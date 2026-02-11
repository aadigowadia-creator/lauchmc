import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import axios from 'axios';
import { ModStateRepository } from '../repositories/mod-state-repository';
import { CustomModRepository } from '../repositories/custom-mod-repository';
import { CustomMod } from '../models';
import { LauncherError, ErrorFactory } from '../errors/launcher-error';
import { LoggerService } from './logger-service';

export interface EssentialMod {
  id: string;
  name: string;
  description: string;
  modrinthProjectId: string;
  fileName: string;
  dependencies?: string[];
  isEssential: boolean;
  required?: boolean;
}

export interface ModDownloadProgress {
  modId: string;
  modName: string;
  downloaded: number;
  total: number;
  percentage: number;
}

export interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  versions: string[];
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  files: Array<{
    url: string;
    filename: string;
    primary: boolean;
    size: number;
    hashes: {
      sha1: string;
      sha512: string;
    };
  }>;
}

export interface CurseForgeProject {
  id: number;
  name: string;
  summary: string;
  latestFiles: Array<{
    id: number;
    displayName: string;
    downloadUrl: string;
    fileLength: number;
    gameVersions: string[];
  }>;
}

export class FabricModService {
  private modStateRepository: ModStateRepository;
  private customModRepository: CustomModRepository;
  private logger: LoggerService;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 2000;
  private readonly DOWNLOAD_TIMEOUT_MS = 60000; // 60 seconds

  // Essential mods configuration - all 10 preinstalled mods
  private readonly ESSENTIAL_MODS: EssentialMod[] = [
    {
      id: 'fabric-api',
      name: 'Fabric API',
      description: 'Essential hooks for Fabric mods',
      modrinthProjectId: 'P7dR8mSH',
      fileName: 'fabric-api.jar',
      dependencies: [],
      isEssential: true,
      required: true, // Fabric API cannot be disabled
    },
    {
      id: 'sodium',
      name: 'Sodium',
      description: 'Modern rendering engine and optimization',
      modrinthProjectId: 'AANobbMI',
      fileName: 'sodium.jar',
      dependencies: [],
      isEssential: true,
    },
    {
      id: 'lithium',
      name: 'Lithium',
      description: 'General-purpose optimization',
      modrinthProjectId: 'gvQqBUqZ',
      fileName: 'lithium.jar',
      dependencies: [],
      isEssential: true,
    },
    {
      id: 'gammautil',
      name: 'GammaUtil',
      description: 'Brightness control utility',
      modrinthProjectId: 'MFvfEWzR',
      fileName: 'gammautil.jar',
      dependencies: ['fabric-api'],
      isEssential: true,
    },
    {
      id: 'appleskin',
      name: 'AppleSkin',
      description: 'Food/hunger information',
      modrinthProjectId: 'EsAfCjCV',
      fileName: 'appleskin.jar',
      dependencies: ['fabric-api'],
      isEssential: true,
    },
    {
      id: 'litematica',
      name: 'Litematica',
      description: 'Schematic mod for building',
      modrinthProjectId: 'gP2IhuRi',
      fileName: 'litematica.jar',
      dependencies: ['fabric-api'],
      isEssential: true,
    },
    {
      id: 'krypton',
      name: 'Krypton',
      description: 'Network stack optimization',
      modrinthProjectId: 'fQEb0iXm',
      fileName: 'krypton.jar',
      dependencies: [],
      isEssential: true,
    },
    {
      id: 'modmenu',
      name: 'Mod Menu',
      description: 'In-game mod configuration',
      modrinthProjectId: 'mOgUt4GM',
      fileName: 'modmenu.jar',
      dependencies: ['fabric-api'],
      isEssential: true,
    },
    {
      id: 'uku-armor-hud',
      name: "Uku's Armor HUD",
      description: 'Armor durability display',
      modrinthProjectId: 'VGLnXGBj',
      fileName: 'uku-armor-hud.jar',
      dependencies: ['fabric-api'],
      isEssential: true,
    },
    {
      id: 'cloth-config',
      name: 'Cloth Config',
      description: 'Configuration library for mods',
      modrinthProjectId: '9s6osm5g',
      fileName: 'cloth-config.jar',
      dependencies: ['fabric-api'],
      isEssential: true,
    },
  ];

