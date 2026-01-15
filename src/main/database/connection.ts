import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import * as path from 'path';
import { app } from 'electron';

export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private db: Database | null = null;

  private constructor() {}

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  public async connect(): Promise<Database> {
    if (this.db) {
      return this.db;
    }

    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'minecraft-launcher.db');

    this.db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    // Enable foreign keys
    await this.db.exec('PRAGMA foreign_keys = ON');
    
    return this.db;
  }

  public async getDatabase(): Promise<Database> {
    if (!this.db) {
      return await this.connect();
    }
    return this.db;
  }

  public async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }

  public async executeTransaction<T>(
    callback: (db: Database) => Promise<T>
  ): Promise<T> {
    const db = await this.getDatabase();
    
    try {
      await db.exec('BEGIN TRANSACTION');
      const result = await callback(db);
      await db.exec('COMMIT');
      return result;
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }
  }
}