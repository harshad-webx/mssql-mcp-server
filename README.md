# MSSQL MCP Server

A Model Context Protocol server for Microsoft SQL Server with read-only access and schema discovery.

## Features

- 🔍 Schema Discovery - Tables, views, columns, relationships
- 🛡️ Security First - Read-only queries with injection prevention  
- 📊 Data Analysis - Query execution and performance analysis
- 🎯 BI Prompts - Templates for common analysis tasks

## Quick Start

1. Install: `npm install`
2. Configure: Copy `.env.example` to `.env` and set database credentials
3. Build: `npm run build`
4. Run: `npm start`

## Environment Variables

- `DB_SERVER` - SQL Server hostname
- `DB_DATABASE` - Database name  
- `DB_USERNAME` - Database username
- `DB_PASSWORD` - Database password
- `DB_PORT` - Port (default: 1433)
- `DB_ENCRYPT` - Enable encryption (default: true)

## Tools

- `execute_query` - Run SELECT queries safely
- `get_table_schema` - Get table information
- `search_tables` - Find tables by name
- `analyze_query` - Performance analysis

## Security

Enforces read-only access by blocking DML/DDL statements and validating all queries before execution.