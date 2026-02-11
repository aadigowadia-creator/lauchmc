import axios from 'axios';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { app } from 'electron';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import AdmZip = require('adm-zip');
import { GameVersion, VersionMetadata, DownloadProgress, LibraryInfo, DownloadInfo, AssetIndex, AssetObject } from '../models';

// Mojang API endpoints
const VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

// Cache configuration
const CACHE_DURATION = 1000 * 60 * 30; // 30 minutes
const CACHE_FILE_NAME = 'version_manifest_cache.json';

// Download configuration
const MAX_CONCURRENT_DOWNLOADS = 8;
const DOWNLOAD_TIMEOUT = 30000; // 30 seconds
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second

interface VersionManifest {
  latest: {
    release: string;
    snapshot: string;
  };
  versions: GameVersion[];
}

interface CachedManifest {
  data: VersionManifest;
  timestamp: number;
}

export class VersionManager extends EventEmitter {
  private cacheDir: string;
  private cacheFilePath: string;
  private gameDir: string;
  private activeDownloads: Map<string, AbortController> = new Map();

  constructor() {
    super();
    this.cacheDir = join(app.getPath('userData'), 'cache');
    this.cacheFilePath = join(this.cacheDir, CACHE_FILE_NAME);
    
    // Use the standard .minecraft directory instead of Electron's userData
    const homeDir = app.getPath('home');
    if (process.platform === 'win32') {
      this.gameDir = join(homeDir, 'AppData', 'Roaming', '.minecraft');
    } else if (process.platform === 'darwin') {
      this.gameDir = join(homeDir, 'Library', 'Application Support', 'minecraft');
    } else {
      this.gameDir = join(homeDir, '.minecraft');
    }
  }

