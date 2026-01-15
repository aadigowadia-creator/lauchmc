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