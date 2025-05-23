import sql from 'mssql';
import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Environment variable schema
const envSchema = z.object({
  DB_SERVER: z.string(),
  DB_DATABASE: z.string(),
  DB_USERNAME: z.string(),
  DB_PASSWORD: z.string(),
  DB_PORT: z.string().optional().default('1433'),
  DB_ENCRYPT: z.string().optional().default('true'),
  DB_TRUST_SERVER_CERTIFICATE: z.string().optional().default('false'),
});

export interface DatabaseConfig {
  server: string;
  database: string;
  user: string;
  password: string;
  port: number;
  options: {
    encrypt: boolean;
    trustServerCertificate: boolean;
    enableArithAbort: boolean;
    requestTimeout: number;
    connectionTimeout: number;
  };
}

export function createDatabaseConfig(): DatabaseConfig {
  const env = envSchema.parse(process.env);
  
  return {
    server: env.DB_SERVER,
    database: env.DB_DATABASE,
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    port: parseInt(env.DB_PORT),
    options: {
      encrypt: env.DB_ENCRYPT === 'true',
      trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE === 'true',
      enableArithAbort: true,
      requestTimeout: 30000, // 30 seconds
      connectionTimeout: 15000, // 15 seconds
    },
  };
}
export class DatabaseConnection {
  private pool: sql.ConnectionPool | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.pool) {
      return;
    }

    try {
      this.pool = new sql.ConnectionPool(this.config);
      await this.pool.connect();
      console.log('Connected to MSSQL database');
    } catch (error) {
      console.error('Failed to connect to database:', error);
      throw new Error(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      console.log('Disconnected from MSSQL database');
    }
  }

  getPool(): sql.ConnectionPool {
    if (!this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.pool;
  }

  isConnected(): boolean {
    return this.pool !== null && this.pool.connected;
  }
}