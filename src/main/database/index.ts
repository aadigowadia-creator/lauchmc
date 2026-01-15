import { MigrationManager } from './migrations';

// Database module exports
export { DatabaseConnection } from './connection';
export { MigrationManager, type Migration } from './migrations';

// Initialize database function
export async function initializeDatabase(): Promise<void> {
  const migrationManager = new MigrationManager();
  await migrationManager.runMigrations();
  console.log('Database initialized successfully');
}