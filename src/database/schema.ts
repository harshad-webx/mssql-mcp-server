import sql from 'mssql';
import { DatabaseConnection } from './config.js';

export interface TableInfo {
  schema: string;
  name: string;
  type: string;
  rowCount?: number;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  maxLength?: number;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  defaultValue?: string;
  description?: string;
}

export interface TableSchema {
  table: TableInfo;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreignKeys: ForeignKeyInfo[];
}

export interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimaryKey: boolean;
}

export interface ForeignKeyInfo {
  name: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
  referencedSchema: string;
}

export class SchemaDiscovery {
  constructor(private db: DatabaseConnection) {}
  async getTables(): Promise<TableInfo[]> {
    const pool = this.db.getPool();
    const result = await pool.request().query(`
      SELECT 
        s.name as [schema],
        t.name as [name],
        t.type_desc as [type]
      FROM sys.tables t
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      WHERE s.name NOT IN ('sys', 'INFORMATION_SCHEMA')
      UNION ALL
      SELECT 
        s.name as [schema],
        v.name as [name],
        'VIEW' as [type]
      FROM sys.views v
      INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
      WHERE s.name NOT IN ('sys', 'INFORMATION_SCHEMA')
      ORDER BY [schema], [name]
    `);

    return result.recordset.map(row => ({
      schema: row.schema,
      name: row.name,
      type: row.type,
    }));
  }
  async getTableSchema(schemaName: string, tableName: string): Promise<TableSchema> {
    const pool = this.db.getPool();
    
    // Get table info
    const tableResult = await pool.request()
      .input('schema', sql.VarChar, schemaName)
      .input('table', sql.VarChar, tableName)
      .query(`
        SELECT 
          s.name as [schema],
          t.name as [name],
          t.type_desc as [type]
        FROM sys.tables t
        INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE s.name = @schema AND t.name = @table
        UNION ALL
        SELECT 
          s.name as [schema],
          v.name as [name],
          'VIEW' as [type]
        FROM sys.views v
        INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
        WHERE s.name = @schema AND v.name = @table
      `);

    if (tableResult.recordset.length === 0) {
      throw new Error(`Table ${schemaName}.${tableName} not found`);
    }

    const table: TableInfo = {
      schema: tableResult.recordset[0].schema,
      name: tableResult.recordset[0].name,
      type: tableResult.recordset[0].type,
    };

    // Get row count for tables (not views)
    if (table.type === 'USER_TABLE') {
      try {
        const countResult = await pool.request()
          .input('schema', sql.VarChar, schemaName)
          .input('table', sql.VarChar, tableName)
          .query(`
            SELECT COUNT(*) as row_count 
            FROM [${schemaName}].[${tableName}]
          `);
        table.rowCount = countResult.recordset[0].row_count;
      } catch (error) {
        console.warn(`Could not get row count for ${schemaName}.${tableName}:`, error);
      }
    }

    // Get columns, indexes, and foreign keys
    const columns = await this.getTableColumns(schemaName, tableName);
    const indexes = await this.getTableIndexes(schemaName, tableName);
    const foreignKeys = await this.getTableForeignKeys(schemaName, tableName);

    return { table, columns, indexes, foreignKeys };
  }
  private async getTableColumns(schemaName: string, tableName: string): Promise<ColumnInfo[]> {
    const pool = this.db.getPool();
    const result = await pool.request()
      .input('schema', sql.VarChar, schemaName)
      .input('table', sql.VarChar, tableName)
      .query(`
        SELECT 
          c.COLUMN_NAME as name,
          c.DATA_TYPE as dataType,
          c.CHARACTER_MAXIMUM_LENGTH as maxLength,
          CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END as isNullable,
          CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as isPrimaryKey,
          CASE WHEN fk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as isForeignKey,
          c.COLUMN_DEFAULT as defaultValue,
          ep.value as description
        FROM INFORMATION_SCHEMA.COLUMNS c
        LEFT JOIN (
          SELECT ku.COLUMN_NAME
          FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
          INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc 
            ON ku.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
          WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
            AND ku.TABLE_SCHEMA = @schema 
            AND ku.TABLE_NAME = @table
        ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
        LEFT JOIN (
          SELECT ku.COLUMN_NAME
          FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
          INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc 
            ON ku.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
          WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
            AND ku.TABLE_SCHEMA = @schema 
            AND ku.TABLE_NAME = @table
        ) fk ON c.COLUMN_NAME = fk.COLUMN_NAME
        LEFT JOIN sys.extended_properties ep ON ep.major_id = OBJECT_ID(@schema + '.' + @table)
          AND ep.minor_id = COLUMNPROPERTY(OBJECT_ID(@schema + '.' + @table), c.COLUMN_NAME, 'ColumnId')
          AND ep.name = 'MS_Description'
        WHERE c.TABLE_SCHEMA = @schema AND c.TABLE_NAME = @table
        ORDER BY c.ORDINAL_POSITION
      `);

    return result.recordset.map(row => ({
      name: row.name,
      dataType: row.dataType,
      maxLength: row.maxLength,
      isNullable: Boolean(row.isNullable),
      isPrimaryKey: Boolean(row.isPrimaryKey),
      isForeignKey: Boolean(row.isForeignKey),
      defaultValue: row.defaultValue,
      description: row.description,
    }));
  }
  private async getTableIndexes(schemaName: string, tableName: string): Promise<IndexInfo[]> {
    const pool = this.db.getPool();
    const result = await pool.request()
      .input('schema', sql.VarChar, schemaName)
      .input('table', sql.VarChar, tableName)
      .query(`
        SELECT 
          i.name as indexName,
          STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) as columns,
          i.is_unique as isUnique,
          i.is_primary_key as isPrimaryKey
        FROM sys.indexes i
        INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        INNER JOIN sys.objects o ON i.object_id = o.object_id
        INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
        WHERE s.name = @schema AND o.name = @table AND i.name IS NOT NULL
        GROUP BY i.name, i.is_unique, i.is_primary_key
        ORDER BY i.name
      `);

    return result.recordset.map(row => ({
      name: row.indexName,
      columns: row.columns.split(', '),
      isUnique: Boolean(row.isUnique),
      isPrimaryKey: Boolean(row.isPrimaryKey),
    }));
  }
  private async getTableForeignKeys(schemaName: string, tableName: string): Promise<ForeignKeyInfo[]> {
    const pool = this.db.getPool();
    const result = await pool.request()
      .input('schema', sql.VarChar, schemaName)
      .input('table', sql.VarChar, tableName)
      .query(`
        SELECT 
          fk.name as constraintName,
          c1.name as columnName,
          s2.name as referencedSchema,
          t2.name as referencedTable,
          c2.name as referencedColumn
        FROM sys.foreign_keys fk
        INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
        INNER JOIN sys.columns c1 ON fkc.parent_object_id = c1.object_id AND fkc.parent_column_id = c1.column_id
        INNER JOIN sys.columns c2 ON fkc.referenced_object_id = c2.object_id AND fkc.referenced_column_id = c2.column_id
        INNER JOIN sys.objects t1 ON fk.parent_object_id = t1.object_id
        INNER JOIN sys.objects t2 ON fk.referenced_object_id = t2.object_id
        INNER JOIN sys.schemas s1 ON t1.schema_id = s1.schema_id
        INNER JOIN sys.schemas s2 ON t2.schema_id = s2.schema_id
        WHERE s1.name = @schema AND t1.name = @table
        ORDER BY fk.name, fkc.constraint_column_id
      `);

    return result.recordset.map(row => ({
      name: row.constraintName,
      column: row.columnName,
      referencedSchema: row.referencedSchema,
      referencedTable: row.referencedTable,
      referencedColumn: row.referencedColumn,
    }));
  }
}