  constructor() {
    this.modStateRepository = new ModStateRepository();
    this.customModRepository = new CustomModRepository();
    this.logger = LoggerService.getInstance();
  }

  /**
   * Get mods directory for a profile
   */
  public getModsDirectory(installationDir: string): string {
    return path.join(installationDir, 'mods');
  }

  /**
   * Get all mods for a profile (essential + custom)
   */
  public async getAllMods(profileId: number): Promise<Array<EssentialMod | CustomMod>> {
    const customMods = await this.customModRepository.findByProfileId(profileId);
    
    // Combine essential mods with custom mods
    return [...this.ESSENTIAL_MODS, ...customMods];
  }

  /**
   * Download and install all essential mods for a profile
   */
  public async installEssentialMods(
    profileId: number,
    gameVersion: string,
    installationDir: string,
    onProgress?: (progress: ModDownloadProgress) => void
  ): Promise<void> {
    const modsDir = this.getModsDirectory(installationDir);
    
    try {
      // Ensure mods directory exists
      await fs.mkdir(modsDir, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create mods directory', error);
      throw ErrorFactory.permissionDenied('create mods directory');
    }

    const errors: Array<{ mod: EssentialMod; error: Error }> = [];
    const downloadPromises: Promise<void>[] = [];

    for (const mod of this.ESSENTIAL_MODS) {
      const downloadPromise = (async () => {
        try {
          // Resolve mod version for game version with retry
          const versionInfo = await this.retryOperation(
            () => this.resolveModVersion(mod, gameVersion),
            `resolve version for ${mod.name}`
          );
          
          // Download mod with retry
          const targetPath = path.join(modsDir, versionInfo.fileName);
          await this.retryOperation(
            () => this.downloadMod(
              mod,
              versionInfo.downloadUrl,
              targetPath,
              versionInfo.sha1,
              (downloaded, total) => {
                if (onProgress) {
                  onProgress({
                    modId: mod.id,
                    modName: mod.name,
                    downloaded,
                    total,
                    percentage: Math.round((downloaded / total) * 100),
                  });
                }
              }
            ),
            `download ${mod.name}`
          );

          this.logger.info(`Successfully installed ${mod.name}`);
        } catch (error) {
          this.logger.error(`Failed to install ${mod.name}`, error);
          errors.push({ mod, error: error as Error });
        }
      })();

      downloadPromises.push(downloadPromise);

      // Limit concurrency to 3 downloads at a time
      if (downloadPromises.length >= 3) {
        await Promise.race(downloadPromises);
        const completedIndex = downloadPromises.findIndex((p) => 
          Promise.race([p, Promise.resolve('pending')]).then(v => v !== 'pending')
        );
        if (completedIndex !== -1) {
          downloadPromises.splice(completedIndex, 1);
        }
      }
    }

    // Wait for all remaining downloads
    await Promise.all(downloadPromises);

    // Check if any critical mods failed
    if (errors.length > 0) {
      const errorMessages = errors.map(e => `${e.mod.name}: ${e.error.message}`).join('\n');
      this.logger.error(`Failed to install ${errors.length} mod(s):\n${errorMessages}`);
      
      // If Fabric API failed, throw error (it's required)
      const fabricApiError = errors.find(e => e.mod.id === 'fabric-api');
      if (fabricApiError) {
        throw ErrorFactory.modDownloadFailed(
          'Fabric API',
          'This mod is required and must be installed',
          fabricApiError.error
        );
      }
      
      // For other mods, log warning but continue
      this.logger.warn(`Some mods failed to install but continuing: ${errors.map(e => e.mod.name).join(', ')}`);
    }

    // Initialize mod states (all enabled by default)
    try {
      const modIds = this.ESSENTIAL_MODS.map((mod) => mod.id);
      await this.modStateRepository.initializeDefaults(profileId, modIds);
    } catch (error) {
      this.logger.error('Failed to initialize mod states', error);
      throw ErrorFactory.databaseError('initialize mod states', error as Error);
    }
  }

  /**
   * Retry an operation with exponential backoff
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = this.MAX_RETRIES
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`${operationName} failed (attempt ${attempt}/${maxRetries}): ${lastError.message}`);
        
        if (attempt < maxRetries) {
          // Exponential backoff: 2s, 4s, 8s
          const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          this.logger.info(`Retrying ${operationName} in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError || new Error(`${operationName} failed after ${maxRetries} attempts`);
  }

  /**
   * Resolve mod version for game version using Modrinth API
   */
  private async resolveModVersion(
    mod: EssentialMod,
    gameVersion: string
  ): Promise<{ downloadUrl: string; fileName: string; sha1: string }> {
    try {
      const response = await axios.get<ModrinthVersion[]>(
        `https://api.modrinth.com/v2/project/${mod.modrinthProjectId}/version`,
        {
          params: {
            game_versions: JSON.stringify([gameVersion]),
            loaders: JSON.stringify(['fabric']),
          },
          timeout: this.DOWNLOAD_TIMEOUT_MS,
        }
      );

      if (response.data.length === 0) {
        this.logger.warn(`No compatible version found for ${mod.name} on Minecraft ${gameVersion}`);
        throw ErrorFactory.modVersionNotFound(mod.name, gameVersion);
      }

      // Get the latest version
      const latestVersion = response.data[0];
      const primaryFile = latestVersion.files.find((f) => f.primary) || latestVersion.files[0];

      if (!primaryFile) {
        this.logger.error(`No download file found for ${mod.name}`);
        throw ErrorFactory.modDownloadFailed(mod.name, 'No download file available');
      }

      this.logger.info(`Resolved ${mod.name} to version ${latestVersion.version_number}`);
      
      return {
        downloadUrl: primaryFile.url,
        fileName: primaryFile.filename,
        sha1: primaryFile.hashes.sha1,
      };
    } catch (error) {
      if (error instanceof LauncherError) {
        throw error;
      }
      
      if (axios.isAxiosError(error)) {
        if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
          throw ErrorFactory.modApiError('Modrinth', error);
        }
        if (error.response?.status === 404) {
          throw ErrorFactory.modNotFound(mod.modrinthProjectId);
        }
        throw ErrorFactory.modApiError('Modrinth', error);
      }
      
      throw error;
    }
  }

