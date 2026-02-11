import { ForgeSettingsRepository } from '../repositories/forge-settings-repository';
import { 
  ForgeOptiFineSettings, 
  ForgeModManagementSettings, 
  ForgeProfileSettings 
} from '../models';
import * as path from 'path';
import * as os from 'os';

export class ForgeSettingsService {
  private repository: ForgeSettingsRepository;

  constructor() {
    this.repository = new ForgeSettingsRepository();
  }

  // OptiFine Settings Management

  /**
   * Get OptiFine settings with defaults
   */
  public async getOptiFineSettings(): Promise<ForgeOptiFineSettings> {
    const defaults: ForgeOptiFineSettings = {
      autoDownload: true,
      defaultEnabled: true,
      preferredVersion: 'recommended',
      specificVersion: undefined,
      enableShaders: true,
      enableConnectedTextures: true,
      enableCustomSky: true,
      enableNaturalTextures: true,
      enableRandomEntities: true,
      enableBetterGrass: true,
      enableBetterSnow: true,
      enableCustomColors: true,
      enableCustomFonts: true,
      enableCustomGUI: true,
      enableCustomItems: true,
      enableCustomModels: true,
      enableDynamicLights: true
    };

    const settings = await this.repository.getSettingsByPrefix('optifine.');
    const result = { ...defaults };

    for (const setting of settings) {
      const key = setting.settingKey.replace('optifine.', '') as keyof ForgeOptiFineSettings;
      if (key in result) {
        (result as any)[key] = this.repository['convertSettingValue'](setting, defaults[key]);
      }
    }

    return result;
  }

