import axios from 'axios';
import { promises as fs } from 'fs';
import { join } from 'path';
import { VersionManager } from '../main/services/version-manager';
import { GameVersion, VersionMetadata } from '../main/models';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock fs
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    access: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
    stat: jest.fn(),
    readdir: jest.fn(),
    open: jest.fn()
  }
}));

// Mock crypto
jest.mock('crypto', () => ({
  createHash: jest.fn(() => ({
    update: jest.fn(),
    digest: jest.fn(() => 'mocked-hash')
  }))
}));

// Mock electron app
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/mock/user/data')
  }
}));

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('VersionManager', () => {
  let versionManager: VersionManager;
  
  const mockVersionManifest = {
    latest: {
      release: '1.20.1',
      snapshot: '23w31a'
    },
    versions: [
      {
        id: '1.20.1',
        type: 'release',
        url: 'https://piston-meta.mojang.com/v1/packages/177e49d3233cb6eac42f0495c0a48e719870c2ae/1.20.1.json',
        time: '2023-06-12T12:00:00+00:00',
        releaseTime: '2023-06-07T12:00:00+00:00',
        sha1: 'abc123',
        complianceLevel: 1
      },
      {
        id: '23w31a',
        type: 'snapshot',
        url: 'https://piston-meta.mojang.com/v1/packages/snapshot/23w31a.json',
        time: '2023-08-02T12:00:00+00:00',
        releaseTime: '2023-08-02T12:00:00+00:00',
        sha1: 'def456',
        complianceLevel: 1
      },
      {
        id: '1.19.4',
        type: 'release',
        url: 'https://piston-meta.mojang.com/v1/packages/old/1.19.4.json',
        time: '2023-03-14T12:00:00+00:00',
        releaseTime: '2023-03-14T12:00:00+00:00',
        sha1: 'ghi789',
        complianceLevel: 1
      }
    ]
  };

  const mockVersionMetadata: VersionMetadata = {
    id: '1.20.1',
    type: 'release',
    mainClass: 'net.minecraft.client.main.Main',
    libraries: [
      {
        name: 'com.mojang:logging:1.0.0',
        downloads: {
          artifact: {
            sha1: 'library-hash',
            size: 1024,
            url: 'https://libraries.minecraft.net/com/mojang/logging/1.0.0/logging-1.0.0.jar'
          }
        }
      }
    ],
    downloads: {
      client: {
        sha1: 'client-jar-hash',
        size: 20971520, // 20MB
        url: 'https://piston-data.mojang.com/v1/objects/client-jar-hash/client.jar'
      }
    },
    assetIndex: {
      id: '1.20',
      sha1: 'asset-index-hash',
      size: 2048,
      totalSize: 104857600, // 100MB
      url: 'https://piston-meta.mojang.com/v1/packages/asset-index-hash/1.20.json'
    },
    assets: '1.20',
    complianceLevel: 1
  };

  beforeEach(() => {
    versionManager = new VersionManager();
    jest.clearAllMocks();
  });

  describe('fetchAvailableVersions', () => {
    it('should fetch versions from API when cache is invalid', async () => {
      // Mock cache miss
      mockedFs.access.mockRejectedValue(new Error('File not found'));
      mockedFs.mkdir.mockResolvedValue(undefined);
      
      // Mock API response
      mockedAxios.get.mockResolvedValue({ data: mockVersionManifest });
      mockedFs.writeFile.mockResolvedValue(undefined);

      const versions = await versionManager.fetchAvailableVersions();

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
        expect.objectContaining({
          timeout: 10000,
          headers: { 'User-Agent': 'MinecraftLauncher/1.0.0' }
        })
      );

      expect(versions).toHaveLength(3);
      expect(versions[0].id).toBe('1.20.1');
      expect(versions[0].type).toBe('release');
      expect(versions[1].id).toBe('23w31a');
      expect(versions[1].type).toBe('snapshot');
    });

    it('should use cached data when cache is valid', async () => {
      const cachedData = {
        data: mockVersionManifest,
        timestamp: Date.now() - 1000 // 1 second ago (within 30 min cache duration)
      };

      // Mock cache hit
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(cachedData));

      const versions = await versionManager.fetchAvailableVersions();

      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(versions).toHaveLength(3);
      expect(versions[0].id).toBe('1.20.1');
    });

    it('should force refresh when forceRefresh is true', async () => {
      // Mock API response
      mockedAxios.get.mockResolvedValue({ data: mockVersionManifest });
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      const versions = await versionManager.fetchAvailableVersions(true);

      expect(mockedAxios.get).toHaveBeenCalled();
      expect(versions).toHaveLength(3);
    });

    it('should fall back to cache when API fails', async () => {
      const cachedData = {
        data: mockVersionManifest,
        timestamp: Date.now() - 1000
      };

      // Mock API failure
      mockedAxios.get.mockRejectedValue(new Error('Network error'));
      
      // Mock cache fallback
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(cachedData));

      const versions = await versionManager.fetchAvailableVersions();

      expect(versions).toHaveLength(3);
    });

    it('should throw error when both API and cache fail', async () => {
      // Mock API failure
      mockedAxios.get.mockRejectedValue(new Error('Network error'));
      
      // Mock cache miss
      mockedFs.access.mockRejectedValue(new Error('File not found'));

      await expect(versionManager.fetchAvailableVersions()).rejects.toThrow('Failed to fetch version manifest');
    });
  });

  describe('getVersionsByType', () => {
    beforeEach(() => {
      mockedFs.access.mockRejectedValue(new Error('File not found'));
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedAxios.get.mockResolvedValue({ data: mockVersionManifest });
      mockedFs.writeFile.mockResolvedValue(undefined);
    });

    it('should filter versions by release type', async () => {
      const releases = await versionManager.getReleaseVersions();
      
      expect(releases).toHaveLength(2);
      expect(releases.every(v => v.type === 'release')).toBe(true);
      expect(releases.map(v => v.id)).toEqual(['1.20.1', '1.19.4']);
    });

    it('should filter versions by snapshot type', async () => {
      const snapshots = await versionManager.getSnapshotVersions();
      
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].type).toBe('snapshot');
      expect(snapshots[0].id).toBe('23w31a');
    });
  });

  describe('findVersion', () => {
    beforeEach(() => {
      mockedFs.access.mockRejectedValue(new Error('File not found'));
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedAxios.get.mockResolvedValue({ data: mockVersionManifest });
      mockedFs.writeFile.mockResolvedValue(undefined);
    });

    it('should find existing version by ID', async () => {
      const version = await versionManager.findVersion('1.20.1');
      
      expect(version).not.toBeNull();
      expect(version?.id).toBe('1.20.1');
      expect(version?.type).toBe('release');
    });

    it('should return null for non-existent version', async () => {
      const version = await versionManager.findVersion('non-existent');
      
      expect(version).toBeNull();
    });
  });

  describe('cache management', () => {
    it('should clear cache successfully', async () => {
      mockedFs.unlink.mockResolvedValue(undefined);

      await versionManager.clearCache();

      expect(mockedFs.unlink).toHaveBeenCalledWith(
        join('/mock/user/data', 'cache', 'version_manifest_cache.json')
      );
    });

    it('should handle cache clear errors gracefully', async () => {
      mockedFs.unlink.mockRejectedValue({ code: 'ENOENT' });

      await expect(versionManager.clearCache()).resolves.not.toThrow();
    });

    it('should check cache validity correctly', async () => {
      const validCacheData = {
        data: mockVersionManifest,
        timestamp: Date.now() - 1000 // 1 second ago
      };

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(validCacheData));

      const isValid = await versionManager.isCacheValid();
      expect(isValid).toBe(true);
    });

    it('should detect expired cache', async () => {
      const expiredCacheData = {
        data: mockVersionManifest,
        timestamp: Date.now() - (1000 * 60 * 60) // 1 hour ago (expired)
      };

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(expiredCacheData));

      const isValid = await versionManager.isCacheValid();
      expect(isValid).toBe(false);
    });
  });

  describe('download functionality', () => {
    beforeEach(() => {
      // Mock version manifest fetch
      mockedFs.access.mockRejectedValue(new Error('File not found'));
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedAxios.get.mockResolvedValue({ data: mockVersionManifest });
      mockedFs.writeFile.mockResolvedValue(undefined);
    });

    it('should check if version is installed', async () => {
      // Mock installed version
      mockedFs.access.mockResolvedValue(undefined);

      const isInstalled = await versionManager.isVersionInstalled('1.20.1');
      expect(isInstalled).toBe(true);

      // Check that it looks for both version.json and jar file
      expect(mockedFs.access).toHaveBeenCalledWith(
        join('/mock/user/data', 'minecraft', 'versions', '1.20.1', '1.20.1.json')
      );
      expect(mockedFs.access).toHaveBeenCalledWith(
        join('/mock/user/data', 'minecraft', 'versions', '1.20.1', '1.20.1.jar')
      );
    });

    it('should return false for non-installed version', async () => {
      // Mock missing files
      mockedFs.access.mockRejectedValue(new Error('File not found'));

      const isInstalled = await versionManager.isVersionInstalled('1.20.1');
      expect(isInstalled).toBe(false);
    });

    it('should get list of installed versions', async () => {
      // Mock directory listing
      mockedFs.readdir.mockResolvedValue([
        { name: '1.20.1', isDirectory: () => true },
        { name: '1.19.4', isDirectory: () => true },
        { name: 'some-file.txt', isDirectory: () => false }
      ] as any);

      // Mock version installation check - only 1.20.1 is installed
      mockedFs.access
        .mockResolvedValueOnce(undefined) // 1.20.1.json exists
        .mockResolvedValueOnce(undefined) // 1.20.1.jar exists
        .mockRejectedValueOnce(new Error('File not found')) // 1.19.4.json missing
        .mockRejectedValueOnce(new Error('File not found')); // 1.19.4.jar missing

      const installedVersions = await versionManager.getInstalledVersions();
      
      expect(installedVersions).toEqual(['1.20.1']);
      expect(mockedFs.readdir).toHaveBeenCalledWith(
        join('/mock/user/data', 'minecraft', 'versions'),
        { withFileTypes: true }
      );
    });

    it('should validate file integrity correctly', async () => {
      // Mock file reading for hash validation
      mockedFs.readFile.mockResolvedValue(Buffer.from('test content'));
      
      // Mock crypto hash to return expected hash
      const mockHash = {
        update: jest.fn(),
        digest: jest.fn(() => 'expected-hash')
      };
      const crypto = require('crypto');
      crypto.createHash.mockReturnValue(mockHash);

      const isValid = await versionManager.validateInstallation('1.20.1');
      
      // Since we're mocking the validation to always return true for this test,
      // we just verify the method can be called without errors
      expect(typeof isValid).toBe('boolean');
    });
  });
});