import { BaseRepository } from './base-repository';
import {
  ModState,
  ModStateRow,
  CreateModStateData,
  UpdateModStateData,
} from '../models';

export class ModStateRepository extends BaseRepository<
  ModState,
  CreateModStateData,
  UpdateModStateData
> {
  protected tableName = 'mod_states';

  protected mapRowToEntity(row: ModStateRow): ModState {
    return {
      id: row.id,
      profileId: row.profile_id,
      modId: row.mod_id,
      enabled: row.enabled === 1,
      updatedAt: new Date(row.updated_at),
    };
  }

  protected mapEntityToRow(
    entity: CreateModStateData | UpdateModStateData
  ): Partial<ModStateRow> {
    const row: Partial<ModStateRow> = {};

    if ('profileId' in entity && entity.profileId !== undefined) {
      row.profile_id = entity.profileId;
    }
    if ('modId' in entity && entity.modId !== undefined) {
      row.mod_id = entity.modId;
    }
    if ('enabled' in entity && entity.enabled !== undefined) {
      row.enabled = entity.enabled ? 1 : 0;
    }
    // Always set updated_at for creates and updates
    row.updated_at = new Date().toISOString();

    return row;
  }

  /**
   * Get all mod states for a profile
   */
  public async findByProfileId(profileId: number): Promise<ModState[]> {
    const db = await this.getDatabase();
    const rows = await db.all<ModStateRow[]>(
      `SELECT * FROM ${this.tableName} WHERE profile_id = ? ORDER BY mod_id`,
      [profileId]
    );

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Get specific mod state
   */
  public async findByProfileAndMod(
    profileId: number,
    modId: string
  ): Promise<ModState | null> {
    const db = await this.getDatabase();
    const row = await db.get<ModStateRow>(
      `SELECT * FROM ${this.tableName} WHERE profile_id = ? AND mod_id = ?`,
      [profileId, modId]
    );

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Create or update mod state (upsert)
   */
  public async upsert(modState: CreateModStateData): Promise<ModState> {
    const db = await this.getDatabase();
    const existing = await this.findByProfileAndMod(
      modState.profileId,
      modState.modId
    );

    if (existing) {
      // Update existing
      const rowData = this.mapEntityToRow({ enabled: modState.enabled });
      await db.run(
        `UPDATE ${this.tableName} SET enabled = ?, updated_at = ? WHERE profile_id = ? AND mod_id = ?`,
        [rowData.enabled, rowData.updated_at, modState.profileId, modState.modId]
      );
      return (await this.findByProfileAndMod(
        modState.profileId,
        modState.modId
      ))!;
    } else {
      // Create new
      return await this.create(modState);
    }
  }

  /**
   * Delete all mod states for a profile
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
   * Initialize default mod states (all enabled)
   */
  public async initializeDefaults(
    profileId: number,
    modIds: string[]
  ): Promise<void> {
    const db = await this.getDatabase();
    const now = new Date().toISOString();

    // Use transaction for bulk insert
    await this.dbConnection.executeTransaction(async () => {
      for (const modId of modIds) {
        await db.run(
          `INSERT OR IGNORE INTO ${this.tableName} (profile_id, mod_id, enabled, updated_at) VALUES (?, ?, ?, ?)`,
          [profileId, modId, 1, now]
        );
      }
    });
  }

  /**
   * Get enabled mod IDs for a profile
   */
  public async getEnabledModIds(profileId: number): Promise<string[]> {
    const db = await this.getDatabase();
    const rows = await db.all<{ mod_id: string }[]>(
      `SELECT mod_id FROM ${this.tableName} WHERE profile_id = ? AND enabled = 1`,
      [profileId]
    );

    return rows.map((row) => row.mod_id);
  }

  /**
   * Get disabled mod IDs for a profile
   */
  public async getDisabledModIds(profileId: number): Promise<string[]> {
    const db = await this.getDatabase();
    const rows = await db.all<{ mod_id: string }[]>(
      `SELECT mod_id FROM ${this.tableName} WHERE profile_id = ? AND enabled = 0`,
      [profileId]
    );

    return rows.map((row) => row.mod_id);
  }

  /**
   * Bulk update mod states
   */
  public async bulkUpsert(modStates: CreateModStateData[]): Promise<void> {
    await this.dbConnection.executeTransaction(async () => {
      for (const modState of modStates) {
        await this.upsert(modState);
      }
    });
  }
}
