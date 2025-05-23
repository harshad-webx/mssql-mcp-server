# MSSQL MCP Server

A comprehensive Model Context Protocol (MCP) server that provides secure, read-only access to Microsoft SQL Server databases. This server enables AI assistants to discover database schemas, execute queries safely, and generate business intelligence insights through a standardized interface.

## 🌟 Features

### 🔍 **Schema Discovery**
- Automatic discovery of tables, views, columns, and relationships
- Detailed metadata including data types, constraints, and indexes
- Foreign key relationship mapping and dependency analysis
- Support for multiple database schemas

### 🛡️ **Security First**
- **Read-only enforcement** - Blocks all DML/DDL operations (INSERT, UPDATE, DELETE, DROP, etc.)
- **SQL injection prevention** - Comprehensive query validation and sanitization
- **Resource protection** - Configurable row limits and query timeouts
- **Access control** - Environment-based database credential management

### 📊 **Powerful Query Tools**
- Execute SELECT queries with automatic safety limits
- Query performance analysis and execution plan generation
- Table search and filtering capabilities
- Query optimization recommendations

### 🎯 **Business Intelligence**
- Pre-built prompts for common data analysis scenarios
- Domain-specific BI query generators (Sales, Finance, Operations, Customer Analytics)
- Data quality assessment templates
- Performance analysis workflows

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **TypeScript** - Installed automatically with dependencies
- **Microsoft SQL Server** - Any version with TCP/IP enabled
- **Database Access** - User account with SELECT permissions
### 1. Installation

```bash
# Clone the repository
git clone https://github.com/harshad-webx/mssql-mcp-server.git
cd mssql-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```

### 2. Configuration

Create a `.env` file in the project root:

```bash
# Copy the example environment file
cp .env.example .env
```

Edit `.env` with your database details:

```env
# MSSQL Database Configuration
DB_SERVER=your-sql-server.com
DB_DATABASE=YourDatabaseName
DB_USERNAME=your_username
DB_PASSWORD=your_secure_password
DB_PORT=1433
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=false
```

### 3. Test the Connection

```bash
# Start the server to test
npm start
```

You should see: `MSSQL MCP Server running on stdio`

## 🔧 MCP Client Integration

### Claude Desktop Integration

