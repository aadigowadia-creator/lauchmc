import { ModLoaderService, ModLoaderInfo } from './mod-loader-service';
import { OptiFineManager, OptiFineInfo, DownloadProgress } from './optifine-manager';
import { ForgeModRepository } from '../repositories/forge-mod-repository';
import { OptiFineConfigRepository } from '../repositories/optifine-config-repository';
import { ProfileService } from './profile-service';
import { ForgeErrorReporter, ErrorContext } from './forge-error-reporter';
import { 
  ForgeModState, 
  CreateForgeModStateData, 
  UpdateForgeModStateData,
  OptiFineConfig,
  CreateOptiFineConfigData,
  UpdateOptiFineConfigData,
  UserProfile,
  CreateProfileData
} from '../models';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface ForgeProfile extends UserProfile {
  modLoader: {
    type: 'forge';
    version: string;
  };
  optifineEnabled: boolean;
  optifineVersion?: string;
  modsDirectory: string;
}

export interface ForgeProfileCreationOptions {
  profileName: string;
  gameVersion: string;
  forgeVersion?: string; // If not provided, will use recommended
  installationDir?: string;
  memoryMin?: number;
  memoryMax?: number;
  jvmArgs?: string;
  enableOptiFine?: boolean;
}

export class ForgeModService {
  private modLoaderService: ModLoaderService;
  private optiFineManager: OptiFineManager;
  private forgeModRepository: ForgeModRepository;
  private optiFineConfigRepository: OptiFineConfigRepository;
  private profileService: ProfileService;
  private errorReporter: ForgeErrorReporter;

  constructor() {
    this.modLoaderService = new ModLoaderService();
    this.optiFineManager = new OptiFineManager();
    this.forgeModRepository = new ForgeModRepository();
    this.optiFineConfigRepository = new OptiFineConfigRepository();
    this.profileService = new ProfileService();
    this.errorReporter = new ForgeErrorReporter();
  }

