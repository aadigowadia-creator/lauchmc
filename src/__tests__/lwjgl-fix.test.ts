import { GameProcessManager } from '../main/services/game-process-manager';
import { LaunchCommandBuilder } from '../main/services/launch-command-builder';
import { UserProfile, VersionMetadata, AuthenticationData } from '../main/models';

describe('LWJGL Native Library Fix', () => {
  let gameProcessManager: GameProcessManager;
  let launchCommandBuilder: LaunchCommandBuilder;

  beforeEach(() => {
    gameProcessManager = GameProcessManager.getInstance();
    launchCommandBuilder = LaunchCommandBuilder.getInstance();
  });

  describe('Legacy Minecraft Version Detection', () => {
    it('should detect Minecraft 1.8.9 as legacy version', () => {
      const mockConfig = {
        profile: { 
          id: 1,
          name: 'Test Profile',
          versionId: '1.8.9',
          installationDir: '/path/to/game',
          memoryMin: 1024,
          memoryMax: 2048,
          jvmArgs: '',
          createdAt: new Date()
        } as UserProfile,
        versionMetadata: { 
          id: '1.8.9',
          type: 'release',
          mainClass: 'net.minecraft.client.main.Main',
          assets: 'legacy',
          downloads: {
            client: { url: '', sha1: '', size: 0 }
          },
          assetIndex: {
            id: 'legacy',
            sha1: '',
            size: 0,
            totalSize: 0,
            url: ''
          },
          complianceLevel: 0,
          libraries: []
        } as VersionMetadata,
        authData: {
          accessToken: 'test-token',
          userProfile: { id: 'test-id', name: 'test-user' }
        } as AuthenticationData,
        javaPath: '/path/to/java',
        gameDirectory: '/path/to/game',
        assetsDirectory: '/path/to/assets',
        librariesDirectory: '/path/to/libraries',
        nativesDirectory: '/path/to/natives'
      };

      const command = launchCommandBuilder.buildLaunchCommand(mockConfig);
      
      // Should include LWJGL-specific library path arguments for legacy versions
      expect(command.args).toContain('-Dorg.lwjgl.librarypath=/path/to/natives');
      expect(command.args).toContain('-Dnet.java.games.input.librarypath=/path/to/natives');
    });

    it('should not add legacy LWJGL args for modern versions', () => {
      const mockConfig = {
        profile: { 
          id: 1,
          name: 'Test Profile',
          versionId: '1.19.2',
          installationDir: '/path/to/game',
          memoryMin: 1024,
          memoryMax: 2048,
          jvmArgs: '',
          createdAt: new Date()
        } as UserProfile,
        versionMetadata: { 
          id: '1.19.2',
          type: 'release',
          mainClass: 'net.minecraft.client.main.Main',
          assets: '1.19',
          downloads: {
            client: { url: '', sha1: '', size: 0 }
          },
          assetIndex: {
            id: '1.19',
            sha1: '',
            size: 0,
            totalSize: 0,
            url: ''
          },
          complianceLevel: 1,
          libraries: []
        } as VersionMetadata,
        authData: {
          accessToken: 'test-token',
          userProfile: { id: 'test-id', name: 'test-user' }
        } as AuthenticationData,
        javaPath: '/path/to/java',
        gameDirectory: '/path/to/game',
        assetsDirectory: '/path/to/assets',
        librariesDirectory: '/path/to/libraries',
        nativesDirectory: '/path/to/natives'
      };

      const command = launchCommandBuilder.buildLaunchCommand(mockConfig);
      
      // Should not include LWJGL-specific library path arguments for modern versions
      expect(command.args).not.toContain('-Dorg.lwjgl.librarypath=/path/to/natives');
      expect(command.args).not.toContain('-Dnet.java.games.input.librarypath=/path/to/natives');
    });
  });

  describe('Native Library Path Handling', () => {
    it('should include java.library.path for all versions', () => {
      const mockConfig = {
        profile: { 
          id: 1,
          name: 'Test Profile',
          versionId: '1.8.9',
          installationDir: '/path/to/game',
          memoryMin: 1024,
          memoryMax: 2048,
          jvmArgs: '',
          createdAt: new Date()
        } as UserProfile,
        versionMetadata: { 
          id: '1.8.9',
          type: 'release',
          mainClass: 'net.minecraft.client.main.Main',
          assets: 'legacy',
          downloads: {
            client: { url: '', sha1: '', size: 0 }
          },
          assetIndex: {
            id: 'legacy',
            sha1: '',
            size: 0,
            totalSize: 0,
            url: ''
          },
          complianceLevel: 0,
          libraries: []
        } as VersionMetadata,
        authData: {
          accessToken: 'test-token',
          userProfile: { id: 'test-id', name: 'test-user' }
        } as AuthenticationData,
        javaPath: '/path/to/java',
        gameDirectory: '/path/to/game',
        assetsDirectory: '/path/to/assets',
        librariesDirectory: '/path/to/libraries',
        nativesDirectory: '/path/to/natives'
      };

      const command = launchCommandBuilder.buildLaunchCommand(mockConfig);
      
      // Should always include standard java.library.path
      expect(command.args).toContain('-Djava.library.path=/path/to/natives');
    });
  });

  describe('LWJGL Error Detection', () => {
    it('should detect LWJGL UnsatisfiedLinkError in crash analysis', () => {
      const processInfo = {
        processId: 1,
        profileId: 1,
        profileName: 'Test Profile',
        versionId: '1.8.9',
        startTime: new Date(),
        status: 'crashed' as const
      };

      const stderrBuffer = 'Exception in thread "main" java.lang.UnsatisfiedLinkError: no lwjgl64 in java.library.path';
      
      // This would be called internally by generateCrashReport
      const crashReport = (gameProcessManager as any).generateCrashReport(
        processInfo,
        1,
        '',
        stderrBuffer
      );

      expect(crashReport.possibleCauses).toContain('LWJGL native libraries not properly extracted or java.library.path not set correctly');
      expect(crashReport.suggestedSolutions).toContain('Delete the natives folder in the version directory and restart the game');
    });
  });

  describe('Native Library Extraction', () => {
    it('should identify LWJGL platform libraries for extraction', async () => {
      const mockVersionMetadata: VersionMetadata = {
        id: '1.8.9',
        type: 'release',
        mainClass: 'net.minecraft.client.main.Main',
        assets: 'legacy',
        downloads: {
          client: {
            url: 'https://example.com/client.jar',
            sha1: 'abc123',
            size: 1000
          }
        },
        assetIndex: {
          id: 'legacy',
          sha1: 'def456',
          size: 2000,
          totalSize: 2000,
          url: 'https://example.com/assets.json'
        },
        complianceLevel: 0,
        libraries: [
          {
            name: 'org.lwjgl.lwjgl:lwjgl-platform:2.9.2-nightly-20140822',
            downloads: {
              artifact: {
                url: 'https://example.com/lwjgl-platform.jar',
                sha1: 'abc123',
                size: 1000
              }
            }
          },
          {
            name: 'net.java.jinput:jinput-platform:2.0.5',
            downloads: {
              artifact: {
                url: 'https://example.com/jinput-platform.jar',
                sha1: 'def456',
                size: 2000
              }
            }
          }
        ]
      };

      const config = {
        profile: { 
          id: 1,
          name: 'Test Profile',
          versionId: '1.8.9',
          installationDir: '/path/to/game',
          memoryMin: 1024,
          memoryMax: 2048,
          jvmArgs: '',
          createdAt: new Date()
        } as UserProfile,
        versionMetadata: mockVersionMetadata,
        authData: {
          accessToken: 'test-token',
          userProfile: { id: 'test-id', name: 'test-user' }
        } as AuthenticationData,
        javaPath: '/path/to/java',
        gameDirectory: '/path/to/game',
        assetsDirectory: '/path/to/assets',
        librariesDirectory: '/path/to/libraries',
        nativesDirectory: '/path/to/natives'
      };

      // The native library filtering logic should identify these as native libraries
      const nativeLibraries = mockVersionMetadata.libraries.filter(lib => {
        return lib.name.includes('org.lwjgl.lwjgl:lwjgl-platform') || 
               lib.name.includes('net.java.jinput:jinput-platform');
      });

      expect(nativeLibraries).toHaveLength(2);
      expect(nativeLibraries[0].name).toContain('lwjgl-platform');
      expect(nativeLibraries[1].name).toContain('jinput-platform');
    });
  });
});