Add to your Claude Desktop MCP configuration (`%APPDATA%\Claude\claude_desktop_config.json` on Windows or `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "mssql": {
      "command": "node",
      "args": ["C:/path/to/mssql-mcp-server/build/index.js"],
      "env": {
        "DB_SERVER": "your-server.com",
        "DB_DATABASE": "YourDatabase",
        "DB_USERNAME": "your_username",
        "DB_PASSWORD": "your_password",
        "DB_PORT": "1433",
        "DB_ENCRYPT": "true"
      }
    }
  }
}
```
### Other MCP Clients

For other MCP-compatible clients, use the stdio transport:

```bash
node build/index.js
```

## 🛠️ Available Tools

### 1. `execute_query`
Execute read-only SQL SELECT queries against your database.

**Parameters:**
- `query` (string, required): SQL SELECT query to execute
- `maxRows` (number, optional): Maximum rows to return (default: 100, max: 1000)
- `includeExecutionPlan` (boolean, optional): Include query execution plan (default: false)

**Example:**
```sql
SELECT TOP 10 
    CustomerID, 
    CustomerName, 
    Country,
    YEAR(OrderDate) as OrderYear
FROM Customers c
INNER JOIN Orders o ON c.CustomerID = o.CustomerID
WHERE Country = 'USA'
ORDER BY OrderDate DESC
```

### 2. `get_table_schema`
Get comprehensive schema information for a specific table.

**Parameters:**
- `schema` (string, required): Database schema name (e.g., 'dbo')
- `table` (string, required): Table name

**Returns:**
- Table metadata (name, type, row count)
- Column details (data types, constraints, descriptions)
- Index information
- Foreign key relationships

### 3. `search_tables`
Search for tables and views by name pattern.

**Parameters:**
- `searchTerm` (string, required): Search pattern to match table/view names

**Example:** Search for all tables containing "customer"

### 4. `analyze_query`
Analyze SQL query performance and get optimization recommendations.

**Parameters:**
- `query` (string, required): SQL query to analyze

**Returns:**
- Execution statistics
- Query execution plan
- Performance recommendations
- Optimization suggestions
## 🎯 Available Prompts

### 1. `analyze_table_relationships`
Generate comprehensive analysis of database table relationships and foreign key constraints.

**Arguments:**
- `schema` (optional): Specific schema to analyze

**Example Output:**
- Foreign key relationship mapping
- Dependency hierarchy
- Orphaned tables identification
- Relationship strength analysis

### 2. `find_data_quality_issues`
Generate SQL queries to identify common data quality problems.

**Arguments:**
- `table` (optional): Specific table to check (format: schema.table)

**Checks Include:**
- NULL value analysis by column
- Duplicate record detection
- Referential integrity violations
- Data format inconsistencies
- Outlier identification

### 3. `performance_analysis`
Generate queries for comprehensive database performance analysis.

**Arguments:**
- `focus` (optional): Focus area - "indexes", "queries", or "tables"

**Analysis Areas:**
- Missing index recommendations
- Unused index identification
- Expensive query detection
- Table statistics review
- Wait statistics analysis

### 4. `business_intelligence_starter`
Generate domain-specific BI queries for business analysis.

**Arguments:**
- `domain` (optional): Business domain - "sales", "finance", "operations", or "customer"

**Query Categories:**
- Time-series trend analysis
- Comparative period-over-period analysis
- Customer segmentation
- Performance KPIs
- Revenue analytics
## 📋 Usage Examples

### Basic Query Execution

```javascript
// Through MCP client
{
  "tool": "execute_query",
  "arguments": {
    "query": "SELECT COUNT(*) as total_customers FROM Customers WHERE Country = 'USA'",
    "maxRows": 1
  }
}
```

### Schema Discovery

```javascript
// Get detailed table information
{
  "tool": "get_table_schema",
  "arguments": {
    "schema": "dbo",
    "table": "Customers"
  }
}
```

### Data Quality Analysis

```javascript
// Using prompt for data quality assessment
{
  "prompt": "find_data_quality_issues",
  "arguments": {
    "table": "Sales.Orders"
  }
}
```

## 🔒 Security Features

### Query Validation
- **Keyword Filtering**: Blocks INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, EXEC, etc.
- **Statement Analysis**: Only SELECT and WITH (CTE) statements allowed
- **Comment Monitoring**: Logs queries with comments for security review

### Resource Protection
- **Row Limiting**: Automatic TOP clause injection for unbounded queries
- **Timeout Control**: Configurable query timeout (default: 30 seconds)
- **Connection Pooling**: Efficient database connection management

### Access Control
- **Environment Variables**: Secure credential management
- **Minimal Permissions**: Designed for read-only database users
- **Connection Encryption**: TLS/SSL support for secure connections
## 🏗️ Database Setup

### Recommended Database User Setup

```sql
-- Create a dedicated read-only user
CREATE LOGIN mcp_reader WITH PASSWORD = 'SecurePassword123!';
USE YourDatabase;
CREATE USER mcp_reader FOR LOGIN mcp_reader;

-- Grant minimal required permissions
GRANT SELECT ON SCHEMA::dbo TO mcp_reader;
GRANT VIEW DEFINITION ON SCHEMA::dbo TO mcp_reader;

-- Grant access to system views for schema discovery
GRANT VIEW ANY DEFINITION TO mcp_reader;

-- Optional: Grant access to specific schemas only
GRANT SELECT ON SCHEMA::Sales TO mcp_reader;
GRANT SELECT ON SCHEMA::Marketing TO mcp_reader;
```

### Network Configuration

Ensure SQL Server is configured to accept TCP/IP connections:

1. **SQL Server Configuration Manager** → **SQL Server Network Configuration**
2. **Enable TCP/IP protocol**
3. **Configure firewall** to allow port 1433 (or your custom port)
4. **Restart SQL Server service**

## 🐳 Docker Support

### Build Docker Image

```bash
docker build -t mssql-mcp-server .
```

### Run with Docker

```bash
docker run -e DB_SERVER=your-server \
           -e DB_DATABASE=YourDB \
           -e DB_USERNAME=user \
           -e DB_PASSWORD=pass \
           mssql-mcp-server
```

### Docker Compose

```yaml
version: '3.8'
services:
  mcp-server:
    build: .
    environment:
      - DB_SERVER=sql-server
      - DB_DATABASE=MyDatabase
      - DB_USERNAME=mcp_reader
      - DB_PASSWORD=securepassword
    depends_on:
      - sql-server
```
## 🔧 Development

### Available Scripts

```bash
# Development with auto-reload
npm run dev

# Build TypeScript
npm run build

# Watch mode for development
npm run watch

# Start production server
npm start
```

### Project Structure

```
src/
├── database/
│   ├── config.ts          # Database connection management
│   ├── schema.ts          # Schema discovery utilities
│   └── queryExecutor.ts   # Query execution and validation
└── index.ts               # Main MCP server implementation
```

### Adding New Features

1. **New Tools**: Add to `ListToolsRequestSchema` and `CallToolRequestSchema` handlers
2. **New Prompts**: Add to `ListPromptsRequestSchema` and `GetPromptRequestSchema` handlers
3. **Security Rules**: Extend `QueryExecutor.validateReadOnlyQuery()` method

## 🐛 Troubleshooting

### Common Issues

**Connection Refused**
```
Error: connect ECONNREFUSED
```
- Verify SQL Server is running and accessible
- Check firewall settings and port configuration
- Ensure TCP/IP protocol is enabled

**Authentication Failed**
```
Error: Login failed for user
```
- Verify username and password in `.env`
- Ensure user has required database permissions
- Check if SQL Server uses Windows Authentication vs SQL Authentication

**Query Timeout**
```
Error: Query execution failed: Timeout
```
- Optimize query performance
- Increase timeout in `queryExecutor.ts`
- Check for blocking queries on the database
**Permission Denied**
```
Error: The SELECT permission was denied
```
- Grant SELECT permissions to the database user
- Verify schema access permissions
- Check VIEW DEFINITION permissions for metadata queries

### Debug Mode

Enable detailed logging by setting environment variable:

```bash
DEBUG=mcp:* npm start
```

## 📊 Performance Optimization

### Query Optimization Tips

1. **Use Specific Columns**: Avoid `SELECT *` for better performance
2. **Add WHERE Clauses**: Always filter data to reduce result sets
3. **Utilize Indexes**: Ensure frequently queried columns are indexed
4. **Limit Results**: Use TOP clause or maxRows parameter

### Database Optimization

1. **Update Statistics**: Keep table statistics current
2. **Rebuild Indexes**: Maintain index health
3. **Monitor Performance**: Use built-in analysis tools
4. **Optimize Queries**: Review execution plans regularly

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines:

### Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes with appropriate tests
4. Commit your changes: `git commit -m 'Add amazing feature'`
5. Push to the branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Add tests for new functionality
- Update documentation for changes
- Ensure security validations are maintained

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check this README and code comments
- **Issues**: [Create a GitHub issue](https://github.com/harshad-webx/mssql-mcp-server/issues)
- **Discussions**: [GitHub Discussions](https://github.com/harshad-webx/mssql-mcp-server/discussions)

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) for the standardized AI-tool interface
- [Microsoft SQL Server](https://www.microsoft.com/sql-server) for the robust database platform
- [Node.js MSSQL Library](https://www.npmjs.com/package/mssql) for database connectivity

---

**Ready to explore your database with AI? Get started now!** 🚀