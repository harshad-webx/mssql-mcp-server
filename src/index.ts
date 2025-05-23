#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { DatabaseConnection, createDatabaseConfig } from './database/config.js';
import { SchemaDiscovery } from './database/schema.js';
import { QueryExecutor } from './database/queryExecutor.js';

// Define schemas for tool arguments
const ExecuteQuerySchema = z.object({
  query: z.string().describe('SQL SELECT query to execute'),
  maxRows: z.number().optional().default(100).describe('Maximum number of rows to return (max 1000)'),
  includeExecutionPlan: z.boolean().optional().default(false).describe('Whether to include execution plan'),
});

const GetTableSchemaSchema = z.object({
  schema: z.string().describe('Database schema name'),
  table: z.string().describe('Table name'),
});

const SearchTablesSchema = z.object({
  searchTerm: z.string().describe('Search term to find tables/views'),
});

const AnalyzeQuerySchema = z.object({
  query: z.string().describe('SQL query to analyze for performance'),
});
class MSSQLMCPServer {
  private server: Server;
  private db: DatabaseConnection;
  private schemaDiscovery: SchemaDiscovery;
  private queryExecutor: QueryExecutor;

  constructor() {
    this.server = new Server(
      {
        name: 'mssql-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
          prompts: {},
        },
      }
    );

    // Initialize database connection
    const config = createDatabaseConfig();
    this.db = new DatabaseConnection(config);
    this.schemaDiscovery = new SchemaDiscovery(this.db);
    this.queryExecutor = new QueryExecutor(this.db);

    this.setupHandlers();
  }
  private setupHandlers(): void {
    // Resource handlers
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      try {
        await this.ensureConnected();
        const tables = await this.schemaDiscovery.getTables();
        
        return {
          resources: tables.map(table => ({
            uri: `mssql://schema/${table.schema}/${table.name}`,
            mimeType: 'application/json',
            name: `${table.schema}.${table.name}`,
            description: `Schema for ${table.type.toLowerCase()} ${table.schema}.${table.name}`,
          })),
        };
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to list resources: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      if (!uri.startsWith('mssql://schema/')) {
        throw new McpError(ErrorCode.InvalidRequest, `Unsupported resource URI: ${uri}`);
      }

      try {
        await this.ensureConnected();
        const match = uri.match(/^mssql:\/\/schema\/([^\/]+)\/(.+)$/);
        if (!match) {
          throw new McpError(ErrorCode.InvalidRequest, `Invalid resource URI format: ${uri}`);
        }

        const [, schema, table] = match;
        const tableSchema = await this.schemaDiscovery.getTableSchema(schema, table);

        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(tableSchema, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to read resource: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
    // Tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'execute_query',
            description: 'Execute a read-only SQL SELECT query against the database',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'SQL SELECT query to execute',
                },
                maxRows: {
                  type: 'number',
                  description: 'Maximum number of rows to return (max 1000)',
                  default: 100,
                },
                includeExecutionPlan: {
                  type: 'boolean',
                  description: 'Whether to include execution plan',
                  default: false,
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'get_table_schema',
            description: 'Get detailed schema information for a specific table',
            inputSchema: {
              type: 'object',
              properties: {
                schema: {
                  type: 'string',
                  description: 'Database schema name',
                },
                table: {
                  type: 'string',
                  description: 'Table name',
                },
              },
              required: ['schema', 'table'],
            },
          },
          {
            name: 'search_tables',
            description: 'Search for tables and views by name',
            inputSchema: {
              type: 'object',
              properties: {
                searchTerm: {
                  type: 'string',
                  description: 'Search term to find tables/views',
                },
              },
              required: ['searchTerm'],
            },
          },          {
            name: 'analyze_query',
            description: 'Analyze a SQL query for performance insights',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'SQL query to analyze for performance',
                },
              },
              required: ['query'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        await this.ensureConnected();

        switch (name) {
          case 'execute_query': {
            const { query, maxRows, includeExecutionPlan } = ExecuteQuerySchema.parse(args);
            const result = await this.queryExecutor.executeQuery(query, { maxRows });
            
            let response: any = {
              result: {
                columns: result.columns,
                rows: result.rows,
                rowCount: result.rowCount,
                executionTime: result.executionTime,
              },
            };

            if (includeExecutionPlan) {
              try {
                const executionPlan = await this.queryExecutor.explainQuery(query);
                response.executionPlan = executionPlan;
              } catch (error) {
                response.executionPlanError = error instanceof Error ? error.message : 'Unknown error';
              }
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }
          case 'get_table_schema': {
            const { schema, table } = GetTableSchemaSchema.parse(args);
            const tableSchema = await this.schemaDiscovery.getTableSchema(schema, table);
            
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(tableSchema, null, 2),
                },
              ],
            };
          }

          case 'search_tables': {
            const { searchTerm } = SearchTablesSchema.parse(args);
            const tables = await this.schemaDiscovery.getTables();
            const filteredTables = tables.filter(table =>
              table.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              table.schema.toLowerCase().includes(searchTerm.toLowerCase())
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(filteredTables, null, 2),
                },
              ],
            };
          }

          case 'analyze_query': {
            const { query } = AnalyzeQuerySchema.parse(args);
            
            try {
              const statistics = await this.queryExecutor.getQueryStatistics(query);
              const executionPlan = await this.queryExecutor.explainQuery(query);
              
              const analysis = {
                query,
                statistics,
                executionPlan,
                recommendations: this.generateQueryRecommendations(query, executionPlan),
              };

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(analysis, null, 2),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Failed to analyze query: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  },
                ],
              };
            }
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });

    // Prompt handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'analyze_table_relationships',
            description: 'Generate analysis of table relationships and foreign keys',
            arguments: [
              {
                name: 'schema',
                description: 'Database schema to analyze',
                required: false,
              },
            ],
          },
          {
            name: 'find_data_quality_issues',
            description: 'Generate queries to identify common data quality issues',
            arguments: [
              {
                name: 'table',
                description: 'Specific table to check (format: schema.table)',
                required: false,
              },
            ],
          },
          {
            name: 'performance_analysis',
            description: 'Generate queries for database performance analysis',
            arguments: [
              {
                name: 'focus',
                description: 'Focus area: indexes, queries, or tables',
                required: false,
              },
            ],
          },
          {
            name: 'business_intelligence_starter',
            description: 'Generate common BI queries for business analysis',
            arguments: [
              {
                name: 'domain',
                description: 'Business domain: sales, finance, operations, or customer',
                required: false,
              },
            ],
          },
        ],
      };
    });
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'analyze_table_relationships':
          return {
            description: 'Analyze table relationships and foreign key constraints',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: this.generateTableRelationshipAnalysis(args?.schema),
                },
              },
            ],
          };

        case 'find_data_quality_issues':
          return {
            description: 'Find common data quality issues in tables',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: this.generateDataQualityQueries(args?.table),
                },
              },
            ],
          };

        case 'performance_analysis':
          return {
            description: 'Analyze database performance',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: this.generatePerformanceAnalysisQueries(args?.focus),
                },
              },
            ],
          };

        case 'business_intelligence_starter':
          return {
            description: 'Generate common business intelligence queries',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: this.generateBIQueries(args?.domain),
                },
              },
            ],
          };

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown prompt: ${name}`);
      }
    });
  }
  private async ensureConnected(): Promise<void> {
    if (!this.db.isConnected()) {
      await this.db.connect();
    }
  }

  private generateQueryRecommendations(query: string, executionPlan: any[]): string[] {
    const recommendations: string[] = [];
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('select *')) {
      recommendations.push('Consider selecting only the columns you need instead of using SELECT *');
    }
    
    if (!lowerQuery.includes('where') && !lowerQuery.includes('top')) {
      recommendations.push('Consider adding WHERE clause or TOP clause to limit results');
    }
    
    if (lowerQuery.includes('order by') && !lowerQuery.includes('top')) {
      recommendations.push('ORDER BY without TOP/LIMIT can be expensive on large tables');
    }

    return recommendations;
  }

  private generateTableRelationshipAnalysis(schema?: string): string {
    const schemaFilter = schema ? `WHERE s1.name = '${schema}'` : '';
    
    return `Please analyze the table relationships in the database using these queries:

1. Find all foreign key relationships:
\`\`\`sql
SELECT 
    s1.name + '.' + t1.name as parent_table,
    c1.name as parent_column,
    s2.name + '.' + t2.name as referenced_table,
    c2.name as referenced_column,
    fk.name as constraint_name
FROM sys.foreign_keys fk
INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
INNER JOIN sys.columns c1 ON fkc.parent_object_id = c1.object_id AND fkc.parent_column_id = c1.column_id
INNER JOIN sys.columns c2 ON fkc.referenced_object_id = c2.object_id AND fkc.referenced_column_id = c2.column_id
INNER JOIN sys.objects t1 ON fk.parent_object_id = t1.object_id
INNER JOIN sys.objects t2 ON fk.referenced_object_id = t2.object_id
INNER JOIN sys.schemas s1 ON t1.schema_id = s1.schema_id
INNER JOIN sys.schemas s2 ON t2.schema_id = s2.schema_id
${schemaFilter}
ORDER BY parent_table, parent_column;
\`\`\`

Please execute these queries and provide insights about the database structure and relationships.`;
  }
  private generateDataQualityQueries(table?: string): string {
    if (table) {
      const [schema, tableName] = table.includes('.') ? table.split('.') : ['dbo', table];
      return `Please check data quality issues for table ${schema}.${tableName}:

1. Check for NULL values in each column
2. Check for duplicate rows
3. Validate data formats and constraints

Use appropriate queries to analyze data quality in this specific table.`;
    }

    return `Please generate data quality assessment queries for the database:

1. Find tables with high NULL percentages
2. Identify potential duplicate records
3. Check referential integrity violations
4. Find orphaned records in child tables
5. Identify data type inconsistencies

Use the table schema information to generate appropriate queries for each table.`;
  }

  private generatePerformanceAnalysisQueries(focus?: string): string {
    return `Please analyze database performance with focus on ${focus || 'general performance'}:

1. Find missing indexes
2. Identify unused indexes
3. Analyze expensive queries
4. Check table statistics
5. Review wait statistics

Generate appropriate queries based on the focus area and available system views.`;
  }

  private generateBIQueries(domain?: string): string {
    const domainText = domain || 'general business';
    return `Please generate business intelligence queries for ${domainText} analysis:

1. Time-series analysis (trends, seasonality)
2. Comparative analysis (period-over-period)
3. Segmentation analysis
4. Performance metrics and KPIs
5. Aggregation and summary reports

Use the available tables to create meaningful business insights.`;
  }
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MSSQL MCP Server running on stdio');
  }

  async stop(): Promise<void> {
    await this.db.disconnect();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the server
const server = new MSSQLMCPServer();
server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});