  /**
   * Fetch available Minecraft versions from Mojang API or cache
   * @param forceRefresh - Force refresh from API even if cache is valid
   * @returns Promise<GameVersion[]> - Array of available game versions
   */
  async fetchAvailableVersions(forceRefresh = false): Promise<GameVersion[]> {
    try {
      // Try to load from cache first if not forcing refresh
      if (!forceRefresh) {
        const cachedVersions = await this.loadFromCache();
        if (cachedVersions) {
          return cachedVersions;
        }
      }

      // Fetch from API
      console.log('Fetching version manifest from Mojang API...');
      const response = await axios.get<VersionManifest>(VERSION_MANIFEST_URL, {
        timeout: 10000, // 10 second timeout
        headers: {
          'User-Agent': 'MinecraftLauncher/1.0.0'
        }
      });

      const manifest = response.data;
      
      // Parse and validate version data
      const versions = this.parseVersionManifest(manifest);
      
      // Cache the results
      await this.saveToCache(manifest);
      
      console.log(`Successfully fetched ${versions.length} versions from API`);
      return versions;

    } catch (error) {
      console.error('Failed to fetch versions from API:', error);
      
      // Try to fall back to cache if API fails
      const cachedVersions = await this.loadFromCache();
      if (cachedVersions) {
        console.log('Using cached version data due to API failure');
        return cachedVersions;
      }
      
      throw new Error(`Failed to fetch version manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get versions filtered by type
   * @param type - Version type to filter by
   * @returns Promise<GameVersion[]> - Filtered versions
   */
  async getVersionsByType(type: GameVersion['type']): Promise<GameVersion[]> {
    const allVersions = await this.fetchAvailableVersions();
    return allVersions.filter(version => version.type === type);
  }

  /**
   * Get only release versions
   * @returns Promise<GameVersion[]> - Release versions only
   */
  async getReleaseVersions(): Promise<GameVersion[]> {
    return this.getVersionsByType('release');
  }

  /**
   * Get only snapshot versions
   * @returns Promise<GameVersion[]> - Snapshot versions only
   */
  async getSnapshotVersions(): Promise<GameVersion[]> {
    return this.getVersionsByType('snapshot');
  }

  /**
   * Find a specific version by ID
   * @param versionId - The version ID to find
   * @returns Promise<GameVersion | null> - The version or null if not found
   */
  async findVersion(versionId: string): Promise<GameVersion | null> {
    const allVersions = await this.fetchAvailableVersions();
    return allVersions.find(version => version.id === versionId) || null;
  }

  /**
   * Get version metadata from local installation
   * @param versionId - The version ID to get metadata for
   * @returns Promise<VersionMetadata | null> - The version metadata or null if not found
   */
  async getVersionMetadata(versionId: string): Promise<VersionMetadata | null> {
    try {
      const versionDir = join(this.gameDir, 'versions', versionId);
      const versionJsonPath = join(versionDir, `${versionId}.json`);
      
      // Read version metadata file
      const metadataContent = await fs.readFile(versionJsonPath, 'utf-8');
      const metadata: any = JSON.parse(metadataContent);
      
      // Handle version inheritance (for Fabric, Forge, etc.)
      if (metadata.inheritsFrom) {
        const parentMetadata = await this.getVersionMetadata(metadata.inheritsFrom);
        if (!parentMetadata) {
          throw new Error(`Parent version ${metadata.inheritsFrom} not found for ${versionId}`);
        }
        
        // Merge libraries with deduplication
        // Child libraries override parent libraries with the same name
        const childLibraries = metadata.libraries || [];
        const parentLibraries = parentMetadata.libraries || [];
        
        // Create a map of child library names for quick lookup
        const childLibraryNames = new Set(
          childLibraries.map((lib: any) => this.getLibraryBaseName(lib.name))
        );
        
        // Filter out parent libraries that are overridden by child libraries
        const filteredParentLibraries = parentLibraries.filter(
          (lib: any) => !childLibraryNames.has(this.getLibraryBaseName(lib.name))
        );
        
        // Merge parent and child metadata
        // Child properties override parent properties
        const mergedMetadata: VersionMetadata = {
          ...parentMetadata,
          ...metadata,
          // Merge libraries arrays (filtered parent libraries + child libraries)
          libraries: [
            ...filteredParentLibraries,
            ...childLibraries
          ],
          // Merge arguments if both exist
          arguments: metadata.arguments ? {
            game: [
              ...(parentMetadata.arguments?.game || []),
              ...(metadata.arguments?.game || [])
            ],
            jvm: [
              ...(parentMetadata.arguments?.jvm || []),
              ...(metadata.arguments?.jvm || [])
            ]
          } : parentMetadata.arguments
        };
        
        return mergedMetadata;
      }
      
      return metadata as VersionMetadata;
    } catch (error) {
      console.error(`Failed to load version metadata for ${versionId}:`, error);
      return null;
    }
  }

  /**
   * Get the base name of a library (without version)
   * e.g., "org.ow2.asm:asm:9.6" -> "org.ow2.asm:asm"
   */
  private getLibraryBaseName(libraryName: string): string {
    const parts = libraryName.split(':');
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}`;
    }
    return libraryName;
  }

  /**
   * Parse the version manifest and convert to GameVersion objects
   * @param manifest - Raw manifest data from Mojang API
   * @returns GameVersion[] - Parsed and validated versions
   */
  private parseVersionManifest(manifest: VersionManifest): GameVersion[] {
    if (!manifest.versions || !Array.isArray(manifest.versions)) {
      throw new Error('Invalid version manifest format: missing versions array');
    }

    return manifest.versions
      .map(version => this.parseVersionEntry(version))
      .filter((version): version is GameVersion => version !== null);
  }

  /**
   * Parse a single version entry from the manifest
   * @param versionData - Raw version data
   * @returns GameVersion | null - Parsed version or null if invalid
   */
  private parseVersionEntry(versionData: any): GameVersion | null {
    try {
      // Validate required fields
      if (!versionData.id || !versionData.type || !versionData.url) {
        console.warn(`Skipping invalid version entry: missing required fields`, versionData);
        return null;
      }

      // Validate version type
      const validTypes: GameVersion['type'][] = ['release', 'snapshot', 'old_beta', 'old_alpha'];
      if (!validTypes.includes(versionData.type)) {
        console.warn(`Skipping version with invalid type: ${versionData.type}`, versionData);
        return null;
      }

      return {
        id: versionData.id,
        type: versionData.type,
        url: versionData.url,
        time: new Date(versionData.time),
        releaseTime: new Date(versionData.releaseTime),
        sha1: versionData.sha1 || '',
        complianceLevel: versionData.complianceLevel || 0
      };
    } catch (error) {
      console.warn(`Failed to parse version entry:`, error, versionData);
      return null;
    }
  }

  /**
   * Load version data from local cache
   * @returns Promise<GameVersion[] | null> - Cached versions or null if cache invalid/missing
   */
  private async loadFromCache(): Promise<GameVersion[] | null> {
    try {
      // Ensure cache directory exists
      await fs.mkdir(this.cacheDir, { recursive: true });

      // Check if cache file exists
      const cacheExists = await fs.access(this.cacheFilePath).then(() => true).catch(() => false);
      if (!cacheExists) {
        return null;
      }

      // Read and parse cache file
      const cacheContent = await fs.readFile(this.cacheFilePath, 'utf-8');
      const cachedData: CachedManifest = JSON.parse(cacheContent);

      // Check if cache is still valid
      const now = Date.now();
      if (now - cachedData.timestamp > CACHE_DURATION) {
        console.log('Cache expired, will fetch fresh data');
        return null;
      }

      // Parse cached manifest
      const versions = this.parseVersionManifest(cachedData.data);
      console.log(`Loaded ${versions.length} versions from cache`);
      return versions;

    } catch (error) {
      console.warn('Failed to load from cache:', error);
      return null;
    }
  }

  /**
   * Save version manifest to local cache
   * @param manifest - Version manifest to cache
   */
  private async saveToCache(manifest: VersionManifest): Promise<void> {
    try {
      // Ensure cache directory exists
      await fs.mkdir(this.cacheDir, { recursive: true });

      const cachedData: CachedManifest = {
        data: manifest,
        timestamp: Date.now()
      };

      await fs.writeFile(this.cacheFilePath, JSON.stringify(cachedData, null, 2), 'utf-8');
      console.log('Version manifest cached successfully');

    } catch (error) {
      console.warn('Failed to save to cache:', error);
      // Don't throw error for cache failures - it's not critical
    }
  }

  /**
   * Clear the version cache
   */
  async clearCache(): Promise<void> {
    try {
      await fs.unlink(this.cacheFilePath);
      console.log('Version cache cleared');
    } catch (error) {
      // Ignore errors if file doesn't exist
      if ((error as any).code !== 'ENOENT') {
        console.warn('Failed to clear cache:', error);
      }
    }
  }

  /**
   * Check if cache exists and is valid
   * @returns Promise<boolean> - True if cache is valid
   */
  async isCacheValid(): Promise<boolean> {
    try {
      const cacheExists = await fs.access(this.cacheFilePath).then(() => true).catch(() => false);
      if (!cacheExists) {
        return false;
      }

      const cacheContent = await fs.readFile(this.cacheFilePath, 'utf-8');
      const cachedData: CachedManifest = JSON.parse(cacheContent);

      const now = Date.now();
      return (now - cachedData.timestamp) <= CACHE_DURATION;

    } catch (error) {
      return false;
    }
  }

  /**
   * Download and install a specific Minecraft version
   * @param versionId - The version ID to download
   * @param installationDir - Optional custom installation directory
   * @returns Promise<void>
   */
  async downloadVersion(versionId: string, installationDir?: string): Promise<void> {
    const controller = new AbortController();
    this.activeDownloads.set(versionId, controller);

    try {
      // Find the version in the manifest
      const version = await this.findVersion(versionId);
      if (!version) {
        throw new Error(`Version ${versionId} not found in manifest`);
      }

      // Set up installation directory
      const versionDir = installationDir || join(this.gameDir, 'versions', versionId);
      await fs.mkdir(versionDir, { recursive: true });

      // Initialize progress tracking
      const progress: DownloadProgress = {
        versionId,
        totalFiles: 0,
        completedFiles: 0,
        totalBytes: 0,
        downloadedBytes: 0,
        percentage: 0,
        estimatedTimeRemaining: 0,
        currentSpeed: 0,
        status: 'downloading'
      };

      // Fetch version metadata
      progress.currentFile = 'version.json';
      this.emit('progress', progress);

      const versionMetadata = await this.fetchVersionMetadata(version.url, controller.signal);
      
      // Save version metadata
      const versionJsonPath = join(versionDir, `${versionId}.json`);
      await fs.writeFile(versionJsonPath, JSON.stringify(versionMetadata, null, 2));

      // Calculate total download size and file count
      await this.calculateDownloadSize(versionMetadata, progress);

      // Download client jar
      await this.downloadClientJar(versionMetadata, versionDir, progress, controller.signal);

      // Download libraries
      await this.downloadLibraries(versionMetadata, progress, controller.signal);

      // Extract native libraries
      await this.extractNatives(versionMetadata, versionId, progress);

      // Download assets
      await this.downloadAssets(versionMetadata, progress, controller.signal);

      // Download logging configuration if present
      if (versionMetadata.logging?.client) {
        await this.downloadLoggingConfig(versionMetadata, progress, controller.signal);
      }

      progress.status = 'completed';
      progress.percentage = 100;
      this.emit('progress', progress);

    } catch (error) {
      if (controller.signal.aborted) {
        const progress: DownloadProgress = {
          versionId,
          totalFiles: 0,
          completedFiles: 0,
          totalBytes: 0,
          downloadedBytes: 0,
          percentage: 0,
          estimatedTimeRemaining: 0,
          currentSpeed: 0,
          status: 'paused'
        };
        this.emit('progress', progress);
      } else {
        const progress: DownloadProgress = {
          versionId,
          totalFiles: 0,
          completedFiles: 0,
          totalBytes: 0,
          downloadedBytes: 0,
          percentage: 0,
          estimatedTimeRemaining: 0,
          currentSpeed: 0,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        };
        this.emit('progress', progress);
        throw error;
      }
    } finally {
      this.activeDownloads.delete(versionId);
    }
  }

  /**
   * Cancel an active download
   * @param versionId - The version ID to cancel
   */
  cancelDownload(versionId: string): void {
    const controller = this.activeDownloads.get(versionId);
    if (controller) {
      controller.abort();
    }
  }

  /**
   * Check if a version is already installed
   * @param versionId - The version ID to check
   * @returns Promise<boolean>
   */
  async isVersionInstalled(versionId: string): Promise<boolean> {
    try {
      const versionDir = join(this.gameDir, 'versions', versionId);
      const versionJsonPath = join(versionDir, `${versionId}.json`);
      const jarPath = join(versionDir, `${versionId}.jar`);

      // Check if both version.json and jar file exist
      await fs.access(versionJsonPath);
      await fs.access(jarPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get list of installed versions
   * @returns Promise<string[]>
   */
  async getInstalledVersions(): Promise<string[]> {
    try {
      const versionsDir = join(this.gameDir, 'versions');
      const entries = await fs.readdir(versionsDir, { withFileTypes: true });
      
      const installedVersions: string[] = [];
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const versionId = entry.name;
          if (await this.isVersionInstalled(versionId)) {
            installedVersions.push(versionId);
          }
        }
      }
      
      return installedVersions;
    } catch {
      return [];
    }
  }

  /**
   * Validate installation integrity for a version
   * @param versionId - The version ID to validate
   * @returns Promise<boolean>
   */
  async validateInstallation(versionId: string): Promise<boolean> {
    try {
      const versionDir = join(this.gameDir, 'versions', versionId);
      const versionJsonPath = join(versionDir, `${versionId}.json`);
      
      // Load version metadata
      const metadataContent = await fs.readFile(versionJsonPath, 'utf-8');
      const metadata: VersionMetadata = JSON.parse(metadataContent);

      // Validate client jar
      const jarPath = join(versionDir, `${versionId}.jar`);
      const jarValid = await this.validateFileIntegrity(jarPath, metadata.downloads.client.sha1);
      if (!jarValid) {
        console.warn(`Client jar integrity check failed for ${versionId}`);
        return false;
      }

      // Validate libraries (sample check - not all libraries for performance)
      const librariesDir = join(this.gameDir, 'libraries');
      let libraryCheckCount = 0;
      const maxLibraryChecks = 5; // Check first 5 libraries for performance

      for (const library of metadata.libraries) {
        if (libraryCheckCount >= maxLibraryChecks) break;
        
        if (library.downloads.artifact && this.shouldIncludeLibrary(library)) {
          const libraryPath = join(librariesDir, this.getLibraryPath(library.name));
          const libraryValid = await this.validateFileIntegrity(libraryPath, library.downloads.artifact.sha1);
          if (!libraryValid) {
            console.warn(`Library integrity check failed for ${library.name}`);
            return false;
          }
          libraryCheckCount++;
        }
      }

      return true;
    } catch (error) {
      console.error(`Failed to validate installation for ${versionId}:`, error);
      return false;
    }
  }

  /**
   * Fetch version metadata from URL
   */
  private async fetchVersionMetadata(url: string, signal: AbortSignal): Promise<VersionMetadata> {
    const response = await axios.get<VersionMetadata>(url, {
      signal,
      timeout: DOWNLOAD_TIMEOUT,
      headers: { 'User-Agent': 'MinecraftLauncher/1.0.0' }
    });
    return response.data;
  }

  /**
   * Calculate total download size and file count
   */
  private async calculateDownloadSize(metadata: VersionMetadata, progress: DownloadProgress): Promise<void> {
    let totalBytes = 0;
    let totalFiles = 0;

    // Client jar
    totalBytes += metadata.downloads.client.size;
    totalFiles += 1;

    // Libraries
    for (const library of metadata.libraries) {
      if (library.downloads.artifact && this.shouldIncludeLibrary(library)) {
        totalBytes += library.downloads.artifact.size;
        totalFiles += 1;
      }
    }

    // Assets
    try {
      const assetIndex = await this.fetchAssetIndex(metadata.assetIndex.url);
      const assetObjects = Object.values(assetIndex.objects);
      totalBytes += assetObjects.reduce((sum, asset) => sum + asset.size, 0);
      totalFiles += assetObjects.length;
    } catch (error) {
      console.warn('Failed to calculate asset size:', error);
    }

    // Logging config
    if (metadata.logging?.client) {
      totalBytes += metadata.logging.client.file.size;
      totalFiles += 1;
    }

    progress.totalBytes = totalBytes;
    progress.totalFiles = totalFiles;
  }

  /**
   * Download client jar file
   */
  private async downloadClientJar(
    metadata: VersionMetadata,
    versionDir: string,
    progress: DownloadProgress,
    signal: AbortSignal
  ): Promise<void> {
    const jarPath = join(versionDir, `${metadata.id}.jar`);
    const downloadInfo = metadata.downloads.client;

    progress.currentFile = `${metadata.id}.jar`;
    this.emit('progress', progress);

    await this.downloadFileWithResume(
      downloadInfo.url,
      jarPath,
      downloadInfo.sha1,
      downloadInfo.size,
      progress,
      signal
    );
  }

  /**
   * Download all required libraries
   */
  private async downloadLibraries(
    metadata: VersionMetadata,
    progress: DownloadProgress,
    signal: AbortSignal
  ): Promise<void> {
    const librariesDir = join(this.gameDir, 'libraries');
    await fs.mkdir(librariesDir, { recursive: true });

    // Filter libraries for current platform
    const requiredLibraries = metadata.libraries.filter(lib => this.shouldIncludeLibrary(lib));

    // Download libraries in parallel batches
    const downloadPromises: Promise<void>[] = [];
    let concurrentDownloads = 0;

    for (const library of requiredLibraries) {
      if (!library.downloads.artifact) continue;

      const libraryPath = join(librariesDir, this.getLibraryPath(library.name));
      const downloadInfo = library.downloads.artifact;

      progress.currentFile = library.name;
      this.emit('progress', progress);

      const downloadPromise = this.downloadFileWithResume(
        downloadInfo.url,
        libraryPath,
        downloadInfo.sha1,
        downloadInfo.size,
        progress,
        signal
      );

      downloadPromises.push(downloadPromise);
      concurrentDownloads++;

      // Limit concurrent downloads
      if (concurrentDownloads >= MAX_CONCURRENT_DOWNLOADS) {
        await Promise.race(downloadPromises);
        concurrentDownloads--;
      }
    }

    // Wait for all remaining downloads
    await Promise.all(downloadPromises);
  }

  /**
   * Extract native libraries for the current platform
   */
  private async extractNatives(
    metadata: VersionMetadata,
    versionId: string,
    progress: DownloadProgress
  ): Promise<void> {
    const librariesDir = join(this.gameDir, 'libraries');
    const nativesDir = join(this.gameDir, 'versions', versionId, 'natives');
    
    // Create natives directory
    await fs.mkdir(nativesDir, { recursive: true });

    // Filter libraries that have native classifiers for current platform
    const nativeLibraries = metadata.libraries.filter(lib => {
      if (!lib.downloads.classifiers) return false;
      
      // Check if library has natives for current platform
      const nativesKey = this.getNativesKey();
      return lib.natives && lib.natives[this.getPlatformKey()] && lib.downloads.classifiers[nativesKey];
    });

    progress.currentFile = 'Extracting native libraries';
    this.emit('progress', progress);

    // Extract each native library
    for (const library of nativeLibraries) {
      try {
        const nativesKey = this.getNativesKey();
        const nativeDownload = library.downloads.classifiers![nativesKey];
        
        if (!nativeDownload) continue;

        // Get the path to the downloaded native library
        const libraryPath = join(librariesDir, this.getLibraryPath(library.name, nativesKey));
        
        // Check if file exists
        try {
          await fs.access(libraryPath);
        } catch {
          console.warn(`Native library not found: ${libraryPath}`);
          continue;
        }

        // Extract the native library
        const zip = new AdmZip(libraryPath);
        const zipEntries = zip.getEntries();

        for (const entry of zipEntries) {
          // Skip META-INF directory (contains signatures that can cause issues)
          if (entry.entryName.startsWith('META-INF/')) continue;
          
          // Only extract files, not directories
          if (!entry.isDirectory) {
            const targetPath = join(nativesDir, entry.entryName);
            await fs.mkdir(dirname(targetPath), { recursive: true });
            await fs.writeFile(targetPath, entry.getData());
          }
        }

        console.log(`Extracted native library: ${library.name}`);
      } catch (error) {
        console.error(`Failed to extract native library ${library.name}:`, error);
        // Continue with other natives even if one fails
      }
    }
  }

  /**
   * Get the natives key for the current platform
   */
  private getNativesKey(): string {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === 'win32') {
      return arch === 'x64' ? 'natives-windows' : 'natives-windows-x86';
    } else if (platform === 'darwin') {
      return 'natives-macos';
    } else if (platform === 'linux') {
      return 'natives-linux';
    }

    return 'natives-windows'; // Default fallback
  }

  /**
   * Get the platform key for natives mapping
   */
  private getPlatformKey(): string {
    const platform = process.platform;

    if (platform === 'win32') {
      return 'windows';
    } else if (platform === 'darwin') {
      return 'osx';
    } else if (platform === 'linux') {
      return 'linux';
    }

    return 'windows'; // Default fallback
  }

  /**
   * Download game assets
   */
  private async downloadAssets(
    metadata: VersionMetadata,
    progress: DownloadProgress,
    signal: AbortSignal
  ): Promise<void> {
    const assetsDir = join(this.gameDir, 'assets');
    const objectsDir = join(assetsDir, 'objects');
    const indexesDir = join(assetsDir, 'indexes');
    
    await fs.mkdir(objectsDir, { recursive: true });
    await fs.mkdir(indexesDir, { recursive: true });

    // Download asset index
    const assetIndexPath = join(indexesDir, `${metadata.assetIndex.id}.json`);
    await this.downloadFileWithResume(
      metadata.assetIndex.url,
      assetIndexPath,
      metadata.assetIndex.sha1,
      metadata.assetIndex.size,
      progress,
      signal
    );

    // Load asset index
    const assetIndex = await this.fetchAssetIndex(metadata.assetIndex.url, signal);
    const assetObjects = Object.entries(assetIndex.objects);

    // Download assets in parallel batches
    const downloadPromises: Promise<void>[] = [];
    let concurrentDownloads = 0;

    for (const [assetName, assetObject] of assetObjects) {
      const hash = assetObject.hash;
      const assetUrl = `https://resources.download.minecraft.net/${hash.substring(0, 2)}/${hash}`;
      const assetPath = join(objectsDir, hash.substring(0, 2), hash);

      progress.currentFile = assetName;
      this.emit('progress', progress);

      const downloadPromise = this.downloadFileWithResume(
        assetUrl,
        assetPath,
        hash,
        assetObject.size,
        progress,
        signal
      );

      downloadPromises.push(downloadPromise);
      concurrentDownloads++;

      // Limit concurrent downloads
      if (concurrentDownloads >= MAX_CONCURRENT_DOWNLOADS) {
        await Promise.race(downloadPromises);
        concurrentDownloads--;
      }
    }

    // Wait for all remaining downloads
    await Promise.all(downloadPromises);
  }

  /**
   * Download logging configuration
   */
  private async downloadLoggingConfig(
    metadata: VersionMetadata,
    progress: DownloadProgress,
    signal: AbortSignal
  ): Promise<void> {
    if (!metadata.logging?.client) return;

    const assetsDir = join(this.gameDir, 'assets');
    const logConfigsDir = join(assetsDir, 'log_configs');
    await fs.mkdir(logConfigsDir, { recursive: true });

    const logConfigPath = join(logConfigsDir, metadata.logging.client.file.id);
    const downloadInfo = metadata.logging.client.file;

    progress.currentFile = metadata.logging.client.file.id;
    this.emit('progress', progress);

    await this.downloadFileWithResume(
      downloadInfo.url,
      logConfigPath,
      downloadInfo.sha1,
      downloadInfo.size,
      progress,
      signal
    );
  }

  /**
   * Download a file with resume capability and integrity verification
   */
  private async downloadFileWithResume(
    url: string,
    filePath: string,
    expectedSha1: string,
    expectedSize: number,
    progress: DownloadProgress,
    signal: AbortSignal
  ): Promise<void> {
    // Ensure directory exists
    await fs.mkdir(dirname(filePath), { recursive: true });

    // Check if file already exists and is valid
    if (await this.validateFileIntegrity(filePath, expectedSha1)) {
      progress.completedFiles++;
      progress.downloadedBytes += expectedSize;
      this.updateProgress(progress);
      return;
    }

    // Check for partial download
    let startByte = 0;
    try {
      const stats = await fs.stat(filePath);
      if (stats.size < expectedSize) {
        startByte = stats.size;
      } else if (stats.size > expectedSize) {
        // File is larger than expected, start over
        await fs.unlink(filePath);
        startByte = 0;
      }
    } catch {
      // File doesn't exist, start from beginning
      startByte = 0;
    }

    let attempt = 0;
    while (attempt < RETRY_ATTEMPTS) {
      try {
        await this.downloadFileChunk(url, filePath, startByte, expectedSha1, expectedSize, progress, signal);
        
        // Verify integrity after download
        if (await this.validateFileIntegrity(filePath, expectedSha1)) {
          progress.completedFiles++;
          this.updateProgress(progress);
          return;
        } else {
          throw new Error('File integrity check failed after download');
        }
      } catch (error) {
        attempt++;
        if (attempt >= RETRY_ATTEMPTS || signal.aborted) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
        
        // Check current file size for resume
        try {
          const stats = await fs.stat(filePath);
          startByte = stats.size;
        } catch {
          startByte = 0;
        }
      }
    }
  }

  /**
   * Download a chunk of a file with progress tracking
   */
  private async downloadFileChunk(
    url: string,
    filePath: string,
    startByte: number,
    expectedSha1: string,
    expectedSize: number,
    progress: DownloadProgress,
    signal: AbortSignal
  ): Promise<void> {
    const headers: any = {
      'User-Agent': 'MinecraftLauncher/1.0.0'
    };

    if (startByte > 0) {
      headers['Range'] = `bytes=${startByte}-`;
    }

    const response = await axios({
      method: 'GET',
      url,
      headers,
      responseType: 'stream',
      signal,
      timeout: DOWNLOAD_TIMEOUT
    });

    const fileStream = await fs.open(filePath, startByte > 0 ? 'a' : 'w');
    const writeStream = fileStream.createWriteStream();

    let downloadedBytes = startByte;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        progress.downloadedBytes += chunk.length;
        
        // Update speed calculation
        const elapsed = (Date.now() - startTime) / 1000;
        progress.currentSpeed = elapsed > 0 ? (downloadedBytes - startByte) / elapsed : 0;
        
        // Update ETA
        const remainingBytes = progress.totalBytes - progress.downloadedBytes;
        progress.estimatedTimeRemaining = progress.currentSpeed > 0 ? remainingBytes / progress.currentSpeed : 0;
        
        this.updateProgress(progress);
      });

