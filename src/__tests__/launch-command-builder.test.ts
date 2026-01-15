import { LaunchCommandBuilder, LaunchConfiguration } from '../main/services/launch-command-builder';
import { UserProfile, VersionMetadata, AuthenticationData } from '../main/models';

describe('LaunchCommandBuilder', () => {
  let builder: LaunchCommandBuilder;
  let mockConfig: LaunchConfiguration;

  const mockProfile: UserProfile = {
    id: 1,
    name: 'Test Profile',
    versionId: '1.20.1',
    installationDir: '/test/minecraft',
    memoryMin: 1024,
    memoryMax: 2048,
    jvmArgs: '-XX:+UseG1GC',
    modLoader: null
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
            sha1: 'test-hash',
            size: 1024,
            url: 'https://test.com/library.jar'
          }
        }
      }
    ],
    downloads: {
      client: {
        sha1: 'client-hash',
        size: 20971520,
        url: 'https://test.com/client.jar'
      }
    },
    assetIndex: {
      id: '1.20',
      sha1: 'asset-hash',
      size: 2048,
      totalSize: 104857600,
      url: 'https://test.com/assets.json'
    },
    assets: '1.20',
    complianceLevel: 1
  };

  const mockAuthData: AuthenticationData = {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresAt: new Date(Date.now() + 3600000),
    userProfile: {
      id: 'test-uuid',
      name: 'TestPlayer',
      skinUrl: 'https://test.com/skin.png'
    }
  };

  beforeEach(() => {
    builder = LaunchCommandBuilder.getInstance();
    mockConfig = {
      profile: mockProfile,
      versionMetadata: mockVersionMetadata,
      authData: mockAuthData,
      javaPath: '/usr/bin/java',
      gameDirectory: '/test/minecraft',
      assetsDirectory: '/test/minecraft/assets',
      librariesDirectory: '/test/minecraft/libraries',
      nativesDirectory: '/test/minecraft/natives'
    };
  });

  describe('buildLaunchCommand', () => {
    it('should build a valid launch command for vanilla Minecraft', () => {
      const command = builder.buildLaunchCommand(mockConfig);

      expect(command.executable).toBe('/usr/bin/java');
      expect(command.workingDirectory).toBe('/test/minecraft');
      expect(command.args).toContain('-Xms1024M');
      expect(command.args).toContain('-Xmx2048M');
      expect(command.args).toContain('-cp');
      expect(command.args).toContain('net.minecraft.client.main.Main');
      expect(command.args).toContain('--username');
      expect(command.args).toContain('TestPlayer');
      expect(command.args).toContain('--accessToken');
      expect(command.args).toContain('test-access-token');
    });

    it('should build a valid launch command for modded Minecraft', () => {
      const moddedProfile = {
        ...mockProfile,
        modLoader: { type: 'fabric' as const, version: '0.14.21' }
      };
      const moddedConfig = { ...mockConfig, profile: moddedProfile };

      const command = builder.buildLaunchCommand(moddedConfig);

      expect(command.executable).toBe('/usr/bin/java');
      expect(command.args).toContain('net.fabricmc.loader.impl.launch.knot.KnotClient');
      expect(command.args).toContain('-Dfabric.development=false');
    });

    it('should validate configuration before building command', () => {
      const invalidConfig = { ...mockConfig, javaPath: '' };

      expect(() => builder.buildLaunchCommand(invalidConfig)).toThrow('Launch configuration validation failed');
    });
  });

  describe('buildVanillaLaunchCommand', () => {
    it('should build vanilla command even with mod loader in profile', () => {
      const moddedProfile = {
        ...mockProfile,
        modLoader: { type: 'forge' as const, version: '47.1.0' }
      };
      const moddedConfig = { ...mockConfig, profile: moddedProfile };

      const command = builder.buildVanillaLaunchCommand(moddedConfig);

      expect(command.args).toContain('net.minecraft.client.main.Main');
      expect(command.args).not.toContain('net.minecraftforge.fml.loading.FMLClientLaunchProvider');
    });
  });

  describe('buildModdedLaunchCommand', () => {
    it('should build modded command with specified mod loader', () => {
      const command = builder.buildModdedLaunchCommand(mockConfig, { type: 'fabric', version: '0.14.21' });

      expect(command.args).toContain('net.fabricmc.loader.impl.launch.knot.KnotClient');
      expect(command.args).toContain('-Dfabric.development=false');
    });
  });

  describe('validateLaunchConfiguration', () => {
    it('should validate a correct configuration', () => {
      const validation = builder.validateLaunchConfiguration(mockConfig);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const invalidConfig = { ...mockConfig, javaPath: '' };
      const validation = builder.validateLaunchConfiguration(invalidConfig);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Java path is required');
    });

    it('should detect invalid memory settings', () => {
      const invalidProfile = { ...mockProfile, memoryMin: 256 };
      const invalidConfig = { ...mockConfig, profile: invalidProfile };
      const validation = builder.validateLaunchConfiguration(invalidConfig);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Minimum memory must be at least 512 MB');
    });
  });
});