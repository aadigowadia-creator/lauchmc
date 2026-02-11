import { GameProcessManager } from '../main/services/game-process-manager';
import { UserProfile, AuthenticationData, VersionMetadata } from '../main/models';

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

// Mock fs/promises
jest.mock('fs/promises', () => ({
  access: jest.fn(),
  mkdir: jest.fn(),
  readdir: jest.fn(),
  writeFile: jest.fn(),
  rm: jest.fn()
}));

// Mock services
jest.mock('../main/services/launch-command-builder', () => ({
  LaunchCommandBuilder: {
    getInstance: jest.fn(() => ({
      buildLaunchCommand: jest.fn(() => ({
        executable: 'java',
        args: ['-Xmx2G', '-jar', 'minecraft.jar'],
        workingDirectory: '/test/minecraft',
        environment: { JAVA_HOME: '/test/java' }
      }))
    }))
  }
}));

jest.mock('../main/services/java-service', () => ({
  JavaService: {
    getInstance: jest.fn(() => ({
      detectJavaInstallations: jest.fn(() => Promise.resolve([{
        path: '/test/java/bin/java',
        version: '17.0.1',
        majorVersion: 17,
        architecture: '64-bit'
      }])),
      validateJavaCompatibility: jest.fn(() => ({
        isCompatible: true,
        requiredVersion: 17,
        actualVersion: 17,
        issues: []
      })),
      getBestJavaInstallation: jest.fn(() => Promise.resolve({
        path: '/test/java/bin/java',
        version: '17.0.1',
        majorVersion: 17,
        architecture: '64-bit'
      }))
    }))
  }
}));

jest.mock('../main/services/profile-service', () => ({
  ProfileService: jest.fn().mockImplementation(() => ({
    shouldShowModDialog: jest.fn(() => Promise.resolve(false)),
    getProfileById: jest.fn(() => Promise.resolve(null))
  }))
}));

jest.mock('../main/services/fabric-mod-service', () => ({
  FabricModService: jest.fn().mockImplementation(() => ({
    applyModStates: jest.fn(() => Promise.resolve()),
    setModState: jest.fn(() => Promise.resolve())
  }))
}));

