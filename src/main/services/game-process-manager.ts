import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import AdmZip = require('adm-zip');
import { LaunchCommand, LaunchCommandBuilder, LaunchConfiguration } from './launch-command-builder';
import { JavaService } from './java-service';
import { UserProfile, AuthenticationData, VersionMetadata } from '../models';

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
  }

  /**
   * Launch Minecraft with the specified profile configuration
   */
  public async launchGame(options: GameLaunchOptions): Promise<GameProcessInfo> {
    const { profile, versionMetadata, authData } = options;
    
    try {
      // Validate launch prerequisites
      await this.validateLaunchPrerequisites(options);

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
    const gameDirectory = profile.installationDir;
    
    // Check main game jar
    const gameJarPath = path.join(
      gameDirectory,
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
      gameDirectory,
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
    const librariesDir = path.join(gameDirectory, 'libraries');
    try {
      await fs.access(librariesDir);
    } catch (error) {
      throw new Error(`Libraries directory not found: ${librariesDir}. Please reinstall the game version.`);
    }

    // Check assets directory exists
    const assetsDir = path.join(gameDirectory, 'assets');
    try {
      await fs.access(assetsDir);
    } catch (error) {
      throw new Error(`Assets directory not found: ${assetsDir}. Please reinstall the game version.`);
    }
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

    return {
      profile,
      versionMetadata,
      authData,
      javaPath,
      gameDirectory,
      assetsDirectory: path.join(gameDirectory, 'assets'),
      librariesDirectory: path.join(gameDirectory, 'libraries'),
      nativesDirectory: path.join(gameDirectory, 'versions', profile.versionId, 'natives')
    };
  }

  /**
   * Ensure native libraries are extracted for the version
   */
  private async ensureNativesExtracted(config: LaunchConfiguration): Promise<void> {
    const { versionMetadata, librariesDirectory, nativesDirectory } = config;
    
    // Create natives directory if it doesn't exist
    await fs.mkdir(nativesDirectory, { recursive: true });

    // Check if natives are already extracted (check for any .dll files on Windows)
    try {
      const files = await fs.readdir(nativesDirectory);
      const hasNatives = files.some(f => f.endsWith('.dll') || f.endsWith('.so') || f.endsWith('.dylib'));
      if (hasNatives && files.length > 5) { // Need more than just JNA files
        console.log('Natives already extracted');
        return;
      }
    } catch {
      // Directory doesn't exist or can't be read, proceed with extraction
    }

    console.log('Extracting native libraries...');

    const platformKey = this.getPlatformKey();
    const nativesKey = this.getNativesKey();

    // Filter libraries that are native libraries for current platform
    // Modern format: library name includes classifier (e.g., "lwjgl:3.3.3:natives-windows")
    // Legacy format: library has natives field and classifiers in downloads
    const nativeLibraries = versionMetadata.libraries.filter(lib => {
      // Modern format: check if library name includes natives classifier
      if (lib.name.includes(':natives-')) {
        const nameParts = lib.name.split(':');
        if (nameParts.length >= 4) {
          const classifier = nameParts[3];
          return classifier === nativesKey || classifier.startsWith('natives-' + platformKey);
        }
      }
      
      // Legacy format: check for natives field and classifiers
      if (lib.downloads.classifiers && lib.natives) {
        return lib.natives[platformKey] && lib.downloads.classifiers[nativesKey];
      }
      
      return false;
    });

    console.log(`Found ${nativeLibraries.length} native libraries to extract`);

    // Extract each native library
    for (const library of nativeLibraries) {
      try {
        let libraryPath: string;
        
        // Modern format: artifact is in downloads.artifact
        if (library.downloads.artifact) {
          // Build path from library name
          libraryPath = path.join(librariesDirectory, this.getLibraryPath(library.name));
        }
        // Legacy format: use classifiers
        else if (library.downloads.classifiers) {
          const nativeDownload = library.downloads.classifiers[nativesKey];
          if (!nativeDownload) continue;
          libraryPath = path.join(librariesDirectory, this.getLibraryPath(library.name, nativesKey));
        } else {
          continue;
        }
        
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
          }
        }

        console.log(`Extracted ${extractedCount} files from: ${library.name}`);
      } catch (error) {
        console.error(`Failed to extract native library ${library.name}:`, error);
        // Continue with other natives even if one fails
      }
    }

    console.log('Native extraction complete');
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
   * Get appropriate Java path for the version
   */
  private async getJavaPath(versionId: string): Promise<string | null> {
    const bestJava = await this.javaService.getBestJavaInstallation(versionId);
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
   * Get crash history for debugging
   */
  public getCrashHistory(): GameProcessInfo[] {
    return Array.from(this.processInfo.values()).filter(
      info => info.status === 'crashed'
    );
  }
}