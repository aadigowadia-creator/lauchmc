import { contextBridge, ipcRenderer } from 'electron';

// Type definitions for bundled Java runtime
export interface BundledRuntimeInfo {
  version: number;           // Major version (8, 17)
  fullVersion: string;       // Full version string (e.g., "17.0.9")
  path: string;              // Path to java.exe
  architecture: string;      // x64
  extracted: boolean;        // Whether runtime has been extracted
  verified: boolean;         // Whether runtime passed verification
  checksum: string;          // SHA256 checksum for verification
}

export interface RuntimeStatus {
  available: boolean;
  extracted: boolean;
  verified: boolean;
  version?: string;
  path?: string;
}

export interface RuntimeVerificationResults {
  [majorVersion: number]: boolean;
}

// Define the API that will be exposed to the renderer process
const electronAPI = {
  // App information
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),

  // Authentication API
  authenticateUser: () => ipcRenderer.invoke('auth:authenticate'),
  validateSession: () => ipcRenderer.invoke('auth:validateSession'),
  refreshToken: () => ipcRenderer.invoke('auth:refreshToken'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getCurrentUser: () => ipcRenderer.invoke('auth:getCurrentUser'),
  isAuthenticated: () => ipcRenderer.invoke('auth:isAuthenticated'),
  checkMinecraftOwnership: () => ipcRenderer.invoke('auth:checkMinecraftOwnership'),

  // Profile Management API
  getProfiles: () => ipcRenderer.invoke('profiles:getAll'),
  getProfileById: (id: number) => ipcRenderer.invoke('profiles:getById', id),
  createProfile: (profile: any) => ipcRenderer.invoke('profiles:create', profile),
  createFabricProfile: (profile: any) => ipcRenderer.invoke('profiles:createFabricProfile', profile),
  updateProfile: (id: number, profile: any) => ipcRenderer.invoke('profiles:update', id, profile),
  deleteProfile: (id: number) => ipcRenderer.invoke('profiles:delete', id),

  // Game Process Management API
  launchGame: (options: any) => ipcRenderer.invoke('game:launch', options),
  launchVanilla: (options: any) => ipcRenderer.invoke('game:launchVanilla', options),
  killGame: (processId: number) => ipcRenderer.invoke('game:kill', processId),
  getActiveProcesses: () => ipcRenderer.invoke('game:getActiveProcesses'),
  getProcessInfo: (processId: number) => ipcRenderer.invoke('game:getProcessInfo', processId),
  isProfileRunning: (profileId: number) => ipcRenderer.invoke('game:isProfileRunning', profileId),
  getCrashHistory: () => ipcRenderer.invoke('game:getCrashHistory'),

  // Mod Loader Management API
  detectModLoaders: (gameVersion: string) => ipcRenderer.invoke('modLoader:detectModLoaders', gameVersion),
  installModLoader: (modLoaderInfo: any, installationDir: string, onProgress?: (progress: { stage: string; percentage: number }) => void) => 
    ipcRenderer.invoke('modLoader:installModLoader', modLoaderInfo, installationDir, onProgress),
  isModLoaderInstalled: (type: 'forge' | 'fabric' | 'quilt', gameVersion: string, loaderVersion: string, installationDir: string) => 
    ipcRenderer.invoke('modLoader:isModLoaderInstalled', type, gameVersion, loaderVersion, installationDir),
  getInstalledModLoaders: (installationDir: string) => ipcRenderer.invoke('modLoader:getInstalledModLoaders', installationDir),

  // Modded Profile Management API
  createModdedProfile: (modLoaderInfo: any, baseProfileName?: string, installationDir?: string) => 
    ipcRenderer.invoke('profiles:createModdedProfile', modLoaderInfo, baseProfileName, installationDir),
  updateModLoaderVersion: (profileId: number, newModLoaderInfo: any, installationDir?: string) => 
    ipcRenderer.invoke('profiles:updateModLoaderVersion', profileId, newModLoaderInfo, installationDir),
  convertToModdedProfile: (profileId: number, modLoaderInfo: any, installationDir?: string) => 
    ipcRenderer.invoke('profiles:convertToModdedProfile', profileId, modLoaderInfo, installationDir),
  removeModLoaderFromProfile: (profileId: number) => 
    ipcRenderer.invoke('profiles:removeModLoaderFromProfile', profileId),
  getAvailableModLoadersForProfile: (profileId: number) => 
    ipcRenderer.invoke('profiles:getAvailableModLoaders', profileId),
  checkModLoaderUpdates: (profileId: number) => 
    ipcRenderer.invoke('profiles:checkModLoaderUpdates', profileId),
  getInstalledModLoadersForProfile: (profileId: number) => 
    ipcRenderer.invoke('profiles:getInstalledModLoaders', profileId),

  // Game Process Events
  onGameStarted: (callback: (processInfo: any) => void) => {
    ipcRenderer.on('game:started', (_, processInfo) => callback(processInfo));
  },
  onGameExited: (callback: (data: any) => void) => {
    ipcRenderer.on('game:exited', (_, data) => callback(data));
  },
  onGameCrashed: (callback: (crashReport: any) => void) => {
    ipcRenderer.on('game:crashed', (_, crashReport) => callback(crashReport));
  },
  onGameKilled: (callback: (processInfo: any) => void) => {
    ipcRenderer.on('game:killed', (_, processInfo) => callback(processInfo));
  },
  onGameOutput: (callback: (output: any) => void) => {
    ipcRenderer.on('game:output', (_, output) => callback(output));
  },
  onGameWarning: (callback: (warning: any) => void) => {
    ipcRenderer.on('game:warning', (_, warning) => callback(warning));
  },
  onGameError: (callback: (error: any) => void) => {
    ipcRenderer.on('game:error', (_, error) => callback(error));
  },
  onLaunchError: (callback: (error: any) => void) => {
    ipcRenderer.on('game:launchError', (_, error) => callback(error));
  },

  // Event cleanup
  removeAllGameListeners: () => {
    ipcRenderer.removeAllListeners('game:started');
    ipcRenderer.removeAllListeners('game:exited');
    ipcRenderer.removeAllListeners('game:crashed');
    ipcRenderer.removeAllListeners('game:killed');
    ipcRenderer.removeAllListeners('game:output');
    ipcRenderer.removeAllListeners('game:warning');
    ipcRenderer.removeAllListeners('game:error');
    ipcRenderer.removeAllListeners('game:launchError');
  },

  // Version Management API
  getVersions: (forceRefresh?: boolean) => ipcRenderer.invoke('versions:getAll', forceRefresh),
  getVersionsByType: (type: string) => ipcRenderer.invoke('versions:getByType', type),
  getReleaseVersions: () => ipcRenderer.invoke('versions:getReleases'),
  getSnapshotVersions: () => ipcRenderer.invoke('versions:getSnapshots'),
  findVersion: (versionId: string) => ipcRenderer.invoke('versions:find', versionId),
  downloadVersion: (versionId: string, installationDir?: string) => ipcRenderer.invoke('versions:download', versionId, installationDir),
  cancelVersionDownload: (versionId: string) => ipcRenderer.invoke('versions:cancelDownload', versionId),
  isVersionInstalled: (versionId: string) => ipcRenderer.invoke('versions:isInstalled', versionId),
  getInstalledVersions: () => ipcRenderer.invoke('versions:getInstalled'),
  validateVersionInstallation: (versionId: string) => ipcRenderer.invoke('versions:validate', versionId),
  clearVersionCache: () => ipcRenderer.invoke('versions:clearCache'),
  onVersionDownloadProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('version:downloadProgress', (_, progress) => callback(progress));
  },
  removeAllVersionListeners: () => {
    ipcRenderer.removeAllListeners('version:downloadProgress');
  },

  // Error Logging API
  logError: (error: { message: string; stack?: string; componentStack?: string }) => 
    ipcRenderer.invoke('error:log', error),

  // Bundled Java Runtime API
  getBundledRuntimes: (): Promise<BundledRuntimeInfo[]> => ipcRenderer.invoke('java:getBundledRuntimes'),
  verifyBundledRuntimes: (): Promise<RuntimeVerificationResults> => ipcRenderer.invoke('java:verifyBundledRuntimes'),
  getRuntimeStatus: (majorVersion: number): Promise<RuntimeStatus> => ipcRenderer.invoke('java:getRuntimeStatus', majorVersion),
  
  // Bundled Java Runtime Events
  onJavaExtractionStart: (callback: (data: { version: number }) => void) => {
    ipcRenderer.on('java:extractionStart', (_, data) => callback(data));
  },
  onJavaExtractionProgress: (callback: (data: { version: number; progress: number }) => void) => {
    ipcRenderer.on('java:extractionProgress', (_, data) => callback(data));
  },
  onJavaExtractionComplete: (callback: (data: { version: number }) => void) => {
    ipcRenderer.on('java:extractionComplete', (_, data) => callback(data));
  },
  onJavaExtractionError: (callback: (data: { version: number; error: string }) => void) => {
    ipcRenderer.on('java:extractionError', (_, data) => callback(data));
  },
  onJavaInitializationComplete: (callback: (data: { success: boolean; error?: string }) => void) => {
    ipcRenderer.on('java:initializationComplete', (_, data) => callback(data));
  },
  removeAllJavaListeners: () => {
    ipcRenderer.removeAllListeners('java:extractionStart');
    ipcRenderer.removeAllListeners('java:extractionProgress');
    ipcRenderer.removeAllListeners('java:extractionComplete');
    ipcRenderer.removeAllListeners('java:extractionError');
    ipcRenderer.removeAllListeners('java:initializationComplete');
  },

  // Auto-updater API
  checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates'),
  downloadUpdate: () => ipcRenderer.invoke('updater:downloadUpdate'),
  quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
  onUpdateStatus: (callback: (status: string) => void) => {
    ipcRenderer.on('update:status', (_, status) => callback(status));
  },
  onUpdateDownloadProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('update:downloadProgress', (_, progress) => callback(progress));
  },
  removeAllUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update:status');
    ipcRenderer.removeAllListeners('update:downloadProgress');
  },

  // Fabric Mod Management API
  installEssentialMods: (profileId: number, gameVersion: string) => ipcRenderer.invoke('mods:installEssentialMods', profileId, gameVersion),
  getAllMods: (profileId: number) => ipcRenderer.invoke('mods:getAllMods', profileId),
  getModStates: (profileId: number) => ipcRenderer.invoke('mods:getModStates', profileId),
  setModState: (profileId: number, modId: string, enabled: boolean) => ipcRenderer.invoke('mods:setModState', profileId, modId, enabled),
  addCustomMod: (profileId: number, url: string) => ipcRenderer.invoke('mods:addCustomMod', profileId, url),
  removeCustomMod: (profileId: number, modId: string) => ipcRenderer.invoke('mods:removeCustomMod', profileId, modId),
  getProfilePreference: (profileId: number, key: string) => ipcRenderer.invoke('mods:getProfilePreference', profileId, key),
  setProfilePreference: (profileId: number, key: string, value: any) => ipcRenderer.invoke('mods:setProfilePreference', profileId, key, value),
  
  // Forge Mod Management API
  createForgeProfile: (profile: any, enableOptiFine?: boolean) => ipcRenderer.invoke('profiles:createForgeProfile', profile, enableOptiFine),
  getForgeModStates: (profileId: number) => ipcRenderer.invoke('forgeMods:getModStates', profileId),
  updateForgeModState: (profileId: number, modName: string, enabled: boolean) => ipcRenderer.invoke('forgeMods:updateModState', profileId, modName, enabled),
  applyForgeModStates: (profileId: number) => ipcRenderer.invoke('forgeMods:applyModStates', profileId),
  getForgeModStatistics: (profileId: number) => ipcRenderer.invoke('forgeMods:getStatistics', profileId),
  scanForgeModsDirectory: (profileId: number, modsDirectory: string) => ipcRenderer.invoke('forgeMods:scanDirectory', profileId, modsDirectory),
  
  // Forge Installer API
  checkJava: () => ipcRenderer.invoke('forge:checkJava'),
  getAvailableForgeVersions: (mcVersion: string) => ipcRenderer.invoke('forge:getAvailableVersions', mcVersion),
  getRecommendedForgeVersion: (mcVersion: string) => ipcRenderer.invoke('forge:getRecommendedVersion', mcVersion),
  isForgeInstalled: (mcVersion: string, forgeVersion: string, minecraftDir: string) => ipcRenderer.invoke('forge:isInstalled', mcVersion, forgeVersion, minecraftDir),
  installForge: (mcVersion: string, forgeVersion: string, minecraftDir: string) => ipcRenderer.invoke('forge:install', mcVersion, forgeVersion, minecraftDir),
  updateProfileVersion: (profileId: number, newVersionId: string) => ipcRenderer.invoke('forge:updateProfileVersion', profileId, newVersionId),
  
  // Forge Settings API
  getOptiFineSettings: () => ipcRenderer.invoke('forgeSettings:getOptiFineSettings'),
  updateOptiFineSettings: (settings: any) => ipcRenderer.invoke('forgeSettings:updateOptiFineSettings', settings),
  
  // OptiFine Installation API
  installOptiFine: (gameVersion: string, modsDirectory: string) => ipcRenderer.invoke('optifine:install', gameVersion, modsDirectory),
  openModsFolder: (modsDirectory: string) => ipcRenderer.invoke('system:openFolder', modsDirectory),
  getModManagementSettings: () => ipcRenderer.invoke('forgeSettings:getModManagementSettings'),
  updateModManagementSettings: (settings: any) => ipcRenderer.invoke('forgeSettings:updateModManagementSettings', settings),
  getProfileSettings: () => ipcRenderer.invoke('forgeSettings:getProfileSettings'),
  updateProfileSettings: (settings: any) => ipcRenderer.invoke('forgeSettings:updateProfileSettings', settings),
  getAllForgeSettings: () => ipcRenderer.invoke('forgeSettings:getAllForgeSettings'),
  resetAllForgeSettings: () => ipcRenderer.invoke('forgeSettings:resetAllForgeSettings'),
  exportForgeSettings: () => ipcRenderer.invoke('forgeSettings:exportSettings'),
  importForgeSettings: (jsonData: string) => ipcRenderer.invoke('forgeSettings:importSettings', jsonData),
  validateForgeSettings: () => ipcRenderer.invoke('forgeSettings:validateSettings'),
  
  // Mod installation progress listener
  onModInstallProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('mods:installProgress', (_, progress) => callback(progress));
  },
  removeModInstallProgressListener: () => {
    ipcRenderer.removeAllListeners('mods:installProgress');
  },

  // Forge installer events
  onForgeInstallProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('forge:installProgress', (_, progress) => callback(progress));
  },
  removeForgeInstallProgressListener: () => {
    ipcRenderer.removeAllListeners('forge:installProgress');
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type definitions for TypeScript
export type ElectronAPI = typeof electronAPI;
