import { BaseRepository } from './base-repository';
import {
  ForgeModState,
  ForgeModStateRow,
  CreateForgeModStateData,
  UpdateForgeModStateData,
} from '../models';

export class ForgeModRepository extends BaseRepository<
  ForgeModState,
  CreateForgeModStateData,
  UpdateForgeModStateData
> {
  protected tableName = 'forge_mod_states';

  protected mapRowToEntity(row: ForgeModStateRow): ForgeModState {
    return {
      id: row.id,
      profileId: row.profile_id,
      modName: row.mod_name,
      enabled: row.enabled === 1,
      filePath: row.file_path,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  protected mapEntityToRow(
    entity: CreateForgeModStateData | UpdateForgeModStateData
  ): Partial<ForgeModStateRow> {
    const row: Partial<ForgeModStateRow> = {};

    if ('profileId' in entity && entity.profileId !== undefined) {
      row.profile_id = entity.profileId;
    }
    if ('modName' in entity && entity.modName !== undefined) {
      row.mod_name = entity.modName;
    }
    if ('enabled' in entity && entity.enabled !== undefined) {
      row.enabled = entity.enabled ? 1 : 0;
    }
    if ('filePath' in entity && entity.filePath !== undefined) {
      row.file_path = entity.filePath;
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
   * Get all mod states for a profile
   */
  public async findByProfileId(profileId: string): Promise<ForgeModState[]> {
    const db = await this.getDatabase();
    const rows = await db.all<ForgeModStateRow[]>(
      `SELECT * FROM ${this.tableName} WHERE profile_id = ? ORDER BY mod_name`,
      [profileId]
    );

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Get specific mod state
   */
  public async findByProfileAndMod(
    profileId: string,
    modName: string
  ): Promise<ForgeModState | null> {
    const db = await this.getDatabase();
    const row = await db.get<ForgeModStateRow>(
      `SELECT * FROM ${this.tableName} WHERE profile_id = ? AND mod_name = ?`,
      [profileId, modName]
    );

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Create or update mod state (upsert)
   */
  public async upsert(modState: CreateForgeModStateData): Promise<ForgeModState> {
    const db = await this.getDatabase();
    const existing = await this.findByProfileAndMod(
      modState.profileId,
      modState.modName
    );

    if (existing) {
      // Update existing
      const rowData = this.mapEntityToRow({
        enabled: modState.enabled,
        filePath: modState.filePath,
      });
      await db.run(
        `UPDATE ${this.tableName} SET enabled = ?, file_path = ?, updated_at = ? WHERE profile_id = ? AND mod_name = ?`,
        [
          rowData.enabled,
          rowData.file_path,
          rowData.updated_at,
          modState.profileId,
          modState.modName,
        ]
      );
      return (await this.findByProfileAndMod(
        modState.profileId,
        modState.modName
      ))!;
    } else {
      // Create new
      return await this.create(modState);
    }
  }

  /**
   * Save mod state (alias for upsert for consistency with requirements)
   */
  public async saveModState(
    profileId: string,
    modName: string,
    enabled: boolean,
    filePath: string
  ): Promise<void> {
    await this.upsert({
      profileId,
      modName,
      enabled,
      filePath,
    });
  }

  /**
   * Get mod states for a profile (alias for findByProfileId for consistency with requirements)
   */
  public async getModStates(profileId: string): Promise<ForgeModState[]> {
    return await this.findByProfileId(profileId);
  }

  /**
   * Delete all mod states for a profile
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
   * Delete mod states for a profile (alias for deleteByProfileId for consistency with requirements)
   */
  public async deleteModStates(profileId: string): Promise<void> {
    await this.deleteByProfileId(profileId);
  }

  /**
   * Get default mod states (OptiFine enabled by default)
   */
  public getDefaultModStates(): Partial<ForgeModState>[] {
    return [
      {
        modName: 'OptiFine',
        enabled: true,
      },
    ];
  }

  /**
   * Initialize default mod states for a profile
   */
  public async initializeDefaults(
    profileId: string,
    modsDirectory: string
  ): Promise<void> {
    const defaults = this.getDefaultModStates();
    
    await this.dbConnection.executeTransaction(async () => {
      for (const defaultState of defaults) {
        await this.upsert({
          profileId,
          modName: defaultState.modName!,
          enabled: defaultState.enabled!,
          filePath: `${modsDirectory}/${defaultState.modName}.jar`,
        });
      }
    });
  }

  /**
   * Get enabled mod names for a profile
   */
  public async getEnabledModNames(profileId: string): Promise<string[]> {
    const db = await this.getDatabase();
    const rows = await db.all<{ mod_name: string }[]>(
      `SELECT mod_name FROM ${this.tableName} WHERE profile_id = ? AND enabled = 1`,
      [profileId]
    );

    return rows.map((row) => row.mod_name);
  }

  /**
   * Get disabled mod names for a profile
   */
  public async getDisabledModNames(profileId: string): Promise<string[]> {
    const db = await this.getDatabase();
    const rows = await db.all<{ mod_name: string }[]>(
      `SELECT mod_name FROM ${this.tableName} WHERE profile_id = ? AND enabled = 0`,
      [profileId]
    );

    return rows.map((row) => row.mod_name);
  }

  /**
   * Bulk update mod states
   */
  public async bulkUpsert(modStates: CreateForgeModStateData[]): Promise<void> {
    await this.dbConnection.executeTransaction(async () => {
      for (const modState of modStates) {
        await this.upsert(modState);
      }
    });
  }

  /**
   * Update mod state by profile and mod name
   */
  public async updateModState(
    profileId: string,
    modName: string,
    enabled: boolean
  ): Promise<void> {
    const existing = await this.findByProfileAndMod(profileId, modName);
    if (existing) {
      await this.upsert({
        profileId,
        modName,
        enabled,
        filePath: existing.filePath,
      });
    }
  }

  /**
   * Check if a mod state exists for a profile
   */
  public async existsByProfileAndMod(
    profileId: string,
    modName: string
  ): Promise<boolean> {
    const db = await this.getDatabase();
    const result = await db.get(
      `SELECT 1 FROM ${this.tableName} WHERE profile_id = ? AND mod_name = ? LIMIT 1`,
      [profileId, modName]
    );

    return !!result;
  }

  /**
   * Count mod states for a profile
   */
  public async countByProfileId(profileId: string): Promise<number> {
    const db = await this.getDatabase();
    const result = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE profile_id = ?`,
      [profileId]
    );

    return result?.count || 0;
  }
}