  /**
   * Create a new Forge profile with OptiFine integration
   * Requirements: 1.1, 1.4, 2.1, 2.2, 3.1, 3.4
   */
  public async createForgeProfile(
    options: ForgeProfileCreationOptions,
    onProgress?: (progress: { stage: string; percentage: number; message?: string }) => void
  ): Promise<ForgeProfile> {
    try {
      onProgress?.({ stage: 'Initializing', percentage: 0, message: 'Starting Forge profile creation' });

      // Step 1: Detect available Forge versions if not specified
      let forgeVersion = options.forgeVersion;
      if (!forgeVersion) {
        onProgress?.({ stage: 'Detecting Forge versions', percentage: 10 });
        const availableForgeVersions = await this.modLoaderService.detectModLoaders(options.gameVersion);
        const forgeVersions = availableForgeVersions.filter(ml => ml.type === 'forge');
        
        if (forgeVersions.length === 0) {
          throw new Error(`No Forge versions available for Minecraft ${options.gameVersion}`);
        }

        // Prefer recommended version, fallback to first stable version
        const recommendedVersion = forgeVersions.find(v => v.recommended);
        const stableVersion = forgeVersions.find(v => v.stable);
        const selectedVersion = recommendedVersion || stableVersion || forgeVersions[0];
        
        forgeVersion = selectedVersion.version;
      }

      // Step 2: Create the profile (simplified approach)
      onProgress?.({ stage: 'Creating profile', percentage: 20, message: 'Setting up profile structure' });
      
      const installationDir = options.installationDir || 
        this.profileService.generateProfileInstallationDirectory(options.profileName);

      const profileData: CreateProfileData = {
        name: options.profileName,
        versionId: options.gameVersion, // Use vanilla version for now
        installationDir,
        memoryMin: options.memoryMin || 3072, // 3GB default for Forge
        memoryMax: options.memoryMax || 6144, // 6GB default for Forge
        jvmArgs: options.jvmArgs || this.getDefaultForgeJvmArgs(),
        modLoader: {
          type: 'forge',
          version: forgeVersion
        }
      };

      const profile = await this.profileService.createProfile(profileData);
      
      // Step 3: Create mods directory
      onProgress?.({ stage: 'Setting up directories', percentage: 60, message: 'Creating mods directory' });
      const modsDirectory = path.join(profile.installationDir, 'mods');
      await fs.mkdir(modsDirectory, { recursive: true });

      // Step 4: Initialize default mod states (OptiFine enabled by default)
      onProgress?.({ stage: 'Initializing mod states', percentage: 80, message: 'Setting up default mod configuration' });
      if (options.enableOptiFine) {
        const optifineState: CreateForgeModStateData = {
          profileId: profile.id!.toString(),
          modName: 'OptiFine',
          enabled: true,
          filePath: path.join(modsDirectory, 'OptiFine.jar')
        };
        await this.forgeModRepository.create(optifineState);
      }

      // Step 5: Skip Forge installation for now (users can install manually)
      onProgress?.({ stage: 'Finalizing', percentage: 90, message: 'Finalizing profile setup' });

      // Step 6: Create the final ForgeProfile object
      const forgeProfile: ForgeProfile = {
        ...profile,
        modLoader: {
          type: 'forge',
          version: forgeVersion
        },
        optifineEnabled: false, // Will be enabled when OptiFine is installed
        optifineVersion: undefined,
        modsDirectory
      };

      onProgress?.({ stage: 'Complete', percentage: 100, message: 'Forge profile created successfully!' });

      return forgeProfile;

    } catch (error) {
      console.error('Error creating Forge profile:', error);
      throw new Error(`Failed to create Forge profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get mod states for a profile
   * Requirements: 1.2, 1.3
   */
  public async getModStates(profileId: string): Promise<ForgeModState[]> {
    try {
      return await this.forgeModRepository.findByProfileId(profileId);
    } catch (error) {
      console.error('Error getting mod states:', error);
      throw new Error(`Failed to get mod states: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update mod state (enable/disable)
   * Requirements: 1.2, 1.3
   */
  public async updateModState(profileId: string, modName: string, enabled: boolean): Promise<void> {
    try {
      const existingState = await this.forgeModRepository.findByProfileAndMod(profileId, modName);
      
      if (existingState) {
        await this.forgeModRepository.update(existingState.id!, { enabled });
      } else {
        // Create new mod state if it doesn't exist
        const newState: CreateForgeModStateData = {
          profileId,
          modName,
          enabled,
          filePath: path.join('mods', `${modName}.jar`) // Default path
        };
        await this.forgeModRepository.create(newState);
      }
    } catch (error) {
      console.error('Error updating mod state:', error);
      throw new Error(`Failed to update mod state: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Apply mod states by renaming files
   * Requirements: 1.2, 1.3
   */
  public async applyModStates(profileId: string): Promise<void> {
    try {
      const modStates = await this.getModStates(profileId);
      const profile = await this.profileService.getProfileById(parseInt(profileId));
      
      if (!profile) {
        throw new Error(`Profile not found: ${profileId}`);
      }

      const modsDir = path.join(profile.installationDir, 'mods');
      
      for (const modState of modStates) {
        const jarPath = path.join(modsDir, `${modState.modName}.jar`);
        const disabledPath = path.join(modsDir, `${modState.modName}.jar.disabled`);
        
        try {
          if (modState.enabled) {
            // Enable mod: rename .disabled to .jar
            try {
              await fs.access(disabledPath);
              await fs.rename(disabledPath, jarPath);
            } catch {
              // File might already be enabled or not exist
            }
          } else {
            // Disable mod: rename .jar to .disabled
            try {
              await fs.access(jarPath);
              await fs.rename(jarPath, disabledPath);
            } catch {
              // File might already be disabled or not exist
            }
          }
        } catch (error) {
          console.warn(`Failed to apply state for mod ${modState.modName}:`, error);
        }
      }
    } catch (error) {
      console.error('Error applying mod states:', error);
      throw new Error(`Failed to apply mod states: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get mod state statistics
   * Requirements: 1.2, 1.3
   */
  public async getModStateStatistics(profileId: string): Promise<{
    total: number;
    enabled: number;
    disabled: number;
    conflicts: number;
  }> {
    try {
      const modStates = await this.getModStates(profileId);
      const enabled = modStates.filter(mod => mod.enabled).length;
      const disabled = modStates.length - enabled;
      
      return {
        total: modStates.length,
        enabled,
        disabled,
        conflicts: 0 // TODO: Implement conflict detection
      };
    } catch (error) {
      console.error('Error getting mod statistics:', error);
      throw new Error(`Failed to get mod statistics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Scan mods directory and update mod states
   * Requirements: 1.2, 1.3
   */
  public async scanAndUpdateModStates(profileId: string, modsDirectory: string): Promise<void> {
    try {
      const files = await fs.readdir(modsDirectory);
      const jarFiles = files.filter(file => file.endsWith('.jar') || file.endsWith('.jar.disabled'));
      
      for (const file of jarFiles) {
        const isEnabled = file.endsWith('.jar');
        const modName = file.replace(/\.jar(\.disabled)?$/, '');
        const filePath = path.join(modsDirectory, file);
        
        const existingState = await this.forgeModRepository.findByProfileAndMod(profileId, modName);
        
        if (!existingState) {
          // Create new mod state
          const newState: CreateForgeModStateData = {
            profileId,
            modName,
            enabled: isEnabled,
            filePath
          };
          await this.forgeModRepository.create(newState);
        } else {
          // Update existing state
          await this.forgeModRepository.update(existingState.id!, { 
            enabled: isEnabled,
            filePath 
          });
        }
      }
    } catch (error) {
      console.error('Error scanning and updating mod states:', error);
      throw new Error(`Failed to scan and update mod states: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get enabled mods for a profile
   * Requirements: 1.2, 1.3
   */
  public async getEnabledMods(profileId: string): Promise<ForgeModState[]> {
    try {
      const modStates = await this.getModStates(profileId);
      return modStates.filter(mod => mod.enabled);
    } catch (error) {
      console.error('Error getting enabled mods:', error);
      throw new Error(`Failed to get enabled mods: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate a mod file
   * Requirements: 1.2, 1.3
   */
  public async validateModFile(filePath: string): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    
    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Check if it's a valid jar file (basic check)
      const stats = await fs.stat(filePath);
      if (stats.size === 0) {
        issues.push('File is empty');
      }
      
      if (!filePath.endsWith('.jar')) {
        issues.push('File is not a .jar file');
      }
      
      // TODO: Add more sophisticated validation (zip structure, mod metadata, etc.)
      
    } catch (error) {
      issues.push(`File not accessible: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Get default JVM arguments for Forge profiles
   */
  private getDefaultForgeJvmArgs(): string {
    return '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1 -Dfml.ignoreInvalidMinecraftCertificates=true -Dfml.ignorePatchDiscrepancies=true';
  }
}