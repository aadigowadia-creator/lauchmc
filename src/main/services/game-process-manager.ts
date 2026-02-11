import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import AdmZip from 'adm-zip';
import { LaunchCommand, LaunchCommandBuilder, LaunchConfiguration } from './launch-command-builder';
import { JavaService } from './java-service';
import { ProfileService } from './profile-service';
import { FabricModService } from './fabric-mod-service';
import { UserProfile, AuthenticationData, VersionMetadata } from '../models';
import { ForgeNotInstalledError } from '../errors/forge-errors';

export interface GameProcessInfo {
  processId: number;
  profileId: number;
  profileName: string;
  versionId: string;
  startTime: Date;
  status: 'starting' | 'running' | 'crashed' | 'exited' | 'killed';
  exitCode?: number;
  pid?: number;
}

export interface GameLaunchOptions {
  profile: UserProfile;
  versionMetadata: VersionMetadata;
  authData: AuthenticationData;
  gameDirectory?: string;
  javaPath?: string;
  onModDialogRequired?: () => Promise<Map<string, boolean> | null>;
}

export interface CrashReport {
  processId: number;
  profileName: string;
  versionId: string;
  exitCode: number;
  crashTime: Date;
  logOutput: string;
  errorOutput: string;
  possibleCauses: string[];
  suggestedSolutions: string[];
}

export class GameProcessManager extends EventEmitter {
  private static instance: GameProcessManager;
  private activeProcesses: Map<number, ChildProcess> = new Map();
  private processInfo: Map<number, GameProcessInfo> = new Map();
  private processCounter = 0;
  private launchCommandBuilder: LaunchCommandBuilder;
  private javaService: JavaService;
  private profileService: ProfileService;
  private fabricModService: FabricModService;

  public static getInstance(): GameProcessManager {
    if (!GameProcessManager.instance) {
      GameProcessManager.instance = new GameProcessManager();
    }
    return GameProcessManager.instance;
  }

  constructor() {
    super();
    this.launchCommandBuilder = LaunchCommandBuilder.getInstance();
    this.javaService = JavaService.getInstance();
    this.profileService = new ProfileService();
    this.fabricModService = new FabricModService();
  }

  /**
   * Launch Minecraft with the specified profile configuration
   */
  public async launchGame(options: GameLaunchOptions): Promise<GameProcessInfo> {
    const { profile, versionMetadata, authData } = options;
    
    try {
      // Validate launch prerequisites
      await this.validateLaunchPrerequisites(options);
    } catch (error) {
      // Handle Forge installation errors specially
      if (error instanceof ForgeNotInstalledError) {
        // Re-throw with additional context for auto-installation
        const enhancedError = new Error(
          `Forge ${error.forgeVersion} is not installed for Minecraft ${error.mcVersion}. ` +
          `Click "Install Forge Automatically" to download and install it, or install manually from https://files.minecraftforge.net/`
        );
        (enhancedError as any).canAutoInstall = true;
        (enhancedError as any).mcVersion = error.mcVersion;
        (enhancedError as any).forgeVersion = error.forgeVersion;
        (enhancedError as any).minecraftDir = error.minecraftDir;
        throw enhancedError;
      }
      throw error;
    }

    try {

      // Handle Fabric mod dialog if needed (Requirements: 2.1, 2.5, 6.1, 6.2, 6.3, 6.5)
      if (profile.modLoader?.type === 'fabric') {
        await this.handleFabricModDialog(profile, options.onModDialogRequired);
      }

      // Handle Forge mod states if needed (Requirements: 2.5, 4.4)
      if (profile.modLoader?.type === 'forge') {
        await this.handleForgeModStates(profile);
      }

      // Prepare launch configuration
      const launchConfig = await this.prepareLaunchConfiguration(options);

      // Ensure natives are extracted
      await this.ensureNativesExtracted(launchConfig);

      // Build launch command
      const launchCommand = this.launchCommandBuilder.buildLaunchCommand(launchConfig);

      // Create process info
      const processId = ++this.processCounter;
      const processInfo: GameProcessInfo = {
        processId,
        profileId: profile.id!,
        profileName: profile.name,
        versionId: profile.versionId,
        startTime: new Date(),
        status: 'starting'
      };

      this.processInfo.set(processId, processInfo);

      // Launch the process
      const gameProcess = await this.spawnGameProcess(launchCommand, processInfo);
      
      // Store active process
      this.activeProcesses.set(processId, gameProcess);
      processInfo.pid = gameProcess.pid;
      processInfo.status = 'running';

      // Set up process monitoring
      this.setupProcessMonitoring(gameProcess, processInfo);

      // Emit launch event
      this.emit('gameStarted', processInfo);

      return processInfo;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.emit('launchError', {
        profileName: profile.name,
        versionId: profile.versionId,
        error: errorMessage
      });
      throw error;
    }
  }

  /**
   * Launch game with vanilla Minecraft (ignoring mod loader configuration)
   * Useful when mod loader is configured but not installed
   */
  public async launchVanilla(options: GameLaunchOptions): Promise<GameProcessInfo> {
    try {
      console.log('Starting vanilla Minecraft launch process...');

      // Create a vanilla version of the profile (without mod loader)
      const vanillaProfile: UserProfile = {
        ...options.profile,
        modLoader: undefined // Remove mod loader configuration
      };

      const vanillaOptions: GameLaunchOptions = {
        ...options,
        profile: vanillaProfile
      };

      // Use the regular launch method with vanilla profile
      return await this.launchGame(vanillaOptions);

    } catch (error) {
      console.error('Failed to launch vanilla Minecraft:', error);
      throw error;
    }
  }

