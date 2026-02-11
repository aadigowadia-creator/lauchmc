import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { UserProfile, VersionMetadata, LibraryInfo, AuthenticationData } from '../models';

export interface LaunchCommand {
  executable: string;
  args: string[];
  workingDirectory: string;
  environment: { [key: string]: string };
}

export interface LaunchConfiguration {
  profile: UserProfile;
  versionMetadata: VersionMetadata;
  authData: AuthenticationData;
  javaPath: string;
  gameDirectory: string;
  assetsDirectory: string;
  librariesDirectory: string;
  nativesDirectory: string;
}

export class LaunchCommandBuilder {
  private static instance: LaunchCommandBuilder;

  public static getInstance(): LaunchCommandBuilder {
    if (!LaunchCommandBuilder.instance) {
      LaunchCommandBuilder.instance = new LaunchCommandBuilder();
    }
    return LaunchCommandBuilder.instance;
  }

  /**
   * Validate launch configuration before building command
   */
  public validateLaunchConfiguration(config: LaunchConfiguration): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate required fields
    if (!config.profile) {
      errors.push('Profile is required');
    }
    if (!config.versionMetadata) {
      errors.push('Version metadata is required');
    }
    if (!config.authData) {
      errors.push('Authentication data is required');
    }
    if (!config.javaPath) {
      errors.push('Java path is required');
    }

    // Validate directories
    if (!config.gameDirectory) {
      errors.push('Game directory is required');
    }
    if (!config.assetsDirectory) {
      errors.push('Assets directory is required');
    }
    if (!config.librariesDirectory) {
      errors.push('Libraries directory is required');
    }
    if (!config.nativesDirectory) {
      errors.push('Natives directory is required');
    }

    // Validate profile settings
    if (config.profile) {
      if (config.profile.memoryMin < 512) {
        errors.push('Minimum memory must be at least 512 MB');
      }
      if (config.profile.memoryMax < config.profile.memoryMin) {
        errors.push('Maximum memory must be greater than minimum memory');
      }
    }

    // Validate version metadata
    if (config.versionMetadata && !config.versionMetadata.mainClass) {
      errors.push('Version metadata must include main class');
    }

