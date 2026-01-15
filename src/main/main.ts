import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { initializeDatabase } from './database';
import { ProfileRepository } from './repositories';
import { AuthService, GameProcessManager } from './services';
import { ModLoaderService } from './services/mod-loader-service';
import { ProfileService } from './services/profile-service';
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