  /**
   * Kill a running game process
   */
  public async killGameProcess(processId: number): Promise<boolean> {
    const process = this.activeProcesses.get(processId);
    const processInfo = this.processInfo.get(processId);

    if (!process || !processInfo) {
      return false;
    }

    try {
      // Try graceful termination first
      process.kill('SIGTERM');
      
      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Force kill if still running
      if (!process.killed) {
        process.kill('SIGKILL');
      }

      processInfo.status = 'killed';
      this.emit('gameKilled', processInfo);
      
      return true;
    } catch (error) {
      console.error('Error killing game process:', error);
      return false;
    }
  }

  /**
   * Handle Fabric mod dialog before game launch
   * Requirements: 2.1, 2.5, 6.1, 6.2, 6.3, 6.5
   */
  private async handleFabricModDialog(
    profile: UserProfile,
    onModDialogRequired?: () => Promise<Map<string, boolean> | null>
  ): Promise<void> {
    // Check if mod dialog should be shown (handles "Don't ask again" preference)
    const shouldShow = await this.profileService.shouldShowModDialog(profile.id!);
    
    if (shouldShow && onModDialogRequired) {
      // Request mod states from UI
      const modStates = await onModDialogRequired();
      
      // If user cancelled the dialog, throw error to abort launch
      if (!modStates) {
        throw new Error('Launch cancelled by user');
      }
      
      // Update mod states in database
      for (const [modId, enabled] of modStates.entries()) {
        await this.fabricModService.setModState(profile.id!, modId, enabled);
      }
    }
    
    // Apply mod states (rename files .jar/.disabled) before launch
    await this.fabricModService.applyModStates(profile.id!, profile.installationDir);
  }

