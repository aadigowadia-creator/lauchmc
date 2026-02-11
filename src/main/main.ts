import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { promises as fs } from 'fs';
import { initializeDatabase } from './database';
import { ProfileRepository } from './repositories';
import { AuthService, GameProcessManager } from './services';
import { ModLoaderService } from './services/mod-loader-service';
import { ProfileService } from './services/profile-service';
import { FabricModService, ModDownloadProgress } from './services/fabric-mod-service';
import { VersionManager } from './services/version-manager';
import { LoggerService } from './services/logger-service';
import { AutoUpdaterService } from './services/auto-updater-service';
import { BundledJavaService } from './services/bundled-java-service';

class MinecraftLauncher {
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    this.initializeApp();
  }

  private initializeApp(): void {
    // Set app name for Task Manager (works in both dev and production)
    app.setName('Hello World Launcher');
    
    // On Windows, set the app user model ID to change Task Manager display name
    if (process.platform === 'win32') {
      app.setAppUserModelId('Hello World Launcher');
    }
    
    // Handle app ready event
    app.whenReady().then(async () => {
      try {
        // Initialize database before creating windows
        await initializeDatabase();
        
        this.createMainWindow();
        this.setupIPC();
        
        // Initialize bundled Java runtimes AFTER window is created so progress can be shown
        this.initializeBundledJavaRuntimes().catch((error) => {
          console.error('Bundled Java initialization failed:', error);
        });

        app.on('activate', () => {
          if (BrowserWindow.getAllWindows().length === 0) {
            this.createMainWindow();
          }
        });
      } catch (error) {
        console.error('Failed to initialize application:', error);
        app.quit();
      }
    });

    // Handle window closed events
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // Handle app shutdown - cleanup game processes
    app.on('before-quit', async (event) => {
      event.preventDefault();
      
      try {
        const gameProcessManager = GameProcessManager.getInstance();
        await gameProcessManager.cleanup();
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
      
      app.exit();
    });
  }

  /**
   * Initialize bundled Java runtimes in background
   * This runs asynchronously and doesn't block app startup
   */
  private async initializeBundledJavaRuntimes(): Promise<void> {
    console.log('=== Starting bundled Java initialization ===');
    
    // Wait a bit for the window to be fully loaded
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      const bundledJavaService = BundledJavaService.getInstance();
      
      // Set up event listeners for extraction progress
      bundledJavaService.on('extraction:start', (data: { version: number }) => {
        console.log(`Starting extraction of Java ${data.version}`);
        this.mainWindow?.webContents.send('java:extractionStart', data);
      });

      bundledJavaService.on('extraction:progress', (data: { version: number; progress: number }) => {
        console.log(`Java ${data.version} extraction progress: ${data.progress}%`);
        this.mainWindow?.webContents.send('java:extractionProgress', data);
      });

      bundledJavaService.on('extraction:complete', (data: { version: number }) => {
        console.log(`Java ${data.version} extraction complete`);
        this.mainWindow?.webContents.send('java:extractionComplete', data);
      });

      bundledJavaService.on('extraction:error', (data: { version: number; error: string }) => {
        console.error(`Java ${data.version} extraction error:`, data.error);
        this.mainWindow?.webContents.send('java:extractionError', data);
      });

      // Initialize runtimes (extract if needed, verify, etc.)
      await bundledJavaService.initializeBundledRuntimes();
      
      console.log('Bundled Java runtimes initialized successfully');
      this.mainWindow?.webContents.send('java:initializationComplete', {
        success: true,
      });
    } catch (error) {
      console.error('Failed to initialize bundled Java runtimes:', error);
      // Don't throw - we want the app to continue even if bundled Java fails
      // The launcher can fall back to system Java
      this.mainWindow?.webContents.send('java:initializationComplete', {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private createMainWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
      titleBarStyle: 'default',
      show: false,
    });

    // Load the renderer
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    
    if (isDev) {
      // Wait a bit for Vite dev server to be ready
      setTimeout(() => {
        this.mainWindow?.loadURL('http://localhost:3000').catch(() => {
          // If dev server isn't ready, try loading the built files
          this.mainWindow?.loadFile(path.join(__dirname, '../renderer/index.html'));
        });
      }, 1000);
      this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
      
      // Check for updates after window is shown
      const autoUpdater = AutoUpdaterService.getInstance();
      autoUpdater.setMainWindow(this.mainWindow!);
      
      // Check for updates 3 seconds after launch
      setTimeout(() => {
        autoUpdater.checkForUpdates();
      }, 3000);
    });

    // Handle window closed
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

	private setupIPC(): void {
		const authService = new AuthService();
		const gameProcessManager = GameProcessManager.getInstance();
		const modLoaderService = new ModLoaderService();
		const profileService = new ProfileService();
		const fabricModService = new FabricModService();
		const versionManager = new VersionManager();
		const logger = LoggerService.getInstance();
		const bundledJavaService = BundledJavaService.getInstance();

    // Set up game process event forwarding
    gameProcessManager.on('gameStarted', (processInfo) => {
      this.mainWindow?.webContents.send('game:started', processInfo);
    });

    gameProcessManager.on('gameExited', (data) => {
      this.mainWindow?.webContents.send('game:exited', data);
    });

    gameProcessManager.on('gameCrashed', (crashReport) => {
      this.mainWindow?.webContents.send('game:crashed', crashReport);
    });

    gameProcessManager.on('gameKilled', (processInfo) => {
      this.mainWindow?.webContents.send('game:killed', processInfo);
    });

    gameProcessManager.on('gameOutput', (output) => {
      this.mainWindow?.webContents.send('game:output', output);
    });

    gameProcessManager.on('gameWarning', (warning) => {
      this.mainWindow?.webContents.send('game:warning', warning);
    });

    gameProcessManager.on('gameError', (error) => {
      this.mainWindow?.webContents.send('game:error', error);
    });

    gameProcessManager.on('launchError', (error) => {
      this.mainWindow?.webContents.send('game:launchError', error);
    });

    // Basic IPC handlers for communication between main and renderer processes
    ipcMain.handle('app:getVersion', () => {
      return app.getVersion();
    });

    ipcMain.handle('app:getPlatform', () => {
      return process.platform;
    });

    ipcMain.handle('window:minimize', () => {
      this.mainWindow?.minimize();
    });

    ipcMain.handle('window:maximize', () => {
      if (this.mainWindow?.isMaximized()) {
        this.mainWindow.unmaximize();
      } else {
        this.mainWindow?.maximize();
      }
    });

    ipcMain.handle('window:close', () => {
      this.mainWindow?.close();
    });

    // Authentication IPC handlers
    ipcMain.handle('auth:authenticate', async () => {
      try {
        return await authService.authenticateUser();
      } catch (error) {
        console.error('Authentication failed:', error);
        throw error;
      }
    });

    ipcMain.handle('auth:validateSession', async () => {
      try {
        return await authService.validateSession();
      } catch (error) {
        console.error('Session validation failed:', error);
        throw error;
      }
    });

    ipcMain.handle('auth:refreshToken', async () => {
      try {
        return await authService.refreshToken();
      } catch (error) {
        console.error('Token refresh failed:', error);
        throw error;
      }
    });

    ipcMain.handle('auth:logout', async () => {
      try {
        await authService.logout();
        return { success: true };
      } catch (error) {
        console.error('Logout failed:', error);
        throw error;
      }
    });

    ipcMain.handle('auth:getCurrentUser', () => {
      try {
        return authService.getCurrentUser();
      } catch (error) {
        console.error('Failed to get current user:', error);
        throw error;
      }
    });

    ipcMain.handle('auth:isAuthenticated', () => {
      try {
        return authService.isAuthenticated();
      } catch (error) {
        console.error('Failed to check authentication status:', error);
        return false;
      }
    });

    ipcMain.handle('auth:checkMinecraftOwnership', async () => {
      try {
        return await authService.checkMinecraftOwnership();
      } catch (error) {
        console.error('Failed to check Minecraft ownership:', error);
        return false;
      }
    });

    // Profile management IPC handlers
    ipcMain.handle('profiles:getAll', async () => {
      try {
        return await profileService.getAllProfiles();
      } catch (error) {
        console.error('Failed to get profiles:', error);
        throw error;
      }
    });

    ipcMain.handle('profiles:getById', async (_, id: number) => {
      try {
        return await profileService.getProfileById(id);
      } catch (error) {
        console.error('Failed to get profile by id:', error);
        throw error;
      }
    });

    ipcMain.handle('profiles:create', async (_, profileData) => {
      try {
        return await profileService.createProfile(profileData);
      } catch (error) {
        console.error('Failed to create profile:', error);
        throw error;
      }
    });

    ipcMain.handle('profiles:update', async (_, id: number, profileData) => {
      try {
        return await profileService.updateProfile(id, profileData);
      } catch (error) {
        console.error('Failed to update profile:', error);
        throw error;
      }
    });

    ipcMain.handle('profiles:delete', async (_, id: number) => {
      try {
        return await profileService.deleteProfile(id);
      } catch (error) {
        console.error('Failed to delete profile:', error);
        throw error;
      }
    });

    // Game process management IPC handlers
    ipcMain.handle('game:launch', async (_, options: { profileId: number }) => {
      try {
        // Get the profile
        let profile = await profileService.getProfileById(options.profileId);
        if (!profile) {
          throw new Error(`Profile with ID ${options.profileId} not found`);
        }

        // Get authentication data
        const authData = authService.getStoredAuthData();
        if (!authData) {
          throw new Error('User not authenticated. Please log in first.');
        }

        // Validate session and refresh if needed
        const validAuthData = await authService.validateSession();
        if (!validAuthData) {
          throw new Error('Authentication session expired. Please log in again.');
        }

        // Fix version ID for Fabric profiles if needed
        // (handles profiles created before the version ID fix)
        if (profile.modLoader?.type === 'fabric') {
          let fabricLoaderVersion = profile.modLoader.version;
          
          // Extract base game version from current version ID
          let baseGameVersion = profile.versionId;
          if (profile.versionId.startsWith('fabric-loader-')) {
            // Extract from fabric version ID: fabric-loader-X.X.X-1.21.5 -> 1.21.5
            const match = profile.versionId.match(/^fabric-loader-.+-(.+)$/);
            if (match) {
              baseGameVersion = match[1];
            }
          }
          
          // Resolve "latest" to actual installed version
          if (fabricLoaderVersion === 'latest') {
            const installedModLoaders = await modLoaderService.getInstalledModLoaders(profile.installationDir);
            const fabricLoader = installedModLoaders.find(ml => 
              ml.type === 'fabric' && ml.gameVersion === baseGameVersion
            );
            
            if (fabricLoader) {
              fabricLoaderVersion = fabricLoader.version;
              console.log(`Resolved Fabric loader version from "latest" to ${fabricLoaderVersion}`);
              
              // Update the profile with the resolved version
              await profileService.updateProfile(profile.id!, {
                modLoader: {
                  type: 'fabric',
                  version: fabricLoaderVersion
                }
              });
            } else {
              throw new Error('Fabric loader not installed. Please reinstall the Fabric mod loader.');
            }
          }
          
          const expectedFabricVersionId = `fabric-loader-${fabricLoaderVersion}-${baseGameVersion}`;
          
          // Check if the version ID needs to be updated
          if (profile.versionId !== expectedFabricVersionId) {
            console.log(`Fixing Fabric profile version ID from ${profile.versionId} to ${expectedFabricVersionId}`);
            
            // Update the profile with the correct version ID
            await profileService.updateProfile(profile.id!, {
              versionId: expectedFabricVersionId
            });
            
            // Reload the profile with the updated version ID
            const updatedProfile = await profileService.getProfileById(profile.id!);
            if (!updatedProfile) {
              throw new Error('Failed to reload profile after version ID update');
            }
            profile = updatedProfile;
          }
        }

        // Get version metadata
        const versionMetadata = await versionManager.getVersionMetadata(profile.versionId);
        if (!versionMetadata) {
          throw new Error(`Version metadata for ${profile.versionId} not found`);
        }

        // Construct proper launch options
        const launchOptions = {
          profile,
          versionMetadata,
          authData: validAuthData
        };

        return await gameProcessManager.launchGame(launchOptions);
      } catch (error) {
        console.error('Failed to launch game:', error);
        throw error;
      }
    });

    // Launch game as vanilla (ignoring mod loader configuration)
    ipcMain.handle('game:launchVanilla', async (_, options: { profileId: number }) => {
      try {
        // Get the profile
        const profile = await profileService.getProfileById(options.profileId);
        if (!profile) {
          throw new Error(`Profile with ID ${options.profileId} not found`);
        }

        // Get authentication data
        const authData = authService.getStoredAuthData();
        if (!authData) {
          throw new Error('User not authenticated. Please log in first.');
        }

        // Validate session and refresh if needed
        const validAuthData = await authService.validateSession();
        if (!validAuthData) {
          throw new Error('Authentication session expired. Please log in again.');
        }

        // Get version metadata for the base game version (not modded)
        const baseVersionId = profile.versionId.split('-')[0]; // Extract base version (e.g., "1.12.2" from "1.12.2-forge-...")
        const versionMetadata = await versionManager.getVersionMetadata(baseVersionId);
        if (!versionMetadata) {
          throw new Error(`Version metadata for ${baseVersionId} not found`);
        }

        // Construct launch options for vanilla
        const launchOptions = {
          profile: {
            ...profile,
            versionId: baseVersionId, // Use base version ID
            modLoader: undefined // Remove mod loader
          },
          versionMetadata,
          authData: validAuthData
        };

        return await gameProcessManager.launchVanilla(launchOptions);
      } catch (error) {
        console.error('Failed to launch vanilla game:', error);
        throw error;
      }
    });

    ipcMain.handle('game:kill', async (_, processId: number) => {
      try {
        return await gameProcessManager.killGameProcess(processId);
      } catch (error) {
        console.error('Failed to kill game process:', error);
        throw error;
      }
    });

    ipcMain.handle('game:getActiveProcesses', () => {
      try {
        return gameProcessManager.getActiveProcesses();
      } catch (error) {
        console.error('Failed to get active processes:', error);
        throw error;
      }
    });

    ipcMain.handle('game:getProcessInfo', (_, processId: number) => {
      try {
        return gameProcessManager.getProcessInfo(processId);
      } catch (error) {
        console.error('Failed to get process info:', error);
        throw error;
      }
    });

    ipcMain.handle('game:isProfileRunning', (_, profileId: number) => {
      try {
        return gameProcessManager.isProfileRunning(profileId);
      } catch (error) {
        console.error('Failed to check if profile is running:', error);
        return false;
      }
    });

    ipcMain.handle('game:getCrashHistory', () => {
      try {
        return gameProcessManager.getCrashHistory();
      } catch (error) {
        console.error('Failed to get crash history:', error);
        throw error;
      }
    });

    // LWJGL troubleshooting IPC handlers
    ipcMain.handle('game:clearNatives', async (_, installationDir: string, versionId: string) => {
      try {
        await gameProcessManager.clearNativesDirectory(installationDir, versionId);
        return { success: true, message: 'Natives directory cleared successfully' };
      } catch (error) {
        console.error('Failed to clear natives directory:', error);
        throw error;
      }
    });

    ipcMain.handle('game:forceNativesReextraction', async (_, profileId: number) => {
      try {
        await gameProcessManager.forceNativesReextraction(profileId);
        return { success: true, message: 'Natives will be re-extracted on next launch' };
      } catch (error) {
        console.error('Failed to force natives re-extraction:', error);
        throw error;
      }
    });

    // Mod loader management IPC handlers
    ipcMain.handle('modLoader:detectModLoaders', async (_, gameVersion: string) => {
      try {
        return await modLoaderService.detectModLoaders(gameVersion);
      } catch (error) {
        console.error('Failed to detect mod loaders:', error);
        throw error;
      }
    });

    ipcMain.handle('modLoader:installModLoader', async (_, modLoaderInfo, installationDir: string, onProgress?: (progress: { stage: string; percentage: number }) => void) => {
      try {
        return await modLoaderService.installModLoader(modLoaderInfo, installationDir, onProgress);
      } catch (error) {
        console.error('Failed to install mod loader:', error);
        throw error;
      }
    });

    ipcMain.handle('modLoader:isModLoaderInstalled', async (_, type: 'forge' | 'fabric' | 'quilt', gameVersion: string, loaderVersion: string, installationDir: string) => {
      try {
        return await modLoaderService.isModLoaderInstalled(type, gameVersion, loaderVersion, installationDir);
      } catch (error) {
        console.error('Failed to check mod loader installation:', error);
        throw error;
      }
    });

    ipcMain.handle('modLoader:getInstalledModLoaders', async (_, installationDir: string) => {
      try {
        return await modLoaderService.getInstalledModLoaders(installationDir);
      } catch (error) {
        console.error('Failed to get installed mod loaders:', error);
        throw error;
      }
    });

    // Modded profile management IPC handlers
    ipcMain.handle('profiles:createModdedProfile', async (_, modLoaderInfo, baseProfileName?: string, installationDir?: string) => {
      try {
        return await profileService.createModdedProfile(modLoaderInfo, baseProfileName, installationDir);
      } catch (error) {
        console.error('Failed to create modded profile:', error);
        throw error;
      }
    });

    ipcMain.handle('profiles:updateModLoaderVersion', async (_, profileId: number, newModLoaderInfo, installationDir?: string) => {
      try {
        return await profileService.updateModLoaderVersion(profileId, newModLoaderInfo, installationDir);
      } catch (error) {
        console.error('Failed to update mod loader version:', error);
        throw error;
      }
    });

    ipcMain.handle('profiles:convertToModdedProfile', async (_, profileId: number, modLoaderInfo, installationDir?: string) => {
      try {
        return await profileService.convertToModdedProfile(profileId, modLoaderInfo, installationDir);
      } catch (error) {
        console.error('Failed to convert to modded profile:', error);
        throw error;
      }
    });

    ipcMain.handle('profiles:removeModLoaderFromProfile', async (_, profileId: number) => {
      try {
        return await profileService.removeModLoaderFromProfile(profileId);
      } catch (error) {
        console.error('Failed to remove mod loader from profile:', error);
        throw error;
      }
    });

    ipcMain.handle('profiles:getAvailableModLoaders', async (_, profileId: number) => {
      try {
        return await profileService.getAvailableModLoadersForProfile(profileId);
      } catch (error) {
        console.error('Failed to get available mod loaders for profile:', error);
        throw error;
      }
    });

    ipcMain.handle('profiles:checkModLoaderUpdates', async (_, profileId: number) => {
      try {
        return await profileService.checkModLoaderUpdates(profileId);
      } catch (error) {
        console.error('Failed to check mod loader updates:', error);
        throw error;
      }
    });

		ipcMain.handle('profiles:getInstalledModLoaders', async (_, profileId: number) => {
			try {
				return await profileService.getInstalledModLoadersForProfile(profileId);
			} catch (error) {
				console.error('Failed to get installed mod loaders for profile:', error);
				throw error;
			}
		});

		// Version management IPC handlers
		ipcMain.handle('versions:getAll', async (_, forceRefresh?: boolean) => {
			try {
				return await versionManager.fetchAvailableVersions(forceRefresh);
			} catch (error) {
				console.error('Failed to fetch versions:', error);
				throw error;
			}
		});

		ipcMain.handle('versions:getByType', async (_, type: string) => {
			try {
				return await versionManager.getVersionsByType(type as any);
			} catch (error) {
				console.error('Failed to fetch versions by type:', error);
				throw error;
			}
		});

		ipcMain.handle('versions:getReleases', async () => {
			try {
				return await versionManager.getReleaseVersions();
			} catch (error) {
				console.error('Failed to fetch release versions:', error);
				throw error;
			}
		});

		ipcMain.handle('versions:getSnapshots', async () => {
			try {
				return await versionManager.getSnapshotVersions();
			} catch (error) {
				console.error('Failed to fetch snapshot versions:', error);
				throw error;
			}
		});

		ipcMain.handle('versions:find', async (_, versionId: string) => {
			try {
				return await versionManager.findVersion(versionId);
			} catch (error) {
				console.error('Failed to find version:', error);
				throw error;
			}
		});

		ipcMain.handle('versions:download', async (_, versionId: string, installationDir?: string) => {
			try {
				// Set up progress event forwarding
				const progressHandler = (progress: any) => {
					this.mainWindow?.webContents.send('version:downloadProgress', progress);
				};
				
				versionManager.on('progress', progressHandler);
				
				try {
					await versionManager.downloadVersion(versionId, installationDir);
					return { success: true };
				} finally {
					versionManager.removeListener('progress', progressHandler);
				}
			} catch (error) {
				console.error('Failed to download version:', error);
				throw error;
			}
		});

		ipcMain.handle('versions:cancelDownload', async (_, versionId: string) => {
			try {
				versionManager.cancelDownload(versionId);
				return { success: true };
			} catch (error) {
				console.error('Failed to cancel download:', error);
				throw error;
			}
		});

		ipcMain.handle('versions:isInstalled', async (_, versionId: string) => {
			try {
				return await versionManager.isVersionInstalled(versionId);
			} catch (error) {
				console.error('Failed to check if version is installed:', error);
				throw error;
			}
		});

		ipcMain.handle('versions:getInstalled', async () => {
			try {
				return await versionManager.getInstalledVersions();
			} catch (error) {
				console.error('Failed to get installed versions:', error);
				throw error;
			}
		});

		ipcMain.handle('versions:validate', async (_, versionId: string) => {
			try {
				return await versionManager.validateInstallation(versionId);
			} catch (error) {
				console.error('Failed to validate installation:', error);
				throw error;
			}
		});

		ipcMain.handle('versions:clearCache', async () => {
			try {
				await versionManager.clearCache();
				return { success: true };
			} catch (error) {
				console.error('Failed to clear version cache:', error);
				throw error;
			}
		});

		// Error logging handler
		ipcMain.handle('error:log', async (_, errorData: { message: string; stack?: string; componentStack?: string }) => {
			try {
				logger.error('Renderer process error', new Error(errorData.message), {
					stack: errorData.stack,
					componentStack: errorData.componentStack,
				});
				return { success: true };
			} catch (error) {
				console.error('Failed to log error:', error);
				return { success: false };
			}
		});

		// Bundled Java runtime IPC handlers
		ipcMain.handle('java:getBundledRuntimes', () => {
			try {
				return bundledJavaService.getAllBundledRuntimes();
			} catch (error) {
				console.error('Failed to get bundled runtimes:', error);
				throw error;
			}
		});

		ipcMain.handle('java:verifyBundledRuntimes', async () => {
			try {
				const runtimes = bundledJavaService.getAllBundledRuntimes();
				const results: { [key: number]: boolean } = {};
				
				for (const runtime of runtimes) {
					results[runtime.version] = await bundledJavaService.verifyRuntimeWithCache(runtime.version);
				}
				
				return results;
			} catch (error) {
				console.error('Failed to verify bundled runtimes:', error);
				throw error;
			}
		});

		ipcMain.handle('java:getRuntimeStatus', async (_, majorVersion: number) => {
			try {
				const runtime = bundledJavaService.getBundledRuntimeInfo(majorVersion);
				
				if (!runtime) {
					return {
						available: false,
						extracted: false,
						verified: false,
					};
				}
				
				return {
					available: bundledJavaService.isBundledRuntimeAvailable(majorVersion),
					extracted: runtime.extracted,
					verified: runtime.verified,
					version: runtime.fullVersion,
					path: runtime.path,
				};
			} catch (error) {
				console.error('Failed to get runtime status:', error);
				throw error;
			}
		});

		// Fabric mod management IPC handlers
		ipcMain.handle('profiles:createFabricProfile', async (_, profileData) => {
			try {
				// Set up progress event forwarding
				const progressHandler = (progress: ModDownloadProgress) => {
					this.mainWindow?.webContents.send('mods:installProgress', progress);
				};
				
				return await profileService.createFabricProfile(profileData, progressHandler);
			} catch (error) {
				console.error('Failed to create Fabric profile:', error);
				throw error;
			}
		});

		ipcMain.handle('mods:installEssentialMods', async (_, profileId: number, gameVersion: string) => {
			try {
				// Get profile to retrieve installation directory
				const profile = await profileService.getProfileById(profileId);
				if (!profile) {
					throw new Error('Profile not found');
				}
				
				// Set up progress event forwarding
				const progressHandler = (progress: ModDownloadProgress) => {
					this.mainWindow?.webContents.send('mods:installProgress', progress);
				};
				
				await fabricModService.installEssentialMods(
					profileId,
					gameVersion,
					profile.installationDir,
					progressHandler
				);
				return { success: true };
			} catch (error) {
				console.error('Failed to install essential mods:', error);
				throw error;
			}
		});

		ipcMain.handle('mods:getAllMods', async (_, profileId: number) => {
			try {
				return await fabricModService.getAllMods(profileId);
			} catch (error) {
				console.error('Failed to get all mods:', error);
				throw error;
			}
		});

		ipcMain.handle('mods:getModStates', async (_, profileId: number) => {
			try {
				const modStates = await fabricModService.getModStates(profileId);
				// Convert Map to object for JSON serialization
				return Object.fromEntries(modStates);
			} catch (error) {
				console.error('Failed to get mod states:', error);
				throw error;
			}
		});

		ipcMain.handle('mods:setModState', async (_, profileId: number, modId: string, enabled: boolean) => {
			try {
				await fabricModService.setModState(profileId, modId, enabled);
				return { success: true };
			} catch (error) {
				console.error('Failed to set mod state:', error);
				throw error;
			}
		});

		ipcMain.handle('mods:addCustomMod', async (_, profileId: number, url: string) => {
			try {
				// Get profile to retrieve game version and installation directory
				const profile = await profileService.getProfileById(profileId);
				if (!profile) {
					throw new Error('Profile not found');
				}
				
				// Set up progress event forwarding
				const progressHandler = (progress: ModDownloadProgress) => {
					this.mainWindow?.webContents.send('mods:installProgress', progress);
				};
				
				return await fabricModService.addCustomMod(
					profileId, 
					url, 
					profile.versionId,
					profile.installationDir,
					progressHandler
				);
			} catch (error) {
				console.error('Failed to add custom mod:', error);
				throw error;
			}
		});

		ipcMain.handle('mods:removeCustomMod', async (_, profileId: number, modId: string) => {
			try {
				// Get profile to retrieve installation directory
				const profile = await profileService.getProfileById(profileId);
				if (!profile) {
					throw new Error('Profile not found');
				}
				
				await fabricModService.removeCustomMod(profileId, modId, profile.installationDir);
				return { success: true };
			} catch (error) {
				console.error('Failed to remove custom mod:', error);
				throw error;
			}
		});

		ipcMain.handle('mods:getProfilePreference', async (_, profileId: number, key: string) => {
			try {
				return await profileService.getProfilePreference(profileId, key);
			} catch (error) {
				console.error('Failed to get profile preference:', error);
				throw error;
			}
		});

		ipcMain.handle('mods:setProfilePreference', async (_, profileId: number, key: string, value: any) => {
			try {
				await profileService.setProfilePreference(profileId, key, value);
				return { success: true };
			} catch (error) {
				console.error('Failed to set profile preference:', error);
				throw error;
			}
		});

		// Forge profile creation handler
		ipcMain.handle('profiles:createForgeProfile', async (_, profileData, enableOptiFine: boolean = true) => {
			try {
				// Set up progress event forwarding
				const progressHandler = (progress: { stage: string; percentage: number; message?: string }) => {
					this.mainWindow?.webContents.send('mods:installProgress', progress);
				};
				
				return await profileService.createForgeProfile(profileData, enableOptiFine, progressHandler);
			} catch (error) {
				console.error('Failed to create Forge profile:', error);
				throw error;
			}
		});

		// Forge mod management IPC handlers
		ipcMain.handle('forgeMods:getModStates', async (_, profileId: number) => {
			try {
				const { ForgeModService } = await import('./services/forge-mod-service');
				const forgeModService = new ForgeModService();
				return await forgeModService.getModStates(profileId.toString());
			} catch (error) {
				console.error('Failed to get Forge mod states:', error);
				throw error;
			}
		});

		ipcMain.handle('forgeMods:updateModState', async (_, profileId: number, modName: string, enabled: boolean) => {
			try {
				const { ForgeModService } = await import('./services/forge-mod-service');
				const forgeModService = new ForgeModService();
				await forgeModService.updateModState(profileId.toString(), modName, enabled);
				return { success: true };
			} catch (error) {
				console.error('Failed to update Forge mod state:', error);
				throw error;
			}
		});

		ipcMain.handle('forgeMods:applyModStates', async (_, profileId: number) => {
			try {
				const { ForgeModService } = await import('./services/forge-mod-service');
				const forgeModService = new ForgeModService();
				await forgeModService.applyModStates(profileId.toString());
				return { success: true };
			} catch (error) {
				console.error('Failed to apply Forge mod states:', error);
				throw error;
			}
		});

		ipcMain.handle('forgeMods:getStatistics', async (_, profileId: number) => {
			try {
				const { ForgeModService } = await import('./services/forge-mod-service');
				const forgeModService = new ForgeModService();
				return await forgeModService.getModStateStatistics(profileId.toString());
			} catch (error) {
				console.error('Failed to get Forge mod statistics:', error);
				throw error;
			}
		});

		ipcMain.handle('forgeMods:scanDirectory', async (_, profileId: number, modsDirectory: string) => {
			try {
				const { ForgeModService } = await import('./services/forge-mod-service');
				const forgeModService = new ForgeModService();
				await forgeModService.scanAndUpdateModStates(profileId.toString(), modsDirectory);
				return { success: true };
			} catch (error) {
				console.error('Failed to scan Forge mods directory:', error);
				throw error;
			}
		});

		// Java detection for Forge installer
		ipcMain.handle('forge:checkJava', async () => {
			try {
				const { JavaService } = await import('./services/java-service');
				const javaService = JavaService.getInstance();
				const javaInstallation = await javaService.getBestJavaInstallation('1.12.2');
				
				if (javaInstallation) {
					return {
						available: true,
						path: javaInstallation.path,
						version: javaInstallation.version,
						majorVersion: javaInstallation.majorVersion
					};
				} else {
					return {
						available: false,
						message: 'No compatible Java installation found. Please install Java 8 or later.'
					};
				}
			} catch (error) {
				console.error('Failed to check Java:', error);
				return {
					available: false,
					message: `Java check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
				};
			}
		});

		// Forge installer IPC handlers
		ipcMain.handle('forge:getAvailableVersions', async (_, mcVersion: string) => {
			try {
				const { ForgeInstaller } = await import('./services/forge-installer');
				const installer = new ForgeInstaller();
				return await installer.getAvailableVersions(mcVersion);
			} catch (error) {
				console.error('Failed to get available Forge versions:', error);
				throw error;
			}
		});

		ipcMain.handle('forge:getRecommendedVersion', async (_, mcVersion: string) => {
			try {
				const { ForgeInstaller } = await import('./services/forge-installer');
				const installer = new ForgeInstaller();
				return await installer.getRecommendedVersion(mcVersion);
			} catch (error) {
				console.error('Failed to get recommended Forge version:', error);
				throw error;
			}
		});

		ipcMain.handle('forge:isInstalled', async (_, mcVersion: string, forgeVersion: string, minecraftDir: string) => {
			try {
				const { ForgeInstaller } = await import('./services/forge-installer');
				const installer = new ForgeInstaller();
				return await installer.isForgeInstalled(mcVersion, forgeVersion, minecraftDir);
			} catch (error) {
				console.error('Failed to check Forge installation:', error);
				return false;
			}
		});

		ipcMain.handle('forge:install', async (_, mcVersion: string, forgeVersion: string, minecraftDir: string) => {
			try {
				const { ForgeInstaller } = await import('./services/forge-installer');
				const installer = new ForgeInstaller();
				
				return new Promise((resolve, reject) => {
					installer.installForge(mcVersion, forgeVersion, minecraftDir, (progress: any) => {
						// Send progress updates to renderer
						this.mainWindow?.webContents.send('forge:installProgress', progress);
					}).then(resolve).catch(reject);
				});
			} catch (error) {
				console.error('Failed to install Forge:', error);
				throw error;
			}
		});

		ipcMain.handle('forge:updateProfileVersion', async (_, profileId: number, newVersionId: string) => {
			try {
				const updatedProfile = await profileService.updateProfile(profileId, {
					versionId: newVersionId
				});
				return updatedProfile;
			} catch (error) {
				console.error('Failed to update profile version:', error);
				throw error;
			}
		});

		// Forge settings IPC handlers
		ipcMain.handle('forgeSettings:getOptiFineSettings', async () => {
			try {
				const { ForgeSettingsService } = await import('./services/forge-settings-service');
				const forgeSettingsService = new ForgeSettingsService();
				return await forgeSettingsService.getOptiFineSettings();
			} catch (error) {
				console.error('Failed to get OptiFine settings:', error);
				throw error;
			}
		});

		// OptiFine installation handler
		ipcMain.handle('optifine:install', async (_, gameVersion: string, modsDirectory: string) => {
			try {
				const { OptiFineManager } = await import('./services/optifine-manager');
				const optifineManager = new OptiFineManager();
				
				// Get available OptiFine versions for the game version
				const availableVersions = await optifineManager.getAvailableVersions(gameVersion);
				if (availableVersions.length === 0) {
					throw new Error(`No OptiFine versions available for Minecraft ${gameVersion}`);
				}
				
				// Use the first (recommended) version
				const optifineVersion = availableVersions[0];
				const targetPath = path.join(modsDirectory, optifineVersion.filename);
				
				// Check if OptiFine is already installed
				try {
					await fs.access(targetPath);
					// Verify it's a valid OptiFine installation
					const stats = await fs.stat(targetPath);
					if (stats.size > 1024) { // More than 1KB, likely valid
						return { 
							success: true, 
							message: `OptiFine ${optifineVersion.version} is already installed`,
							version: optifineVersion.version,
							path: targetPath
						};
					}
				} catch {
					// OptiFine not installed, proceed with download
				}
				
				// Ensure mods directory exists
				await fs.mkdir(modsDirectory, { recursive: true });
				
				try {
					// Use the advanced download method with multiple mirror sources
					console.log('Attempting OptiFine download with advanced mirror sources...');
					await optifineManager.downloadOptiFineAdvanced(
						optifineVersion,
						targetPath,
						(progress: any) => {
							// Send progress updates to renderer
							this.mainWindow?.webContents.send('optifine:downloadProgress', progress);
						}
					);
					
					return { 
						success: true, 
						message: `OptiFine ${optifineVersion.version} installed successfully via automatic download`,
						version: optifineVersion.version,
						path: targetPath
					};
				} catch (advancedError) {
					console.log('Advanced download failed, trying fallback method...');
					
					// Fallback to original method
					try {
						const fallbackUrls = [
							'https://optifine.net/downloadx?f=OptiFine_1.12.2_HD_U_E3.jar&x=1',
							'https://optifine.net/downloadx?f=OptiFine_1.12.2_HD_U_E3.jar&x=2',
						];
						
						await optifineManager.downloadOptiFineWithFallback(
							optifineVersion,
							targetPath,
							fallbackUrls,
							(progress: any) => {
								this.mainWindow?.webContents.send('optifine:downloadProgress', progress);
							}
						);
						
						return { 
							success: true, 
							message: `OptiFine ${optifineVersion.version} installed successfully via fallback method`,
							version: optifineVersion.version,
							path: targetPath
						};
					} catch (fallbackError) {
						// Both methods failed, try the alternative installation method
						console.log('All download methods failed, creating installation guide...');
						
						try {
							const guidePath = await optifineManager.installOptiFineAlternative(
								optifineVersion,
								targetPath,
								(progress: any) => {
									this.mainWindow?.webContents.send('optifine:downloadProgress', progress);
								}
							);
							
							// Return manual installation instructions with the guide
							const manualInstructions = {
								success: false,
								requiresManualInstall: true,
								message: `OptiFine installation guide created. Please follow the instructions:`,
								instructions: [
									`1. Visit https://optifine.net/downloads`,
									`2. Download OptiFine ${optifineVersion.version} for Minecraft ${gameVersion}`,
									`3. Place the JAR file in: ${modsDirectory}`,
									`4. Restart launcher and launch the game`,
									`5. Detailed guide created at: ${guidePath}`
								],
								downloadUrl: `https://optifine.net/downloads`,
								targetDirectory: modsDirectory,
								expectedFilename: optifineVersion.filename,
								guidePath: guidePath,
								error: 'Automatic download restricted by OptiFine licensing'
							};
							
							return manualInstructions;
						} catch (guideError) {
							// Even guide creation failed, return basic manual instructions
							const downloadError = advancedError;
							
							const manualInstructions = {
								success: false,
								requiresManualInstall: true,
								message: `Automatic OptiFine download failed. Please install manually:`,
								instructions: [
									`1. Visit https://optifine.net/downloads`,
									`2. Download OptiFine ${optifineVersion.version} for Minecraft ${gameVersion}`,
									`3. Place the downloaded JAR file in: ${modsDirectory}`,
									`4. Restart the launcher and try launching the game`
								],
								downloadUrl: `https://optifine.net/downloads`,
								targetDirectory: modsDirectory,
								expectedFilename: optifineVersion.filename,
								error: downloadError instanceof Error ? downloadError.message : 'Unknown download error'
							};
							
							return manualInstructions;
						}
					}
				}
			} catch (error) {
				console.error('Failed to install OptiFine:', error);
				throw error;
			}
		});

		// System utilities
		ipcMain.handle('system:openFolder', async (_, folderPath: string) => {
			try {
				const { shell } = await import('electron');
				await shell.openPath(folderPath);
				return { success: true };
			} catch (error) {
				console.error('Failed to open folder:', error);
				throw error;
			}
		});

		ipcMain.handle('forgeSettings:updateOptiFineSettings', async (_, settings) => {
			try {
				const { ForgeSettingsService } = await import('./services/forge-settings-service');
				const forgeSettingsService = new ForgeSettingsService();
				await forgeSettingsService.updateOptiFineSettings(settings);
				return { success: true };
			} catch (error) {
				console.error('Failed to update OptiFine settings:', error);
				throw error;
			}
		});

		ipcMain.handle('forgeSettings:getModManagementSettings', async () => {
			try {
				const { ForgeSettingsService } = await import('./services/forge-settings-service');
				const forgeSettingsService = new ForgeSettingsService();
				return await forgeSettingsService.getModManagementSettings();
			} catch (error) {
				console.error('Failed to get mod management settings:', error);
				throw error;
			}
		});

		ipcMain.handle('forgeSettings:updateModManagementSettings', async (_, settings) => {
			try {
				const { ForgeSettingsService } = await import('./services/forge-settings-service');
				const forgeSettingsService = new ForgeSettingsService();
				await forgeSettingsService.updateModManagementSettings(settings);
				return { success: true };
			} catch (error) {
				console.error('Failed to update mod management settings:', error);
				throw error;
			}
		});

		ipcMain.handle('forgeSettings:getProfileSettings', async () => {
			try {
				const { ForgeSettingsService } = await import('./services/forge-settings-service');
				const forgeSettingsService = new ForgeSettingsService();
				return await forgeSettingsService.getProfileSettings();
			} catch (error) {
				console.error('Failed to get profile settings:', error);
				throw error;
			}
		});

		ipcMain.handle('forgeSettings:updateProfileSettings', async (_, settings) => {
			try {
				const { ForgeSettingsService } = await import('./services/forge-settings-service');
				const forgeSettingsService = new ForgeSettingsService();
				await forgeSettingsService.updateProfileSettings(settings);
				return { success: true };
			} catch (error) {
				console.error('Failed to update profile settings:', error);
				throw error;
			}
		});

		ipcMain.handle('forgeSettings:getAllForgeSettings', async () => {
			try {
				const { ForgeSettingsService } = await import('./services/forge-settings-service');
				const forgeSettingsService = new ForgeSettingsService();
				return await forgeSettingsService.getAllForgeSettings();
			} catch (error) {
				console.error('Failed to get all Forge settings:', error);
				throw error;
			}
		});

		ipcMain.handle('forgeSettings:resetAllForgeSettings', async () => {
			try {
				const { ForgeSettingsService } = await import('./services/forge-settings-service');
				const forgeSettingsService = new ForgeSettingsService();
				await forgeSettingsService.resetAllSettings();
				return { success: true };
			} catch (error) {
				console.error('Failed to reset all Forge settings:', error);
				throw error;
			}
		});

		ipcMain.handle('forgeSettings:exportSettings', async () => {
			try {
				const { ForgeSettingsService } = await import('./services/forge-settings-service');
				const forgeSettingsService = new ForgeSettingsService();
				return await forgeSettingsService.exportSettings();
			} catch (error) {
				console.error('Failed to export Forge settings:', error);
				throw error;
			}
		});

		ipcMain.handle('forgeSettings:importSettings', async (_, jsonData: string) => {
			try {
				const { ForgeSettingsService } = await import('./services/forge-settings-service');
				const forgeSettingsService = new ForgeSettingsService();
				await forgeSettingsService.importSettings(jsonData);
				return { success: true };
			} catch (error) {
				console.error('Failed to import Forge settings:', error);
				throw error;
			}
		});

		ipcMain.handle('forgeSettings:validateSettings', async () => {
			try {
				const { ForgeSettingsService } = await import('./services/forge-settings-service');
				const forgeSettingsService = new ForgeSettingsService();
				return await forgeSettingsService.validateSettings();
			} catch (error) {
				console.error('Failed to validate Forge settings:', error);
				throw error;
			}
		});

		// Auto-updater handlers
		const autoUpdater = AutoUpdaterService.getInstance();
		
		ipcMain.handle('updater:checkForUpdates', () => {
			try {
				autoUpdater.checkForUpdates();
				return { success: true };
			} catch (error) {
				console.error('Failed to check for updates:', error);
				throw error;
			}
		});

		ipcMain.handle('updater:downloadUpdate', () => {
			try {
				autoUpdater.downloadUpdate();
				return { success: true };
			} catch (error) {
				console.error('Failed to download update:', error);
				throw error;
			}
		});

		ipcMain.handle('updater:quitAndInstall', () => {
			try {
				autoUpdater.quitAndInstall();
				return { success: true };
			} catch (error) {
				console.error('Failed to quit and install:', error);
				throw error;
			}
		});
	}
}

// Initialize the application
new MinecraftLauncher();
