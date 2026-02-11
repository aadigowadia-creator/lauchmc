// Core data models for the Minecraft Launcher

export interface UserProfile {
  id?: number;
  name: string;
  versionId: string;
  installationDir: string;
  memoryMin: number;
  memoryMax: number;
  jvmArgs: string;
  modLoader?: {
    type: 'forge' | 'fabric' | 'quilt';
    version: string;
  } | null;
  createdAt?: Date;
  lastUsed?: Date;
}

export interface GameVersion {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  url: string;
  time: Date;
  releaseTime: Date;
  sha1: string;
  complianceLevel: number;
}

export interface AuthenticationData {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  userProfile: {
    id: string;
    name: string;
    skinUrl?: string;
  };
}

// Database row interfaces for SQLite operations
export interface ProfileRow {
  id: number;
  name: string;
  version_id: string;
  installation_dir: string;
  memory_min: number;
  memory_max: number;
  jvm_args: string;
  mod_loader: string | null; // JSON string or null
  created_at: string;
  last_used: string | null;
}

// Utility type for creating profiles (without auto-generated fields)
export type CreateProfileData = Omit<UserProfile, 'id' | 'createdAt' | 'lastUsed'>;

// Utility type for updating profiles (all fields optional except id)
export type UpdateProfileData = Partial<Omit<UserProfile, 'id'>> & { id: number };

// Download progress tracking interfaces
export interface DownloadProgress {
  versionId: string;
  totalFiles: number;
  completedFiles: number;
  totalBytes: number;
  downloadedBytes: number;
  percentage: number;
  estimatedTimeRemaining: number; // in seconds
  currentSpeed: number; // bytes per second
  status: 'downloading' | 'verifying' | 'completed' | 'failed' | 'paused';
  currentFile?: string;
  error?: string;
}

export interface VersionMetadata {
  id: string;
  type: string;
  mainClass: string;
  minecraftArguments?: string;
  arguments?: {
    game: (string | { rules: any[]; value: string | string[] })[];
    jvm: (string | { rules: any[]; value: string | string[] })[];
  };
  libraries: LibraryInfo[];
  downloads: {
    client: DownloadInfo;
    client_mappings?: DownloadInfo;
    server?: DownloadInfo;
    server_mappings?: DownloadInfo;
  };
  assetIndex: {
    id: string;
    sha1: string;
    size: number;
    totalSize: number;
    url: string;
  };
  assets: string;
  complianceLevel: number;
  javaVersion?: {
    component: string;
    majorVersion: number;
  };
  logging?: {
    client: {
      argument: string;
      file: {
        id: string;
        sha1: string;
        size: number;
        url: string;
      };
      type: string;
    };
  };
}

export interface LibraryInfo {
  name: string;
  downloads: {
    artifact?: DownloadInfo;
    classifiers?: { [key: string]: DownloadInfo };
  };
  rules?: Array<{
    action: 'allow' | 'disallow';
    os?: {
      name?: string;
      version?: string;
      arch?: string;
    };
    features?: { [key: string]: boolean };
  }>;
  natives?: { [key: string]: string };
  extract?: {
    exclude: string[];
  };
}

export interface DownloadInfo {
  sha1: string;
  size: number;
  url: string;
}

export interface AssetIndex {
  objects: { [key: string]: AssetObject };
}

export interface AssetObject {
  hash: string;
  size: number;
}

// Mod Management Models
export interface ModState {
  id?: number;
  profileId: number;
  modId: string;
  enabled: boolean;
  updatedAt: Date;
}

export interface CustomMod {
  id?: number;
  profileId: number;
  modId: string;
  name: string;
  description?: string;
  fileName: string;
  source: 'modrinth' | 'curseforge';
  projectId: string;
  versionId?: string;
  downloadUrl: string;
  createdAt: Date;
}

export interface ProfilePreference {
  id?: number;
  profileId: number;
  preferenceKey: string;
  preferenceValue: string;
}

// Database row interfaces for mod management
export interface ModStateRow {
  id: number;
  profile_id: number;
  mod_id: string;
  enabled: number; // SQLite stores boolean as 0/1
  updated_at: string;
}