  /**
   * Handle Forge mod states before game launch
   * Requirements: 2.5, 4.4
   */
  private async handleForgeModStates(profile: UserProfile): Promise<void> {
    try {
      // Import ForgeModService to avoid circular dependency
      const { ForgeModService } = await import('./forge-mod-service');
      const forgeModService = new ForgeModService();

      // Apply mod states (rename files .jar/.disabled) before launch
      await forgeModService.applyModStates(profile.id!.toString());
      
      // Validate mod compatibility
      await this.validateForgeModCompatibility(profile);
    } catch (error) {
      throw new Error(`Failed to prepare Forge mods: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate Forge mod compatibility before launch
   * Requirements: 4.4, 4.5
   */
  private async validateForgeModCompatibility(profile: UserProfile): Promise<void> {
    if (!profile.modLoader || profile.modLoader.type !== 'forge') {
      return;
    }

    try {
      // Import ForgeModService to avoid circular dependency
      const { ForgeModService } = await import('./forge-mod-service');
      const forgeModService = new ForgeModService();

      // Get enabled mods
      const enabledMods = await forgeModService.getEnabledMods(profile.id!.toString());
      
      // Check if mods directory exists
      const modsDirectory = path.join(profile.installationDir, 'mods');
      try {
        await fs.access(modsDirectory);
      } catch {
        throw new Error('Mods directory not found. Please reinstall the Forge profile.');
      }

      // Validate each enabled mod file exists and is valid
      const modStates = await forgeModService.getModStates(profile.id!.toString());
      const enabledModStates = modStates.filter(mod => mod.enabled);
      
      for (const modState of enabledModStates) {
        const validation = await forgeModService.validateModFile(modState.filePath);
        if (!validation.valid) {
          console.warn(`Mod validation issues for ${modState.modName}:`, validation.issues);
          // Don't fail launch for mod validation issues, just warn
        }
      }

      console.log(`Validated ${enabledModStates.length} enabled Forge mods`);
    } catch (error) {
      console.error('Forge mod validation error:', error);
      // Don't fail launch for validation errors, just log them
    }
  }

  /**
   * Get information about all active processes
   */
  public getActiveProcesses(): GameProcessInfo[] {
    return Array.from(this.processInfo.values()).filter(
      info => info.status === 'starting' || info.status === 'running'
    );
  }

  /**
   * Get information about a specific process
   */
  public getProcessInfo(processId: number): GameProcessInfo | undefined {
    return this.processInfo.get(processId);
  }

  /**
   * Check if a profile is currently running
   */
  public isProfileRunning(profileId: number): boolean {
    return Array.from(this.processInfo.values()).some(
      info => info.profileId === profileId && 
      (info.status === 'starting' || info.status === 'running')
    );
  }

  /**
   * Validate prerequisites for launching the game
   */
  private async validateLaunchPrerequisites(options: GameLaunchOptions): Promise<void> {
    const { profile, versionMetadata, authData } = options;

    // Check if profile is already running
    if (this.isProfileRunning(profile.id!)) {
      throw new Error(`Profile "${profile.name}" is already running`);
    }

    // Validate authentication
    if (!authData.accessToken || !authData.userProfile?.id) {
      throw new Error('Valid authentication is required to launch the game');
    }

    // Check if authentication token is expired
    if (authData.expiresAt && new Date() >= authData.expiresAt) {
      throw new Error('Authentication token has expired. Please re-authenticate');
    }

    // Validate Java installation
    const javaPath = options.javaPath || await this.getJavaPath(profile.versionId);
    if (!javaPath) {
      // Provide helpful error message about bundled Java
      const requiredVersion = this.getRequiredJavaVersionForMinecraft(profile.versionId);
      throw new Error(
        `No compatible Java installation found. ` +
        `Minecraft ${profile.versionId} requires Java ${requiredVersion}. ` +
        `The launcher includes bundled Java ${requiredVersion}, but it may not be extracted or verified. ` +
        `Please restart the launcher or install Java ${requiredVersion} manually.`
      );
    }

    // Validate Java compatibility
    const javaInstallations = await this.javaService.detectJavaInstallations();
    const javaInstallation = javaInstallations.find(j => j.path === javaPath);
    
    if (javaInstallation) {
      const compatibility = this.javaService.validateJavaCompatibility(
        javaInstallation, 
        profile.versionId
      );
      
      if (!compatibility.isCompatible) {
        throw new Error(`Java compatibility issue: ${compatibility.issues.join(', ')}`);
      }
    }

    // Validate game files exist
    await this.validateGameFiles(profile, versionMetadata);
  }

  /**
   * Validate that required game files exist
   */
  private async validateGameFiles(profile: UserProfile, versionMetadata: VersionMetadata): Promise<void> {
    // Get the Minecraft root directory (where versions are actually stored)
    const minecraftRoot = this.getMinecraftRootDirectory(profile.installationDir);
    
    // Check main game jar
    const gameJarPath = path.join(
      minecraftRoot,
      'versions',
      profile.versionId,
      `${profile.versionId}.jar`
    );

    try {
      await fs.access(gameJarPath);
    } catch (error) {
      throw new Error(`Game jar not found: ${gameJarPath}. Please reinstall the game version.`);
    }

    // Check version metadata file
    const versionJsonPath = path.join(
      minecraftRoot,
      'versions',
      profile.versionId,
      `${profile.versionId}.json`
    );

    try {
      await fs.access(versionJsonPath);
    } catch (error) {
      throw new Error(`Version metadata not found: ${versionJsonPath}. Please reinstall the game version.`);
    }

    // Check libraries directory exists
    const librariesDir = path.join(minecraftRoot, 'libraries');
    try {
      await fs.access(librariesDir);
    } catch (error) {
      throw new Error(`Libraries directory not found: ${librariesDir}. Please reinstall the game version.`);
    }

    // Check assets directory exists
    const assetsDir = path.join(minecraftRoot, 'assets');
    try {
      await fs.access(assetsDir);
    } catch (error) {
      throw new Error(`Assets directory not found: ${assetsDir}. Please reinstall the game version.`);
    }

    // Validate mod loader installation if configured
    if (profile.modLoader) {
      await this.validateModLoaderInstallation(profile, minecraftRoot);
    }
  }

  /**
   * Validate that the configured mod loader is actually installed
   */
  private async validateModLoaderInstallation(profile: UserProfile, minecraftRoot: string): Promise<void> {
    if (!profile.modLoader) return;

    switch (profile.modLoader.type) {
      case 'forge':
        await this.validateForgeInstallation(profile, minecraftRoot);
        break;
      case 'fabric':
        await this.validateFabricInstallation(profile, minecraftRoot);
        break;
      case 'quilt':
        await this.validateQuiltInstallation(profile, minecraftRoot);
        break;
    }
  }

  /**
   * Validate Forge installation with modern Forge support
   */
  private async validateForgeInstallation(profile: UserProfile, minecraftRoot: string): Promise<void> {
    const forgeVersion = profile.modLoader!.version;
    const mcVersion = profile.versionId.split('-')[0]; // Extract base version like "1.12.2"
    
    // Check if Forge version directory exists
    const forgeVersionDir = path.join(
      minecraftRoot,
      'versions',
      `${mcVersion}-forge-${forgeVersion}`
    );

    try {
      await fs.access(forgeVersionDir);
    } catch (error) {
      throw new ForgeNotInstalledError(
        `Forge ${forgeVersion} is not installed for Minecraft ${mcVersion}. ` +
        `Click "Install Forge Automatically" to download and install it, ` +
        `or install manually from https://files.minecraftforge.net/`,
        mcVersion,
        forgeVersion,
        minecraftRoot
      );
    }

    // Check if Forge JSON profile exists (this is the most important file for modern Forge)
    const forgeJsonPath = path.join(forgeVersionDir, `${mcVersion}-forge-${forgeVersion}.json`);
    try {
      await fs.access(forgeJsonPath);
      console.log(`Forge profile JSON found: ${forgeJsonPath}`);
    } catch (error) {
      throw new ForgeNotInstalledError(
        `Forge profile JSON not found: ${forgeJsonPath}. ` +
        `Click "Install Forge Automatically" to download and install it, ` +
        `or install manually from https://files.minecraftforge.net/`,
        mcVersion,
        forgeVersion,
        minecraftRoot
      );
    }

    // For modern Forge, check if Forge libraries exist - this is more reliable than checking for jar files
    const forgeLibrariesDir = path.join(minecraftRoot, 'libraries', 'net', 'minecraftforge');
    try {
      await fs.access(forgeLibrariesDir);
      console.log(`Forge libraries directory found: ${forgeLibrariesDir}`);
    } catch (error) {
      throw new ForgeNotInstalledError(
        `Forge libraries not found: ${forgeLibrariesDir}. ` +
        `Click "Install Forge Automatically" to download and install it, ` +
        `or install manually from https://files.minecraftforge.net/`,
        mcVersion,
        forgeVersion,
        minecraftRoot
      );
    }

    console.log(`Forge installation validated successfully for ${mcVersion}-forge-${forgeVersion}`);
  }

