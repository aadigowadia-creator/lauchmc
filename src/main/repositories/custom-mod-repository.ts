import { BaseRepository } from './base-repository';
import { CustomMod, CustomModRow, CreateCustomModData } from '../models';

export class CustomModRepository extends BaseRepository<
  CustomMod,
  CreateCustomModData,
  Partial<CustomMod>
> {
  protected tableName = 'custom_mods';

  protected mapRowToEntity(row: CustomModRow): CustomMod {
    return {
      id: row.id,
      profileId: row.profile_id,
      modId: row.mod_id,
      name: row.name,
      description: row.description || undefined,
      fileName: row.file_name,
      source: row.source as 'modrinth' | 'curseforge',
      projectId: row.project_id,
      versionId: row.version_id || undefined,
      downloadUrl: row.download_url,
      createdAt: new Date(row.created_at),
    };
  }

  protected mapEntityToRow(
    entity: CreateCustomModData | Partial<CustomMod>
  ): Partial<CustomModRow> {
    const row: Partial<CustomModRow> = {};

    if ('profileId' in entity && entity.profileId !== undefined) {
      row.profile_id = entity.profileId;
    }
    if ('modId' in entity && entity.modId !== undefined) {
      row.mod_id = entity.modId;
    }
    if ('name' in entity && entity.name !== undefined) {
      row.name = entity.name;
    }
    if ('description' in entity) {
      row.description = entity.description || null;
    }
    if ('fileName' in entity && entity.fileName !== undefined) {
      row.file_name = entity.fileName;
    }
    if ('source' in entity && entity.source !== undefined) {
      row.source = entity.source;
    }
    if ('projectId' in entity && entity.projectId !== undefined) {
      row.project_id = entity.projectId;
    }
    if ('versionId' in entity) {
      row.version_id = entity.versionId || null;
    }
    if ('downloadUrl' in entity && entity.downloadUrl !== undefined) {
      row.download_url = entity.downloadUrl;
    }
    if ('createdAt' in entity && entity.createdAt !== undefined) {
      row.created_at = entity.createdAt.toISOString();
    } else if (!('id' in entity)) {
      // Set created_at for new records
      row.created_at = new Date().toISOString();
    }

    return row;
  }

  /**
   * Get all custom mods for a profile
   */
  public async findByProfileId(profileId: number): Promise<CustomMod[]> {
    const db = await this.getDatabase();
    const rows = await db.all<CustomModRow[]>(
      `SELECT * FROM ${this.tableName} WHERE profile_id = ? ORDER BY created_at DESC`,
      [profileId]
    );

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Get specific custom mod
   */
  public async findByProfileAndMod(
    profileId: number,
    modId: string
  ): Promise<CustomMod | null> {
    const db = await this.getDatabase();
    const row = await db.get<CustomModRow>(
      `SELECT * FROM ${this.tableName} WHERE profile_id = ? AND mod_id = ?`,
      [profileId, modId]
    );

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Delete custom mod by profile and mod ID
   */
  public async deleteByProfileAndMod(
    profileId: number,
    modId: string
  ): Promise<boolean> {
    const db = await this.getDatabase();
    const result = await db.run(
      `DELETE FROM ${this.tableName} WHERE profile_id = ? AND mod_id = ?`,
      [profileId, modId]
    );

    return (result.changes || 0) > 0;
  }

  /**
   * Delete all custom mods for a profile
   */
  public async deleteByProfileId(profileId: number): Promise<boolean> {
    const db = await this.getDatabase();
    const result = await db.run(
      `DELETE FROM ${this.tableName} WHERE profile_id = ?`,
      [profileId]
    );

    return (result.changes || 0) > 0;
  }

  /**
   * Check if a custom mod exists for a profile
   */
  public async existsByProfileAndMod(
    profileId: number,
    modId: string
  ): Promise<boolean> {
    const db = await this.getDatabase();
    const result = await db.get(
      `SELECT 1 FROM ${this.tableName} WHERE profile_id = ? AND mod_id = ? LIMIT 1`,
      [profileId, modId]
    );

    return !!result;
  }

  /**
   * Get custom mods by source
   */
  public async findByProfileAndSource(
    profileId: number,
    source: 'modrinth' | 'curseforge'
  ): Promise<CustomMod[]> {
    const db = await this.getDatabase();
    const rows = await db.all<CustomModRow[]>(
      `SELECT * FROM ${this.tableName} WHERE profile_id = ? AND source = ? ORDER BY created_at DESC`,
      [profileId, source]
    );

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Count custom mods for a profile
   */
  public async countByProfileId(profileId: number): Promise<number> {
    const db = await this.getDatabase();
    const result = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE profile_id = ?`,
      [profileId]
    );

    return result?.count || 0;
  }

  /**
   * Get custom mod by project ID (useful for checking duplicates)
   */
  public async findByProfileAndProjectId(
    profileId: number,
    projectId: string
  ): Promise<CustomMod | null> {
    const db = await this.getDatabase();
    const row = await db.get<CustomModRow>(
      `SELECT * FROM ${this.tableName} WHERE profile_id = ? AND project_id = ?`,
      [profileId, projectId]
    );

    return row ? this.mapRowToEntity(row) : null;
  }
}
