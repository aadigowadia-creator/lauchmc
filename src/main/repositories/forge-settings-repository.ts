import { BaseRepository } from './base-repository';
import { 
  ForgeSetting, 
  ForgeSettingRow, 
  CreateForgeSettingData, 
  UpdateForgeSettingData 
} from '../models';

export class ForgeSettingsRepository extends BaseRepository<ForgeSetting, CreateForgeSettingData, UpdateForgeSettingData> {
  protected tableName = 'forge_settings';

  protected mapRowToEntity(row: ForgeSettingRow): ForgeSetting {
    return {
      id: row.id,
      settingKey: row.setting_key,
      settingValue: row.setting_value,
      settingType: row.setting_type as 'string' | 'number' | 'boolean' | 'json',
      description: row.description || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  protected mapEntityToRow(entity: CreateForgeSettingData | UpdateForgeSettingData): any {
    const now = new Date().toISOString();
    return {
      setting_key: (entity as CreateForgeSettingData).settingKey,
      setting_value: entity.settingValue,
      setting_type: entity.settingType,
      description: entity.description || null,
      created_at: now,
      updated_at: now
    };
  }
  /**
   * Get a setting by key
   */
  public async getSetting(key: string): Promise<ForgeSetting | null> {
    const db = await this.getDatabase();
    const row = await db.get<ForgeSettingRow>(
      'SELECT * FROM forge_settings WHERE setting_key = ?',
      [key]
    );

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Get all settings
   */
  public async getAllSettings(): Promise<ForgeSetting[]> {
    const db = await this.getDatabase();
    const rows = await db.all<ForgeSettingRow[]>(
      'SELECT * FROM forge_settings ORDER BY setting_key'
    );

    return rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Get settings by key prefix
   */
  public async getSettingsByPrefix(prefix: string): Promise<ForgeSetting[]> {
    const db = await this.getDatabase();
    const rows = await db.all<ForgeSettingRow[]>(
      'SELECT * FROM forge_settings WHERE setting_key LIKE ? ORDER BY setting_key',
      [`${prefix}%`]
    );

    return rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Create or update a setting
   */
  public async setSetting(data: CreateForgeSettingData): Promise<ForgeSetting> {
    const db = await this.getDatabase();
    const now = new Date().toISOString();

    const result = await db.run(
      `INSERT OR REPLACE INTO forge_settings 
       (setting_key, setting_value, setting_type, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, 
         COALESCE((SELECT created_at FROM forge_settings WHERE setting_key = ?), ?),
         ?)`,
      [
        data.settingKey,
        data.settingValue,
        data.settingType,
        data.description || null,
        data.settingKey,
        now,
        now
      ]
    );

    if (!result.lastID) {
      throw new Error('Failed to create/update setting');
    }

    const created = await this.getSetting(data.settingKey);
    if (!created) {
      throw new Error('Failed to retrieve created setting');
    }

    return created;
  }

  /**
   * Update a setting
   */
  public async updateSetting(key: string, data: UpdateForgeSettingData): Promise<ForgeSetting | null> {
    const existing = await this.getSetting(key);
    if (!existing) {
      return null;
    }

    const db = await this.getDatabase();
    const now = new Date().toISOString();

    const updates: string[] = [];
    const values: any[] = [];

    if (data.settingValue !== undefined) {
      updates.push('setting_value = ?');
      values.push(data.settingValue);
    }

    if (data.settingType !== undefined) {
      updates.push('setting_type = ?');
      values.push(data.settingType);
    }

    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(key);

    await db.run(
      `UPDATE forge_settings SET ${updates.join(', ')} WHERE setting_key = ?`,
      values
    );

    return await this.getSetting(key);
  }

  /**
   * Delete a setting
   */
  public async deleteSetting(key: string): Promise<boolean> {
    const db = await this.getDatabase();
    const result = await db.run(
      'DELETE FROM forge_settings WHERE setting_key = ?',
      [key]
    );

    return (result.changes || 0) > 0;
  }

  /**
   * Delete settings by key prefix
   */
  public async deleteSettingsByPrefix(prefix: string): Promise<number> {
    const db = await this.getDatabase();
    const result = await db.run(
      'DELETE FROM forge_settings WHERE setting_key LIKE ?',
      [`${prefix}%`]
    );

    return result.changes || 0;
  }

  /**
   * Check if a setting exists
   */
  public async settingExists(key: string): Promise<boolean> {
    const db = await this.getDatabase();
    const result = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM forge_settings WHERE setting_key = ?',
      [key]
    );

    return (result?.count || 0) > 0;
  }

  /**
   * Get setting value with type conversion
   */
  public async getSettingValue<T>(key: string, defaultValue: T): Promise<T> {
    const setting = await this.getSetting(key);
    if (!setting) {
      return defaultValue;
    }

    return this.convertSettingValue(setting, defaultValue);
  }

  /**
   * Set setting value with automatic type detection
   */
  public async setSettingValue<T>(key: string, value: T, description?: string): Promise<void> {
    const settingType = this.detectSettingType(value);
    const settingValue = this.serializeSettingValue(value);

    await this.setSetting({
      settingKey: key,
      settingValue,
      settingType,
      description
    });
  }

  // Private helper methods

  private convertSettingValue<T>(setting: ForgeSetting, defaultValue: T): T {
    try {
      switch (setting.settingType) {
        case 'boolean':
          return (setting.settingValue === 'true') as unknown as T;
        case 'number':
          return Number(setting.settingValue) as unknown as T;
        case 'json':
          return JSON.parse(setting.settingValue) as T;
        case 'string':
        default:
          return setting.settingValue as unknown as T;
      }
    } catch (error) {
      console.warn(`Failed to convert setting ${setting.settingKey}:`, error);
      return defaultValue;
    }
  }

  private detectSettingType(value: any): 'string' | 'number' | 'boolean' | 'json' {
    if (typeof value === 'boolean') {
      return 'boolean';
    }
    if (typeof value === 'number') {
      return 'number';
    }
    if (typeof value === 'string') {
      return 'string';
    }
    return 'json';
  }

  private serializeSettingValue(value: any): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
      return String(value);
    }
    return JSON.stringify(value);
  }
}