import * as os from 'os';

// Mock electron app before importing database modules
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue(os.tmpdir()),
  },
}));

import { DatabaseConnection, MigrationManager } from '../main/database';
import {
  ModStateRepository,
  CustomModRepository,
  ProfilePreferencesRepository,
  ProfileRepository,
} from '../main/repositories';
import { CreateProfileData } from '../main/models';

describe('Mod Management Repositories', () => {
  let dbConnection: DatabaseConnection;
  let migrationManager: MigrationManager;
  let modStateRepo: ModStateRepository;
  let customModRepo: CustomModRepository;
  let profilePrefsRepo: ProfilePreferencesRepository;
  let profileRepo: ProfileRepository;
  let testProfileId: number;

  beforeAll(async () => {
    dbConnection = DatabaseConnection.getInstance();
    await dbConnection.connect();
    migrationManager = new MigrationManager();
    await migrationManager.runMigrations();

    modStateRepo = new ModStateRepository();
    customModRepo = new CustomModRepository();
    profilePrefsRepo = new ProfilePreferencesRepository();
    profileRepo = new ProfileRepository();
  });

  beforeEach(async () => {
    // Clean up before each test
    const db = await dbConnection.getDatabase();
    await db.run('DELETE FROM mod_states');
    await db.run('DELETE FROM custom_mods');
    await db.run('DELETE FROM profile_preferences');
    await db.run('DELETE FROM profiles');

    // Create a test profile for each test
    const profileData: CreateProfileData = {
      name: `Test Fabric Profile ${Date.now()}`,
      versionId: '1.20.1',
      installationDir: '/test/minecraft',
      memoryMin: 2048,
      memoryMax: 4096,
      jvmArgs: '-XX:+UseG1GC',
      modLoader: {
        type: 'fabric',
        version: '0.15.0',
      },
    };
    const profile = await profileRepo.create(profileData);
    testProfileId = profile.id!;
  });

  afterAll(async () => {
    await dbConnection.close();
  });

  describe('ModStateRepository', () => {
    it('should initialize default mod states', async () => {
      const modIds = ['fabric-api', 'sodium', 'lithium'];
      await modStateRepo.initializeDefaults(testProfileId, modIds);

      const states = await modStateRepo.findByProfileId(testProfileId);
      expect(states).toHaveLength(3);
      expect(states.every((s) => s.enabled)).toBe(true);
    });

    it('should upsert mod state', async () => {
      // Initialize first
      await modStateRepo.initializeDefaults(testProfileId, ['sodium']);
      
      await modStateRepo.upsert({
        profileId: testProfileId,
        modId: 'sodium',
        enabled: false,
      });

      const state = await modStateRepo.findByProfileAndMod(
        testProfileId,
        'sodium'
      );
      expect(state).not.toBeNull();
      expect(state!.enabled).toBe(false);
    });

    it('should get enabled and disabled mod IDs', async () => {
      // Initialize mods
      await modStateRepo.initializeDefaults(testProfileId, ['fabric-api', 'sodium', 'lithium']);
      
      // Disable sodium
      await modStateRepo.upsert({
        profileId: testProfileId,
        modId: 'sodium',
        enabled: false,
      });
      
      const enabledIds = await modStateRepo.getEnabledModIds(testProfileId);
      const disabledIds = await modStateRepo.getDisabledModIds(testProfileId);

      expect(enabledIds).toContain('fabric-api');
      expect(enabledIds).toContain('lithium');
      expect(disabledIds).toContain('sodium');
    });

    it('should bulk upsert mod states', async () => {
      // Initialize first
      await modStateRepo.initializeDefaults(testProfileId, ['fabric-api', 'sodium', 'lithium']);
      
      await modStateRepo.bulkUpsert([
        { profileId: testProfileId, modId: 'fabric-api', enabled: true },
        { profileId: testProfileId, modId: 'sodium', enabled: true },
        { profileId: testProfileId, modId: 'lithium', enabled: false },
      ]);

      const states = await modStateRepo.findByProfileId(testProfileId);
      const sodiumState = states.find((s) => s.modId === 'sodium');
      const lithiumState = states.find((s) => s.modId === 'lithium');

      expect(sodiumState!.enabled).toBe(true);
      expect(lithiumState!.enabled).toBe(false);
    });
  });

  describe('CustomModRepository', () => {
    it('should create and retrieve custom mod', async () => {
      const customMod = await customModRepo.create({
        profileId: testProfileId,
        modId: 'iris-shaders',
        name: 'Iris Shaders',
        description: 'Shader mod for Fabric',
        fileName: 'iris-mc1.20.1-1.6.10.jar',
        source: 'modrinth',
        projectId: 'YL57xq9U',
        versionId: 'v1.6.10',
        downloadUrl: 'https://cdn.modrinth.com/data/YL57xq9U/versions/v1.6.10/iris-mc1.20.1-1.6.10.jar',
      });

      expect(customMod.id).toBeDefined();
      expect(customMod.name).toBe('Iris Shaders');

      const retrieved = await customModRepo.findByProfileAndMod(
        testProfileId,
        'iris-shaders'
      );
      expect(retrieved).not.toBeNull();
      expect(retrieved!.source).toBe('modrinth');
    });

    it('should find custom mods by profile', async () => {
      // Create a custom mod first
      await customModRepo.create({
        profileId: testProfileId,
        modId: 'iris-shaders',
        name: 'Iris Shaders',
        fileName: 'iris.jar',
        source: 'modrinth',
        projectId: 'YL57xq9U',
        downloadUrl: 'https://example.com/iris.jar',
      });
      
      const mods = await customModRepo.findByProfileId(testProfileId);
      expect(mods.length).toBeGreaterThan(0);
      expect(mods[0].modId).toBe('iris-shaders');
    });

    it('should find custom mods by source', async () => {
      // Create a custom mod first
      await customModRepo.create({
        profileId: testProfileId,
        modId: 'iris-shaders',
        name: 'Iris Shaders',
        fileName: 'iris.jar',
        source: 'modrinth',
        projectId: 'YL57xq9U',
        downloadUrl: 'https://example.com/iris.jar',
      });
      
      const modrinthMods = await customModRepo.findByProfileAndSource(
        testProfileId,
        'modrinth'
      );
      expect(modrinthMods.length).toBeGreaterThan(0);
      expect(modrinthMods.every((m) => m.source === 'modrinth')).toBe(true);
    });

    it('should count custom mods', async () => {
      // Create a custom mod first
      await customModRepo.create({
        profileId: testProfileId,
        modId: 'iris-shaders',
        name: 'Iris Shaders',
        fileName: 'iris.jar',
        source: 'modrinth',
        projectId: 'YL57xq9U',
        downloadUrl: 'https://example.com/iris.jar',
      });
      
      const count = await customModRepo.countByProfileId(testProfileId);
      expect(count).toBeGreaterThan(0);
    });

    it('should delete custom mod', async () => {
      // Create a custom mod first
      await customModRepo.create({
        profileId: testProfileId,
        modId: 'iris-shaders',
        name: 'Iris Shaders',
        fileName: 'iris.jar',
        source: 'modrinth',
        projectId: 'YL57xq9U',
        downloadUrl: 'https://example.com/iris.jar',
      });
      
      const deleted = await customModRepo.deleteByProfileAndMod(
        testProfileId,
        'iris-shaders'
      );
      expect(deleted).toBe(true);

      const retrieved = await customModRepo.findByProfileAndMod(
        testProfileId,
        'iris-shaders'
      );
      expect(retrieved).toBeNull();
    });
  });

  describe('ProfilePreferencesRepository', () => {
    it('should set and get preference', async () => {
      await profilePrefsRepo.setPreference(
        testProfileId,
        'skipModDialog',
        'true'
      );

      const value = await profilePrefsRepo.getPreferenceValue(
        testProfileId,
        'skipModDialog'
      );
      expect(value).toBe('true');
    });

    it('should update existing preference', async () => {
      // Set initial value
      await profilePrefsRepo.setPreference(
        testProfileId,
        'skipModDialog',
        'true'
      );
      
      // Update it
      await profilePrefsRepo.setPreference(
        testProfileId,
        'skipModDialog',
        'false'
      );

      const value = await profilePrefsRepo.getPreferenceValue(
        testProfileId,
        'skipModDialog'
      );
      expect(value).toBe('false');
    });

    it('should get boolean preference', async () => {
      await profilePrefsRepo.setPreference(
        testProfileId,
        'skipModDialog',
        'false'
      );
      
      const boolValue = await profilePrefsRepo.getBooleanPreference(
        testProfileId,
        'skipModDialog'
      );
      expect(boolValue).toBe(false);
    });

    it('should set boolean preference', async () => {
      await profilePrefsRepo.setBooleanPreference(
        testProfileId,
        'autoUpdate',
        true
      );

      const value = await profilePrefsRepo.getBooleanPreference(
        testProfileId,
        'autoUpdate'
      );
      expect(value).toBe(true);
    });

    it('should get preferences as map', async () => {
      // Set some preferences first
      await profilePrefsRepo.setPreference(testProfileId, 'skipModDialog', 'true');
      
      const map = await profilePrefsRepo.getPreferencesMap(testProfileId);
      expect(map.size).toBeGreaterThan(0);
      expect(map.has('skipModDialog')).toBe(true);
    });

    it('should bulk set preferences', async () => {
      await profilePrefsRepo.bulkSetPreferences(testProfileId, {
        theme: 'dark',
        language: 'en',
        notifications: 'enabled',
      });

      const map = await profilePrefsRepo.getPreferencesMap(testProfileId);
      expect(map.get('theme')).toBe('dark');
      expect(map.get('language')).toBe('en');
      expect(map.get('notifications')).toBe('enabled');
    });

    it('should delete preference by key', async () => {
      // Set preference first
      await profilePrefsRepo.setPreference(testProfileId, 'theme', 'dark');
      
      const deleted = await profilePrefsRepo.deleteByProfileAndKey(
        testProfileId,
        'theme'
      );
      expect(deleted).toBe(true);

      const value = await profilePrefsRepo.getPreferenceValue(
        testProfileId,
        'theme'
      );
      expect(value).toBeNull();
    });
  });

  describe('Cascade Deletion', () => {
    it('should delete mod states when profile is deleted', async () => {
      // Create a temporary profile
      const tempProfile = await profileRepo.create({
        name: 'Temp Profile',
        versionId: '1.20.1',
        installationDir: '/test/temp',
        memoryMin: 1024,
        memoryMax: 2048,
        jvmArgs: '',
      });

      // Add mod states
      await modStateRepo.initializeDefaults(tempProfile.id!, ['mod1', 'mod2']);

      // Delete profile
      await profileRepo.delete(tempProfile.id!);

      // Verify mod states are deleted
      const states = await modStateRepo.findByProfileId(tempProfile.id!);
      expect(states).toHaveLength(0);
    });

    it('should delete custom mods when profile is deleted', async () => {
      // Create a temporary profile
      const tempProfile = await profileRepo.create({
        name: 'Temp Profile 2',
        versionId: '1.20.1',
        installationDir: '/test/temp2',
        memoryMin: 1024,
        memoryMax: 2048,
        jvmArgs: '',
      });

      // Add custom mod
      await customModRepo.create({
        profileId: tempProfile.id!,
        modId: 'test-mod',
        name: 'Test Mod',
        fileName: 'test.jar',
        source: 'modrinth',
        projectId: 'test123',
        downloadUrl: 'https://example.com/test.jar',
      });

      // Delete profile
      await profileRepo.delete(tempProfile.id!);

      // Verify custom mods are deleted
      const mods = await customModRepo.findByProfileId(tempProfile.id!);
      expect(mods).toHaveLength(0);
    });

    it('should delete preferences when profile is deleted', async () => {
      // Create a temporary profile
      const tempProfile = await profileRepo.create({
        name: 'Temp Profile 3',
        versionId: '1.20.1',
        installationDir: '/test/temp3',
        memoryMin: 1024,
        memoryMax: 2048,
        jvmArgs: '',
      });

      // Add preferences
      await profilePrefsRepo.setPreference(tempProfile.id!, 'key1', 'value1');

      // Delete profile
      await profileRepo.delete(tempProfile.id!);

      // Verify preferences are deleted
      const prefs = await profilePrefsRepo.findByProfileId(tempProfile.id!);
      expect(prefs).toHaveLength(0);
    });
  });
});