    // Validate authentication
    if (config.authData) {
      if (!config.authData.accessToken) {
        errors.push('Access token is required');
      }
      if (!config.authData.userProfile?.id) {
        errors.push('User profile ID is required');
      }
      if (!config.authData.userProfile?.name) {
        errors.push('User profile name is required');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Build complete Java launch command for Minecraft
   */
  public buildLaunchCommand(config: LaunchConfiguration): LaunchCommand {
    // Validate configuration first
    const validation = this.validateLaunchConfiguration(config);
    if (!validation.isValid) {
      throw new Error(`Launch configuration validation failed: ${validation.errors.join(', ')}`);
    }

    const { profile, versionMetadata, authData, javaPath } = config;

    // Build JVM arguments
    const jvmArgs = this.buildJvmArguments(config);
    
    // Build classpath
    const classpath = this.buildClasspath(config);
    
    // Build game arguments
    const gameArgs = this.buildGameArguments(config);

    // Get main class (may be modified by mod loaders)
    const mainClass = this.getMainClass(config);

    // Combine all arguments
    const args = [
      ...jvmArgs,
      '-cp',
      classpath,
      mainClass,
      ...gameArgs
    ];

    return {
      executable: javaPath,
      args,
      workingDirectory: config.gameDirectory,
      environment: this.buildEnvironmentVariables(config)
    };
  }

  /**
   * Build launch command specifically for vanilla Minecraft
   */
  public buildVanillaLaunchCommand(config: LaunchConfiguration): LaunchCommand {
    // Ensure no mod loader is set for vanilla
    const vanillaConfig = {
      ...config,
      profile: {
        ...config.profile,
        modLoader: undefined
      }
    };

    return this.buildLaunchCommand(vanillaConfig);
  }

  /**
   * Build launch command specifically for modded Minecraft
   */
  public buildModdedLaunchCommand(config: LaunchConfiguration, modLoader: { type: 'forge' | 'fabric' | 'quilt'; version: string }): LaunchCommand {
    // Ensure mod loader is set
    const moddedConfig = {
      ...config,
      profile: {
        ...config.profile,
        modLoader
      }
    };

    return this.buildLaunchCommand(moddedConfig);
  }

  /**
   * Build launch command with custom JVM arguments
   */
  public buildCustomLaunchCommand(config: LaunchConfiguration, customJvmArgs: string[]): LaunchCommand {
    // Add custom JVM arguments to profile
    const customConfig = {
      ...config,
      profile: {
        ...config.profile,
        jvmArgs: [...customJvmArgs, config.profile.jvmArgs].join(' ')
      }
    };

    return this.buildLaunchCommand(customConfig);
  }

  /**
   * Get main class (may be modified by mod loaders)
   */
  private getMainClass(config: LaunchConfiguration): string {
    const { profile, versionMetadata } = config;

    // Check if mod loader modifies the main class
    if (profile.modLoader) {
      switch (profile.modLoader.type) {
        case 'forge':
          // Forge main class depends on Minecraft version
          return this.getForgeMainClass(versionMetadata.id);
        
        case 'fabric':
          // Fabric uses its own launcher
          return 'net.fabricmc.loader.impl.launch.knot.KnotClient';
        
        case 'quilt':
          // Quilt uses its own launcher
          return 'org.quiltmc.loader.impl.launch.knot.KnotClient';
        
        default:
          // Unknown mod loader, use vanilla main class
          return versionMetadata.mainClass;
      }
    }

    // Use vanilla main class
    return versionMetadata.mainClass;
  }

  /**
   * Get the correct Forge main class based on Minecraft version
   */
  private getForgeMainClass(minecraftVersion: string): string {
    // Extract base version from modded versions (e.g., "1.12.2-forge-14.23.5.2847" -> "1.12.2")
    let baseVersion = minecraftVersion;
    if (minecraftVersion.includes('-')) {
      const parts = minecraftVersion.split('-');
      baseVersion = parts[0];
    }
    
    // Parse version numbers
    const versionParts = baseVersion.split('.');
    if (versionParts.length >= 2) {
      const major = parseInt(versionParts[0], 10);
      const minor = parseInt(versionParts[1], 10);
      const patch = versionParts.length >= 3 ? parseInt(versionParts[2], 10) : 0;
      
      // Minecraft 1.13+ uses the new Forge launcher
      if (major === 1 && minor >= 13) {
        return 'net.minecraftforge.fml.loading.FMLClientLaunchProvider';
      }
      
      // Minecraft 1.12.2 and earlier use the legacy Forge launcher
      if (major === 1 && minor <= 12) {
        return 'net.minecraft.launchwrapper.Launch';
      }
    }
    
    // Default to legacy launcher for unknown versions
    return 'net.minecraft.launchwrapper.Launch';
  }

  /**
   * Build JVM arguments including memory settings and profile-specific args
   */
  private buildJvmArguments(config: LaunchConfiguration): string[] {
    const { profile, versionMetadata } = config;
    const args: string[] = [];

    // Memory settings
    args.push(`-Xms${profile.memoryMin}M`);
    args.push(`-Xmx${profile.memoryMax}M`);

    // Default JVM arguments for Minecraft
    args.push(`-Djava.library.path=${config.nativesDirectory}`);
    args.push('-Dminecraft.launcher.brand=minecraft-launcher');
    args.push('-Dminecraft.launcher.version=1.0.0');

    // For older Minecraft versions (1.8.9), ensure LWJGL can find natives
    if (this.isLegacyMinecraftVersion(versionMetadata.id)) {
      // Add additional library path arguments for LWJGL 2.9.x
      args.push(`-Dorg.lwjgl.librarypath=${config.nativesDirectory}`);
      args.push(`-Dnet.java.games.input.librarypath=${config.nativesDirectory}`);
    }

    // Version-specific JVM arguments
    if (versionMetadata.arguments?.jvm) {
      const resolvedJvmArgs = this.resolveArguments(
        versionMetadata.arguments.jvm,
        config
      );
      args.push(...resolvedJvmArgs);
    }

    // Logging configuration
    if (versionMetadata.logging?.client) {
      const loggingConfig = versionMetadata.logging.client;
      args.push(loggingConfig.argument);
      args.push('-Dlog4j.configurationFile=' + path.join(config.gameDirectory, 'log4j2.xml'));
    }

    // Profile-specific JVM arguments
    if (profile.jvmArgs) {
      const profileJvmArgs = profile.jvmArgs.split(' ').filter(arg => arg.trim());
      args.push(...profileJvmArgs);
    }

    // Mod loader specific arguments
    if (profile.modLoader) {
      args.push(...this.getModLoaderJvmArgs(profile.modLoader, config));
    }

    return args;
  }

  /**
   * Build classpath including game jar and libraries
   */
  private buildClasspath(config: LaunchConfiguration): string {
    const { versionMetadata } = config;
    const classpathEntries: string[] = [];

    // Get the Minecraft root directory (where versions are actually stored)
    const minecraftRoot = this.getMinecraftRootDirectory(config.gameDirectory);

    // Add main game jar (always in the root .minecraft/versions directory)
    const gameJarPath = path.join(
      minecraftRoot,
      'versions',
      versionMetadata.id,
      `${versionMetadata.id}.jar`
    );
    classpathEntries.push(gameJarPath);

    // Add libraries
    for (const library of versionMetadata.libraries) {
      if (this.shouldIncludeLibrary(library)) {
        const libraryPath = this.getLibraryPath(library, config.librariesDirectory);
        if (libraryPath) {
          classpathEntries.push(libraryPath);
        }
      }
    }

    // Mod loader classpath modifications
    if (config.profile.modLoader) {
      const modLoaderClasspath = this.getModLoaderClasspath(config.profile.modLoader, config);
      classpathEntries.push(...modLoaderClasspath);
    }

    return classpathEntries.join(path.delimiter);
  }

  /**
   * Build game arguments including authentication and game settings
   */
  private buildGameArguments(config: LaunchConfiguration): string[] {
    const { profile, versionMetadata, authData } = config;
    const args: string[] = [];

    // Use modern arguments format if available, fallback to legacy
    if (versionMetadata.arguments?.game) {
      const resolvedGameArgs = this.resolveArguments(
        versionMetadata.arguments.game,
        config
      );
      args.push(...resolvedGameArgs);
    } else if (versionMetadata.minecraftArguments) {
      // Legacy format - replace placeholders manually
      const legacyArgs = this.resolveLegacyArguments(
        versionMetadata.minecraftArguments,
        config
      );
      args.push(...legacyArgs);
    }

    // Add authentication arguments if not already present
    if (!args.includes('--username')) {
      args.push('--username', this.escapeArgument(authData.userProfile.name));
    }
    if (!args.includes('--uuid')) {
      args.push('--uuid', this.escapeArgument(authData.userProfile.id));
    }
    if (!args.includes('--accessToken')) {
      args.push('--accessToken', this.escapeArgument(authData.accessToken));
    }

    // For legacy versions (1.8.9), add user properties as empty JSON to prevent parsing issues
    if (this.isLegacyMinecraftVersion(versionMetadata.id) && !args.includes('--userProperties')) {
      args.push('--userProperties', '{}');
    }

    // Add user type
    if (!args.includes('--userType')) {
      args.push('--userType', 'mojang');
    }

    // Add game directory
    if (!args.includes('--gameDir')) {
      args.push('--gameDir', this.escapePathArgument(config.gameDirectory));
    }

    // Add assets directory and index
    if (!args.includes('--assetsDir')) {
      args.push('--assetsDir', this.escapePathArgument(config.assetsDirectory));
    }
    if (!args.includes('--assetIndex')) {
      args.push('--assetIndex', this.escapeArgument(versionMetadata.assets));
    }

    // Add version info
    if (!args.includes('--version')) {
      args.push('--version', this.escapeArgument(versionMetadata.id));
    }

    // Add version type
    if (!args.includes('--versionType')) {
      args.push('--versionType', this.escapeArgument(versionMetadata.type));
    }

    // Mod loader specific game arguments
    if (profile.modLoader) {
      args.push(...this.getModLoaderGameArgs(profile.modLoader, config));
    }

    // Validate arguments for potential JSON issues
    this.validateGameArguments(args);

    return args;
  }

  /**
   * Validate game arguments to prevent JSON parsing issues
   */
  private validateGameArguments(args: string[]): void {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      // Skip validation for valid JSON objects
      if (arg === '{}' || arg === '[]') {
        continue;
      }
      
      // Check for potential JSON-like content that could cause issues
      if (arg.includes('{') || arg.includes('}')) {
        console.warn(`Potentially problematic argument detected: ${arg}`);
        // Remove JSON-like characters
        args[i] = arg.replace(/[{}]/g, '');
      }
      
      // Check for line breaks or control characters
      if (/[\r\n\t]/.test(arg)) {
        console.warn(`Argument contains control characters: ${arg}`);
        args[i] = arg.replace(/[\r\n\t]/g, '');
      }
      
      // Ensure arguments don't start with invalid characters
      if (arg.startsWith('{') || arg.startsWith('}')) {
        console.warn(`Argument starts with JSON character: ${arg}`);
        args[i] = arg.substring(1);
      }
    }
  }

  /**
   * Resolve argument templates with actual values
   */
  private resolveArguments(
    argumentTemplates: (string | { rules: any[]; value: string | string[] })[],
    config: LaunchConfiguration
  ): string[] {
    const resolvedArgs: string[] = [];

    for (const argTemplate of argumentTemplates) {
      if (typeof argTemplate === 'string') {
        resolvedArgs.push(this.resolveArgumentPlaceholders(argTemplate, config));
      } else {
        // Conditional argument based on rules
        if (this.evaluateRules(argTemplate.rules, config)) {
          const values = Array.isArray(argTemplate.value) 
            ? argTemplate.value 
            : [argTemplate.value];
          
          for (const value of values) {
            resolvedArgs.push(this.resolveArgumentPlaceholders(value, config));
          }
        }
      }
    }

    return resolvedArgs;
  }

  /**
   * Resolve legacy minecraft arguments format
   */
  private resolveLegacyArguments(
    minecraftArguments: string,
    config: LaunchConfiguration
  ): string[] {
    let resolved = minecraftArguments;
    
    // Replace common placeholders with escaped values
    resolved = resolved.replace(/\$\{auth_player_name\}/g, this.escapeArgument(config.authData.userProfile.name));
    resolved = resolved.replace(/\$\{version_name\}/g, this.escapeArgument(config.versionMetadata.id));
    resolved = resolved.replace(/\$\{game_directory\}/g, this.escapePathArgument(config.gameDirectory));
    resolved = resolved.replace(/\$\{assets_root\}/g, this.escapePathArgument(config.assetsDirectory));
    resolved = resolved.replace(/\$\{assets_index_name\}/g, this.escapeArgument(config.versionMetadata.assets));
    resolved = resolved.replace(/\$\{auth_uuid\}/g, this.escapeArgument(config.authData.userProfile.id));
    resolved = resolved.replace(/\$\{auth_access_token\}/g, this.escapeArgument(config.authData.accessToken));
    resolved = resolved.replace(/\$\{user_type\}/g, 'mojang');
    resolved = resolved.replace(/\$\{version_type\}/g, this.escapeArgument(config.versionMetadata.type));
    
    // Handle user properties placeholder - provide empty JSON for legacy versions
    resolved = resolved.replace(/\$\{user_properties\}/g, '{}');

    // Split arguments and filter out empty ones
    const args = resolved.split(' ').filter(arg => arg.trim());
    
    // Validate each argument
    return args.map(arg => {
      // Only remove JSON characters if they're not part of a valid JSON object
      if (arg === '{}') {
        // Keep empty JSON object as-is
        return arg;
      }
      // Remove any other potential JSON characters that could cause issues
      return arg.replace(/[{}]/g, '').replace(/[\r\n\t]/g, '').trim();
    }).filter(arg => arg.length > 0);
  }

  /**
   * Resolve argument placeholders with actual values
   */
  private resolveArgumentPlaceholders(argument: string, config: LaunchConfiguration): string {
    let resolved = argument;

    // Authentication placeholders - ensure proper escaping
    resolved = resolved.replace(/\$\{auth_player_name\}/g, this.escapeArgument(config.authData.userProfile.name));
    resolved = resolved.replace(/\$\{auth_uuid\}/g, this.escapeArgument(config.authData.userProfile.id));
    resolved = resolved.replace(/\$\{auth_access_token\}/g, this.escapeArgument(config.authData.accessToken));
    resolved = resolved.replace(/\$\{user_type\}/g, 'mojang');

    // Version placeholders
    resolved = resolved.replace(/\$\{version_name\}/g, this.escapeArgument(config.versionMetadata.id));
    resolved = resolved.replace(/\$\{version_type\}/g, this.escapeArgument(config.versionMetadata.type));

    // Directory placeholders - ensure proper path escaping
    resolved = resolved.replace(/\$\{game_directory\}/g, this.escapePathArgument(config.gameDirectory));
    resolved = resolved.replace(/\$\{assets_root\}/g, this.escapePathArgument(config.assetsDirectory));
    resolved = resolved.replace(/\$\{assets_index_name\}/g, this.escapeArgument(config.versionMetadata.assets));

    // Library path placeholder
    resolved = resolved.replace(/\$\{library_directory\}/g, this.escapePathArgument(config.librariesDirectory));
    resolved = resolved.replace(/\$\{natives_directory\}/g, this.escapePathArgument(config.nativesDirectory));

    // Launcher placeholders
    resolved = resolved.replace(/\$\{launcher_name\}/g, 'minecraft-launcher');
    resolved = resolved.replace(/\$\{launcher_version\}/g, '1.0.0');

    return resolved;
  }

  /**
   * Escape argument values to prevent JSON parsing issues
   */
  private escapeArgument(value: string): string {
    if (!value) return '';
    
    // Remove any characters that could cause JSON parsing issues
    return value
      .replace(/[\r\n\t]/g, '') // Remove line breaks and tabs
      .replace(/[{}]/g, '') // Remove curly braces that could be interpreted as JSON
      .trim();
  }

  /**
   * Escape path arguments for Windows compatibility
   */
  private escapePathArgument(path: string): string {
    if (!path) return '';
    
    // On Windows, ensure paths with spaces are handled correctly
    // Convert forward slashes to backslashes for consistency
    let escapedPath = path.replace(/\//g, '\\');
    
    // Remove any characters that could cause issues
    escapedPath = escapedPath.replace(/[\r\n\t]/g, '').trim();
    
    return escapedPath;
  }

  /**
   * Evaluate rules for conditional arguments
   */
  private evaluateRules(rules: any[], config: LaunchConfiguration): boolean {
    // If no rules, allow by default
    if (!rules || rules.length === 0) {
      return true;
    }
    
    let allowed = false; // Start with disallow
    
    for (const rule of rules) {
      const action = rule.action;
      let matches = true;

      // Check OS rules
      if (rule.os) {
        if (rule.os.name && !this.matchesOS(rule.os.name)) {
          matches = false;
        }
        if (rule.os.version && !this.matchesOSVersion(rule.os.version)) {
          matches = false;
        }
        if (rule.os.arch && !this.matchesArchitecture(rule.os.arch)) {
          matches = false;
        }
      }

      // Check feature rules
      if (rule.features) {
        for (const [feature, required] of Object.entries(rule.features)) {
          const hasFeature = this.hasFeature(feature, config);
          if (hasFeature !== required) {
            matches = false;
          }
        }
      }

      // Apply rule result
      if (matches) {
        if (action === 'allow') {
          allowed = true;
        } else if (action === 'disallow') {
          return false; // Explicit disallow
        }
      }
    }

    return allowed;
  }

  /**
   * Get the root Minecraft directory from an installation path
   * Handles both root .minecraft and profile-specific subdirectories
   */
  private getMinecraftRootDirectory(installationDir: string): string {
    // If the path contains 'profiles', extract the root .minecraft directory
    if (installationDir.includes(path.sep + 'profiles' + path.sep)) {
      const parts = installationDir.split(path.sep);
      const profilesIndex = parts.indexOf('profiles');
      if (profilesIndex > 0) {
        return parts.slice(0, profilesIndex).join(path.sep);
      }
    }
    
    // If it's already the root directory or doesn't contain profiles, return as-is
    return installationDir;
  }

  /**
   * Check if library should be included based on rules
   */
  private shouldIncludeLibrary(library: LibraryInfo): boolean {
    if (!library.rules) {
      return true;
    }

    for (const rule of library.rules) {
      let matches = true;

      if (rule.os) {
        if (rule.os.name && !this.matchesOS(rule.os.name)) {
          matches = false;
        }
        if (rule.os.arch && !this.matchesArchitecture(rule.os.arch)) {
          matches = false;
        }
      }

      if (matches) {
        return rule.action === 'allow';
      }
    }

    return true;
  }

  /**
   * Get library file path
   */
  private getLibraryPath(library: LibraryInfo, librariesDir: string): string | null {
    // Parse library name (e.g., "org.lwjgl:lwjgl:3.2.2" or "org.ow2.asm:asm:9.7")
    const nameParts = library.name.split(':');
    if (nameParts.length < 3) {
      return null; // Invalid library name format
    }
    
    const [group, name, version] = nameParts;
    const groupPath = group.replace(/\./g, path.sep);
    
    // Construct the standard Maven repository path
    return path.join(
      librariesDir,
      groupPath,
      name,
      version,
      `${name}-${version}.jar`
    );
  }

  /**
   * Get mod loader specific JVM arguments
   */
  private getModLoaderJvmArgs(
    modLoader: { type: string; version: string },
    config: LaunchConfiguration
  ): string[] {
    const args: string[] = [];

    switch (modLoader.type) {
      case 'forge':
        args.push('-Dfml.ignoreInvalidMinecraftCertificates=true');
        args.push('-Dfml.ignorePatchDiscrepancies=true');
        args.push('-Djava.net.preferIPv4Stack=true');
        // Add Forge-specific library path
        args.push(`-Dforge.logging.markers=REGISTRIES`);
        args.push(`-Dforge.logging.console.level=debug`);
        break;
      
      case 'fabric':
        args.push('-Dfabric.development=false');
        args.push(`-Dfabric.gameJarPath=${config.gameDirectory}`);
        break;
      
      case 'quilt':
        args.push('-Dquilt.development=false');
        args.push(`-Dquilt.gameJarPath=${config.gameDirectory}`);
        break;
    }

    return args;
  }

  /**
   * Get mod loader specific game arguments
   */
  private getModLoaderGameArgs(
    modLoader: { type: string; version: string },
    config: LaunchConfiguration
  ): string[] {
    const args: string[] = [];

    switch (modLoader.type) {
      case 'forge':
        // Forge arguments depend on Minecraft version
        const isLegacyForge = this.isLegacyForgeVersion(config.versionMetadata.id);
        
        if (isLegacyForge) {
          // Legacy Forge (1.12.2 and earlier) uses LaunchWrapper
          args.push('--tweakClass', 'net.minecraftforge.fml.common.launcher.FMLTweaker');
        } else {
          // Modern Forge (1.13+) uses FML loading
          args.push('--fml.forgeVersion', modLoader.version);
          args.push('--fml.mcVersion', config.versionMetadata.id);
        }
        break;
      
      case 'fabric':
        // Fabric uses a different main class but may need additional args
        args.push('--fabric');
        break;
      
      case 'quilt':
        // Quilt uses a different main class but may need additional args  
        args.push('--quilt');
        break;
    }

    return args;
  }

  /**
   * Check if this Minecraft version uses legacy Forge (LaunchWrapper)
   */
  private isLegacyForgeVersion(minecraftVersion: string): boolean {
    // Extract base version from modded versions
    let baseVersion = minecraftVersion;
    if (minecraftVersion.includes('-')) {
      const parts = minecraftVersion.split('-');
      baseVersion = parts[0];
    }
    
    // Parse version numbers
    const versionParts = baseVersion.split('.');
    if (versionParts.length >= 2) {
      const major = parseInt(versionParts[0], 10);
      const minor = parseInt(versionParts[1], 10);
      
      // Minecraft 1.12.2 and earlier use legacy Forge
      if (major === 1 && minor <= 12) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get mod loader specific classpath entries
   */
  private getModLoaderClasspath(
    modLoader: { type: string; version: string },
    config: LaunchConfiguration
  ): string[] {
    const classpathEntries: string[] = [];

    switch (modLoader.type) {
      case 'forge':
        // For Forge, we need to read the Forge JSON profile to get the correct libraries
        // Modern Forge installations define their libraries in the JSON profile
        const mcVersion = config.versionMetadata.id.split('-')[0]; // Extract base version like "1.12.2"
        const forgeProfilePath = path.join(
          this.getMinecraftRootDirectory(config.gameDirectory),
          'versions',
          `${mcVersion}-forge-${modLoader.version}`,
          `${mcVersion}-forge-${modLoader.version}.json`
        );
        
        try {
          // Read the Forge profile JSON to get the libraries
          const forgeProfileData = JSON.parse(fs.readFileSync(forgeProfilePath, 'utf8'));
          
          // Add all libraries from the Forge profile
          if (forgeProfileData.libraries) {
            for (const library of forgeProfileData.libraries) {
              if (this.shouldIncludeLibrary(library)) {
                const libraryPath = this.getLibraryPath(library, config.librariesDirectory);
                if (libraryPath) {
                  classpathEntries.push(libraryPath);
                }
              }
            }
          }
          
          console.log(`Added ${classpathEntries.length} Forge libraries to classpath`);
        } catch (error) {
          console.error(`Failed to read Forge profile: ${forgeProfilePath}`, error);
          // Fallback to old method if JSON reading fails
          const forgeLibraryPath = path.join(
            config.librariesDirectory,
            'net', 'minecraftforge', 'forge',
            `${config.versionMetadata.id}-${modLoader.version}`,
            `forge-${config.versionMetadata.id}-${modLoader.version}.jar`
          );
          classpathEntries.push(forgeLibraryPath);
        }
        break;
      
      case 'fabric':
        // Fabric loader jar
        const fabricLoaderPath = path.join(
          config.librariesDirectory,
          'net', 'fabricmc', 'fabric-loader',
          modLoader.version,
          `fabric-loader-${modLoader.version}.jar`
        );
        classpathEntries.push(fabricLoaderPath);
        
        // Fabric intermediary
        const fabricIntermediaryPath = path.join(
          config.librariesDirectory,
          'net', 'fabricmc', 'intermediary',
          config.versionMetadata.id,
          `intermediary-${config.versionMetadata.id}.jar`
        );
        classpathEntries.push(fabricIntermediaryPath);
        break;
      
      case 'quilt':
        // Quilt loader jar
        const quiltLoaderPath = path.join(
          config.librariesDirectory,
          'org', 'quiltmc', 'quilt-loader',
          modLoader.version,
          `quilt-loader-${modLoader.version}.jar`
        );
        classpathEntries.push(quiltLoaderPath);
        break;
    }

    return classpathEntries;
  }

  /**
   * Build environment variables for the game process
   */
  private buildEnvironmentVariables(config: LaunchConfiguration): { [key: string]: string } {
    const env: { [key: string]: string } = {
      // Inherit system environment
      ...process.env,
      
      // Minecraft-specific environment
      MINECRAFT_LAUNCHER_BRAND: 'minecraft-launcher',
      MINECRAFT_LAUNCHER_VERSION: '1.0.0',
    };

    // Add mod loader specific environment variables
    if (config.profile.modLoader) {
      switch (config.profile.modLoader.type) {
        case 'forge':
          env.FORGE_VERSION = config.profile.modLoader.version;
          break;
        case 'fabric':
          env.FABRIC_VERSION = config.profile.modLoader.version;
          break;
        case 'quilt':
          env.QUILT_VERSION = config.profile.modLoader.version;
          break;
      }
    }

    return env;
  }

  // Helper methods for rule evaluation

  private matchesOS(osName: string): boolean {
    const platform = process.platform;
    
    switch (osName.toLowerCase()) {
      case 'windows':
        return platform === 'win32';
      case 'osx':
      case 'macos':
        return platform === 'darwin';
      case 'linux':
        return platform === 'linux';
      default:
        return false;
    }
  }

  private matchesOSVersion(versionPattern: string): boolean {
    // Simplified OS version matching
    // In a real implementation, you'd check actual OS version against the pattern
    const osRelease = os.release();
    
    // Basic pattern matching - this could be enhanced for more complex patterns
    if (versionPattern.includes('*')) {
      // Wildcard matching
      const pattern = versionPattern.replace(/\*/g, '.*');
      const regex = new RegExp(pattern);
      return regex.test(osRelease);
    }
    
    // Exact match
    return osRelease === versionPattern;
  }

  private matchesArchitecture(arch: string): boolean {
    const systemArch = os.arch();
    
    switch (arch.toLowerCase()) {
      case 'x86':
        return systemArch === 'ia32';
      case 'x86_64':
      case 'amd64':
        return systemArch === 'x64';
      case 'arm64':
        return systemArch === 'arm64';
      default:
        return false;
    }
  }

  private hasFeature(feature: string, config: LaunchConfiguration): boolean {
    // Check for specific features
    switch (feature) {
      case 'is_demo_user':
        return false; // Assume not demo user
      case 'has_custom_resolution':
        return false; // No custom resolution support yet
      default:
        return false;
    }
  }

  /**
   * Check if this is a legacy Minecraft version that needs special LWJGL handling
   */
  private isLegacyMinecraftVersion(versionId: string): boolean {
    // Extract base version from modded versions
    let baseVersion = versionId;
    if (versionId.includes('-')) {
      const parts = versionId.split('-');
      baseVersion = parts[0];
    }
    
    // Minecraft 1.12.2 and earlier use LWJGL 2.9.x
    const versionParts = baseVersion.split('.');
    if (versionParts.length >= 2) {
      const major = parseInt(versionParts[0], 10);
      const minor = parseInt(versionParts[1], 10);
      
      if (major === 1 && minor <= 12) {
        return true;
      }
    }
    
    return false;
  }
}