describe('GameProcessManager', () => {
  let gameProcessManager: GameProcessManager;
  let mockProfile: UserProfile;
  let mockAuthData: AuthenticationData;
  let mockVersionMetadata: VersionMetadata;

  beforeEach(() => {
    gameProcessManager = GameProcessManager.getInstance();
    
    mockProfile = {
      id: 1,
      name: 'Test Profile',
      versionId: '1.20.1',
      installationDir: '/test/minecraft',
      memoryMin: 1024,
      memoryMax: 2048,
      jvmArgs: '-XX:+UseG1GC'
    };

    mockAuthData = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      userProfile: {
        id: 'test-user-id',
        name: 'TestUser'
      }
    };

    mockVersionMetadata = {
      id: '1.20.1',
      type: 'release',
      mainClass: 'net.minecraft.client.main.Main',
      libraries: [],
      downloads: {
        client: {
          sha1: 'test-sha1',
          size: 1000000,
          url: 'https://test.com/client.jar'
        }
      },
      assetIndex: {
        id: '1.20',
        sha1: 'test-asset-sha1',
        size: 500000,
        totalSize: 500000,
        url: 'https://test.com/assets.json'
      },
      assets: '1.20',
      complianceLevel: 1
    };

    // Clear any existing processes and mocks
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  afterEach(async () => {
    await gameProcessManager.cleanup();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = GameProcessManager.getInstance();
      const instance2 = GameProcessManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('getActiveProcesses', () => {
    it('should return empty array when no processes are running', () => {
      const activeProcesses = gameProcessManager.getActiveProcesses();
      expect(activeProcesses).toEqual([]);
    });
  });

  describe('isProfileRunning', () => {
    it('should return false when profile is not running', () => {
      const isRunning = gameProcessManager.isProfileRunning(1);
      expect(isRunning).toBe(false);
    });
  });

  describe('getProcessInfo', () => {
    it('should return undefined for non-existent process', () => {
      const processInfo = gameProcessManager.getProcessInfo(999);
      expect(processInfo).toBeUndefined();
    });
  });

  describe('getCrashHistory', () => {
    it('should return empty array when no crashes occurred', () => {
      const crashHistory = gameProcessManager.getCrashHistory();
      expect(crashHistory).toEqual([]);
    });
  });

  describe('launchGame validation', () => {
    const fs = require('fs/promises');

    beforeEach(() => {
      // Mock file system access to simulate files exist
      fs.access.mockResolvedValue(undefined);
    });

    it('should reject launch when profile is missing required fields', async () => {
      const invalidProfile = { ...mockProfile, id: undefined };
      
      await expect(gameProcessManager.launchGame({
        profile: invalidProfile,
        versionMetadata: mockVersionMetadata,
        authData: mockAuthData
      })).rejects.toThrow();
    });

    it('should reject launch when authentication is invalid', async () => {
      const invalidAuthData = { ...mockAuthData, accessToken: '' };
      
      await expect(gameProcessManager.launchGame({
        profile: mockProfile,
        versionMetadata: mockVersionMetadata,
        authData: invalidAuthData
      })).rejects.toThrow('Valid authentication is required');
    });

    it('should reject launch when authentication token is expired', async () => {
      const expiredAuthData = { 
        ...mockAuthData, 
        expiresAt: new Date(Date.now() - 3600000) // 1 hour ago
      };
      
      await expect(gameProcessManager.launchGame({
        profile: mockProfile,
        versionMetadata: mockVersionMetadata,
        authData: expiredAuthData
      })).rejects.toThrow('Authentication token has expired');
    });

    it('should reject launch when profile is already running', async () => {
      // Mock that profile is already running
      jest.spyOn(gameProcessManager, 'isProfileRunning').mockReturnValue(true);
      
      await expect(gameProcessManager.launchGame({
        profile: mockProfile,
        versionMetadata: mockVersionMetadata,
        authData: mockAuthData
      })).rejects.toThrow('Profile "Test Profile" is already running');
    });

    it('should reject launch when game files are missing', async () => {
      // Mock file system access to simulate missing files
      fs.access.mockRejectedValue(new Error('File not found'));
      
      await expect(gameProcessManager.launchGame({
        profile: mockProfile,
        versionMetadata: mockVersionMetadata,
        authData: mockAuthData
      })).rejects.toThrow('Game jar not found');
    });
  });

  describe('killGameProcess', () => {
    it('should return false for non-existent process', async () => {
      const result = await gameProcessManager.killGameProcess(999);
      expect(result).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should complete without errors when no processes are running', async () => {
      await expect(gameProcessManager.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('event handling', () => {
    it('should be an EventEmitter', () => {
      expect(gameProcessManager.on).toBeDefined();
      expect(gameProcessManager.emit).toBeDefined();
      expect(gameProcessManager.removeListener).toBeDefined();
    });

    it('should allow adding and removing event listeners', () => {
      const mockCallback = jest.fn();
      
      gameProcessManager.on('gameStarted', mockCallback);
      gameProcessManager.emit('gameStarted', { processId: 1 });
      
      expect(mockCallback).toHaveBeenCalledWith({ processId: 1 });
      
      gameProcessManager.removeListener('gameStarted', mockCallback);
      gameProcessManager.emit('gameStarted', { processId: 2 });
      
      // Should only have been called once (for the first emit)
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Fabric mod dialog handling', () => {
    const fs = require('fs/promises');
    const ProfileService = require('../main/services/profile-service').ProfileService;
    const FabricModService = require('../main/services/fabric-mod-service').FabricModService;

    beforeEach(() => {
      // Mock file system access to simulate files exist
      fs.access.mockResolvedValue(undefined);
      fs.mkdir.mockResolvedValue(undefined);
      fs.readdir.mockResolvedValue([]);
      jest.clearAllMocks();
    });

    it('should not show mod dialog for non-Fabric profiles', async () => {
      const vanillaProfile = { ...mockProfile, modLoader: undefined };
      
      // Mock spawn to prevent actual process launch
      const { spawn } = require('child_process');
      spawn.mockReturnValue({
        pid: 12345,
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      });

      const mockProfileService = new ProfileService();
      const mockFabricModService = new FabricModService();

      await gameProcessManager.launchGame({
        profile: vanillaProfile,
        versionMetadata: mockVersionMetadata,
        authData: mockAuthData
      });

      // Should not call shouldShowModDialog for non-Fabric profiles
      expect(mockProfileService.shouldShowModDialog).not.toHaveBeenCalled();
      expect(mockFabricModService.applyModStates).not.toHaveBeenCalled();
    });

    it('should apply mod states for Fabric profiles when dialog is skipped', async () => {
      const fabricProfile = { 
        ...mockProfile, 
        modLoader: { type: 'fabric' as const, version: '0.15.0' }
      };
      
      // Mock spawn to prevent actual process launch
      const { spawn } = require('child_process');
      spawn.mockReturnValue({
        pid: 12345,
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      });

      // Get the mocked services from GameProcessManager
      const ProfileService = require('../main/services/profile-service').ProfileService;
      const FabricModService = require('../main/services/fabric-mod-service').FabricModService;
      
      // Reset and configure mocks
      ProfileService.mockClear();
      FabricModService.mockClear();
      
      const mockShouldShowModDialog = jest.fn().mockResolvedValue(false);
      const mockApplyModStates = jest.fn().mockResolvedValue(undefined);
      
      ProfileService.mockImplementation(() => ({
        shouldShowModDialog: mockShouldShowModDialog,
        getProfileById: jest.fn(() => Promise.resolve(null))
      }));
      
      FabricModService.mockImplementation(() => ({
        applyModStates: mockApplyModStates,
        setModState: jest.fn(() => Promise.resolve())
      }));

      // Create a new instance to use the updated mocks
      const testGameProcessManager = new (require('../main/services/game-process-manager').GameProcessManager)();

      await testGameProcessManager.launchGame({
        profile: fabricProfile,
        versionMetadata: mockVersionMetadata,
        authData: mockAuthData
      });

      // Should check if dialog should be shown
      expect(mockShouldShowModDialog).toHaveBeenCalledWith(fabricProfile.id);
      
      // Should apply mod states even when dialog is skipped
      expect(mockApplyModStates).toHaveBeenCalledWith(
        fabricProfile.id,
        fabricProfile.installationDir
      );
    });

    it('should show mod dialog and update states when callback is provided', async () => {
      const fabricProfile = { 
        ...mockProfile, 
        modLoader: { type: 'fabric' as const, version: '0.15.0' }
      };
      
      // Mock spawn to prevent actual process launch
      const { spawn } = require('child_process');
      spawn.mockReturnValue({
        pid: 12345,
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      });

      // Get the mocked services
      const ProfileService = require('../main/services/profile-service').ProfileService;
      const FabricModService = require('../main/services/fabric-mod-service').FabricModService;
      
      // Reset and configure mocks
      ProfileService.mockClear();
      FabricModService.mockClear();
      
      const mockShouldShowModDialog = jest.fn().mockResolvedValue(true);
      const mockSetModState = jest.fn().mockResolvedValue(undefined);
      const mockApplyModStates = jest.fn().mockResolvedValue(undefined);
      
      ProfileService.mockImplementation(() => ({
        shouldShowModDialog: mockShouldShowModDialog,
        getProfileById: jest.fn(() => Promise.resolve(null))
      }));
      
      FabricModService.mockImplementation(() => ({
        applyModStates: mockApplyModStates,
        setModState: mockSetModState
      }));

      // Mock mod dialog callback
      const mockModStates = new Map([
        ['fabric-api', true],
        ['sodium', true],
        ['lithium', false]
      ]);
      const onModDialogRequired = jest.fn().mockResolvedValue(mockModStates);

      // Create a new instance to use the updated mocks
      const testGameProcessManager = new (require('../main/services/game-process-manager').GameProcessManager)();

      await testGameProcessManager.launchGame({
        profile: fabricProfile,
        versionMetadata: mockVersionMetadata,
        authData: mockAuthData,
        onModDialogRequired
      });

      // Should check if dialog should be shown
      expect(mockShouldShowModDialog).toHaveBeenCalledWith(fabricProfile.id);
      
      // Should call the dialog callback
      expect(onModDialogRequired).toHaveBeenCalled();
      
      // Should update mod states based on user selection
      expect(mockSetModState).toHaveBeenCalledWith(fabricProfile.id, 'fabric-api', true);
      expect(mockSetModState).toHaveBeenCalledWith(fabricProfile.id, 'sodium', true);
      expect(mockSetModState).toHaveBeenCalledWith(fabricProfile.id, 'lithium', false);
      
      // Should apply mod states
      expect(mockApplyModStates).toHaveBeenCalledWith(
        fabricProfile.id,
        fabricProfile.installationDir
      );
    });

    it('should abort launch when user cancels mod dialog', async () => {
      const fabricProfile = { 
        ...mockProfile, 
        modLoader: { type: 'fabric' as const, version: '0.15.0' }
      };
      
      // Get the mocked services
      const ProfileService = require('../main/services/profile-service').ProfileService;
      const FabricModService = require('../main/services/fabric-mod-service').FabricModService;
      
      // Reset and configure mocks
      ProfileService.mockClear();
      FabricModService.mockClear();
      
      const mockShouldShowModDialog = jest.fn().mockResolvedValue(true);
      
      ProfileService.mockImplementation(() => ({
        shouldShowModDialog: mockShouldShowModDialog,
        getProfileById: jest.fn(() => Promise.resolve(null))
      }));
      
      FabricModService.mockImplementation(() => ({
        applyModStates: jest.fn().mockResolvedValue(undefined),
        setModState: jest.fn().mockResolvedValue(undefined)
      }));

      // Mock mod dialog callback returning null (user cancelled)
      const onModDialogRequired = jest.fn().mockResolvedValue(null);

      // Create a new instance to use the updated mocks
      const testGameProcessManager = new (require('../main/services/game-process-manager').GameProcessManager)();

      await expect(testGameProcessManager.launchGame({
        profile: fabricProfile,
        versionMetadata: mockVersionMetadata,
        authData: mockAuthData,
        onModDialogRequired
      })).rejects.toThrow('Launch cancelled by user');

      // Should check if dialog should be shown
      expect(mockShouldShowModDialog).toHaveBeenCalledWith(fabricProfile.id);
      
      // Should call the dialog callback
      expect(onModDialogRequired).toHaveBeenCalled();
    });
  });
});