      response.data.on('end', async () => {
        await fileStream.close();
        resolve();
      });

      response.data.on('error', async (error: Error) => {
        await fileStream.close();
        reject(error);
      });

      writeStream.on('error', async (error: Error) => {
        await fileStream.close();
        reject(error);
      });

      response.data.pipe(writeStream);
    });
  }

  /**
   * Validate file integrity using SHA1 checksum
   */
  private async validateFileIntegrity(filePath: string, expectedSha1: string): Promise<boolean> {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const hash = createHash('sha1');
      hash.update(fileBuffer);
      const actualSha1 = hash.digest('hex');
      return actualSha1.toLowerCase() === expectedSha1.toLowerCase();
    } catch {
      return false;
    }
  }

  /**
   * Fetch asset index from URL
   */
  private async fetchAssetIndex(url: string, signal?: AbortSignal): Promise<AssetIndex> {
    const response = await axios.get<AssetIndex>(url, {
      signal,
      timeout: DOWNLOAD_TIMEOUT,
      headers: { 'User-Agent': 'MinecraftLauncher/1.0.0' }
    });
    return response.data;
  }

  /**
   * Check if a library should be included for the current platform
   */
  private shouldIncludeLibrary(library: LibraryInfo): boolean {
    if (!library.rules) return true;

    let allowed = false;
    
    for (const rule of library.rules) {
      let ruleMatches = true;
      
      if (rule.os) {
        const platform = process.platform;
        const osName = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'osx' : 'linux';
        
        if (rule.os.name && rule.os.name !== osName) {
          ruleMatches = false;
        }
        
        if (rule.os.arch && rule.os.arch !== process.arch) {
          ruleMatches = false;
        }
      }
      
      if (ruleMatches) {
        allowed = rule.action === 'allow';
      }
    }
    
    return allowed;
  }

  /**
   * Get the file path for a library based on its name
   */
  private getLibraryPath(libraryName: string, classifier?: string): string {
    const parts = libraryName.split(':');
    if (parts.length < 3 || parts.length > 4) {
      throw new Error(`Invalid library name format: ${libraryName}`);
    }
    
    const [group, artifact, version, existingClassifier] = parts;
    const groupPath = group.replace(/\./g, '/');
    
    // Use provided classifier or existing one from library name
    const finalClassifier = classifier || existingClassifier;
    
    // Handle native libraries with classifiers (e.g., natives-windows)
    if (finalClassifier) {
      return `${groupPath}/${artifact}/${version}/${artifact}-${version}-${finalClassifier}.jar`;
    }
    
    return `${groupPath}/${artifact}/${version}/${artifact}-${version}.jar`;
  }

  /**
   * Update progress and emit event
   */
  private updateProgress(progress: DownloadProgress): void {
    if (progress.totalBytes > 0) {
      progress.percentage = Math.round((progress.downloadedBytes / progress.totalBytes) * 100);
    }
    this.emit('progress', progress);
  }
}