  /**
   * Validate Fabric installation (placeholder)
   */
  private async validateFabricInstallation(profile: UserProfile, minecraftRoot: string): Promise<void> {
    // TODO: Implement Fabric validation
    console.log('Fabric validation not implemented yet');
  }

  /**
   * Validate Quilt installation (placeholder)
   */
  private async validateQuiltInstallation(profile: UserProfile, minecraftRoot: string): Promise<void> {
    // TODO: Implement Quilt validation
    console.log('Quilt validation not implemented yet');
  }

  /**
   * Prepare launch configuration from options
   */
  private async prepareLaunchConfiguration(options: GameLaunchOptions): Promise<LaunchConfiguration> {
    const { profile, versionMetadata, authData } = options;
    
    const gameDirectory = options.gameDirectory || profile.installationDir;
    const javaPath = options.javaPath || await this.getJavaPath(profile.versionId);
    
    if (!javaPath) {
      throw new Error('No Java installation found');
    }

    // For Fabric profiles, libraries and versions are in the root .minecraft directory
    // Extract root directory if this is a profile-specific subdirectory
    const minecraftRoot = this.getMinecraftRootDirectory(gameDirectory);

    return {
      profile,
      versionMetadata,
      authData,
      javaPath,
      gameDirectory,
      assetsDirectory: path.join(minecraftRoot, 'assets'),
      librariesDirectory: path.join(minecraftRoot, 'libraries'),
      nativesDirectory: path.join(minecraftRoot, 'versions', profile.versionId, 'natives')
    };
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
   * Ensure native libraries are extracted for the version
   */
  private async ensureNativesExtracted(config: LaunchConfiguration): Promise<void> {
    const { versionMetadata, librariesDirectory, nativesDirectory } = config;
    
    // Create natives directory if it doesn't exist
    await fs.mkdir(nativesDirectory, { recursive: true });

    // Check if natives are already extracted (check for specific LWJGL files)
    try {
      const files = await fs.readdir(nativesDirectory);
      const hasNatives = files.some(f => f.endsWith('.dll') || f.endsWith('.so') || f.endsWith('.dylib'));
      
      // For LWJGL 2.9.x (MC 1.8.9), specifically check for lwjgl64.dll on Windows
      if (hasNatives && files.length > 3) {
        const isLegacyVersion = this.isLegacyMinecraftVersion(versionMetadata.id);
        if (isLegacyVersion && process.platform === 'win32') {
          // Check for specific LWJGL 2.9.x files
          const hasLwjgl64 = files.includes('lwjgl64.dll') || files.includes('lwjgl.dll');
          const hasJinput = files.some(f => f.includes('jinput') && f.endsWith('.dll'));
          
          if (hasLwjgl64 && hasJinput) {
            console.log('Natives already extracted (verified LWJGL 2.9.x files)');
            return;
          } else {
            console.log('Natives directory exists but missing required LWJGL 2.9.x files, re-extracting...');
            // Clear the directory and re-extract
            await fs.rm(nativesDirectory, { recursive: true, force: true });
            await fs.mkdir(nativesDirectory, { recursive: true });
          }
        } else {
          console.log('Natives already extracted');
          return;
        }
      }
    } catch {
      // Directory doesn't exist or can't be read, proceed with extraction
    }

    console.log('Extracting native libraries...');

    const platformKey = this.getPlatformKey();
    const nativesKey = this.getNativesKey();

    // Filter libraries that are native libraries for current platform
    // Handle both modern and legacy LWJGL formats
    const nativeLibraries = versionMetadata.libraries.filter(lib => {
      // Modern format: library name includes natives classifier (e.g., "lwjgl:3.3.3:natives-windows")
      if (lib.name.includes(':natives-')) {
        const nameParts = lib.name.split(':');
        if (nameParts.length >= 4) {
          const classifier = nameParts[3];
          return classifier === nativesKey || classifier.startsWith('natives-' + platformKey);
        }
      }
      
      // Legacy LWJGL format: check for natives field and classifiers
      if (lib.downloads && lib.downloads.classifiers && lib.natives) {
        return lib.natives[platformKey] && lib.downloads.classifiers[nativesKey];
      }
      
      // Very old LWJGL format (1.8.9): check for platform-specific library names
      if (lib.name.includes('lwjgl-platform') || lib.name.includes('jinput-platform')) {
        return true; // Always extract these for legacy versions
      }
      
      // Special case for LWJGL 2.9.x format used in MC 1.8.9
      if (lib.name.includes('org.lwjgl.lwjgl:lwjgl-platform') || lib.name.includes('net.java.jinput:jinput-platform')) {
        // These are always native libraries for the current platform
        return true;
      }
      
      // Additional check for any library with "natives" in the name
      if (lib.name.toLowerCase().includes('natives')) {
        return true;
      }
      
      return false;
    });

    console.log(`Found ${nativeLibraries.length} native libraries to extract`);
    
    // Log the libraries we found for debugging
    for (const lib of nativeLibraries) {
      console.log(`Native library found: ${lib.name}`);
    }

    // Extract each native library
    for (const library of nativeLibraries) {
      try {
        let libraryPath: string;
        
        // Handle different library formats
        if (library.downloads && library.downloads.classifiers) {
          // Legacy format with classifiers
          const nativeDownload = library.downloads.classifiers[nativesKey];
          if (!nativeDownload) continue;
          libraryPath = path.join(librariesDirectory, this.getLibraryPath(library.name, nativesKey));
        } else if (library.downloads && library.downloads.artifact) {
          // Modern format with artifact
          libraryPath = path.join(librariesDirectory, this.getLibraryPath(library.name));
        } else {
          // Very old format - build path manually
          libraryPath = path.join(librariesDirectory, this.getLibraryPath(library.name));
        }
        
        // Check if file exists
        try {
          await fs.access(libraryPath);
        } catch {
          // Try alternative paths for LWJGL 2.9.x format
          if (library.name.includes('lwjgl-platform') || library.name.includes('jinput-platform')) {
            const altPaths = [
              this.getLegacyLWJGLPath(library.name, librariesDirectory, nativesKey),
              this.getLegacyLWJGLPath(library.name, librariesDirectory, 'natives-windows'),
              this.getLegacyLWJGLPath(library.name, librariesDirectory, 'natives-windows-x86'),
              // Try without classifier for very old format
              path.join(librariesDirectory, this.getLibraryPath(library.name))
            ].filter(Boolean);
            
            let found = false;
            for (const altPath of altPaths) {
              try {
                await fs.access(altPath!);
                libraryPath = altPath!;
                found = true;
                console.log(`Found library at alternative path: ${altPath}`);
                break;
              } catch {
                // Continue trying other paths
              }
            }
            
            // If still not found and this is LWJGL platform, try to find any available version
            if (!found && library.name.includes('lwjgl-platform')) {
              const anyLwjglPath = await this.findAnyLWJGLPlatformLibrary(librariesDirectory, nativesKey);
              if (anyLwjglPath) {
                libraryPath = anyLwjglPath;
                found = true;
                console.log(`Using alternative LWJGL version: ${anyLwjglPath}`);
              }
            }
            
            if (!found) {
              console.warn(`Native library not found at any path: ${library.name}`);
              console.warn(`Tried paths: ${altPaths.join(', ')}`);
              continue;
            }
          } else {
            console.warn(`Native library not found: ${libraryPath}`);
            continue;
          }
        }

        // Extract the native library
        console.log(`Extracting from: ${libraryPath}`);
        const zip = new AdmZip(libraryPath);
        const zipEntries = zip.getEntries();

        let extractedCount = 0;
        for (const entry of zipEntries) {
          // Skip META-INF directory (contains signatures that can cause issues)
          if (entry.entryName.startsWith('META-INF/')) continue;
          
          // Only extract files, not directories
          if (!entry.isDirectory) {
            const targetPath = path.join(nativesDirectory, entry.entryName);
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.writeFile(targetPath, entry.getData());
            extractedCount++;
            
            // Log important native files
            if (entry.entryName.includes('lwjgl') || entry.entryName.includes('jinput')) {
              console.log(`Extracted native file: ${entry.entryName}`);
            }
          }
        }

        console.log(`Extracted ${extractedCount} files from: ${library.name}`);
      } catch (error) {
        console.error(`Failed to extract native library ${library.name}:`, error);
        // Continue with other natives even if one fails
      }
    }

    console.log('Native extraction complete');
    
    // Verify extraction for legacy versions
    if (this.isLegacyMinecraftVersion(versionMetadata.id) && process.platform === 'win32') {
      try {
        const extractedFiles = await fs.readdir(nativesDirectory);
        console.log(`Extracted files: ${extractedFiles.join(', ')}`);
        
        const hasLwjgl64 = extractedFiles.includes('lwjgl64.dll');
        const hasLwjgl = extractedFiles.includes('lwjgl.dll');
        const hasJinput = extractedFiles.some(f => f.includes('jinput') && f.endsWith('.dll'));
        
        console.log(`LWJGL verification: lwjgl64.dll=${hasLwjgl64}, lwjgl.dll=${hasLwjgl}, jinput=${hasJinput}`);
        
        if (!hasLwjgl64 && !hasLwjgl) {
          console.warn('WARNING: No LWJGL native library found after extraction!');
        }
      } catch (error) {
        console.error('Failed to verify native extraction:', error);
      }
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

  /**
   * Get the natives key for the current platform
   */
  private getNativesKey(): string {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === 'win32') {
      return arch === 'x64' ? 'natives-windows' : 'natives-windows';
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
   * Get library file path with optional classifier
   */
  private getLibraryPath(libraryName: string, classifier?: string): string {
    const parts = libraryName.split(':');
    if (parts.length < 3 || parts.length > 4) {
      throw new Error(`Invalid library name format: ${libraryName}`);
    }
    
    const [group, artifact, version, existingClassifier] = parts;
    const groupPath = group.replace(/\./g, path.sep);
    
    // Use provided classifier or existing one from library name
    const finalClassifier = classifier || existingClassifier;
    
    // Handle native libraries with classifiers (e.g., natives-windows)
    if (finalClassifier) {
      return path.join(groupPath, artifact, version, `${artifact}-${version}-${finalClassifier}.jar`);
    }
    
    return path.join(groupPath, artifact, version, `${artifact}-${version}.jar`);
  }

  /**
   * Get legacy LWJGL library path for older Minecraft versions (1.8.9)
   */
  private getLegacyLWJGLPath(libraryName: string, librariesDirectory: string, nativesKey: string): string | null {
    const parts = libraryName.split(':');
    if (parts.length < 3) return null;
    
    const [group, artifact, version] = parts;
    const groupPath = group.replace(/\./g, path.sep);
    
    // For LWJGL 2.9.x platform libraries, try different path formats
    if (artifact === 'lwjgl-platform') {
      // Standard format: lwjgl-platform-2.9.2-nightly-20140822-natives-windows.jar
      return path.join(librariesDirectory, groupPath, artifact, version, `${artifact}-${version}-${nativesKey}.jar`);
    }
    
    if (artifact === 'jinput-platform') {
      // Standard format: jinput-platform-2.0.5-natives-windows.jar
      return path.join(librariesDirectory, groupPath, artifact, version, `${artifact}-${version}-${nativesKey}.jar`);
    }
    
    // Handle full library names like "org.lwjgl.lwjgl:lwjgl-platform:2.9.2-nightly-20140822"
    if (libraryName.includes('org.lwjgl.lwjgl:lwjgl-platform')) {
      const lwjglGroup = 'org.lwjgl.lwjgl'.replace(/\./g, path.sep);
      return path.join(librariesDirectory, lwjglGroup, 'lwjgl-platform', version, `lwjgl-platform-${version}-${nativesKey}.jar`);
    }
    
    if (libraryName.includes('net.java.jinput:jinput-platform')) {
      const jinputGroup = 'net.java.jinput'.replace(/\./g, path.sep);
      return path.join(librariesDirectory, jinputGroup, 'jinput-platform', version, `jinput-platform-${version}-${nativesKey}.jar`);
    }
    
    return null;
  }

  /**
   * Find any available LWJGL 2.9.x native library (handles version mismatches)
   */
  private async findAnyLWJGLPlatformLibrary(librariesDirectory: string, nativesKey: string): Promise<string | null> {
    const lwjglPlatformDir = path.join(librariesDirectory, 'org', 'lwjgl', 'lwjgl', 'lwjgl-platform');
    
    try {
      const versions = await fs.readdir(lwjglPlatformDir);
      
      // Try each version directory
      for (const version of versions) {
        const versionDir = path.join(lwjglPlatformDir, version);
        const expectedFile = `lwjgl-platform-${version}-${nativesKey}.jar`;
        const fullPath = path.join(versionDir, expectedFile);
        
        try {
          await fs.access(fullPath);
          console.log(`Found LWJGL platform library: ${fullPath}`);
          return fullPath;
        } catch {
          // Try next version
        }
      }
    } catch {
      // Directory doesn't exist
    }
    
    return null;
  }

  /**
   * Get appropriate Java path for the version
   */
  private async getJavaPath(versionId: string): Promise<string | null> {
    // Extract base Minecraft version from modded version IDs
    // fabric-loader-0.16.14-1.21.5 -> 1.21.5
    // forge-1.21.5-XX.X.X -> 1.21.5
    // quilt-loader-X.X.X-1.21.5 -> 1.21.5
    let minecraftVersion = versionId;
    
    if (versionId.startsWith('fabric-loader-')) {
      const match = versionId.match(/^fabric-loader-.+-(.+)$/);
      if (match) {
        minecraftVersion = match[1];
      }
    } else if (versionId.includes('-forge-')) {
      const match = versionId.match(/^(.+)-forge-.+$/);
      if (match) {
        minecraftVersion = match[1];
      }
    } else if (versionId.startsWith('quilt-loader-')) {
      const match = versionId.match(/^quilt-loader-.+-(.+)$/);
      if (match) {
        minecraftVersion = match[1];
      }
    }
    
    const bestJava = await this.javaService.getBestJavaInstallation(minecraftVersion);
    return bestJava?.path || null;
  }

  /**
   * Get required Java version for a Minecraft version
   * This mirrors the logic in JavaService for error messages
   */
  private getRequiredJavaVersionForMinecraft(minecraftVersion: string): number {
    const versionParts = minecraftVersion.split('.');
    const major = parseInt(versionParts[0], 10);
    const minor = parseInt(versionParts[1], 10);

    // Minecraft 1.17+ requires Java 17
    if (major > 1 || (major === 1 && minor >= 17)) {
      return 17;
    }
    
    // Older versions use Java 8
    return 8;
  }

  /**
   * Spawn the game process with proper configuration
   */
  private async spawnGameProcess(
    launchCommand: LaunchCommand, 
    processInfo: GameProcessInfo
  ): Promise<ChildProcess> {
    
    // Ensure working directory exists
    try {
      await fs.access(launchCommand.workingDirectory);
    } catch (error) {
      throw new Error(`Working directory does not exist: ${launchCommand.workingDirectory}`);
    }

    // Spawn the process
    const gameProcess = spawn(launchCommand.executable, launchCommand.args, {
      cwd: launchCommand.workingDirectory,
      env: launchCommand.environment,
      stdio: ['ignore', 'pipe', 'pipe'], // Capture stdout and stderr
      detached: false
    });

    if (!gameProcess.pid) {
      throw new Error('Failed to start game process');
    }

    return gameProcess;
  }

  /**
   * Set up monitoring for the game process
   */
  private setupProcessMonitoring(gameProcess: ChildProcess, processInfo: GameProcessInfo): void {
    let stdoutBuffer = '';
    let stderrBuffer = '';

    // Capture stdout
    if (gameProcess.stdout) {
      gameProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        stdoutBuffer += output;
        
        // Keep buffer size manageable (last 50KB)
        if (stdoutBuffer.length > 50000) {
          stdoutBuffer = stdoutBuffer.slice(-50000);
        }

        this.emit('gameOutput', {
          processId: processInfo.processId,
          type: 'stdout',
          data: output
        });
      });
    }

    // Capture stderr
    if (gameProcess.stderr) {
      gameProcess.stderr.on('data', (data: Buffer) => {
        const output = data.toString();
        stderrBuffer += output;
        
        // Keep buffer size manageable (last 50KB)
        if (stderrBuffer.length > 50000) {
          stderrBuffer = stderrBuffer.slice(-50000);
        }

        this.emit('gameOutput', {
          processId: processInfo.processId,
          type: 'stderr',
          data: output
        });

        // Check for common error patterns
        this.checkForKnownErrors(output, processInfo);
      });
    }

    // Handle process exit
    gameProcess.on('exit', (code: number | null, signal: string | null) => {
      processInfo.exitCode = code || 0;
      
      // Determine exit status
      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        processInfo.status = 'killed';
      } else if (code === 0) {
        processInfo.status = 'exited';
      } else {
        processInfo.status = 'crashed';
        
        // Generate crash report
        const crashReport = this.generateCrashReport(
          processInfo, 
          code || -1, 
          stdoutBuffer, 
          stderrBuffer
        );
        
        // Log crash details
        console.error('=== GAME CRASHED ===');
        console.error(`Exit code: ${crashReport.exitCode}`);
        console.error(`Version: ${crashReport.versionId}`);
        console.error(`Profile: ${crashReport.profileName}`);
        if (crashReport.errorOutput) {
          console.error('Error output:');
          console.error(crashReport.errorOutput);
        }
        if (crashReport.logOutput) {
          console.error('Last log output:');
          console.error(crashReport.logOutput.slice(-1000)); // Last 1000 chars
        }
        console.error('Possible causes:', crashReport.possibleCauses);
        console.error('Suggested solutions:', crashReport.suggestedSolutions);
        console.error('===================');
        
        this.emit('gameCrashed', crashReport);
      }

      // Clean up
      this.activeProcesses.delete(processInfo.processId);
      
      this.emit('gameExited', {
        processInfo,
        exitCode: code,
        signal
      });
    });

    // Handle process errors
    gameProcess.on('error', (error: Error) => {
      processInfo.status = 'crashed';
      processInfo.exitCode = -1;
      
      this.activeProcesses.delete(processInfo.processId);
      
      this.emit('gameError', {
        processInfo,
        error: error.message
      });
    });
  }

  /**
   * Check for known error patterns in game output
   */
  private checkForKnownErrors(output: string, processInfo: GameProcessInfo): void {
    const knownErrors = [
      {
        pattern: /OutOfMemoryError/i,
        type: 'memory',
        message: 'Game ran out of memory'
      },
      {
        pattern: /Could not create the Java Virtual Machine/i,
        type: 'java',
        message: 'Java Virtual Machine failed to start'
      },
      {
        pattern: /UnsupportedClassVersionError/i,
        type: 'java_version',
        message: 'Incompatible Java version'
      },
      {
        pattern: /java\.lang\.ClassNotFoundException/i,
        type: 'missing_class',
        message: 'Missing game files or corrupted installation'
      },
      {
        pattern: /Failed to download file/i,
        type: 'download',
        message: 'Failed to download required files'
      }
    ];

    for (const errorPattern of knownErrors) {
      if (errorPattern.pattern.test(output)) {
        this.emit('gameWarning', {
          processId: processInfo.processId,
          type: errorPattern.type,
          message: errorPattern.message,
          output
        });
      }
    }
  }

  /**
   * Generate detailed crash report
   */
  private generateCrashReport(
    processInfo: GameProcessInfo,
    exitCode: number,
    stdoutBuffer: string,
    stderrBuffer: string
  ): CrashReport {
    
    const possibleCauses: string[] = [];
    const suggestedSolutions: string[] = [];

    // Analyze exit code
    switch (exitCode) {
      case -1073741819: // 0xC0000005 - Access violation (Windows)
        possibleCauses.push('Memory access violation');
        suggestedSolutions.push('Try reducing memory allocation or updating graphics drivers');
        break;
      case 1:
        possibleCauses.push('General application error');
        suggestedSolutions.push('Check game logs for specific error messages');
        break;
      case 130:
        possibleCauses.push('Process interrupted by user');
        break;
      default:
        if (exitCode !== 0) {
          possibleCauses.push(`Unexpected exit code: ${exitCode}`);
        }
    }

    // Analyze error output
    if (stderrBuffer.includes('OutOfMemoryError')) {
      possibleCauses.push('Insufficient memory allocated to the game');
      suggestedSolutions.push('Increase maximum memory allocation in profile settings');
    }

    if (stderrBuffer.includes('UnsupportedClassVersionError')) {
      possibleCauses.push('Incompatible Java version');
      suggestedSolutions.push('Install a compatible Java version for this Minecraft version');
    }

    if (stderrBuffer.includes('ClassNotFoundException')) {
      possibleCauses.push('Missing or corrupted game files');
      suggestedSolutions.push('Reinstall the game version or verify file integrity');
    }

    if (stderrBuffer.includes('Could not create the Java Virtual Machine')) {
      possibleCauses.push('Invalid JVM arguments or insufficient system resources');
      suggestedSolutions.push('Check JVM arguments in profile settings or reduce memory allocation');
    }

    // JSON parsing errors (common in MC 1.8.9)
    if (stderrBuffer.includes('JsonSyntaxException') || stderrBuffer.includes('MalformedJsonException')) {
      possibleCauses.push('Malformed JSON in game arguments or authentication data');
      suggestedSolutions.push('Check launch arguments for invalid JSON formatting');
      suggestedSolutions.push('Verify authentication data is properly formatted');
      suggestedSolutions.push('Try launching with minimal arguments');
    }

    // LWJGL native library issues (common in 1.8.9)
    if (stderrBuffer.includes('UnsatisfiedLinkError') && stderrBuffer.includes('lwjgl')) {
      possibleCauses.push('LWJGL native libraries not found or corrupted');
      suggestedSolutions.push('Clear natives directory and restart launcher to re-extract native libraries');
      suggestedSolutions.push('Ensure antivirus is not blocking native library extraction');
    }

    if (stderrBuffer.includes('no lwjgl64 in java.library.path') || stderrBuffer.includes('no lwjgl in java.library.path')) {
      possibleCauses.push('LWJGL native libraries not properly extracted or java.library.path not set correctly');
      suggestedSolutions.push('Delete the natives folder in the version directory and restart the game');
      suggestedSolutions.push('Check that native libraries are being extracted to the correct location');
    }

    // Default suggestions if no specific cause found
    if (possibleCauses.length === 0) {
      possibleCauses.push('Unknown error occurred');
      suggestedSolutions.push('Check game logs for more details');
      suggestedSolutions.push('Try launching with default settings');
      suggestedSolutions.push('Verify game files are not corrupted');
    }

    return {
      processId: processInfo.processId,
      profileName: processInfo.profileName,
      versionId: processInfo.versionId,
      exitCode,
      crashTime: new Date(),
      logOutput: stdoutBuffer,
      errorOutput: stderrBuffer,
      possibleCauses,
      suggestedSolutions
    };
  }

  /**
   * Clean up all active processes (called on app shutdown)
   */
  public async cleanup(): Promise<void> {
    const activeProcessIds = Array.from(this.activeProcesses.keys());
    
    for (const processId of activeProcessIds) {
      await this.killGameProcess(processId);
    }
    
    this.activeProcesses.clear();
    this.processInfo.clear();
  }

  /**
   * Force re-extraction of native libraries (useful for fixing LWJGL issues)
   */
  public async forceNativesReextraction(profileId: number): Promise<void> {
    const profile = await this.profileService.getProfileById(profileId);
    if (!profile) {
      throw new Error('Profile not found');
    }

    const minecraftRoot = this.getMinecraftRootDirectory(profile.installationDir);
    const nativesDirectory = path.join(minecraftRoot, 'versions', profile.versionId, 'natives');

    // Remove existing natives directory
    try {
      await fs.rm(nativesDirectory, { recursive: true, force: true });
      console.log(`Cleared natives directory: ${nativesDirectory}`);
    } catch (error) {
      console.warn('Failed to clear natives directory:', error);
    }

    // Natives will be re-extracted on next launch
  }

  /**
   * Clear natives directory for a specific version (useful for troubleshooting)
   */
  public async clearNativesDirectory(installationDir: string, versionId: string): Promise<void> {
    const minecraftRoot = this.getMinecraftRootDirectory(installationDir);
    const nativesDirectory = path.join(minecraftRoot, 'versions', versionId, 'natives');

    try {
      await fs.rm(nativesDirectory, { recursive: true, force: true });
      console.log(`Cleared natives directory: ${nativesDirectory}`);
    } catch (error) {
      console.warn('Failed to clear natives directory:', error);
      throw error;
    }
  }

  /**
   * Get crash history for debugging
   */
  public getCrashHistory(): GameProcessInfo[] {
    return Array.from(this.processInfo.values()).filter(
      info => info.status === 'crashed'
    );
  }
}