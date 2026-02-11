import * as os from 'os';

// Mock electron app before importing database modules
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue(os.tmpdir()),
  },
}));

import { ForgeModRepository } from '../main/repositories/forge-mod-repository';
import { OptiFineConfigRepository } from '../main/repositories/optifine-config-repository';
import { DatabaseConnection } from '../main/database/connection';
import { MigrationManager } from '../main/database/migrations';
import { CreateForgeModStateData, CreateOptiFineConfigData } from '../main/models';

describe('Forge Mod Repositories', () => {
  let forgeModRepo: ForgeModRepository;
  let optifineConfigRepo: OptiFineConfigRepository;
  let dbConnection: DatabaseConnection;
  let migrationManager: MigrationManager;

  beforeAll(async () => {
    // Use in-memory database for testing
    process.env.NODE_ENV = 'test';
    
    dbConnection = DatabaseConnection.getInstance();
    await dbConnection.connect();
    migrationManager = new MigrationManager();
    await migrationManager.runMigrations();

    forgeModRepo = new ForgeModRepository();
    optifineConfigRepo = new OptiFineConfigRepository();
  });

  beforeEach(async () => {
    // Clean up data before each test
    const db = await dbConnection.getDatabase();
    await db.exec('DELETE FROM forge_mod_states');
    await db.exec('DELETE FROM optifine_configs');
  });

  afterAll(async () => {
    await dbConnection.close();
  });

  describe('ForgeModRepository', () => {
    const testProfileId = 'test-profile-1';
    const testModState: CreateForgeModStateData = {
      profileId: testProfileId,
      modName: 'OptiFine',
      enabled: true,
      filePath: '/path/to/mods/OptiFine.jar',
    };

    it('should create and retrieve a forge mod state', async () => {
      const created = await forgeModRepo.create(testModState);
      
      expect(created.id).toBeDefined();
      expect(created.profileId).toBe(testModState.profileId);
      expect(created.modName).toBe(testModState.modName);
      expect(created.enabled).toBe(testModState.enabled);
      expect(created.filePath).toBe(testModState.filePath);
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);
    });

    it('should find mod states by profile ID', async () => {
      await forgeModRepo.create(testModState);
      await forgeModRepo.create({
        ...testModState,
        modName: 'JEI',
        filePath: '/path/to/mods/JEI.jar',
      });

      const modStates = await forgeModRepo.findByProfileId(testProfileId);
      
      expect(modStates).toHaveLength(2);
      expect(modStates.map(m => m.modName)).toContain('OptiFine');
      expect(modStates.map(m => m.modName)).toContain('JEI');
    });

    it('should find specific mod state by profile and mod name', async () => {
      await forgeModRepo.create(testModState);
      
      const found = await forgeModRepo.findByProfileAndMod(testProfileId, 'OptiFine');
      
      expect(found).not.toBeNull();
      expect(found!.modName).toBe('OptiFine');
      expect(found!.enabled).toBe(true);
    });

    it('should upsert mod states', async () => {
      // First upsert (create)
      const created = await forgeModRepo.upsert(testModState);
      expect(created.enabled).toBe(true);

      // Second upsert (update)
      const updated = await forgeModRepo.upsert({
        ...testModState,
        enabled: false,
      });
      expect(updated.enabled).toBe(false);
      expect(updated.id).toBe(created.id);
    });

    it('should save mod state using saveModState method', async () => {
      await forgeModRepo.saveModState(
        testProfileId,
        'OptiFine',
        true,
        '/path/to/mods/OptiFine.jar'
      );

      const found = await forgeModRepo.findByProfileAndMod(testProfileId, 'OptiFine');
      expect(found).not.toBeNull();
      expect(found!.enabled).toBe(true);
    });

    it('should get mod states using getModStates method', async () => {
      await forgeModRepo.create(testModState);
      
      const modStates = await forgeModRepo.getModStates(testProfileId);
      expect(modStates).toHaveLength(1);
      expect(modStates[0].modName).toBe('OptiFine');
    });

    it('should delete mod states by profile ID', async () => {
      await forgeModRepo.create(testModState);
      
      const deleted = await forgeModRepo.deleteByProfileId(testProfileId);
      expect(deleted).toBe(true);
      
      const modStates = await forgeModRepo.findByProfileId(testProfileId);
      expect(modStates).toHaveLength(0);
    });

    it('should get default mod states', () => {
      const defaults = forgeModRepo.getDefaultModStates();
      expect(defaults).toHaveLength(1);
      expect(defaults[0].modName).toBe('OptiFine');
      expect(defaults[0].enabled).toBe(true);
    });

    it('should initialize default mod states', async () => {
      await forgeModRepo.initializeDefaults(testProfileId, '/path/to/mods');
      
      const modStates = await forgeModRepo.findByProfileId(testProfileId);
      expect(modStates).toHaveLength(1);
      expect(modStates[0].modName).toBe('OptiFine');
      expect(modStates[0].enabled).toBe(true);
    });

    it('should get enabled and disabled mod names', async () => {
      await forgeModRepo.create(testModState);
      await forgeModRepo.create({
        ...testModState,
        modName: 'JEI',
        enabled: false,
        filePath: '/path/to/mods/JEI.jar',
      });

      const enabled = await forgeModRepo.getEnabledModNames(testProfileId);
      const disabled = await forgeModRepo.getDisabledModNames(testProfileId);
      
      expect(enabled).toContain('OptiFine');
      expect(disabled).toContain('JEI');
    });
  });

  describe('OptiFineConfigRepository', () => {
    const testProfileId = 'test-profile-1';
    const testConfig: CreateOptiFineConfigData = {
      profileId: testProfileId,
      version: 'HD_U_I5',
      enabled: true,
      downloadUrl: 'https://optifine.net/download',
      filePath: '/path/to/mods/OptiFine.jar',
    };

    it('should create and retrieve OptiFine config', async () => {
      const created = await optifineConfigRepo.create(testConfig);
      
      expect(created.id).toBeDefined();
      expect(created.profileId).toBe(testConfig.profileId);
      expect(created.version).toBe(testConfig.version);
      expect(created.enabled).toBe(testConfig.enabled);
      expect(created.downloadUrl).toBe(testConfig.downloadUrl);
      expect(created.filePath).toBe(testConfig.filePath);
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);
    });

    it('should find config by profile ID', async () => {
      await optifineConfigRepo.create(testConfig);
      
      const found = await optifineConfigRepo.findByProfileId(testProfileId);
      
      expect(found).not.toBeNull();
      expect(found!.version).toBe('HD_U_I5');
      expect(found!.enabled).toBe(true);
    });

    it('should upsert OptiFine configs', async () => {
      // First upsert (create)
      const created = await optifineConfigRepo.upsert(testConfig);
      expect(created.version).toBe('HD_U_I5');

      // Second upsert (update)
      const updated = await optifineConfigRepo.upsert({
        ...testConfig,
        version: 'HD_U_I6',
      });
      expect(updated.version).toBe('HD_U_I6');
      expect(updated.id).toBe(created.id);
    });

    it('should save config using saveConfig method', async () => {
      const saved = await optifineConfigRepo.saveConfig(
        testProfileId,
        'HD_U_I5',
        true,
        'https://optifine.net/download',
        '/path/to/mods/OptiFine.jar'
      );

      expect(saved.version).toBe('HD_U_I5');
      expect(saved.enabled).toBe(true);
    });

    it('should get config using getConfig method', async () => {
      await optifineConfigRepo.create(testConfig);
      
      const config = await optifineConfigRepo.getConfig(testProfileId);
      expect(config).not.toBeNull();
      expect(config!.version).toBe('HD_U_I5');
    });

    it('should delete config by profile ID', async () => {
      await optifineConfigRepo.create(testConfig);
      
      const deleted = await optifineConfigRepo.deleteByProfileId(testProfileId);
      expect(deleted).toBe(true);
      
      const config = await optifineConfigRepo.findByProfileId(testProfileId);
      expect(config).toBeNull();
    });

    it('should enable and disable OptiFine', async () => {
      await optifineConfigRepo.create(testConfig);
      
      await optifineConfigRepo.disableOptiFine(testProfileId);
      let config = await optifineConfigRepo.findByProfileId(testProfileId);
      expect(config!.enabled).toBe(false);
      
      await optifineConfigRepo.enableOptiFine(testProfileId);
      config = await optifineConfigRepo.findByProfileId(testProfileId);
      expect(config!.enabled).toBe(true);
    });

    it('should update OptiFine version', async () => {
      await optifineConfigRepo.create(testConfig);
      
      await optifineConfigRepo.updateVersion(
        testProfileId,
        'HD_U_I6',
        'https://optifine.net/download/new',
        '/path/to/mods/OptiFine_new.jar'
      );
      
      const config = await optifineConfigRepo.findByProfileId(testProfileId);
      expect(config!.version).toBe('HD_U_I6');
      expect(config!.downloadUrl).toBe('https://optifine.net/download/new');
      expect(config!.filePath).toBe('/path/to/mods/OptiFine_new.jar');
    });

    it('should get all configs', async () => {
      await optifineConfigRepo.create(testConfig);
      await optifineConfigRepo.create({
        ...testConfig,
        profileId: 'test-profile-2',
      });

      const allConfigs = await optifineConfigRepo.getAllConfigs();
      expect(allConfigs).toHaveLength(2);
    });

    it('should get enabled configs only', async () => {
      await optifineConfigRepo.create(testConfig);
      await optifineConfigRepo.create({
        ...testConfig,
        profileId: 'test-profile-2',
        enabled: false,
      });

      const enabledConfigs = await optifineConfigRepo.getEnabledConfigs();
      expect(enabledConfigs).toHaveLength(1);
      expect(enabledConfigs[0].enabled).toBe(true);
    });

    it('should find configs by version', async () => {
      await optifineConfigRepo.create(testConfig);
      await optifineConfigRepo.create({
        ...testConfig,
        profileId: 'test-profile-2',
        version: 'HD_U_I6',
      });

      const configsI5 = await optifineConfigRepo.findByVersion('HD_U_I5');
      const configsI6 = await optifineConfigRepo.findByVersion('HD_U_I6');
      
      expect(configsI5).toHaveLength(1);
      expect(configsI6).toHaveLength(1);
    });
  });
});