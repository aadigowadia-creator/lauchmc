import { BaseRepository } from './base-repository';
import {
  OptiFineConfig,
  OptiFineConfigRow,
  CreateOptiFineConfigData,
  UpdateOptiFineConfigData,
} from '../models';

export class OptiFineConfigRepository extends BaseRepository<
  OptiFineConfig,
  CreateOptiFineConfigData,
  UpdateOptiFineConfigData
> {
  protected tableName = 'optifine_configs';

  protected mapRowToEntity(row: OptiFineConfigRow): OptiFineConfig {
    return {
      id: row.id,
      profileId: row.profile_id,
      version: row.version,
      enabled: row.enabled === 1,
      downloadUrl: row.download_url || undefined,
      filePath: row.file_path || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  protected mapEntityToRow(
    entity: CreateOptiFineConfigData | UpdateOptiFineConfigData
  ): Partial<OptiFineConfigRow> {
    const row: Partial<OptiFineConfigRow> = {};

    if ('profileId' in entity && entity.profileId !== undefined) {
      row.profile_id = entity.profileId;
    }
    if ('version' in entity && entity.version !== undefined) {
      row.version = entity.version;
    }
    if ('enabled' in entity && entity.enabled !== undefined) {
      row.enabled = entity.enabled ? 1 : 0;
    }
    if ('downloadUrl' in entity) {
      row.download_url = entity.downloadUrl || null;
    }
    if ('filePath' in entity) {
      row.file_path = entity.filePath || null;
    }

    // Set timestamps
    const now = new Date().toISOString();
    if (!('id' in entity)) {
      // Creating new record
      row.created_at = now;
    }
    row.updated_at = now;

    return row;
  }

  /**
   * Get OptiFine config for a profile
   */
  public async findByProfileId(profileId: string): Promise<OptiFineConfig | null> {
    const db = await this.getDatabase();
    const row = await db.get<OptiFineConfigRow>(
      `SELECT * FROM ${this.tableName} WHERE profile_id = ?`,
      [profileId]
    );

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Create or update OptiFine config (upsert)
   */
  public async upsert(config: CreateOptiFineConfigData): Promise<OptiFineConfig> {
    const db = await this.getDatabase();
    const existing = await this.findByProfileId(config.profileId);

    if (existing) {
      // Update existing
      const rowData = this.mapEntityToRow({
        version: config.version,
        enabled: config.enabled,
        downloadUrl: config.downloadUrl,
        filePath: config.filePath,
      });
      await db.run(
        `UPDATE ${this.tableName} SET version = ?, enabled = ?, download_url = ?, file_path = ?, updated_at = ? WHERE profile_id = ?`,
        [
          rowData.version,
          rowData.enabled,
          rowData.download_url,
          rowData.file_path,
          rowData.updated_at,
          config.profileId,
        ]
      );
      return (await this.findByProfileId(config.profileId))!;
    } else {
      // Create new
      return await this.create(config);
    }
  }

  /**
   * Save OptiFine configuration
   */
  public async saveConfig(
    profileId: string,
    version: string,
    enabled: boolean,
    downloadUrl?: string,
    filePath?: string
  ): Promise<OptiFineConfig> {
    return await this.upsert({
      profileId,
      version,
      enabled,
      downloadUrl,
      filePath,
    });
  }

  /**
   * Get OptiFine configuration for a profile
   */
  public async getConfig(profileId: string): Promise<OptiFineConfig | null> {
    return await this.findByProfileId(profileId);
  }

  /**
   * Delete OptiFine config for a profile
   */
  public async deleteByProfileId(profileId: string): Promise<boolean> {
    const db = await this.getDatabase();
    const result = await db.run(
      `DELETE FROM ${this.tableName} WHERE profile_id = ?`,
      [profileId]
    );

    return (result.changes || 0) > 0;
  }

  /**
   * Delete OptiFine configuration for a profile
   */
  public async deleteConfig(profileId: string): Promise<void> {
    await this.deleteByProfileId(profileId);
  }

  /**
   * Check if OptiFine config exists for a profile
   */
  public async existsByProfileId(profileId: string): Promise<boolean> {
    const db = await this.getDatabase();
    const result = await db.get(
      `SELECT 1 FROM ${this.tableName} WHERE profile_id = ? LIMIT 1`,
      [profileId]
    );

    return !!result;
  }

  /**
   * Enable OptiFine for a profile
   */
  public async enableOptiFine(profileId: string): Promise<void> {
    const existing = await this.findByProfileId(profileId);
    if (existing) {
      await this.upsert({
        profileId,
        version: existing.version,
        enabled: true,
        downloadUrl: existing.downloadUrl,
        filePath: existing.filePath,
      });
    }
  }

  /**
   * Disable OptiFine for a profile
   */
  public async disableOptiFine(profileId: string): Promise<void> {
    const existing = await this.findByProfileId(profileId);
    if (existing) {
      await this.upsert({
        profileId,
        version: existing.version,
        enabled: false,
        downloadUrl: existing.downloadUrl,
        filePath: existing.filePath,
      });
    }
  }

  /**
   * Update OptiFine version for a profile
   */
  public async updateVersion(
    profileId: string,
    version: string,
    downloadUrl?: string,
    filePath?: string
  ): Promise<void> {
    const existing = await this.findByProfileId(profileId);
    if (existing) {
      await this.upsert({
        profileId,
        version,
        enabled: existing.enabled,
        downloadUrl: downloadUrl || existing.downloadUrl,
        filePath: filePath || existing.filePath,
      });
    } else {
      // Create new config if it doesn't exist
      await this.upsert({
        profileId,
        version,
        enabled: true, // Default to enabled
        downloadUrl,
        filePath,
      });
    }
  }

  /**
   * Get all OptiFine configurations
   */
  public async getAllConfigs(): Promise<OptiFineConfig[]> {
    const db = await this.getDatabase();
    const rows = await db.all<OptiFineConfigRow[]>(
      `SELECT * FROM ${this.tableName} ORDER BY created_at DESC`
    );

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Get enabled OptiFine configurations
   */
  public async getEnabledConfigs(): Promise<OptiFineConfig[]> {
    const db = await this.getDatabase();
    const rows = await db.all<OptiFineConfigRow[]>(
      `SELECT * FROM ${this.tableName} WHERE enabled = 1 ORDER BY created_at DESC`
    );

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Count OptiFine configurations
   */
  public async countConfigs(): Promise<number> {
    const db = await this.getDatabase();
    const result = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName}`
    );

    return result?.count || 0;
  }

  /**
   * Get OptiFine configurations by version
   */
  public async findByVersion(version: string): Promise<OptiFineConfig[]> {
    const db = await this.getDatabase();
    const rows = await db.all<OptiFineConfigRow[]>(
      `SELECT * FROM ${this.tableName} WHERE version = ? ORDER BY created_at DESC`,
      [version]
    );

    return rows.map((row) => this.mapRowToEntity(row));
  }
}