  /**
   * Update OptiFine settings
   */
  public async updateOptiFineSettings(settings: Partial<ForgeOptiFineSettings>): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined) {
        await this.repository.setSettingValue(
          `optifine.${key}`,
          value,
          this.getOptiFineSettingDescription(key)
        );
      }
    }
  }

  /**
   * Reset OptiFine settings to defaults
   */
  public async resetOptiFineSettings(): Promise<void> {
    await this.repository.deleteSettingsByPrefix('optifine.');
  }

  // Mod Management Settings

  /**
   * Get mod management settings with defaults
   */
  public async getModManagementSettings(): Promise<ForgeModManagementSettings> {
    const defaults: ForgeModManagementSettings = {
      autoUpdateMods: false,
      checkCompatibility: true,
      enableModRecommendations: true,
      autoBackupMods: true,
      maxBackupCount: 5,
      showModDescriptions: true,
      sortModsBy: 'name',
      defaultModsDirectory: this.getDefaultModsDirectory(),
      enableModCategories: true,
      autoCleanDisabledMods: false,
      warnOnIncompatibleMods: true
    };

    const settings = await this.repository.getSettingsByPrefix('modManagement.');
    const result = { ...defaults };

    for (const setting of settings) {
      const key = setting.settingKey.replace('modManagement.', '') as keyof ForgeModManagementSettings;
      if (key in result) {
        (result as any)[key] = this.repository['convertSettingValue'](setting, defaults[key]);
      }
    }

    return result;
  }

  /**
   * Update mod management settings
   */
  public async updateModManagementSettings(settings: Partial<ForgeModManagementSettings>): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined) {
        await this.repository.setSettingValue(
          `modManagement.${key}`,
          value,
          this.getModManagementSettingDescription(key)
        );
      }
    }
  }

  /**
   * Reset mod management settings to defaults
   */
  public async resetModManagementSettings(): Promise<void> {
    await this.repository.deleteSettingsByPrefix('modManagement.');
  }

  // Profile Settings

  /**
   * Get profile settings with defaults
   */
  public async getProfileSettings(): Promise<ForgeProfileSettings> {
    const defaults: ForgeProfileSettings = {
      defaultForgeVersion: 'recommended',
      specificForgeVersion: undefined,
      autoInstallForge: true,
      enableForgeLogging: false,
      forgeLogLevel: 'info',
      enableModLoadingProgress: true,
      skipForgeUpdateCheck: false,
      forgeInstallTimeout: 300000, // 5 minutes
      enableForgeMetrics: false
    };

    const settings = await this.repository.getSettingsByPrefix('profile.');
    const result = { ...defaults };

    for (const setting of settings) {
      const key = setting.settingKey.replace('profile.', '') as keyof ForgeProfileSettings;
      if (key in result) {
        (result as any)[key] = this.repository['convertSettingValue'](setting, defaults[key]);
      }
    }

    return result;
  }

  /**
   * Update profile settings
   */
  public async updateProfileSettings(settings: Partial<ForgeProfileSettings>): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined) {
        await this.repository.setSettingValue(
          `profile.${key}`,
          value,
          this.getProfileSettingDescription(key)
        );
      }
    }
  }

  /**
   * Reset profile settings to defaults
   */
  public async resetProfileSettings(): Promise<void> {
    await this.repository.deleteSettingsByPrefix('profile.');
  }

  // General Settings Management

  /**
   * Get all Forge settings
   */
  public async getAllForgeSettings(): Promise<{
    optifine: ForgeOptiFineSettings;
    modManagement: ForgeModManagementSettings;
    profile: ForgeProfileSettings;
  }> {
    const [optifine, modManagement, profile] = await Promise.all([
      this.getOptiFineSettings(),
      this.getModManagementSettings(),
      this.getProfileSettings()
    ]);

    return { optifine, modManagement, profile };
  }

  /**
   * Reset all Forge settings to defaults
   */
  public async resetAllSettings(): Promise<void> {
    await Promise.all([
      this.resetOptiFineSettings(),
      this.resetModManagementSettings(),
      this.resetProfileSettings()
    ]);
  }

  /**
   * Export settings to JSON
   */
  public async exportSettings(): Promise<string> {
    const settings = await this.getAllForgeSettings();
    return JSON.stringify(settings, null, 2);
  }

  /**
   * Import settings from JSON
   */
  public async importSettings(jsonData: string): Promise<void> {
    try {
      const settings = JSON.parse(jsonData);
      
      if (settings.optifine) {
        await this.updateOptiFineSettings(settings.optifine);
      }
      
      if (settings.modManagement) {
        await this.updateModManagementSettings(settings.modManagement);
      }
      
      if (settings.profile) {
        await this.updateProfileSettings(settings.profile);
      }
    } catch (error) {
      throw new Error(`Failed to import settings: ${error}`);
    }
  }

  /**
   * Validate settings configuration
   */
  public async validateSettings(): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    try {
      const settings = await this.getAllForgeSettings();
      
      // Validate mod management settings
      if (settings.modManagement.maxBackupCount < 1 || settings.modManagement.maxBackupCount > 50) {
        errors.push('Max backup count must be between 1 and 50');
      }
      
      if (!['name', 'date', 'size', 'status'].includes(settings.modManagement.sortModsBy)) {
        errors.push('Invalid sort option for mods');
      }
      
      // Validate profile settings
      if (settings.profile.forgeInstallTimeout < 30000 || settings.profile.forgeInstallTimeout > 600000) {
        errors.push('Forge install timeout must be between 30 seconds and 10 minutes');
      }
      
      if (!['debug', 'info', 'warn', 'error'].includes(settings.profile.forgeLogLevel)) {
        errors.push('Invalid Forge log level');
      }
      
      // Validate OptiFine settings
      if (!['latest', 'recommended', 'specific'].includes(settings.optifine.preferredVersion)) {
        errors.push('Invalid OptiFine version preference');
      }
      
      if (settings.optifine.preferredVersion === 'specific' && !settings.optifine.specificVersion) {
        errors.push('Specific OptiFine version must be provided when preference is set to specific');
      }
      
    } catch (error) {
      errors.push(`Settings validation failed: ${error}`);
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Private helper methods

  private getDefaultModsDirectory(): string {
    const homeDir = os.homedir();
    
    switch (process.platform) {
      case 'win32':
        return path.join(homeDir, 'AppData', 'Roaming', '.minecraft', 'mods');
      case 'darwin':
        return path.join(homeDir, 'Library', 'Application Support', 'minecraft', 'mods');
      default:
        return path.join(homeDir, '.minecraft', 'mods');
    }
  }

  private getOptiFineSettingDescription(key: string): string {
    const descriptions: Record<string, string> = {
      autoDownload: 'Automatically download OptiFine when creating Forge profiles',
      defaultEnabled: 'Enable OptiFine by default in new Forge profiles',
      preferredVersion: 'Preferred OptiFine version selection strategy',
      specificVersion: 'Specific OptiFine version to use when preference is set to specific',
      enableShaders: 'Enable shader support in OptiFine',
      enableConnectedTextures: 'Enable connected textures feature',
      enableCustomSky: 'Enable custom sky rendering',
      enableNaturalTextures: 'Enable natural texture variations',
      enableRandomEntities: 'Enable random entity textures',
      enableBetterGrass: 'Enable better grass rendering',
      enableBetterSnow: 'Enable better snow rendering',
      enableCustomColors: 'Enable custom color support',
      enableCustomFonts: 'Enable custom font support',
      enableCustomGUI: 'Enable custom GUI elements',
      enableCustomItems: 'Enable custom item textures',
      enableCustomModels: 'Enable custom block/item models',
      enableDynamicLights: 'Enable dynamic lighting effects'
    };
    
    return descriptions[key] || `OptiFine setting: ${key}`;
  }

  private getModManagementSettingDescription(key: string): string {
    const descriptions: Record<string, string> = {
      autoUpdateMods: 'Automatically check for and update mods',
      checkCompatibility: 'Check mod compatibility before installation',
      enableModRecommendations: 'Show recommended mods based on current setup',
      autoBackupMods: 'Automatically backup mods before updates',
      maxBackupCount: 'Maximum number of mod backups to keep',
      showModDescriptions: 'Display mod descriptions in the interface',
      sortModsBy: 'Default sorting method for mod lists',
      defaultModsDirectory: 'Default directory for storing mods',
      enableModCategories: 'Enable mod categorization features',
      autoCleanDisabledMods: 'Automatically clean up disabled mod files',
      warnOnIncompatibleMods: 'Show warnings for incompatible mods'
    };
    
    return descriptions[key] || `Mod management setting: ${key}`;
  }

  private getProfileSettingDescription(key: string): string {
    const descriptions: Record<string, string> = {
      defaultForgeVersion: 'Default Forge version selection strategy',
      specificForgeVersion: 'Specific Forge version to use when preference is set to specific',
      autoInstallForge: 'Automatically install Forge when creating profiles',
      enableForgeLogging: 'Enable detailed Forge logging',
      forgeLogLevel: 'Forge logging verbosity level',
      enableModLoadingProgress: 'Show progress during mod loading',
      skipForgeUpdateCheck: 'Skip checking for Forge updates',
      forgeInstallTimeout: 'Timeout for Forge installation process (milliseconds)',
      enableForgeMetrics: 'Enable Forge performance metrics collection'
    };
    
    return descriptions[key] || `Profile setting: ${key}`;
  }
}