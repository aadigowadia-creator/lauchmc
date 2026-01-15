import { BaseRepository } from './base-repository';
import { UserProfile, ProfileRow, CreateProfileData, UpdateProfileData } from '../models';

export class ProfileRepository extends BaseRepository<UserProfile, CreateProfileData, UpdateProfileData> {
  protected tableName = 'profiles';

  protected mapRowToEntity(row: ProfileRow): UserProfile {
    return {
      id: row.id,
      name: row.name,
      versionId: row.version_id,
      installationDir: row.installation_dir,
      memoryMin: row.memory_min,
      memoryMax: row.memory_max,
      jvmArgs: row.jvm_args,
      modLoader: row.mod_loader ? JSON.parse(row.mod_loader) : null,
      createdAt: new Date(row.created_at),
      lastUsed: row.last_used ? new Date(row.last_used) : undefined,
    };
  }

  protected mapEntityToRow(entity: CreateProfileData | UpdateProfileData): Partial<ProfileRow> {
    const row: Partial<ProfileRow> = {};

    if ('name' in entity && entity.name !== undefined) {
      row.name = entity.name;
    }
    if ('versionId' in entity && entity.versionId !== undefined) {
      row.version_id = entity.versionId;
    }
    if ('installationDir' in entity && entity.installationDir !== undefined) {
      row.installation_dir = entity.installationDir;
    }
    if ('memoryMin' in entity && entity.memoryMin !== undefined) {
      row.memory_min = entity.memoryMin;
    }
    if ('memoryMax' in entity && entity.memoryMax !== undefined) {
      row.memory_max = entity.memoryMax;
    }
    if ('jvmArgs' in entity && entity.jvmArgs !== undefined) {
      row.jvm_args = entity.jvmArgs;
    }
    if ('modLoader' in entity && entity.modLoader !== undefined) {
      row.mod_loader = entity.modLoader ? JSON.stringify(entity.modLoader) : null;
    }
    if ('lastUsed' in entity && entity.lastUsed !== undefined) {
      row.last_used = entity.lastUsed.toISOString();
    }

    return row;
  }

  // Profile-specific methods
  public async findByName(name: string): Promise<UserProfile | null> {
    const db = await this.getDatabase();
    const row = await db.get(`SELECT * FROM ${this.tableName} WHERE name = ?`, [name]);
    
    return row ? this.mapRowToEntity(row) : null;
  }

  public async findByVersionId(versionId: string): Promise<UserProfile[]> {
    const db = await this.getDatabase();
    const rows = await db.all(
      `SELECT * FROM ${this.tableName} WHERE version_id = ? ORDER BY last_used DESC, created_at DESC`,
      [versionId]
    );
    
    return rows.map(row => this.mapRowToEntity(row));
  }

  public async updateLastUsed(id: number): Promise<UserProfile | null> {
    const db = await this.getDatabase();
    const now = new Date().toISOString();
    
    const result = await db.run(
      `UPDATE ${this.tableName} SET last_used = ? WHERE id = ?`,
      [now, id]
    );
    
    if (result.changes === 0) {
      return null;
    }
    
    return await this.findById(id);
  }

  public async getRecentlyUsed(limit: number = 5): Promise<UserProfile[]> {
    const db = await this.getDatabase();
    const rows = await db.all(
      `SELECT * FROM ${this.tableName} 
       WHERE last_used IS NOT NULL 
       ORDER BY last_used DESC 
       LIMIT ?`,
      [limit]
    );
    
    return rows.map(row => this.mapRowToEntity(row));
  }

  public async validateProfileName(name: string, excludeId?: number): Promise<boolean> {
    const db = await this.getDatabase();
    let query = `SELECT 1 FROM ${this.tableName} WHERE name = ?`;
    const params: any[] = [name];
    
    if (excludeId !== undefined) {
      query += ' AND id != ?';
      params.push(excludeId);
    }
    
    const result = await db.get(query, params);
    return !result; // Returns true if name is available (no existing record)
  }

  public async getProfilesByModLoader(modLoaderType: string): Promise<UserProfile[]> {
    const db = await this.getDatabase();
    const rows = await db.all(
      `SELECT * FROM ${this.tableName} 
       WHERE mod_loader IS NOT NULL 
       AND JSON_EXTRACT(mod_loader, '$.type') = ?
       ORDER BY created_at DESC`,
      [modLoaderType]
    );
    
    return rows.map(row => this.mapRowToEntity(row));
  }
}