export interface CustomModRow {
  id: number;
  profile_id: number;
  mod_id: string;
  name: string;
  description: string | null;
  file_name: string;
  source: string;
  project_id: string;
  version_id: string | null;
  download_url: string;
  created_at: string;
}

export interface ProfilePreferenceRow {
  id: number;
  profile_id: number;
  preference_key: string;
  preference_value: string;
}

// Utility types for creating mod management records
export type CreateModStateData = Omit<ModState, 'id' | 'updatedAt'>;
export type UpdateModStateData = Partial<Omit<ModState, 'id' | 'profileId' | 'modId'>>;

export type CreateCustomModData = Omit<CustomMod, 'id' | 'createdAt'>;

export type CreateProfilePreferenceData = Omit<ProfilePreference, 'id'>;

// Forge Mod Management Models
export interface ForgeModState {
  id?: number;
  profileId: string;
  modName: string;
  enabled: boolean;
  filePath: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OptiFineConfig {
  id?: number;
  profileId: string;
  version: string;
  enabled: boolean;
  downloadUrl?: string;
  filePath?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Database row interfaces for Forge mod management
export interface ForgeModStateRow {
  id: number;
  profile_id: string;
  mod_name: string;
  enabled: number; // SQLite stores boolean as 0/1
  file_path: string;
  created_at: string;
  updated_at: string;
}

export interface OptiFineConfigRow {
  id: number;
  profile_id: string;
  version: string;
  enabled: number; // SQLite stores boolean as 0/1
  download_url: string | null;
  file_path: string | null;
  created_at: string;
  updated_at: string;
}

// Utility types for creating Forge mod management records
export type CreateForgeModStateData = Omit<ForgeModState, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateForgeModStateData = Partial<Omit<ForgeModState, 'id' | 'profileId' | 'modName'>>;

export type CreateOptiFineConfigData = Omit<OptiFineConfig, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateOptiFineConfigData = Partial<Omit<OptiFineConfig, 'id' | 'profileId'>>;

// Forge Settings Models
export interface ForgeSetting {
  id?: number;
  settingKey: string;
  settingValue: string;
  settingType: 'string' | 'number' | 'boolean' | 'json';
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Database row interface for Forge settings
export interface ForgeSettingRow {
  id: number;
  setting_key: string;
  setting_value: string;
  setting_type: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// Utility types for creating Forge settings
export type CreateForgeSettingData = Omit<ForgeSetting, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateForgeSettingData = Partial<Omit<ForgeSetting, 'id' | 'settingKey'>>;

// Forge-specific configuration interfaces
export interface ForgeOptiFineSettings {
  autoDownload: boolean;
  defaultEnabled: boolean;
  preferredVersion: 'latest' | 'recommended' | 'specific';
  specificVersion?: string;
  enableShaders: boolean;
  enableConnectedTextures: boolean;
  enableCustomSky: boolean;
  enableNaturalTextures: boolean;
  enableRandomEntities: boolean;
  enableBetterGrass: boolean;
  enableBetterSnow: boolean;
  enableCustomColors: boolean;
  enableCustomFonts: boolean;
  enableCustomGUI: boolean;
  enableCustomItems: boolean;
  enableCustomModels: boolean;
  enableDynamicLights: boolean;
}

export interface ForgeModManagementSettings {
  autoUpdateMods: boolean;
  checkCompatibility: boolean;
  enableModRecommendations: boolean;
  autoBackupMods: boolean;
  maxBackupCount: number;
  showModDescriptions: boolean;
  sortModsBy: 'name' | 'date' | 'size' | 'status';
  defaultModsDirectory: string;
  enableModCategories: boolean;
  autoCleanDisabledMods: boolean;
  warnOnIncompatibleMods: boolean;
}

export interface ForgeProfileSettings {
  defaultForgeVersion: 'latest' | 'recommended' | 'specific';
  specificForgeVersion?: string;
  autoInstallForge: boolean;
  enableForgeLogging: boolean;
  forgeLogLevel: 'debug' | 'info' | 'warn' | 'error';
  enableModLoadingProgress: boolean;
  skipForgeUpdateCheck: boolean;
  forgeInstallTimeout: number;
  enableForgeMetrics: boolean;
}