import * as path from 'path';
import * as os from 'os';
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
          // Forge typically uses its own main class
          return 'net.minecraftforge.fml.loading.FMLClientLaunchProvider';
        
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
   * Build JVM arguments including memory settings and profile-specific args
   */
  private buildJvmArguments(config: LaunchConfiguration): string[] {
    const { profile, versionMetadata } = config;
    const args: string[] = [];

    // Memory settings
    args.push(`-Xms${profile.memoryMin}M`);
    args.push(`-Xmx${profile.memoryMax}M`);

    // Default JVM arguments for Minecraft
    args.push('-Djava.library.path=' + config.nativesDirectory);
    args.push('-Dminecraft.launcher.brand=minecraft-launcher');
    args.push('-Dminecraft.launcher.version=1.0.0');

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

    // Add main game jar
    const gameJarPath = path.join(
      config.gameDirectory,
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
      args.push('--username', authData.userProfile.name);
    }
    if (!args.includes('--uuid')) {
      args.push('--uuid', authData.userProfile.id);
    }
    if (!args.includes('--accessToken')) {
      args.push('--accessToken', authData.accessToken);
    }

    // Add game directory
    if (!args.includes('--gameDir')) {
      args.push('--gameDir', config.gameDirectory);
    }

    // Add assets directory and index
    if (!args.includes('--assetsDir')) {
      args.push('--assetsDir', config.assetsDirectory);
    }
    if (!args.includes('--assetIndex')) {
      args.push('--assetIndex', versionMetadata.assets);
    }

    // Add version info
    if (!args.includes('--version')) {
      args.push('--version', versionMetadata.id);
    }

    // Mod loader specific game arguments
    if (profile.modLoader) {
      args.push(...this.getModLoaderGameArgs(profile.modLoader, config));
    }

    return args;
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
    
    // Replace common placeholders
    resolved = resolved.replace(/\$\{auth_player_name\}/g, config.authData.userProfile.name);
    resolved = resolved.replace(/\$\{version_name\}/g, config.versionMetadata.id);
    resolved = resolved.replace(/\$\{game_directory\}/g, config.gameDirectory);
    resolved = resolved.replace(/\$\{assets_root\}/g, config.assetsDirectory);
    resolved = resolved.replace(/\$\{assets_index_name\}/g, config.versionMetadata.assets);
    resolved = resolved.replace(/\$\{auth_uuid\}/g, config.authData.userProfile.id);
    resolved = resolved.replace(/\$\{auth_access_token\}/g, config.authData.accessToken);
    resolved = resolved.replace(/\$\{user_type\}/g, 'mojang');
    resolved = resolved.replace(/\$\{version_type\}/g, config.versionMetadata.type);

    return resolved.split(' ').filter(arg => arg.trim());
  }

  /**
   * Resolve argument placeholders with actual values
   */
  private resolveArgumentPlaceholders(argument: string, config: LaunchConfiguration): string {
    let resolved = argument;

    // Authentication placeholders
    resolved = resolved.replace(/\$\{auth_player_name\}/g, config.authData.userProfile.name);
    resolved = resolved.replace(/\$\{auth_uuid\}/g, config.authData.userProfile.id);
    resolved = resolved.replace(/\$\{auth_access_token\}/g, config.authData.accessToken);
    resolved = resolved.replace(/\$\{user_type\}/g, 'mojang');

    // Version placeholders
    resolved = resolved.replace(/\$\{version_name\}/g, config.versionMetadata.id);
    resolved = resolved.replace(/\$\{version_type\}/g, config.versionMetadata.type);

    // Directory placeholders
    resolved = resolved.replace(/\$\{game_directory\}/g, config.gameDirectory);
    resolved = resolved.replace(/\$\{assets_root\}/g, config.assetsDirectory);
    resolved = resolved.replace(/\$\{assets_index_name\}/g, config.versionMetadata.assets);

    // Library path placeholder
    resolved = resolved.replace(/\$\{library_directory\}/g, config.librariesDirectory);
    resolved = resolved.replace(/\$\{natives_directory\}/g, config.nativesDirectory);

    // Launcher placeholders
    resolved = resolved.replace(/\$\{launcher_name\}/g, 'minecraft-launcher');
    resolved = resolved.replace(/\$\{launcher_version\}/g, '1.0.0');

    return resolved;
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
    if (!library.downloads.artifact) {
      return null;
    }

    // Parse library name (e.g., "org.lwjgl:lwjgl:3.2.2")
    const [group, name, version] = library.name.split(':');
    const groupPath = group.replace(/\./g, path.sep);
    
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
        // Forge typically modifies the main class and arguments through its installer
        // Add any Forge-specific game arguments here
        args.push('--fml.forgeVersion', modLoader.version);
        args.push('--fml.mcVersion', config.versionMetadata.id);
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
   * Get mod loader specific classpath entries
   */
  private getModLoaderClasspath(
    modLoader: { type: string; version: string },
    config: LaunchConfiguration
  ): string[] {
    const classpathEntries: string[] = [];

    // Add mod loader libraries to classpath
    const modLoaderLibrariesDir = path.join(config.librariesDirectory, 'net');
    
    switch (modLoader.type) {
      case 'forge':
        // Forge libraries are typically in libraries directory under net/minecraftforge
        const forgeLibraryPath = path.join(
          config.librariesDirectory,
          'net', 'minecraftforge', 'forge',
          `${config.versionMetadata.id}-${modLoader.version}`,
          `forge-${config.versionMetadata.id}-${modLoader.version}.jar`
        );
        classpathEntries.push(forgeLibraryPath);
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
}