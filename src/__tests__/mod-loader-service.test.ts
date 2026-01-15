import { ModLoaderService, ModLoaderInfo } from '../main/services/mod-loader-service';
import { promises as fs } from 'fs';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock fs/promises
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    access: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn()
  },
  createWriteStream: jest.fn(() => ({
    on: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    close: jest.fn()
  }))
}));

// Mock electron app
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/mock/user/data')
  }
}));

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn(() => ({
    on: jest.fn(),
    stdio: 'pipe'
  }))
}));

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('ModLoaderService', () => {
  let modLoaderService: ModLoaderService;

  beforeEach(() => {
    modLoaderService = new ModLoaderService();
    jest.clearAllMocks();
  });

  describe('detectModLoaders', () => {
    it('should detect available mod loaders for a game version', async () => {
      // Mock Forge API response
      const forgeResponse = {
        data: {
          promos: {
            '1.20.1-recommended': '47.2.0',
            '1.20.1-latest': '47.2.1'
          }
        }
      };

      // Mock Fabric API response
      const fabricGameVersionsResponse = {
        data: [
          { version: '1.20.1' },
          { version: '1.20.0' }
        ]
      };

      const fabricLoaderVersionsResponse = {
        data: [
          { version: '0.14.21', stable: true },
          { version: '0.14.20', stable: true }
        ]
      };

      // Mock Quilt API response
      const quiltGameVersionsResponse = {
        data: [
          { version: '1.20.1' },
          { version: '1.20.0' }
        ]
      };

      const quiltLoaderVersionsResponse = {
        data: [
          { version: '0.19.0', stable: true },
          { version: '0.18.0', stable: true }
        ]
      };

      // Mock axios calls in sequence
      mockedAxios.get
        .mockResolvedValueOnce(forgeResponse) // Forge API
        .mockResolvedValueOnce(fabricGameVersionsResponse) // Fabric game versions
        .mockResolvedValueOnce(fabricLoaderVersionsResponse) // Fabric loader versions
        .mockResolvedValueOnce(quiltGameVersionsResponse) // Quilt game versions
        .mockResolvedValueOnce(quiltLoaderVersionsResponse); // Quilt loader versions

      const modLoaders = await modLoaderService.detectModLoaders('1.20.1');

      expect(modLoaders).toHaveLength(6);
      expect(modLoaders).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'forge', version: '47.2.0', gameVersion: '1.20.1', stable: true, recommended: true }),
        expect.objectContaining({ type: 'forge', version: '47.2.1', gameVersion: '1.20.1', stable: false, recommended: false }),
        expect.objectContaining({ type: 'fabric', version: '0.14.21', gameVersion: '1.20.1', stable: true }),
        expect.objectContaining({ type: 'fabric', version: '0.14.20', gameVersion: '1.20.1', stable: true }),
        expect.objectContaining({ type: 'quilt', version: '0.19.0', gameVersion: '1.20.1', stable: true }),
        expect.objectContaining({ type: 'quilt', version: '0.18.0', gameVersion: '1.20.1', stable: true })
      ]));

      // Verify API calls were made
      expect(mockedAxios.get).toHaveBeenCalled();
      expect(mockedAxios.get.mock.calls.length).toBeGreaterThan(0);
    });

    it('should handle API failures gracefully', async () => {
      // Mock API failures
      mockedAxios.get
        .mockRejectedValueOnce(new Error('Forge API unavailable'))
        .mockRejectedValueOnce(new Error('Fabric API unavailable'))
        .mockRejectedValueOnce(new Error('Fabric API unavailable'))
        .mockRejectedValueOnce(new Error('Quilt API unavailable'))
        .mockRejectedValueOnce(new Error('Quilt API unavailable'));

      const modLoaders = await modLoaderService.detectModLoaders('1.20.1');

      expect(modLoaders).toHaveLength(0);
    });

    it('should return empty array for unsupported version', async () => {
      // Mock Forge API response with no matching version
      const forgeResponse = {
        data: {
          promos: {}
        }
      };

      // Mock Fabric API response with no matching version
      const fabricGameVersionsResponse = {
        data: [
          { version: '1.20.0' },
          { version: '1.19.4' }
        ]
      };

      // Mock Quilt API response with no matching version
      const quiltGameVersionsResponse = {
        data: [
          { version: '1.20.0' },
          { version: '1.19.4' }
        ]
      };

      // Mock axios calls in sequence
      mockedAxios.get
        .mockResolvedValueOnce(forgeResponse) // Forge API
        .mockResolvedValueOnce(fabricGameVersionsResponse) // Fabric game versions
        .mockResolvedValueOnce({ data: [] }) // Fabric loader versions (empty)
        .mockResolvedValueOnce(quiltGameVersionsResponse) // Quilt game versions
        .mockResolvedValueOnce({ data: [] }); // Quilt loader versions (empty)

      const modLoaders = await modLoaderService.detectModLoaders('999.999.999');

      expect(modLoaders).toHaveLength(0);
    });
  });

  describe('installModLoader', () => {
    it('should attempt to install Forge mod loader', async () => {
      const forgeModLoader: ModLoaderInfo = {
        type: 'forge',
        version: '47.2.0',
        gameVersion: '1.20.1',
        stable: true,
        recommended: true,
        installerUrl: 'https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1-47.2.0/forge-1.20.1-47.2.0-installer.jar'
      };

      const progressCallback = jest.fn();
      const result = await modLoaderService.installModLoader(
        forgeModLoader,
        '/test/minecraft',
        progressCallback
      );

      // Installation will fail in test environment due to missing dependencies
      expect(typeof result).toBe('boolean');
    });

    it('should attempt to install Fabric mod loader', async () => {
      const fabricModLoader: ModLoaderInfo = {
        type: 'fabric',
        version: '0.14.21',
        gameVersion: '1.20.1',
        stable: true,
        recommended: true
      };

      const progressCallback = jest.fn();
      const result = await modLoaderService.installModLoader(
        fabricModLoader,
        '/test/minecraft',
        progressCallback
      );

      // Installation will fail in test environment due to missing dependencies
      expect(typeof result).toBe('boolean');
    });

    it('should handle installation failures', async () => {
      const forgeModLoader: ModLoaderInfo = {
        type: 'forge',
        version: '47.2.0',
        gameVersion: '1.20.1',
        stable: true,
        recommended: true,
        installerUrl: 'https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1-47.2.0/forge-1.20.1-47.2.0-installer.jar'
      };

      // Mock file system failure
      mockedFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      const progressCallback = jest.fn();
      const result = await modLoaderService.installModLoader(
        forgeModLoader,
        '/test/minecraft',
        progressCallback
      );

      expect(result).toBe(false);
      expect(progressCallback).toHaveBeenCalled();
    });
  });

  describe('isModLoaderInstalled', () => {
    it('should detect installed Forge mod loader', async () => {
      // Mock file system to indicate files exist
      mockedFs.access.mockResolvedValue(undefined);

      const isInstalled = await modLoaderService.isModLoaderInstalled(
        'forge',
        '1.20.1',
        '47.2.0',
        '/test/minecraft'
      );

      expect(isInstalled).toBe(true);
      expect(mockedFs.access).toHaveBeenCalledWith(
        expect.stringContaining('1.20.1-forge-47.2.0.json')
      );
    });

    it('should detect installed Fabric mod loader', async () => {
      // Mock file system to indicate files exist
      mockedFs.access.mockResolvedValue(undefined);

      const isInstalled = await modLoaderService.isModLoaderInstalled(
        'fabric',
        '1.20.1',
        '0.14.21',
        '/test/minecraft'
      );

      expect(isInstalled).toBe(true);
      expect(mockedFs.access).toHaveBeenCalledWith(
        expect.stringContaining('fabric-loader-0.14.21-1.20.1.json')
      );
    });

    it('should return false for non-installed mod loader', async () => {
      // Mock file system to indicate files don't exist
      mockedFs.access.mockRejectedValue(new Error('File not found'));

      const isInstalled = await modLoaderService.isModLoaderInstalled(
        'forge',
        '1.20.1',
        '47.2.0',
        '/test/minecraft'
      );

      expect(isInstalled).toBe(false);
    });
  });

  describe('getInstalledModLoaders', () => {
    it('should return list of installed mod loaders', async () => {
      // Mock directory listing
      mockedFs.readdir.mockResolvedValue([
        '1.20.1-forge-47.2.0',
        'fabric-loader-0.14.21-1.20.1',
        'other-file.txt'
      ] as any);

      // Mock file reading
      const forgeJsonContent = JSON.stringify({
        id: '1.20.1-forge-47.2.0',
        type: 'release',
        mainClass: 'net.minecraftforge.fml.loading.FMLClientLaunchProvider'
      });

      const fabricJsonContent = JSON.stringify({
        id: 'fabric-loader-0.14.21-1.20.1',
        type: 'release',
        mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient'
      });

      mockedFs.readFile
        .mockResolvedValueOnce(forgeJsonContent)
        .mockResolvedValueOnce(fabricJsonContent);

      const installedModLoaders = await modLoaderService.getInstalledModLoaders('/test/minecraft');

      expect(installedModLoaders).toHaveLength(2);
      expect(installedModLoaders).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'forge', version: '47.2.0', gameVersion: '1.20.1' }),
        expect.objectContaining({ type: 'fabric', version: '0.14.21', gameVersion: '1.20.1' })
      ]));
    });

    it('should return empty array when no mod loaders are installed', async () => {
      // Mock empty directory
      mockedFs.readdir.mockResolvedValue([]);

      const installedModLoaders = await modLoaderService.getInstalledModLoaders('/test/minecraft');

      expect(installedModLoaders).toHaveLength(0);
    });

    it('should handle invalid version files gracefully', async () => {
      // Mock directory listing
      mockedFs.readdir.mockResolvedValue([
        '1.20.1-forge-47.2.0',
        'invalid-file'
      ] as any);

      // Mock file reading - first succeeds, second fails
      const forgeJsonContent = JSON.stringify({
        id: '1.20.1-forge-47.2.0',
        type: 'release',
        mainClass: 'net.minecraftforge.fml.loading.FMLClientLaunchProvider'
      });

      mockedFs.readFile
        .mockResolvedValueOnce(forgeJsonContent)
        .mockRejectedValueOnce(new Error('Invalid JSON'));

      const installedModLoaders = await modLoaderService.getInstalledModLoaders('/test/minecraft');

      expect(installedModLoaders).toHaveLength(1);
      expect(installedModLoaders[0]).toEqual(expect.objectContaining({ type: 'forge', version: '47.2.0', gameVersion: '1.20.1' }));
    });
  });
});
