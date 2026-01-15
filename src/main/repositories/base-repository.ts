import { Database } from 'sqlite';
import { DatabaseConnection } from '../database/connection';

export abstract class BaseRepository<T, TCreate = Omit<T, 'id'>, TUpdate = Partial<T>> {
  protected dbConnection: DatabaseConnection;
  protected abstract tableName: string;

  constructor() {
    this.dbConnection = DatabaseConnection.getInstance();
  }

  protected async getDatabase(): Promise<Database> {
    return await this.dbConnection.getDatabase();
  }

  // Abstract methods that must be implemented by concrete repositories
  protected abstract mapRowToEntity(row: any): T;
  protected abstract mapEntityToRow(entity: TCreate | TUpdate): any;

  // Common CRUD operations
  public async findById(id: number): Promise<T | null> {
    const db = await this.getDatabase();
    const row = await db.get(`SELECT * FROM ${this.tableName} WHERE id = ?`, [id]);
    
    return row ? this.mapRowToEntity(row) : null;
  }

  public async findAll(): Promise<T[]> {
    const db = await this.getDatabase();
    const rows = await db.all(`SELECT * FROM ${this.tableName} ORDER BY id`);
    
    return rows.map(row => this.mapRowToEntity(row));
  }

  public async create(entity: TCreate): Promise<T> {
    const db = await this.getDatabase();
    const rowData = this.mapEntityToRow(entity);
    
    // Build dynamic INSERT query
    const columns = Object.keys(rowData);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(rowData);
    
    const query = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    const result = await db.run(query, values);
    
    if (!result.lastID) {
      throw new Error(`Failed to create entity in ${this.tableName}`);
    }
    
    const created = await this.findById(result.lastID);
    if (!created) {
      throw new Error(`Failed to retrieve created entity from ${this.tableName}`);
    }
    
    return created;
  }

  public async update(id: number, entity: TUpdate): Promise<T | null> {
    const db = await this.getDatabase();
    const rowData = this.mapEntityToRow(entity);
    
    // Remove undefined values and id from update data
    const updateData = Object.entries(rowData)
      .filter(([_, value]) => value !== undefined)
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    
    if (Object.keys(updateData).length === 0) {
      return await this.findById(id);
    }
    
    // Build dynamic UPDATE query
    const columns = Object.keys(updateData);
    const setClause = columns.map(col => `${col} = ?`).join(', ');
    const values = [...Object.values(updateData), id];
    
    const query = `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`;
    const result = await db.run(query, values);
    
    if (result.changes === 0) {
      return null; // No rows updated
    }
    
    return await this.findById(id);
  }

  public async delete(id: number): Promise<boolean> {
    const db = await this.getDatabase();
    const result = await db.run(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
    
    return (result.changes || 0) > 0;
  }

  public async exists(id: number): Promise<boolean> {
    const db = await this.getDatabase();
    const result = await db.get(
      `SELECT 1 FROM ${this.tableName} WHERE id = ? LIMIT 1`,
      [id]
    );
    
    return !!result;
  }

  public async count(): Promise<number> {
    const db = await this.getDatabase();
    const result = await db.get(`SELECT COUNT(*) as count FROM ${this.tableName}`);
    
    return result?.count || 0;
  }

  // Transaction support
  public async executeInTransaction<TResult>(
    callback: (repository: this) => Promise<TResult>
  ): Promise<TResult> {
    return await this.dbConnection.executeTransaction(async () => {
      return await callback(this);
    });
  }
}