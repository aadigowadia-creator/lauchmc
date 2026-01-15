import { GameProcessManager } from '../main/services/game-process-manager';
import { UserProfile, AuthenticationData, VersionMetadata } from '../main/models';

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

// Mock fs/promises
jest.mock('fs/promises', () => ({
  access: jest.fn()
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
});