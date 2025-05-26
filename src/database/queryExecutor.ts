import sql from 'mssql';
import { DatabaseConnection } from './config.js';

export interface QueryResult {
  columns: string[];
  rows: any[];
  rowCount: number;
  executionTime: number;
}

export interface QueryOptions {
  maxRows?: number;
  timeout?: number;
}

export class QueryExecutor {
  private readonly MAX_ROWS = 1000;
  private readonly DEFAULT_TIMEOUT = 30000; // 30 seconds

  constructor(private db: DatabaseConnection) {}

  async executeQuery(query: string, options: QueryOptions = {}): Promise<QueryResult> {
    // Validate that the query is read-only
    this.validateReadOnlyQuery(query);

    const startTime = Date.now();
    const pool = this.db.getPool();
    
    const maxRows = Math.min(options.maxRows || this.MAX_ROWS, this.MAX_ROWS);
    const timeout = options.timeout || this.DEFAULT_TIMEOUT;

    try {
      const request = pool.request();
      
      // Add TOP clause if not present and it's a SELECT statement
      const modifiedQuery = this.addRowLimit(query, maxRows);
      
      const result = await request.query(modifiedQuery);
      const executionTime = Date.now() - startTime;
      // Extract column names from the first recordset
      const columns = result.recordset && result.recordset.columns 
        ? Object.keys(result.recordset.columns)
        : [];

      return {
        columns,
        rows: result.recordset || [],
        rowCount: result.recordset ? result.recordset.length : 0,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('Query execution error:', error);
      
      if (error instanceof Error) {
        throw new Error(`Query execution failed (${executionTime}ms): ${error.message}`);
      }
      throw new Error(`Query execution failed (${executionTime}ms): Unknown error`);
    }
  }
  private validateReadOnlyQuery(query: string): void {
    const normalizedQuery = query.trim().toLowerCase();
    
    // Check for forbidden keywords
    const forbiddenKeywords = [
      'insert', 'update', 'delete', 'drop', 'create', 'alter',
      'truncate', 'merge', 'exec', 'execute', 'sp_',
      'xp_', 'bulk', 'openrowset', 'opendatasource'
    ];

    for (const keyword of forbiddenKeywords) {
      if (normalizedQuery.includes(keyword)) {
        throw new Error(`Query contains forbidden keyword: ${keyword}. Only SELECT statements are allowed.`);
      }
    }

    // Ensure it starts with SELECT (after removing comments and whitespace)
    const queryWithoutComments = this.removeComments(normalizedQuery);
    const firstWord = queryWithoutComments.trim().split(/\s+/)[0];
    
    if (firstWord !== 'select' && firstWord !== 'with') {
      throw new Error('Only SELECT statements and CTEs (WITH clause) are allowed.');
    }

    // Additional security checks
    if (normalizedQuery.includes('--') || normalizedQuery.includes('/*')) {
      // Comments are allowed but let's log them for monitoring
      console.error('Query contains comments, review for security:', query.substring(0, 200));
    }
  }
  private removeComments(query: string): string {
    // Remove single-line comments (-- comments)
    let result = query.replace(/--.*$/gm, '');
    
    // Remove multi-line comments (/* comments */)
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    
    return result;
  }

  private addRowLimit(query: string, maxRows: number): string {
    const normalizedQuery = query.trim().toLowerCase();
    
    // If query already has TOP clause, don't modify
    if (normalizedQuery.includes('top ') || normalizedQuery.includes('top(')) {
      return query;
    }

    // For simple SELECT statements, add TOP clause
    if (normalizedQuery.startsWith('select ')) {
      return query.replace(/^(\s*select\s+)/i, `$1TOP ${maxRows} `);
    }

    // For CTEs, this is more complex, so we'll leave as-is
    // In production, you might want to wrap the entire query in a subquery with TOP
    return query;
  }
  async explainQuery(query: string): Promise<any[]> {
    this.validateReadOnlyQuery(query);
    
    const pool = this.db.getPool();
    const request = pool.request();
    
    try {
      // Get execution plan
      await request.query('SET SHOWPLAN_ALL ON');
      const result = await request.query(query);
      await request.query('SET SHOWPLAN_ALL OFF');
      
      return result.recordset || [];
    } catch (error) {
      console.error('Explain query error:', error);
      throw new Error(`Failed to get query execution plan: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getQueryStatistics(query: string): Promise<{
    logicalReads: number;
    physicalReads: number;
    cpuTime: number;
    elapsedTime: number;
  }> {
    this.validateReadOnlyQuery(query);
    
    const pool = this.db.getPool();
    const request = pool.request();
    
    try {
      // Enable statistics
      await request.query('SET STATISTICS IO ON');
      await request.query('SET STATISTICS TIME ON');
      
      const startTime = Date.now();
      await request.query(query);
      const elapsedTime = Date.now() - startTime;
      
      // Disable statistics
      await request.query('SET STATISTICS IO OFF');
      await request.query('SET STATISTICS TIME OFF');
      
      // Note: In a real implementation, you'd need to capture the statistics
      // from the SQL Server messages. This is a simplified version.
      return {
        logicalReads: 0, // Would be parsed from SQL Server messages
        physicalReads: 0, // Would be parsed from SQL Server messages
        cpuTime: 0, // Would be parsed from SQL Server messages
        elapsedTime,
      };
    } catch (error) {
      console.error('Query statistics error:', error);
      throw new Error(`Failed to get query statistics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}