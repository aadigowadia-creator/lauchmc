import { ProfileRepository } from '../repositories/profile-repository';
import { UserProfile, CreateProfileData, UpdateProfileData } from '../models';
import { ProfileConfigService, MemoryConfiguration, JvmPreset, SystemSpecification, InstallationDirectoryInfo } from './profile-config-service';
import { ModLoaderService, ModLoaderInfo } from './mod-loader-service';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

export interface ProfileValidationError {
  field: string;
  message: string;
}

export interface ProfileValidationResult {
  isValid: boolean;
  errors: ProfileValidationError[];
}

export class ProfileService {
  private profileRepository: ProfileRepository;
  private configService: ProfileConfigService;
  private modLoaderService: ModLoaderService;

  constructor() {
    this.profileRepository = new ProfileRepository();
    this.configService = new ProfileConfigService();
    this.modLoaderService = new ModLoaderService();
  }

  /**
   * Create a new profile with validation
   */
  public async createProfile(profileData: CreateProfileData): Promise<UserProfile> {
    // Validate profile data
    const validation = await this.validateProfileData(profileData);
    if (!validation.isValid) {
      throw new Error(`Profile validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    // Check if name is unique
    const nameAvailable = await this.profileRepository.validateProfileName(profileData.name);
    if (!nameAvailable) {
      throw new Error(`Profile name "${profileData.name}" already exists`);
    }

    // Set default installation directory if not provided
    const profileWithDefaults = {
      ...profileData,
      installationDir: profileData.installationDir || this.configService.getDefaultInstallationDirectory(),
      jvmArgs: profileData.jvmArgs || '',
    };

    // Create installation directory if it doesn't exist
    await this.ensureInstallationDirectory(profileWithDefaults.installationDir);

    return await this.profileRepository.create(profileWithDefaults);
  }

  /**
   * Update an existing profile
   */
  public async updateProfile(id: number, updateData: Partial<Omit<UserProfile, 'id' | 'createdAt'>>): Promise<UserProfile | null> {
    // Check if profile exists
    const existingProfile = await this.profileRepository.findById(id);
    if (!existingProfile) {
      throw new Error(`Profile with id ${id} not found`);
    }

    // Validate update data
    const mergedData = { ...existingProfile, ...updateData };
    const validation = await this.validateProfileData(mergedData);
    if (!validation.isValid) {
      throw new Error(`Profile validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    // Check name uniqueness if name is being updated
    if (updateData.name && updateData.name !== existingProfile.name) {
      const nameAvailable = await this.profileRepository.validateProfileName(updateData.name, id);
      if (!nameAvailable) {
        throw new Error(`Profile name "${updateData.name}" already exists`);
      }
    }

    // Create installation directory if it's being changed
    if (updateData.installationDir && updateData.installationDir !== existingProfile.installationDir) {
      await this.ensureInstallationDirectory(updateData.installationDir);
    }

    return await this.profileRepository.update(id, { id, ...updateData });
  }

  /**
   * Delete a profile
   */
  public async deleteProfile(id: number, deleteFiles: boolean = false): Promise<boolean> {
    const profile = await this.profileRepository.findById(id);
    if (!profile) {
      return false;
    }

    // Optionally delete installation files
    if (deleteFiles && profile.installationDir) {
      try {
        await fs.rm(profile.installationDir, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Failed to delete installation directory: ${error}`);
        // Continue with profile deletion even if file deletion fails
      }
    }

    return await this.profileRepository.delete(id);
  }

  /**
   * Duplicate an existing profile
   */
  public async duplicateProfile(id: number, newName: string): Promise<UserProfile> {
    const originalProfile = await this.profileRepository.findById(id);
    if (!originalProfile) {
      throw new Error(`Profile with id ${id} not found`);
    }

    // Check if new name is unique
    const nameAvailable = await this.profileRepository.validateProfileName(newName);
    if (!nameAvailable) {
      throw new Error(`Profile name "${newName}" already exists`);
    }

    // Create duplicate profile data
    const duplicateData: CreateProfileData = {
      name: newName,
      versionId: originalProfile.versionId,
      installationDir: this.configService.generateProfileInstallationDirectory(newName),
      memoryMin: originalProfile.memoryMin,
      memoryMax: originalProfile.memoryMax,
      jvmArgs: originalProfile.jvmArgs,
      modLoader: originalProfile.modLoader,
    };

    return await this.createProfile(duplicateData);
  }

  /**
   * Get all profiles
   */
  public async getAllProfiles(): Promise<UserProfile[]> {
    return await this.profileRepository.findAll();
  }

  /**
   * Get profile by ID
   */
  public async getProfileById(id: number): Promise<UserProfile | null> {
    return await this.profileRepository.findById(id);
  }

  /**
   * Get profiles by version ID
   */
  public async getProfilesByVersion(versionId: string): Promise<UserProfile[]> {
    return await this.profileRepository.findByVersionId(versionId);
  }

  /**
   * Get recently used profiles
   */
  public async getRecentlyUsedProfiles(limit: number = 5): Promise<UserProfile[]> {
    return await this.profileRepository.getRecentlyUsed(limit);
  }

  /**
   * Update profile's last used timestamp
   */
  public async markProfileAsUsed(id: number): Promise<UserProfile | null> {
    return await this.profileRepository.updateLastUsed(id);
  }

  /**
   * Get profiles by mod loader type
   */
  public async getProfilesByModLoader(modLoaderType: string): Promise<UserProfile[]> {
    return await this.profileRepository.getProfilesByModLoader(modLoaderType);
  }

  /**
   * Validate profile data
   */
  private async validateProfileData(profileData: Partial<UserProfile>): Promise<ProfileValidationResult> {
    const errors: ProfileValidationError[] = [];

    // Validate name
    if (!profileData.name || profileData.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Profile name is required' });
    } else if (profileData.name.length > 50) {
      errors.push({ field: 'name', message: 'Profile name must be 50 characters or less' });
    } else if (!/^[a-zA-Z0-9\s\-_]+$/.test(profileData.name)) {
      errors.push({ field: 'name', message: 'Profile name can only contain letters, numbers, spaces, hyphens, and underscores' });
    }

    // Validate version ID
    if (!profileData.versionId || profileData.versionId.trim().length === 0) {
      errors.push({ field: 'versionId', message: 'Version ID is required' });
    }

    // Validate memory settings
    if (profileData.memoryMin !== undefined) {
      if (profileData.memoryMin < 512) {
        errors.push({ field: 'memoryMin', message: 'Minimum memory must be at least 512 MB' });
      } else if (profileData.memoryMin > 32768) {
        errors.push({ field: 'memoryMin', message: 'Minimum memory cannot exceed 32 GB' });
      }
    }

    if (profileData.memoryMax !== undefined) {
      if (profileData.memoryMax < 1024) {
        errors.push({ field: 'memoryMax', message: 'Maximum memory must be at least 1024 MB' });
      } else if (profileData.memoryMax > 32768) {
        errors.push({ field: 'memoryMax', message: 'Maximum memory cannot exceed 32 GB' });
      }
    }

    // Validate memory min/max relationship
    if (profileData.memoryMin !== undefined && profileData.memoryMax !== undefined) {
      if (profileData.memoryMin > profileData.memoryMax) {
        errors.push({ field: 'memory', message: 'Minimum memory cannot be greater than maximum memory' });
      }
    }

    // Validate installation directory
    if (profileData.installationDir) {
      try {
        const resolvedPath = path.resolve(profileData.installationDir);
        // Check if path is valid and not a system directory
        if (this.isSystemDirectory(resolvedPath)) {
          errors.push({ field: 'installationDir', message: 'Installation directory cannot be a system directory' });
        }
      } catch (error) {
        errors.push({ field: 'installationDir', message: 'Invalid installation directory path' });
      }
    }

    // Validate JVM arguments
    if (profileData.jvmArgs !== undefined) {
      const jvmArgsValidation = this.validateJvmArgumentsBasic(profileData.jvmArgs);
      if (!jvmArgsValidation.isValid) {
        errors.push({ field: 'jvmArgs', message: jvmArgsValidation.message });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate JVM arguments (basic validation for profile creation)
   */
  private validateJvmArgumentsBasic(jvmArgs: string): { isValid: boolean; message: string } {
    if (!jvmArgs || jvmArgs.trim().length === 0) {
      return { isValid: true, message: '' };
    }

    // Check for potentially dangerous arguments
    const dangerousArgs = [
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:+UseG1GC',
      '-XX:+UseConcMarkSweepGC',
      '-XX:+UseParallelGC',
    ];

    const args = jvmArgs.split(/\s+/);
    const potentiallyDangerous = args.some(arg => 
      dangerousArgs.some(dangerous => arg.startsWith(dangerous))
    );

    if (potentiallyDangerous) {
      return { 
        isValid: true, // Allow but warn
        message: 'Warning: Some JVM arguments may affect game performance or stability' 
      };
    }

    // Check for invalid argument patterns
    const invalidPatterns = [
      /--?[a-zA-Z]/, // Command line flags that don't start with -X or -D
    ];

    const hasInvalidArgs = args.some(arg => 
      invalidPatterns.some(pattern => pattern.test(arg)) && 
      !arg.startsWith('-X') && 
      !arg.startsWith('-D')
    );

    if (hasInvalidArgs) {
      return { 
        isValid: false, 
        message: 'JVM arguments must start with -X or -D, or be valid JVM options' 
      };
    }

    return { isValid: true, message: '' };
  }

  /**
   * Ensure installation directory exists
   */
  private async ensureInstallationDirectory(installationDir: string): Promise<void> {
    return await this.configService.createInstallationDirectory(installationDir);
  }

  /**
   * Check if path is a system directory
   */
  private isSystemDirectory(dirPath: string): boolean {
    const systemDirs = [
      'C:\\Windows',
      'C:\\Program Files',
      'C:\\Program Files (x86)',
      '/System',
      '/usr',
      '/bin',
      '/sbin',
      '/etc',
    ];

    return systemDirs.some(sysDir => 
      dirPath.toLowerCase().startsWith(sysDir.toLowerCase())
    );
  }

  // Configuration Management Methods

  /**
   * Get memory configuration recommendations
   */
  public async getMemoryConfiguration(): Promise<MemoryConfiguration> {
    return await this.configService.getMemoryConfiguration();
  }

  /**
   * Validate memory allocation for a profile
   */
  public validateMemoryAllocation(min: number, max: number): { isValid: boolean; errors: string[] } {
    return this.configService.validateMemoryAllocation(min, max);
  }

  /**
   * Get available JVM presets
   */
  public getJvmPresets(): JvmPreset[] {
    return this.configService.getJvmPresets();
  }

  /**
   * Get system specification presets
   */
  public getSystemSpecifications(): SystemSpecification[] {
    return this.configService.getSystemSpecifications();
  }

  /**
   * Get recommended system specification for current system
   */
  public getRecommendedSystemSpec(): SystemSpecification {
    return this.configService.getRecommendedSystemSpec();
  }

  /**
   * Apply JVM preset to profile
   */
  public async applyJvmPreset(profileId: number, presetName: string): Promise<UserProfile | null> {
    const preset = this.configService.getJvmPresets().find(p => p.name === presetName);
    if (!preset) {
      throw new Error(`JVM preset "${presetName}" not found`);
    }

    const profile = await this.profileRepository.findById(profileId);
    if (!profile) {
      throw new Error(`Profile with id ${profileId} not found`);
    }

    const updateData: Partial<Omit<UserProfile, 'id'>> = {
      jvmArgs: preset.args.join(' '),
    };

    // Apply memory recommendations if preset specifies them
    if (preset.minMemory && preset.minMemory > profile.memoryMin) {
      updateData.memoryMin = preset.minMemory;
    }
    if (preset.maxMemory && preset.maxMemory !== profile.memoryMax) {
      updateData.memoryMax = preset.maxMemory;
    }

    return await this.updateProfile(profileId, updateData);
  }

  /**
   * Apply system specification to profile
   */
  public async applySystemSpec(profileId: number, specCategory: string): Promise<UserProfile | null> {
    const spec = this.configService.getSystemSpecifications().find(s => s.category === specCategory);
    if (!spec) {
      throw new Error(`System specification "${specCategory}" not found`);
    }

    const updateData: Partial<Omit<UserProfile, 'id'>> = {
      memoryMin: spec.memoryMin,
      memoryMax: spec.memoryMax,
      jvmArgs: spec.jvmArgs.join(' '),
    };

    return await this.updateProfile(profileId, updateData);
  }

  /**
   * Validate JVM arguments for a profile
   */
  public validateJvmArguments(jvmArgs: string): { isValid: boolean; warnings: string[]; errors: string[] } {
    const args = jvmArgs.trim().split(/\s+/).filter(arg => arg.length > 0);
    return this.configService.validateJvmArguments(args);
  }

  /**
   * Get installation directory information
   */
  public async getInstallationDirectoryInfo(dirPath: string): Promise<InstallationDirectoryInfo> {
    return await this.configService.getInstallationDirectoryInfo(dirPath);
  }

  /**
   * Create installation directory for profile
   */
  public async createInstallationDirectory(dirPath: string): Promise<void> {
    return await this.configService.createInstallationDirectory(dirPath);
  }

  /**
   * Get default installation directory
   */
  public getDefaultInstallationDirectory(): string {
    return this.configService.getDefaultInstallationDirectory();
  }

  /**
   * Generate profile-specific installation directory
   */
  public generateProfileInstallationDirectory(profileName: string, baseDir?: string): string {
    return this.configService.generateProfileInstallationDirectory(profileName, baseDir);
  }

  /**
   * Update profile memory settings with validation
   */
  public async updateProfileMemory(profileId: number, memoryMin: number, memoryMax: number): Promise<UserProfile | null> {
    const validation = this.validateMemoryAllocation(memoryMin, memoryMax);
    if (!validation.isValid) {
      throw new Error(`Memory validation failed: ${validation.errors.join(', ')}`);
    }

    return await this.updateProfile(profileId, { memoryMin, memoryMax });
  }

  /**
   * Update profile JVM arguments with validation
   */
  public async updateProfileJvmArgs(profileId: number, jvmArgs: string): Promise<UserProfile | null> {
    const validation = this.validateJvmArguments(jvmArgs);
    if (!validation.isValid) {
      throw new Error(`JVM arguments validation failed: ${validation.errors.join(', ')}`);
    }

    // Log warnings if any
    if (validation.warnings.length > 0) {
      console.warn('JVM Arguments warnings:', validation.warnings);
    }

    return await this.updateProfile(profileId, { jvmArgs });
  }

  /**
   * Update profile installation directory with validation
   */
  public async updateProfileInstallationDir(profileId: number, installationDir: string): Promise<UserProfile | null> {
    const dirInfo = await this.getInstallationDirectoryInfo(installationDir);
    
    if (!dirInfo.isValid) {
      throw new Error(`Installation directory validation failed: ${dirInfo.error}`);
    }

    // Create directory if it doesn't exist
    if (!dirInfo.exists) {
      await this.createInstallationDirectory(installationDir);
    }

    return await this.updateProfile(profileId, { installationDir });
  }

  /**
   * Get profile configuration summary
   */
  public async getProfileConfigSummary(profileId: number): Promise<{
    profile: UserProfile;
    memoryValidation: { isValid: boolean; errors: string[] };
    jvmValidation: { isValid: boolean; warnings: string[]; errors: string[] };
    directoryInfo: InstallationDirectoryInfo;
    recommendedSpec: SystemSpecification;
  } | null> {
    const profile = await this.profileRepository.findById(profileId);
    if (!profile) {
      return null;
    }

    const memoryValidation = this.validateMemoryAllocation(profile.memoryMin, profile.memoryMax);
    const jvmValidation = this.validateJvmArguments(profile.jvmArgs);
    const directoryInfo = await this.getInstallationDirectoryInfo(profile.installationDir);
    const recommendedSpec = this.getRecommendedSystemSpec();

    return {
      profile,
      memoryValidation,
      jvmValidation,
      directoryInfo,
      recommendedSpec,
    };
  }

  // Modded Profile Management Methods

  /**
   * Create a modded profile automatically after mod loader installation
   */
  public async createModdedProfile(
    modLoaderInfo: ModLoaderInfo,
    baseProfileName?: string,
    installationDir?: string
  ): Promise<UserProfile> {
    const profileName = baseProfileName || `${modLoaderInfo.gameVersion}-${modLoaderInfo.type}-${modLoaderInfo.version}`;
    
    // Check if profile name already exists, if so, append a number
    let finalProfileName = profileName;
    let counter = 1;
    while (!(await this.profileRepository.validateProfileName(finalProfileName))) {
      finalProfileName = `${profileName} (${counter})`;
      counter++;
    }

    // Generate mod loader-specific version ID
    const versionId = this.generateModdedVersionId(modLoaderInfo);
    
    // Set up installation directory
    const profileInstallationDir = installationDir || 
      this.configService.generateProfileInstallationDirectory(finalProfileName);

    // Get mod loader-specific configuration
    const modLoaderConfig = this.getModLoaderConfiguration(modLoaderInfo);

    const profileData: CreateProfileData = {
      name: finalProfileName,
      versionId: versionId,
      installationDir: profileInstallationDir,
      memoryMin: modLoaderConfig.recommendedMemoryMin,
      memoryMax: modLoaderConfig.recommendedMemoryMax,
      jvmArgs: modLoaderConfig.jvmArgs.join(' '),
      modLoader: {
        type: modLoaderInfo.type,
        version: modLoaderInfo.version
      }
    };

    return await this.createProfile(profileData);
  }

  /**
   * Update mod loader version for an existing profile
   */
  public async updateModLoaderVersion(
    profileId: number,
    newModLoaderInfo: ModLoaderInfo,
    installationDir?: string
  ): Promise<UserProfile | null> {
    const profile = await this.profileRepository.findById(profileId);
    if (!profile) {
      throw new Error(`Profile with id ${profileId} not found`);
    }

    if (!profile.modLoader) {
      throw new Error('Profile is not a modded profile');
    }

    if (profile.modLoader.type !== newModLoaderInfo.type) {
      throw new Error(`Cannot change mod loader type from ${profile.modLoader.type} to ${newModLoaderInfo.type}`);
    }

    // Check if mod loader is installed
    const targetInstallationDir = installationDir || profile.installationDir;
    const isInstalled = await this.modLoaderService.isModLoaderInstalled(
      newModLoaderInfo.type,
      newModLoaderInfo.gameVersion,
      newModLoaderInfo.version,
      targetInstallationDir
    );

    if (!isInstalled) {
      throw new Error(`Mod loader ${newModLoaderInfo.type} ${newModLoaderInfo.version} is not installed`);
    }

    // Generate new version ID
    const newVersionId = this.generateModdedVersionId(newModLoaderInfo);
    
    // Get updated configuration
    const modLoaderConfig = this.getModLoaderConfiguration(newModLoaderInfo);

    const updateData: Partial<Omit<UserProfile, 'id'>> = {
      versionId: newVersionId,
      modLoader: {
        type: newModLoaderInfo.type,
        version: newModLoaderInfo.version
      },
      jvmArgs: modLoaderConfig.jvmArgs.join(' ')
    };

    // Update installation directory if provided
    if (installationDir && installationDir !== profile.installationDir) {
      updateData.installationDir = installationDir;
    }

    return await this.updateProfile(profileId, updateData);
  }

  /**
   * Convert a vanilla profile to a modded profile
   */
  public async convertToModdedProfile(
    profileId: number,
    modLoaderInfo: ModLoaderInfo,
    installationDir?: string
  ): Promise<UserProfile | null> {
    const profile = await this.profileRepository.findById(profileId);
    if (!profile) {
      throw new Error(`Profile with id ${profileId} not found`);
    }

    if (profile.modLoader) {
      throw new Error('Profile is already a modded profile');
    }

    // Check if the game version matches
    if (profile.versionId !== modLoaderInfo.gameVersion) {
      throw new Error(`Game version mismatch: profile uses ${profile.versionId}, mod loader is for ${modLoaderInfo.gameVersion}`);
    }

    // Check if mod loader is installed
    const targetInstallationDir = installationDir || profile.installationDir;
    const isInstalled = await this.modLoaderService.isModLoaderInstalled(
      modLoaderInfo.type,
      modLoaderInfo.gameVersion,
      modLoaderInfo.version,
      targetInstallationDir
    );

    if (!isInstalled) {
      throw new Error(`Mod loader ${modLoaderInfo.type} ${modLoaderInfo.version} is not installed`);
    }

    // Generate modded version ID
    const moddedVersionId = this.generateModdedVersionId(modLoaderInfo);
    
    // Get mod loader configuration
    const modLoaderConfig = this.getModLoaderConfiguration(modLoaderInfo);

    const updateData: Partial<Omit<UserProfile, 'id'>> = {
      versionId: moddedVersionId,
      modLoader: {
        type: modLoaderInfo.type,
        version: modLoaderInfo.version
      },
      // Merge existing JVM args with mod loader-specific ones
      jvmArgs: this.mergeJvmArguments(profile.jvmArgs, modLoaderConfig.jvmArgs.join(' '))
    };

    // Update memory settings if mod loader recommends higher values
    if (modLoaderConfig.recommendedMemoryMin > profile.memoryMin) {
      updateData.memoryMin = modLoaderConfig.recommendedMemoryMin;
    }
    if (modLoaderConfig.recommendedMemoryMax > profile.memoryMax) {
      updateData.memoryMax = modLoaderConfig.recommendedMemoryMax;
    }

    // Update installation directory if provided
    if (installationDir && installationDir !== profile.installationDir) {
      updateData.installationDir = installationDir;
    }

    return await this.updateProfile(profileId, updateData);
  }

  /**
   * Remove mod loader from a profile (convert back to vanilla)
   */
  public async removeModLoaderFromProfile(profileId: number): Promise<UserProfile | null> {
    const profile = await this.profileRepository.findById(profileId);
    if (!profile) {
      throw new Error(`Profile with id ${profileId} not found`);
    }

    if (!profile.modLoader) {
      throw new Error('Profile is not a modded profile');
    }

    // Extract base game version from modded version ID
    const baseGameVersion = this.extractBaseGameVersion(profile.versionId, profile.modLoader.type);

    const updateData: Partial<Omit<UserProfile, 'id'>> = {
      versionId: baseGameVersion,
      modLoader: null,
      // Remove mod loader-specific JVM arguments
      jvmArgs: this.removeModLoaderJvmArguments(profile.jvmArgs, profile.modLoader.type)
    };

    return await this.updateProfile(profileId, updateData);
  }

  /**
   * Get available mod loaders for a profile's game version
   */
  public async getAvailableModLoadersForProfile(profileId: number): Promise<ModLoaderInfo[]> {
    const profile = await this.profileRepository.findById(profileId);
    if (!profile) {
      throw new Error(`Profile with id ${profileId} not found`);
    }

    // Extract base game version if it's a modded profile
    const gameVersion = profile.modLoader ? 
      this.extractBaseGameVersion(profile.versionId, profile.modLoader.type) : 
      profile.versionId;

    return await this.modLoaderService.detectModLoaders(gameVersion);
  }

  /**
   * Check if a profile's mod loader needs updating
   */
  public async checkModLoaderUpdates(profileId: number): Promise<{
    hasUpdates: boolean;
    currentVersion: string;
    availableVersions: ModLoaderInfo[];
  } | null> {
    const profile = await this.profileRepository.findById(profileId);
    if (!profile || !profile.modLoader) {
      return null;
    }

    const gameVersion = this.extractBaseGameVersion(profile.versionId, profile.modLoader.type);
    const availableModLoaders = await this.modLoaderService.detectModLoaders(gameVersion);
    
    const sameTypeLoaders = availableModLoaders.filter((ml: ModLoaderInfo) => ml.type === profile.modLoader!.type);
    const hasUpdates = sameTypeLoaders.some((ml: ModLoaderInfo) => ml.version !== profile.modLoader!.version);

    return {
      hasUpdates,
      currentVersion: profile.modLoader.version,
      availableVersions: sameTypeLoaders
    };
  }

  /**
   * Get installed mod loaders in a profile's installation directory
   */
  public async getInstalledModLoadersForProfile(profileId: number): Promise<ModLoaderInfo[]> {
    const profile = await this.profileRepository.findById(profileId);
    if (!profile) {
      throw new Error(`Profile with id ${profileId} not found`);
    }

    return await this.modLoaderService.getInstalledModLoaders(profile.installationDir);
  }

  /**
   * Generate version ID for modded profiles
   */
  private generateModdedVersionId(modLoaderInfo: ModLoaderInfo): string {
    switch (modLoaderInfo.type) {
      case 'forge':
        return `${modLoaderInfo.gameVersion}-forge-${modLoaderInfo.version}`;
      case 'fabric':
        return `fabric-loader-${modLoaderInfo.version}-${modLoaderInfo.gameVersion}`;
      case 'quilt':
        return `quilt-loader-${modLoaderInfo.version}-${modLoaderInfo.gameVersion}`;
      default:
        throw new Error(`Unsupported mod loader type: ${modLoaderInfo.type}`);
    }
  }

  /**
   * Extract base game version from modded version ID
   */
  private extractBaseGameVersion(versionId: string, modLoaderType: 'forge' | 'fabric' | 'quilt'): string {
    switch (modLoaderType) {
      case 'forge':
        const forgeMatch = versionId.match(/^(.+)-forge-.+$/);
        return forgeMatch ? forgeMatch[1] : versionId;
      case 'fabric':
        const fabricMatch = versionId.match(/^fabric-loader-.+-(.+)$/);
        return fabricMatch ? fabricMatch[1] : versionId;
      case 'quilt':
        const quiltMatch = versionId.match(/^quilt-loader-.+-(.+)$/);
        return quiltMatch ? quiltMatch[1] : versionId;
      default:
        return versionId;
    }
  }

  /**
   * Get mod loader-specific configuration
   */
  private getModLoaderConfiguration(modLoaderInfo: ModLoaderInfo): {
    recommendedMemoryMin: number;
    recommendedMemoryMax: number;
    jvmArgs: string[];
  } {
    const baseConfig = {
      recommendedMemoryMin: 2048, // 2GB minimum for modded
      recommendedMemoryMax: 4096, // 4GB recommended for modded
      jvmArgs: [] as string[]
    };

    switch (modLoaderInfo.type) {
      case 'forge':
        return {
          ...baseConfig,
          recommendedMemoryMin: 3072, // 3GB for Forge
          recommendedMemoryMax: 6144, // 6GB for Forge
          jvmArgs: [
            '-XX:+UseG1GC',
            '-XX:+ParallelRefProcEnabled',
            '-XX:MaxGCPauseMillis=200',
            '-XX:+UnlockExperimentalVMOptions',
            '-XX:+DisableExplicitGC',
            '-XX:+AlwaysPreTouch',
            '-XX:G1NewSizePercent=30',
            '-XX:G1MaxNewSizePercent=40',
            '-XX:G1HeapRegionSize=8M',
            '-XX:G1ReservePercent=20',
            '-XX:G1HeapWastePercent=5',
            '-XX:G1MixedGCCountTarget=4',
            '-XX:InitiatingHeapOccupancyPercent=15',
            '-XX:G1MixedGCLiveThresholdPercent=90',
            '-XX:G1RSetUpdatingPauseTimePercent=5',
            '-XX:SurvivorRatio=32',
            '-XX:+PerfDisableSharedMem',
            '-XX:MaxTenuringThreshold=1'
          ]
        };
      case 'fabric':
        return {
          ...baseConfig,
          recommendedMemoryMin: 2048, // 2GB for Fabric
          recommendedMemoryMax: 4096, // 4GB for Fabric
          jvmArgs: [
            '-XX:+UseG1GC',
            '-XX:+ParallelRefProcEnabled',
            '-XX:MaxGCPauseMillis=200',
            '-XX:+UnlockExperimentalVMOptions',
            '-XX:+DisableExplicitGC',
            '-XX:+AlwaysPreTouch',
            '-XX:G1NewSizePercent=40',
            '-XX:G1MaxNewSizePercent=50',
            '-XX:G1HeapRegionSize=16M',
            '-XX:G1ReservePercent=15',
            '-XX:InitiatingHeapOccupancyPercent=20'
          ]
        };
      case 'quilt':
        return {
          ...baseConfig,
          recommendedMemoryMin: 2048, // 2GB for Quilt
          recommendedMemoryMax: 4096, // 4GB for Quilt
          jvmArgs: [
            '-XX:+UseG1GC',
            '-XX:+ParallelRefProcEnabled',
            '-XX:MaxGCPauseMillis=200',
            '-XX:+UnlockExperimentalVMOptions',
            '-XX:+DisableExplicitGC',
            '-XX:+AlwaysPreTouch',
            '-XX:G1NewSizePercent=40',
            '-XX:G1MaxNewSizePercent=50',
            '-XX:G1HeapRegionSize=16M',
            '-XX:G1ReservePercent=15',
            '-XX:InitiatingHeapOccupancyPercent=20'
          ]
        };
      default:
        return baseConfig;
    }
  }

  /**
   * Merge JVM arguments, avoiding duplicates
   */
  private mergeJvmArguments(existingArgs: string, newArgs: string): string {
    const existing = existingArgs.trim().split(/\s+/).filter(arg => arg.length > 0);
    const newArgsArray = newArgs.trim().split(/\s+/).filter(arg => arg.length > 0);
    
    const merged = [...existing];
    
    for (const newArg of newArgsArray) {
      // Check if this argument type already exists
      const argPrefix = newArg.split('=')[0];
      const existingIndex = merged.findIndex(arg => arg.split('=')[0] === argPrefix);
      
      if (existingIndex >= 0) {
        // Replace existing argument
        merged[existingIndex] = newArg;
      } else {
        // Add new argument
        merged.push(newArg);
      }
    }
    
    return merged.join(' ');
  }

  /**
   * Remove mod loader-specific JVM arguments
   */
  private removeModLoaderJvmArguments(jvmArgs: string, modLoaderType: 'forge' | 'fabric' | 'quilt'): string {
    const args = jvmArgs.trim().split(/\s+/).filter(arg => arg.length > 0);
    const modLoaderConfig = this.getModLoaderConfiguration({ 
      type: modLoaderType, 
      version: '', 
      gameVersion: '', 
      stable: true 
    });
    
    const modLoaderArgs = new Set(modLoaderConfig.jvmArgs);
    
    // Remove mod loader-specific arguments
    const filteredArgs = args.filter(arg => {
      const argPrefix = arg.split('=')[0];
      return !modLoaderArgs.has(arg) && !modLoaderArgs.has(argPrefix);
    });
    
    return filteredArgs.join(' ');
  }
}