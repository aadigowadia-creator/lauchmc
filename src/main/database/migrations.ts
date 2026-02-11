import { Database } from 'sqlite';
import { DatabaseConnection } from './connection';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => Promise<void>;
  down: (db: Database) => Promise<void>;
}

export class MigrationManager {
  private migrations: Migration[] = [
    {
      version: 1,
      name: 'create_profiles_table',
      up: async (db: Database) => {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            version_id TEXT NOT NULL,
            installation_dir TEXT,
            memory_min INTEGER DEFAULT 1024,
            memory_max INTEGER DEFAULT 2048,
            jvm_args TEXT DEFAULT '',
            mod_loader TEXT, -- JSON string for mod loader config
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_used DATETIME
          )
        `);
      },
      down: async (db: Database) => {
        await db.exec('DROP TABLE IF EXISTS profiles');
      },
    },
    {
      version: 2,
      name: 'create_migrations_table',
      up: async (db: Database) => {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
      },
      down: async (db: Database) => {
        await db.exec('DROP TABLE IF EXISTS migrations');
      },
    },
    {
      version: 3,
      name: 'create_mod_states_table',
      up: async (db: Database) => {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS mod_states (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL,
            mod_id TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
            UNIQUE(profile_id, mod_id)
          );
          
          CREATE INDEX IF NOT EXISTS idx_mod_states_profile ON mod_states(profile_id);
        `);
      },
      down: async (db: Database) => {
        await db.exec('DROP INDEX IF EXISTS idx_mod_states_profile');
        await db.exec('DROP TABLE IF EXISTS mod_states');
      },
    },
    {
      version: 4,
      name: 'create_custom_mods_table',
      up: async (db: Database) => {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS custom_mods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL,
            mod_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            file_name TEXT NOT NULL,
            source TEXT NOT NULL CHECK(source IN ('modrinth', 'curseforge')),
            project_id TEXT NOT NULL,
            version_id TEXT,
            download_url TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
            UNIQUE(profile_id, mod_id)
          );
          
          CREATE INDEX IF NOT EXISTS idx_custom_mods_profile ON custom_mods(profile_id);
        `);
      },
      down: async (db: Database) => {
        await db.exec('DROP INDEX IF EXISTS idx_custom_mods_profile');
        await db.exec('DROP TABLE IF EXISTS custom_mods');
      },
    },
    {
      version: 5,
      name: 'create_profile_preferences_table',
      up: async (db: Database) => {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS profile_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL,
            preference_key TEXT NOT NULL,
            preference_value TEXT NOT NULL,
            FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
            UNIQUE(profile_id, preference_key)
          );
          
          CREATE INDEX IF NOT EXISTS idx_profile_preferences_profile ON profile_preferences(profile_id);
        `);
      },
      down: async (db: Database) => {
        await db.exec('DROP INDEX IF EXISTS idx_profile_preferences_profile');
        await db.exec('DROP TABLE IF EXISTS profile_preferences');
      },
    },
    {
      version: 6,
      name: 'create_forge_mod_states_table',
      up: async (db: Database) => {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS forge_mod_states (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id TEXT NOT NULL,
            mod_name TEXT NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT 1,
            file_path TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(profile_id, mod_name)
          );
          
          CREATE INDEX IF NOT EXISTS idx_forge_mod_states_profile ON forge_mod_states(profile_id);
        `);
      },
      down: async (db: Database) => {
        await db.exec('DROP INDEX IF EXISTS idx_forge_mod_states_profile');
        await db.exec('DROP TABLE IF EXISTS forge_mod_states');
      },
    },
    {
      version: 7,
      name: 'create_optifine_configs_table',
      up: async (db: Database) => {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS optifine_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id TEXT NOT NULL UNIQUE,
            version TEXT NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT 1,
            download_url TEXT,
            file_path TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          
          CREATE INDEX IF NOT EXISTS idx_optifine_configs_profile ON optifine_configs(profile_id);
        `);
      },
      down: async (db: Database) => {
        await db.exec('DROP INDEX IF EXISTS idx_optifine_configs_profile');
        await db.exec('DROP TABLE IF EXISTS optifine_configs');
      },
    },
    {
      version: 8,
      name: 'create_forge_settings_table',
      up: async (db: Database) => {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS forge_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            setting_key TEXT NOT NULL UNIQUE,
            setting_value TEXT NOT NULL,
            setting_type TEXT NOT NULL CHECK(setting_type IN ('string', 'number', 'boolean', 'json')),
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          
          CREATE INDEX IF NOT EXISTS idx_forge_settings_key ON forge_settings(setting_key);
        `);
      },
      down: async (db: Database) => {
        await db.exec('DROP INDEX IF EXISTS idx_forge_settings_key');
        await db.exec('DROP TABLE IF EXISTS forge_settings');
      },
    },
  ];

  public async runMigrations(): Promise<void> {
    const dbConnection = DatabaseConnection.getInstance();
    const db = await dbConnection.getDatabase();

    // First, ensure migrations table exists
    const migrationTableExists = await db.get(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='migrations'
    `);

    if (!migrationTableExists) {
      // Create migrations table first
      const migrationTableMigration = this.migrations.find(m => m.name === 'create_migrations_table');
      if (migrationTableMigration) {
        await migrationTableMigration.up(db);
        await db.run(
          'INSERT INTO migrations (version, name) VALUES (?, ?)',
          [migrationTableMigration.version, migrationTableMigration.name]
        );
      }
    }

    // Get applied migrations
    const appliedMigrations = await db.all<{ version: number }[]>(
      'SELECT version FROM migrations ORDER BY version'
    );
    const appliedVersions = new Set(appliedMigrations.map(m => m.version));

    // Run pending migrations
    for (const migration of this.migrations) {
      if (!appliedVersions.has(migration.version)) {
        console.log(`Running migration: ${migration.name}`);
        
        await dbConnection.executeTransaction(async (transactionDb) => {
          await migration.up(transactionDb);
          await transactionDb.run(
            'INSERT INTO migrations (version, name) VALUES (?, ?)',
            [migration.version, migration.name]
          );
        });
        
        console.log(`Migration completed: ${migration.name}`);
      }
    }
  }

  public async rollbackMigration(targetVersion: number): Promise<void> {
    const dbConnection = DatabaseConnection.getInstance();
    const db = await dbConnection.getDatabase();

    const appliedMigrations = await db.all<{ version: number; name: string }[]>(
      'SELECT version, name FROM migrations WHERE version > ? ORDER BY version DESC',
      [targetVersion]
    );

    for (const appliedMigration of appliedMigrations) {
      const migration = this.migrations.find(m => m.version === appliedMigration.version);
      if (migration) {
        console.log(`Rolling back migration: ${migration.name}`);
        
        await dbConnection.executeTransaction(async (transactionDb) => {
          await migration.down(transactionDb);
          await transactionDb.run(
            'DELETE FROM migrations WHERE version = ?',
            [migration.version]
          );
        });
        
        console.log(`Migration rolled back: ${migration.name}`);
      }
    }
  }

  public async getCurrentVersion(): Promise<number> {
    const dbConnection = DatabaseConnection.getInstance();
    const db = await dbConnection.getDatabase();

    const result = await db.get<{ version: number }>(
      'SELECT MAX(version) as version FROM migrations'
    );

    return result?.version || 0;
  }
}