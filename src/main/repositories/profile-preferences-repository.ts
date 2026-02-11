import { BaseRepository } from './base-repository';
import {
  ProfilePreference,
  ProfilePreferenceRow,
  CreateProfilePreferenceData,
} from '../models';

export class ProfilePreferencesRepository extends BaseRepository<
  ProfilePreference,
  CreateProfilePreferenceData,
  Partial<ProfilePreference>
> {
  protected tableName = 'profile_preferences';

  protected mapRowToEntity(row: ProfilePreferenceRow): ProfilePreference {
    return {
      id: row.id,
      profileId: row.profile_id,
      preferenceKey: row.preference_key,
      preferenceValue: row.preference_value,
    };
  }

  protected mapEntityToRow(
    entity: CreateProfilePreferenceData | Partial<ProfilePreference>
  ): Partial<ProfilePreferenceRow> {
    const row: Partial<ProfilePreferenceRow> = {};

    if ('profileId' in entity && entity.profileId !== undefined) {
      row.profile_id = entity.profileId;
    }
    if ('preferenceKey' in entity && entity.preferenceKey !== undefined) {
      row.preference_key = entity.preferenceKey;
    }
    if ('preferenceValue' in entity && entity.preferenceValue !== undefined) {
      row.preference_value = entity.preferenceValue;
    }

    return row;
  }

  /**
   * Get all preferences for a profile
   */
  public async findByProfileId(profileId: number): Promise<ProfilePreference[]> {
    const db = await this.getDatabase();
    const rows = await db.all<ProfilePreferenceRow[]>(
      `SELECT * FROM ${this.tableName} WHERE profile_id = ? ORDER BY preference_key`,
      [profileId]
    );

    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Get specific preference by key
   */
  public async findByProfileAndKey(
    profileId: number,
    preferenceKey: string
  ): Promise<ProfilePreference | null> {
    const db = await this.getDatabase();
    const row = await db.get<ProfilePreferenceRow>(
      `SELECT * FROM ${this.tableName} WHERE profile_id = ? AND preference_key = ?`,
      [profileId, preferenceKey]
    );

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Get preference value by key (convenience method)
   */
  public async getPreferenceValue(
    profileId: number,
    preferenceKey: string
  ): Promise<string | null> {
    const preference = await this.findByProfileAndKey(profileId, preferenceKey);
    return preference ? preference.preferenceValue : null;
  }

  /**
   * Set preference value (upsert)
   */
  public async setPreference(
    profileId: number,
    preferenceKey: string,
    preferenceValue: string
  ): Promise<ProfilePreference> {
    const db = await this.getDatabase();
    const existing = await this.findByProfileAndKey(profileId, preferenceKey);

    if (existing) {
      // Update existing
      await db.run(
        `UPDATE ${this.tableName} SET preference_value = ? WHERE profile_id = ? AND preference_key = ?`,
        [preferenceValue, profileId, preferenceKey]
      );
      return (await this.findByProfileAndKey(profileId, preferenceKey))!;
    } else {
      // Create new
      return await this.create({
        profileId,
        preferenceKey,
        preferenceValue,
      });
    }
  }

  /**
   * Delete preference by key
   */
  public async deleteByProfileAndKey(
    profileId: number,
    preferenceKey: string
  ): Promise<boolean> {
    const db = await this.getDatabase();
    const result = await db.run(
      `DELETE FROM ${this.tableName} WHERE profile_id = ? AND preference_key = ?`,
      [profileId, preferenceKey]
    );

    return (result.changes || 0) > 0;
  }

  /**
   * Delete all preferences for a profile
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
   * Check if preference exists
   */
  public async existsByProfileAndKey(
    profileId: number,
    preferenceKey: string
  ): Promise<boolean> {
    const db = await this.getDatabase();
    const result = await db.get(
      `SELECT 1 FROM ${this.tableName} WHERE profile_id = ? AND preference_key = ? LIMIT 1`,
      [profileId, preferenceKey]
    );

    return !!result;
  }

  /**
   * Get preferences as a key-value map
   */
  public async getPreferencesMap(
    profileId: number
  ): Promise<Map<string, string>> {
    const preferences = await this.findByProfileId(profileId);
    const map = new Map<string, string>();

    for (const pref of preferences) {
      map.set(pref.preferenceKey, pref.preferenceValue);
    }

    return map;
  }

  /**
   * Bulk set preferences
   */
  public async bulkSetPreferences(
    profileId: number,
    preferences: Record<string, string>
  ): Promise<void> {
    await this.dbConnection.executeTransaction(async () => {
      for (const [key, value] of Object.entries(preferences)) {
        await this.setPreference(profileId, key, value);
      }
    });
  }

  /**
   * Get boolean preference value (convenience method)
   */
  public async getBooleanPreference(
    profileId: number,
    preferenceKey: string,
    defaultValue: boolean = false
  ): Promise<boolean> {
    const value = await this.getPreferenceValue(profileId, preferenceKey);
    if (value === null) {
      return defaultValue;
    }
    return value === 'true' || value === '1';
  }

  /**
   * Set boolean preference value (convenience method)
   */
  public async setBooleanPreference(
    profileId: number,
    preferenceKey: string,
    value: boolean
  ): Promise<ProfilePreference> {
    return await this.setPreference(profileId, preferenceKey, value.toString());
  }
}