  /**
   * Download a mod file with progress tracking and integrity verification
   */
  private async downloadMod(
    mod: EssentialMod,
    downloadUrl: string,
    targetPath: string,
    expectedSha1: string,
    onProgress?: (downloaded: number, total: number) => void
  ): Promise<void> {
    try {
      this.logger.info(`Downloading ${mod.name} from ${downloadUrl}`);
      
      // Download file
      const response = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: this.DOWNLOAD_TIMEOUT_MS,
        onDownloadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            onProgress(progressEvent.loaded, progressEvent.total);
          }
        },
      });

      const fileData = Buffer.from(response.data);

      // Verify SHA-1 hash
      const actualSha1 = crypto.createHash('sha1').update(fileData).digest('hex');
      if (actualSha1 !== expectedSha1) {
        this.logger.error(`Integrity check failed for ${mod.name}. Expected ${expectedSha1}, got ${actualSha1}`);
        throw ErrorFactory.modIntegrityCheckFailed(mod.name);
      }

      // Write file to disk
      await fs.writeFile(targetPath, fileData);
      this.logger.info(`Successfully downloaded and verified ${mod.name}`);
    } catch (error) {
      if (error instanceof LauncherError) {
        throw error;
      }
      
      if (axios.isAxiosError(error)) {
        if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
          throw ErrorFactory.networkError(error);
        }
        if (error.code === 'ECONNABORTED') {
          throw ErrorFactory.modDownloadFailed(mod.name, 'Download timeout', error);
        }
        throw ErrorFactory.modDownloadFailed(mod.name, error.message, error);
      }
      
      // File system errors
      if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        throw ErrorFactory.permissionDenied(`write mod file ${mod.name}`);
      }
      if ((error as NodeJS.ErrnoException).code === 'ENOSPC') {
        throw ErrorFactory.diskSpaceInsufficient('500 MB');
      }
      
      throw error;
    }
  }

  /**
   * Get mod states for a profile
   */
  public async getModStates(profileId: number): Promise<Map<string, boolean>> {
    const modStates = await this.modStateRepository.findByProfileId(profileId);
    const stateMap = new Map<string, boolean>();

    for (const state of modStates) {
      stateMap.set(state.modId, state.enabled);
    }

    return stateMap;
  }

  /**
   * Update mod state (enable/disable)
   */
  public async setModState(
    profileId: number,
    modId: string,
    enabled: boolean
  ): Promise<void> {
    try {
      // Check if mod is required (Fabric API cannot be disabled)
      const essentialMod = this.ESSENTIAL_MODS.find((m) => m.id === modId);
      if (essentialMod?.required && !enabled) {
        throw ErrorFactory.modStateUpdateFailed(
          essentialMod.name,
          new Error('This mod is required and cannot be disabled')
        );
      }

      // Check for dependency warnings when disabling a mod
      if (!enabled && essentialMod) {
        const dependentMods = this.ESSENTIAL_MODS.filter(m => 
          m.dependencies?.includes(modId)
        );
        
        if (dependentMods.length > 0) {
          // Get current states to check if any dependent mods are enabled
          const currentStates = await this.getModStates(profileId);
          const enabledDependents = dependentMods.filter(m => currentStates.get(m.id) !== false);
          
          if (enabledDependents.length > 0) {
            this.logger.warn(
              `Disabling ${essentialMod.name} while dependent mods are enabled: ${enabledDependents.map(m => m.name).join(', ')}`
            );
            // Note: We log a warning but don't throw an error, allowing the user to proceed
          }
        }
      }

      // Update state in database
      await this.modStateRepository.upsert({
        profileId,
        modId,
        enabled,
      });
      
      this.logger.info(`Updated mod state: ${modId} = ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      if (error instanceof LauncherError) {
        throw error;
      }
      
      this.logger.error(`Failed to update mod state for ${modId}`, error);
      throw ErrorFactory.modStateUpdateFailed(modId, error as Error);
    }
  }

  /**
   * Apply mod states before game launch (rename files .jar/.disabled)
   */
  public async applyModStates(profileId: number, installationDir: string): Promise<void> {
    const modsDir = this.getModsDirectory(installationDir);
    const modStates = await this.getModStates(profileId);

    // Get all mods (essential + custom)
    const allMods = await this.getAllMods(profileId);
    const errors: Array<{ modName: string; error: Error }> = [];

    for (const mod of allMods) {
      // Get mod ID - essential mods use string id, custom mods use modId
      const modIdentifier = 'isEssential' in mod ? (mod as EssentialMod).id : (mod as CustomMod).modId;
      const modName = mod.name;
      const enabled = modStates.get(modIdentifier) ?? true; // Default to enabled if not set
      
      try {
        // Determine file name
        let fileName: string | undefined;
        if ('isEssential' in mod && mod.isEssential) {
          // For essential mods, we need to find the actual file in the mods directory
          // since the filename includes version info
          const essentialMod = mod as EssentialMod;
          const files = await fs.readdir(modsDir);
          const modFile = files.find((f) => 
            f.startsWith(essentialMod.fileName.replace('.jar', '')) && 
            (f.endsWith('.jar') || f.endsWith('.jar.disabled'))
          );
          
          if (!modFile) {
            this.logger.warn(`Mod file not found for ${essentialMod.name}`);
            continue;
          }
          
          fileName = modFile;
        } else {
          // For custom mods, use the stored fileName
          const customMod = mod as CustomMod;
          fileName = customMod.fileName;
        }

        if (!fileName) {
          this.logger.warn(`No file name found for mod ${modName}`);
          continue;
        }

        const enabledPath = path.join(modsDir, fileName.replace('.disabled', ''));
        const disabledPath = path.join(modsDir, fileName.replace('.jar', '.jar.disabled'));

        if (enabled) {
          // Enable mod: rename .disabled to .jar
          const currentPath = await this.findModFile(modsDir, fileName);
          if (currentPath && currentPath.endsWith('.disabled')) {
            await fs.rename(currentPath, enabledPath);
            this.logger.info(`Enabled mod: ${modName}`);
          }
        } else {
          // Disable mod: rename .jar to .jar.disabled
          const currentPath = await this.findModFile(modsDir, fileName);
          if (currentPath && currentPath.endsWith('.jar') && !currentPath.endsWith('.disabled')) {
            await fs.rename(currentPath, disabledPath);
            this.logger.info(`Disabled mod: ${modName}`);
          }
        }
      } catch (error) {
        this.logger.error(`Failed to apply state for ${modName}`, error);
        errors.push({ modName, error: error as Error });
      }
    }

    // If any errors occurred, throw an aggregated error
    if (errors.length > 0) {
      const errorMessage = errors.map(e => `${e.modName}: ${e.error.message}`).join('; ');
      throw ErrorFactory.modStateUpdateFailed(
        `${errors.length} mod(s)`,
        new Error(errorMessage)
      );
    }
  }

  /**
   * Find mod file in mods directory (handles both .jar and .jar.disabled)
   */
  private async findModFile(modsDir: string, baseFileName: string): Promise<string | null> {
    try {
      const files = await fs.readdir(modsDir);
      const baseName = baseFileName.replace('.jar.disabled', '').replace('.jar', '');
      
      const modFile = files.find((f) => 
        f.startsWith(baseName) && 
        (f.endsWith('.jar') || f.endsWith('.jar.disabled'))
      );

      return modFile ? path.join(modsDir, modFile) : null;
    } catch (error) {
      console.error(`Error finding mod file ${baseFileName}:`, error);
      return null;
    }
  }

  /**
   * Parse Modrinth URL and extract project info
   */
  public parseModrinthUrl(url: string): { projectId: string; versionId?: string } {
    const patterns = [
      /modrinth\.com\/mod\/([^\/]+)(?:\/version\/([^\/\?]+))?/,
      /modrinth\.com\/project\/([^\/]+)(?:\/version\/([^\/\?]+))?/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          projectId: match[1],
          versionId: match[2],
        };
      }
    }

    this.logger.error(`Invalid Modrinth URL: ${url}`);
    throw ErrorFactory.modInvalidUrl(url);
  }

  /**
   * Parse CurseForge URL and extract project info
   */
  public parseCurseForgeUrl(url: string): { projectSlug: string; fileId?: string } {
    const pattern = /curseforge\.com\/minecraft\/mc-mods\/([^\/]+)(?:\/files\/(\d+))?/;
    const match = url.match(pattern);

    if (!match) {
      this.logger.error(`Invalid CurseForge URL: ${url}`);
      throw ErrorFactory.modInvalidUrl(url);
    }

    return {
      projectSlug: match[1],
      fileId: match[2],
    };
  }

  /**
   * Fetch mod info from Modrinth
   */
  public async fetchModrinthProject(
    projectId: string,
    gameVersion: string
  ): Promise<ModrinthProject> {
    try {
      // Fetch project info
      const projectResponse = await axios.get<ModrinthProject>(
        `https://api.modrinth.com/v2/project/${projectId}`,
        { timeout: this.DOWNLOAD_TIMEOUT_MS }
      );

      // Fetch compatible versions
      const versionsResponse = await axios.get<ModrinthVersion[]>(
        `https://api.modrinth.com/v2/project/${projectId}/version`,
        {
          params: {
            game_versions: JSON.stringify([gameVersion]),
            loaders: JSON.stringify(['fabric']),
          },
          timeout: this.DOWNLOAD_TIMEOUT_MS,
        }
      );

      if (versionsResponse.data.length === 0) {
        this.logger.warn(`No compatible versions found for ${projectResponse.data.title} on Minecraft ${gameVersion}`);
        throw ErrorFactory.modVersionNotFound(projectResponse.data.title, gameVersion);
      }

      return {
        ...projectResponse.data,
        versions: versionsResponse.data.map((v) => v.id),
      };
    } catch (error) {
      if (error instanceof LauncherError) {
        throw error;
      }
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw ErrorFactory.modNotFound(projectId);
        }
        if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
          throw ErrorFactory.modApiError('Modrinth', error);
        }
        throw ErrorFactory.modApiError('Modrinth', error);
      }
      
      throw error;
    }
  }

  /**
   * Fetch mod info from CurseForge
   */
  public async fetchCurseForgeProject(
    projectSlug: string,
    gameVersion: string
  ): Promise<CurseForgeProject> {
    // Note: CurseForge API requires an API key
    // For now, we'll throw an error indicating CurseForge support is not yet implemented
    throw new Error('CurseForge support is not yet implemented. Please use Modrinth URLs instead.');
  }

  /**
   * Add custom mod from Modrinth or CurseForge URL
   */
  public async addCustomMod(
    profileId: number,
    url: string,
    gameVersion: string,
    installationDir: string,
    onProgress?: (progress: ModDownloadProgress) => void
  ): Promise<CustomMod> {
    // Determine source and parse URL
    let source: 'modrinth' | 'curseforge';
    let projectInfo: { projectId: string; versionId?: string } | { projectSlug: string; fileId?: string };

    try {
      if (url.includes('modrinth.com')) {
        source = 'modrinth';
        projectInfo = this.parseModrinthUrl(url);
      } else if (url.includes('curseforge.com')) {
        source = 'curseforge';
        projectInfo = this.parseCurseForgeUrl(url);
      } else {
        throw ErrorFactory.modInvalidUrl(url);
      }
    } catch (error) {
      if (error instanceof LauncherError) {
        throw error;
      }
      throw ErrorFactory.modInvalidUrl(url);
    }

    // Fetch mod metadata and download
    if (source === 'modrinth') {
      const { projectId, versionId } = projectInfo as { projectId: string; versionId?: string };
      
      try {
        // Check if mod already exists
        const existingMod = await this.customModRepository.findByProfileAndProjectId(profileId, projectId);
        if (existingMod) {
          throw ErrorFactory.modAlreadyInstalled(existingMod.name);
        }

        // Fetch project info with retry
        const project = await this.retryOperation(
          () => this.fetchModrinthProject(projectId, gameVersion),
          `fetch Modrinth project ${projectId}`
        );

        // Get version info
        const targetVersionId = versionId || project.versions[0];
        const versionResponse = await this.retryOperation(
          () => axios.get<ModrinthVersion>(
            `https://api.modrinth.com/v2/version/${targetVersionId}`,
            { timeout: this.DOWNLOAD_TIMEOUT_MS }
          ),
          `fetch version info for ${project.title}`
        );
        
        const versionInfo = versionResponse.data;
        const primaryFile = versionInfo.files.find((f) => f.primary) || versionInfo.files[0];

        if (!primaryFile) {
          throw ErrorFactory.modDownloadFailed(project.title, 'No download file available');
        }

        // Generate unique mod ID
        const modId = `custom-${projectId}`;

        // Download mod with retry
        const modsDir = this.getModsDirectory(installationDir);
        await fs.mkdir(modsDir, { recursive: true });
        const targetPath = path.join(modsDir, primaryFile.filename);

        await this.retryOperation(
          () => this.downloadCustomMod(
            project.title,
            primaryFile.url,
            targetPath,
            primaryFile.hashes.sha1,
            (downloaded, total) => {
              if (onProgress) {
                onProgress({
                  modId,
                  modName: project.title,
                  downloaded,
                  total,
                  percentage: Math.round((downloaded / total) * 100),
                });
              }
            }
          ),
          `download ${project.title}`
        );

        // Create custom mod record
        const customMod: CustomMod = {
          profileId,
          modId,
          name: project.title,
          description: project.description,
          fileName: primaryFile.filename,
          source: 'modrinth',
          projectId,
          versionId: targetVersionId,
          downloadUrl: primaryFile.url,
          createdAt: new Date(),
        };

        const createdMod = await this.customModRepository.create(customMod);

        // Initialize mod state (enabled by default)
        await this.modStateRepository.upsert({
          profileId,
          modId,
          enabled: true,
        });

        this.logger.info(`Successfully added custom mod: ${project.title}`);
        return createdMod;
      } catch (error) {
        if (error instanceof LauncherError) {
          throw error;
        }
        
        this.logger.error(`Failed to add custom mod from ${url}`, error);
        throw ErrorFactory.modDownloadFailed(
          'custom mod',
          error instanceof Error ? error.message : 'Unknown error',
          error as Error
        );
      }
    } else {
      // CurseForge
      const { projectSlug } = projectInfo as { projectSlug: string; fileId?: string };
      
      try {
        await this.fetchCurseForgeProject(projectSlug, gameVersion);
      } catch (error) {
        // CurseForge is not yet implemented
        throw new Error('CurseForge support is not yet implemented. Please use Modrinth URLs instead.');
      }
      
      throw new Error('CurseForge support is not yet implemented');
    }
  }

  /**
   * Download custom mod file
   */
  private async downloadCustomMod(
    modName: string,
    downloadUrl: string,
    targetPath: string,
    expectedSha1: string,
    onProgress?: (downloaded: number, total: number) => void
  ): Promise<void> {
    try {
      this.logger.info(`Downloading custom mod ${modName} from ${downloadUrl}`);
      
      // Download file
      const response = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: this.DOWNLOAD_TIMEOUT_MS,
        onDownloadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            onProgress(progressEvent.loaded, progressEvent.total);
          }
        },
      });

      const fileData = Buffer.from(response.data);

      // Verify SHA-1 hash
      const actualSha1 = crypto.createHash('sha1').update(fileData).digest('hex');
      if (actualSha1 !== expectedSha1) {
        this.logger.error(`Integrity check failed for ${modName}. Expected ${expectedSha1}, got ${actualSha1}`);
        throw ErrorFactory.modIntegrityCheckFailed(modName);
      }

      // Write file to disk
      await fs.writeFile(targetPath, fileData);
      this.logger.info(`Successfully downloaded and verified custom mod ${modName}`);
    } catch (error) {
      if (error instanceof LauncherError) {
        throw error;
      }
      
      if (axios.isAxiosError(error)) {
        if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
          throw ErrorFactory.networkError(error);
        }
        if (error.code === 'ECONNABORTED') {
          throw ErrorFactory.modDownloadFailed(modName, 'Download timeout', error);
        }
        throw ErrorFactory.modDownloadFailed(modName, error.message, error);
      }
      
      // File system errors
      if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        throw ErrorFactory.permissionDenied(`write mod file ${modName}`);
      }
      if ((error as NodeJS.ErrnoException).code === 'ENOSPC') {
        throw ErrorFactory.diskSpaceInsufficient('500 MB');
      }
      
      throw error;
    }
  }

  /**
   * Remove custom mod from profile
   */
  public async removeCustomMod(profileId: number, modId: string, installationDir: string): Promise<void> {
    try {
      // Get custom mod info
      const customMod = await this.customModRepository.findByProfileAndMod(profileId, modId);
      if (!customMod) {
        throw ErrorFactory.modNotFound(modId);
      }

      // Delete mod file
      const modsDir = this.getModsDirectory(installationDir);
      const modPath = path.join(modsDir, customMod.fileName);
      const disabledPath = path.join(modsDir, customMod.fileName.replace('.jar', '.jar.disabled'));

      let fileDeleted = false;
      
      // Try to delete both enabled and disabled versions
      try {
        await fs.unlink(modPath);
        fileDeleted = true;
        this.logger.info(`Deleted mod file: ${modPath}`);
      } catch (error) {
        // File might not exist or already disabled
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          this.logger.warn(`Could not delete enabled mod file: ${(error as Error).message}`);
        }
      }

      try {
        await fs.unlink(disabledPath);
        fileDeleted = true;
        this.logger.info(`Deleted disabled mod file: ${disabledPath}`);
      } catch (error) {
        // File might not exist
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          this.logger.warn(`Could not delete disabled mod file: ${(error as Error).message}`);
        }
      }

      if (!fileDeleted) {
        this.logger.warn(`No mod files found for ${customMod.name}, continuing with database cleanup`);
      }

      // Delete from database
      await this.customModRepository.deleteByProfileAndMod(profileId, modId);

      // Delete mod state
      const modState = await this.modStateRepository.findByProfileAndMod(profileId, modId);
      if (modState?.id) {
        await this.modStateRepository.delete(modState.id);
      }

      this.logger.info(`Successfully removed custom mod: ${customMod.name}`);
    } catch (error) {
      if (error instanceof LauncherError) {
        throw error;
      }
      
      this.logger.error(`Failed to remove custom mod ${modId}`, error);
      throw ErrorFactory.modStateUpdateFailed(
        modId,
        error as Error
      );
    }
  }
}
