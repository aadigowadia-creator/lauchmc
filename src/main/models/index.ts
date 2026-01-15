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