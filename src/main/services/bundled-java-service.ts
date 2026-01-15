import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as crypto from 'crypto';
import { app } from 'electron';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { LoggerService } from './logger-service';

/**
 * Information about a bundled Java runtime
 */
export interface BundledRuntimeInfo {
  version: number;           // Major version (8, 17)
  fullVersion: string;       // Full version string (e.g., "17.0.9")
  path: string;              // Path to java.exe
  architecture: string;      // x64
  extracted: boolean;        // Whether runtime has been extracted
  verified: boolean;         // Whether runtime passed verification
  checksum: string;          // SHA256 checksum for verification
}

/**
 * Metadata for a single runtime in the manifest
 */
export interface RuntimeMetadata {
  version: string;           // Full Java version
  checksum: string;          // SHA256 checksum
  extractedPath: string;     // Path where runtime is extracted
}

/**
 * Manifest file structure for bundled runtimes
 */
export interface RuntimeManifest {
  version: string;           // Manifest version
  runtimes: {
    java8: RuntimeMetadata;
    java17: RuntimeMetadata;
    java21: RuntimeMetadata;
  };
}

/**
 * Service for managing bundled Java runtimes
 * Handles extraction, verification, and access to bundled Java installations
 */
export class BundledJavaService extends EventEmitter {
  private static instance: BundledJavaService;
  private runtimesDirectory: string;
  private availableRuntimes: Map<number, BundledRuntimeInfo>;
  private logger: LoggerService;
  private verificationCache: Map<number, { timestamp: number; verified: boolean }>;
  private readonly VERIFICATION_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

  private constructor() {
    super();
    // Initialize runtimes directory in userData
    this.runtimesDirectory = path.join(app.getPath('userData'), 'runtimes');
    this.availableRuntimes = new Map();
    this.verificationCache = new Map();
    this.logger = LoggerService.getInstance();
  }

  /**
   * Get singleton instance of BundledJavaService
   */
  public static getInstance(): BundledJavaService {
    if (!BundledJavaService.instance) {
      BundledJavaService.instance = new BundledJavaService();
    }
    return BundledJavaService.instance;
  }

  /**
   * Get the base directory where bundled runtimes are stored
   */
  public getRuntimesDirectory(): string {
    return this.runtimesDirectory;
  }

  /**
   * Get the directory path for a specific Java version
   */
  public getRuntimeDirectory(majorVersion: number): string {
    return path.join(this.runtimesDirectory, `java-${majorVersion}`);
  }

  /**
   * Get the path to the java executable for a specific version
   */
  public getJavaExecutablePath(majorVersion: number): string {
    const runtimeDir = this.getRuntimeDirectory(majorVersion);
    const executable = process.platform === 'win32' ? 'java.exe' : 'java';
    return path.join(runtimeDir, 'bin', executable);
  }

  /**
   * Get information about a bundled runtime
   */
  public getBundledRuntimeInfo(majorVersion: number): BundledRuntimeInfo | null {
    const runtime = this.availableRuntimes.get(majorVersion);
    
    if (!runtime) {
      this.logger.warn(`Bundled runtime not found for Java ${majorVersion}`);
    }
    
    return runtime || null;
  }

  /**
   * Get all available bundled runtimes
   */
  public getAllBundledRuntimes(): BundledRuntimeInfo[] {
    return Array.from(this.availableRuntimes.values());
  }

  /**
   * Check if a bundled runtime is available for the specified version
   */
  public isBundledRuntimeAvailable(majorVersion: number): boolean {
    const runtime = this.availableRuntimes.get(majorVersion);
    const isAvailable = runtime !== undefined && runtime.extracted && runtime.verified;
    
    if (!isAvailable) {
      this.logger.warn(
        `Bundled runtime not available for Java ${majorVersion}`,
        {
          exists: runtime !== undefined,
          extracted: runtime?.extracted || false,
          verified: runtime?.verified || false,
        }
      );
    }
    
    return isAvailable;
  }

  /**
   * Get the path to the manifest file
   */
  public getManifestPath(): string {
    return path.join(this.runtimesDirectory, 'manifest.json');
  }

  /**
   * Get the path to the bundled resources directory
   */
  public getBundledResourcesPath(): string {
    // In production, resources are in the app.asar.unpacked directory
    // In development, they're in the resources directory
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'runtimes');
    } else {
      // In development, go up from dist/main to project root
      const appPath = app.getAppPath();
      const projectRoot = path.join(appPath, '..', '..');
      return path.join(projectRoot, 'resources', 'runtimes');
    }
  }

  /**
   * Get the path to a bundled compressed runtime archive
   */
  public getBundledArchivePath(majorVersion: number): string {
    const resourcesPath = this.getBundledResourcesPath();
    return path.join(resourcesPath, `java-${majorVersion}-windows-x64.7z`);
  }

  /**
   * Extract a bundled Java runtime from compressed archive
   * @param version Major Java version (8 or 17)
   * @returns Promise that resolves when extraction is complete
   */
  public async extractBundledRuntime(version: number): Promise<void> {
    this.logger.info(`Starting extraction of Java ${version} runtime`);
    this.emit('extraction:start', { version });

    try {
      const archivePath = this.getBundledArchivePath(version);
      const targetDir = this.getRuntimeDirectory(version);

      // Check if archive exists
      if (!fs.existsSync(archivePath)) {
        const error = new Error(`Bundled runtime archive not found: ${archivePath}`);
        this.logger.error(`Archive not found for Java ${version}`, error);
        this.emit('extraction:error', { version, error: error.message });
        throw error;
      }

      this.logger.debug(`Archive path: ${archivePath}`);
      this.logger.debug(`Target directory: ${targetDir}`);

      // Check disk space before extraction (estimate: 200MB per runtime)
      const requiredSpace = 200 * 1024 * 1024; // 200MB in bytes
      const hasSpace = await this.checkDiskSpace(targetDir, requiredSpace);
      
      if (!hasSpace) {
        const error = new Error(
          `Insufficient disk space for Java ${version} extraction. Need at least 200MB free.`
        );
        this.logger.error('Insufficient disk space', error);
        this.emit('extraction:error', { version, error: error.message });
        throw error;
      }

      // Create target directory if it doesn't exist and check write permissions
      try {
        await fsPromises.mkdir(targetDir, { recursive: true });
        
        // Test write permissions by creating a temporary file
        const testFile = path.join(targetDir, '.write-test');
        await fsPromises.writeFile(testFile, 'test');
        await fsPromises.unlink(testFile);
      } catch (permError) {
        const error = new Error(
          `No write permission for extraction directory: ${targetDir}`
        );
        this.logger.error('Permission denied for extraction', permError);
        this.emit('extraction:error', { version, error: error.message });
        throw error;
      }

      // Extract the archive using 7-Zip
      await this.extract7zArchive(archivePath, targetDir, version);

      // Set proper file permissions for java executable (Unix systems)
      if (process.platform !== 'win32') {
        const javaExePath = this.getJavaExecutablePath(version);
        if (fs.existsSync(javaExePath)) {
          await fsPromises.chmod(javaExePath, 0o755);
          this.logger.debug(`Set executable permissions for ${javaExePath}`);
        }
      }

      this.logger.info(`Successfully extracted Java ${version} runtime`);
      this.emit('extraction:complete', { version });
    } catch (error) {
      this.logger.error(`Failed to extract Java ${version} runtime`, error);
      this.emit('extraction:error', { version, error });
      throw error;
    }
  }

  /**
   * Extract a 7-Zip or ZIP archive
   * @param archivePath Path to the archive
   * @param targetDir Directory to extract to
   * @param version Java version being extracted (for progress tracking)
   */
  private async extract7zArchive(
    archivePath: string,
    targetDir: string,
    version: number
  ): Promise<void> {
    // Check if file is ZIP format (starts with PK)
    const isZip = await this.isZipFile(archivePath);
    
    if (isZip && process.platform === 'win32') {
      // Use PowerShell Expand-Archive for ZIP files on Windows
      this.logger.info(`Detected ZIP format, using PowerShell extraction for ${archivePath}`);
      return this.extractZipWithPowerShell(archivePath, targetDir, version);
    }
    
    // Use 7z for 7z files
    return this.extract7zWithCommand(archivePath, targetDir, version);
  }

  /**
   * Check if a file is in ZIP format
   */
  private async isZipFile(filePath: string): Promise<boolean> {
    try {
      const buffer = Buffer.alloc(4);
      const fd = await fsPromises.open(filePath, 'r');
      await fd.read(buffer, 0, 4, 0);
      await fd.close();
      
      // ZIP files start with PK (0x50 0x4B)
      return buffer[0] === 0x50 && buffer[1] === 0x4B;
    } catch (error) {
      this.logger.error('Failed to check file format', error);
      return false;
    }
  }

  /**
   * Extract ZIP file using PowerShell Expand-Archive
   */
  private async extractZipWithPowerShell(
    archivePath: string,
    targetDir: string,
    version: number
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      this.logger.debug(`Extracting ZIP with PowerShell: ${archivePath} to ${targetDir}`);
      
      // PowerShell Expand-Archive only works with .zip extension
      // If file has .7z extension, create a temporary copy with .zip extension
      let zipPath = archivePath;
      let isTempFile = false;
      
      if (archivePath.endsWith('.7z')) {
        zipPath = archivePath.replace(/\.7z$/, '.zip');
        try {
          await fsPromises.copyFile(archivePath, zipPath);
          isTempFile = true;
          this.logger.debug(`Created temporary ZIP file: ${zipPath}`);
        } catch (error) {
          this.logger.error('Failed to create temporary ZIP file', error);
          return reject(new Error(`Failed to create temporary ZIP file: ${error}`));
        }
      }
      
      // PowerShell command to extract ZIP
      const psCommand = `Expand-Archive -Path "${zipPath}" -DestinationPath "${targetDir}" -Force`;
      const powershell = spawn('powershell.exe', ['-Command', psCommand]);

      let stdout = '';
      let stderr = '';

      powershell.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      powershell.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      powershell.on('error', async (error) => {
        this.logger.error('Failed to spawn PowerShell process', error);
        if (isTempFile) {
          try {
            await fsPromises.unlink(zipPath);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
        reject(new Error(`Failed to start PowerShell extraction: ${error.message}`));
      });

      powershell.on('close', async (code) => {
        // Clean up temporary file
        if (isTempFile) {
          try {
            await fsPromises.unlink(zipPath);
            this.logger.debug(`Cleaned up temporary ZIP file: ${zipPath}`);
          } catch (error) {
            this.logger.warn('Failed to clean up temporary ZIP file', error);
          }
        }
        
        if (code === 0) {
          this.logger.debug('PowerShell extraction completed successfully');
          this.emit('extraction:complete', { version });
          resolve();
        } else {
          this.logger.error(`PowerShell extraction failed with code ${code}`, { stdout, stderr });
          reject(new Error(`PowerShell extraction failed with exit code ${code}: ${stderr}`));
        }
      });
    });
  }

  /**
   * Extract using 7z command
   */
  private async extract7zWithCommand(
    archivePath: string,
    targetDir: string,
    version: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const sevenZipCommand = this.get7zCommand();

      this.logger.debug(`Using 7-Zip command: ${sevenZipCommand}`);
      this.logger.debug(`Extracting ${archivePath} to ${targetDir}`);

      // Spawn 7z process: 7z x <archive> -o<output> -y
      const args = ['x', archivePath, `-o${targetDir}`, '-y'];
      const process7z = spawn(sevenZipCommand, args);

      let stdout = '';
      let stderr = '';

      process7z.stdout?.on('data', (data) => {
        stdout += data.toString();
        // Parse progress from 7z output if available
        const progressMatch = data.toString().match(/(\d+)%/);
        if (progressMatch) {
          const progress = parseInt(progressMatch[1], 10);
          this.emit('extraction:progress', { version, progress });
        }
      });

      process7z.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process7z.on('error', (error) => {
        this.logger.error('Failed to spawn 7z process', error);
        reject(new Error(`Failed to start 7-Zip extraction: ${error.message}`));
      });

      process7z.on('close', (code) => {
        if (code === 0) {
          this.logger.debug('7-Zip extraction completed successfully');
          resolve();
        } else {
          this.logger.error(`7-Zip extraction failed with code ${code}`, { stdout, stderr });
          reject(new Error(`7-Zip extraction failed with exit code ${code}: ${stderr}`));
        }
      });
    });
  }

  /**
   * Get the 7-Zip command to use for extraction
   * On Windows, we bundle 7z.exe in resources/bin
   * On Unix systems, use system 7z command
   */
  private get7zCommand(): string {
    if (process.platform === 'win32') {
      // Try bundled 7z.exe first (in resources/bin)
      const resourcesBase = app.isPackaged 
        ? path.join(process.resourcesPath)
        : path.join(app.getAppPath(), 'resources');
      
      const bundled7z = path.join(resourcesBase, 'bin', '7z.exe');
      if (fs.existsSync(bundled7z)) {
        this.logger.debug(`Using bundled 7z.exe: ${bundled7z}`);
        return bundled7z;
      }
      
      // Fallback to system 7z if bundled not found
      this.logger.warn('Bundled 7z.exe not found, falling back to system 7z');
      return '7z';
    } else {
      // Unix systems - use system 7z
      return '7z';
    }
  }

  /**
   * Check if a runtime is already extracted
   * @param version Major Java version
   * @returns true if runtime is extracted
   */
  public isRuntimeExtracted(version: number): boolean {
    const javaExePath = this.getJavaExecutablePath(version);
    return fs.existsSync(javaExePath);
  }

  /**
   * Check if the runtimes directory exists
   * @returns true if directory exists
   */
  public runtimesDirectoryExists(): boolean {
    return fs.existsSync(this.runtimesDirectory);
  }

  /**
   * Initialize bundled runtimes - extract on first launch
   * This should be called during app startup
   */
  public async initializeBundledRuntimes(): Promise<void> {
    this.logger.info('Initializing bundled Java runtimes');

    try {
      // Create runtimes directory if it doesn't exist
      if (!this.runtimesDirectoryExists()) {
        this.logger.info('Creating runtimes directory');
        await fsPromises.mkdir(this.runtimesDirectory, { recursive: true });
      }

      // Check which runtimes need to be extracted
      const runtimesToExtract: number[] = [];
      
      // Check Java 8
      if (!this.isRuntimeExtracted(8)) {
        this.logger.info('Java 8 runtime not found, will extract');
        runtimesToExtract.push(8);
      } else {
        this.logger.info('Java 8 runtime already extracted');
      }

      // Check Java 17
      if (!this.isRuntimeExtracted(17)) {
        this.logger.info('Java 17 runtime not found, will extract');
        runtimesToExtract.push(17);
      } else {
        this.logger.info('Java 17 runtime already extracted');
      }

      // Check Java 21
      if (!this.isRuntimeExtracted(21)) {
        this.logger.info('Java 21 runtime not found, will extract');
        runtimesToExtract.push(21);
      } else {
        this.logger.info('Java 21 runtime already extracted');
      }

      // Extract runtimes that are missing
      for (const version of runtimesToExtract) {
        await this.extractBundledRuntime(version);
      }

      // Create or update manifest after extraction
      await this.createManifest();

      // Load runtime information
      await this.loadRuntimeInfo();

      // Perform startup verification
      await this.performStartupVerification();

      this.logger.info('Bundled runtimes initialization complete');
    } catch (error) {
      this.logger.error('Failed to initialize bundled runtimes', error);
      throw error;
    }
  }

  /**
   * Create manifest.json file with runtime information
   */
  private async createManifest(): Promise<void> {
    this.logger.info('Creating runtime manifest');

    try {
      const manifest: RuntimeManifest = {
        version: '1.0.0',
        runtimes: {
          java8: {
            version: await this.detectJavaVersion(8),
            checksum: '', // Will be populated during verification
            extractedPath: this.getRuntimeDirectory(8),
          },
          java17: {
            version: await this.detectJavaVersion(17),
            checksum: '', // Will be populated during verification
            extractedPath: this.getRuntimeDirectory(17),
          },
          java21: {
            version: await this.detectJavaVersion(21),
            checksum: '', // Will be populated during verification
            extractedPath: this.getRuntimeDirectory(21),
          },
        },
      };

      const manifestPath = this.getManifestPath();
      await fsPromises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
      
      this.logger.info('Runtime manifest created successfully');
    } catch (error) {
      this.logger.error('Failed to create runtime manifest', error);
      throw error;
    }
  }

  /**
   * Detect the Java version by executing java -version
   * @param majorVersion Major Java version
   * @returns Full version string
   */
  private async detectJavaVersion(majorVersion: number): Promise<string> {
    return new Promise((resolve) => {
      const javaExePath = this.getJavaExecutablePath(majorVersion);
      
      if (!fs.existsSync(javaExePath)) {
        resolve(`${majorVersion}.0.0`); // Default version if not found
        return;
      }

      const javaProcess = spawn(javaExePath, ['-version']);
      let stderr = '';

      javaProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      javaProcess.on('close', (code) => {
        if (code === 0 || stderr) {
          // Parse version from stderr (Java outputs version to stderr)
          const versionMatch = stderr.match(/version "(.+?)"/);
          if (versionMatch) {
            resolve(versionMatch[1]);
          } else {
            resolve(`${majorVersion}.0.0`);
          }
        } else {
          resolve(`${majorVersion}.0.0`);
        }
      });

      javaProcess.on('error', () => {
        resolve(`${majorVersion}.0.0`);
      });
    });
  }

  /**
   * Load runtime information from manifest and populate availableRuntimes
   */
  private async loadRuntimeInfo(): Promise<void> {
    try {
      const manifestPath = this.getManifestPath();
      
      if (!fs.existsSync(manifestPath)) {
        this.logger.warn('Runtime manifest not found');
        return;
      }

      const manifestContent = await fsPromises.readFile(manifestPath, 'utf-8');
      const manifest: RuntimeManifest = JSON.parse(manifestContent);

      // Load Java 8 info
      if (this.isRuntimeExtracted(8)) {
        this.availableRuntimes.set(8, {
          version: 8,
          fullVersion: manifest.runtimes.java8.version,
          path: this.getJavaExecutablePath(8),
          architecture: 'x64',
          extracted: true,
          verified: false, // Will be verified separately
          checksum: manifest.runtimes.java8.checksum,
        });
      }

      // Load Java 17 info
      if (this.isRuntimeExtracted(17)) {
        this.availableRuntimes.set(17, {
          version: 17,
          fullVersion: manifest.runtimes.java17.version,
          path: this.getJavaExecutablePath(17),
          architecture: 'x64',
          extracted: true,
          verified: false, // Will be verified separately
          checksum: manifest.runtimes.java17.checksum,
        });
      }

      // Load Java 21 info
      if (this.isRuntimeExtracted(21)) {
        this.availableRuntimes.set(21, {
          version: 21,
          fullVersion: manifest.runtimes.java21.version,
          path: this.getJavaExecutablePath(21),
          architecture: 'x64',
          extracted: true,
          verified: false, // Will be verified separately
          checksum: manifest.runtimes.java21.checksum,
        });
      }

      this.logger.info(`Loaded ${this.availableRuntimes.size} runtime(s) from manifest`);
    } catch (error) {
      this.logger.error('Failed to load runtime info', error);
    }
  }

  /**
   * Calculate SHA256 checksum of a file
   * @param filePath Path to the file
   * @returns Promise that resolves to the hex-encoded checksum
   */
  private async calculateFileChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => {
        hash.update(data);
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Calculate SHA256 checksum of a directory by hashing all files recursively
   * @param dirPath Path to the directory
   * @returns Promise that resolves to the hex-encoded checksum
   */
  private async calculateDirectoryChecksum(dirPath: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    
    // Get all files in directory recursively
    const files = await this.getAllFilesRecursive(dirPath);
    
    // Sort files to ensure consistent ordering
    files.sort();
    
    // Hash each file's content
    for (const file of files) {
      const relativePath = path.relative(dirPath, file);
      hash.update(relativePath); // Include file path in hash
      
      const fileContent = await fsPromises.readFile(file);
      hash.update(fileContent);
    }
    
    return hash.digest('hex');
  }

  /**
   * Get all files in a directory recursively
   * @param dirPath Directory path
   * @returns Array of file paths
   */
  private async getAllFilesRecursive(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        const subFiles = await this.getAllFilesRecursive(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  /**
   * Verify checksum of a bundled runtime archive before extraction
   * @param majorVersion Major Java version
   * @param expectedChecksum Expected SHA256 checksum
   * @returns true if checksum matches
   */
  public async verifyArchiveChecksum(majorVersion: number, expectedChecksum: string): Promise<boolean> {
    try {
      const archivePath = this.getBundledArchivePath(majorVersion);
      
      if (!fs.existsSync(archivePath)) {
        this.logger.error(`Archive not found for verification: ${archivePath}`);
        return false;
      }

      this.logger.info(`Verifying checksum for Java ${majorVersion} archive`);
      const actualChecksum = await this.calculateFileChecksum(archivePath);
      
      const matches = actualChecksum === expectedChecksum;
      
      if (matches) {
        this.logger.info(`Archive checksum verified for Java ${majorVersion}`);
      } else {
        this.logger.error(`Archive checksum mismatch for Java ${majorVersion}`, {
          expected: expectedChecksum,
          actual: actualChecksum,
        });
      }
      
      return matches;
    } catch (error) {
      this.logger.error(`Failed to verify archive checksum for Java ${majorVersion}`, error);
      return false;
    }
  }

  /**
   * Verify checksum of an extracted runtime directory
   * @param majorVersion Major Java version
   * @param expectedChecksum Expected SHA256 checksum
   * @returns true if checksum matches
   */
  public async verifyExtractedChecksum(majorVersion: number, expectedChecksum: string): Promise<boolean> {
    try {
      const runtimeDir = this.getRuntimeDirectory(majorVersion);
      
      if (!fs.existsSync(runtimeDir)) {
        this.logger.error(`Runtime directory not found for verification: ${runtimeDir}`);
        return false;
      }

      this.logger.info(`Verifying checksum for extracted Java ${majorVersion} runtime`);
      const actualChecksum = await this.calculateDirectoryChecksum(runtimeDir);
      
      const matches = actualChecksum === expectedChecksum;
      
      if (matches) {
        this.logger.info(`Extracted runtime checksum verified for Java ${majorVersion}`);
      } else {
        this.logger.error(`Extracted runtime checksum mismatch for Java ${majorVersion}`, {
          expected: expectedChecksum,
          actual: actualChecksum,
        });
      }
      
      return matches;
    } catch (error) {
      this.logger.error(`Failed to verify extracted runtime checksum for Java ${majorVersion}`, error);
      return false;
    }
  }

  /**
   * Verify checksum of a bundled runtime (checks extracted runtime against manifest)
   * @param majorVersion Major Java version
   * @returns true if checksum matches manifest
   */
  public async verifyRuntimeChecksum(majorVersion: number): Promise<boolean> {
    try {
      const runtime = this.availableRuntimes.get(majorVersion);
      
      if (!runtime) {
        this.logger.error(`Runtime info not found for Java ${majorVersion}`);
        return false;
      }

      if (!runtime.checksum) {
        this.logger.warn(`No checksum available in manifest for Java ${majorVersion}`);
        return true; // Skip verification if no checksum in manifest
      }

      return await this.verifyExtractedChecksum(majorVersion, runtime.checksum);
    } catch (error) {
      this.logger.error(`Failed to verify runtime checksum for Java ${majorVersion}`, error);
      return false;
    }
  }

  /**
   * Test runtime execution by running java -version
   * @param majorVersion Major Java version
   * @returns Object with success status, version string, and error if any
   */
  public async testRuntimeExecution(majorVersion: number): Promise<{
    success: boolean;
    version?: string;
    error?: string;
  }> {
    return new Promise((resolve) => {
      const javaExePath = this.getJavaExecutablePath(majorVersion);
      
      if (!fs.existsSync(javaExePath)) {
        this.logger.error(`Java executable not found: ${javaExePath}`);
        resolve({
          success: false,
          error: `Java executable not found at ${javaExePath}`,
        });
        return;
      }

      this.logger.info(`Testing Java ${majorVersion} runtime execution`);
      
      const javaProcess = spawn(javaExePath, ['-version']);
      let stdout = '';
      let stderr = '';

      javaProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      javaProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      javaProcess.on('close', (code) => {
        if (code === 0 || stderr) {
          // Java outputs version to stderr, so check both
          const output = stderr || stdout;
          const versionMatch = output.match(/version "(.+?)"/);
          
          if (versionMatch) {
            const fullVersion = versionMatch[1];
            this.logger.info(`Java ${majorVersion} runtime test successful: ${fullVersion}`);
            resolve({
              success: true,
              version: fullVersion,
            });
          } else {
            this.logger.error(`Could not parse Java version from output: ${output}`);
            resolve({
              success: false,
              error: 'Could not parse Java version from output',
            });
          }
        } else {
          this.logger.error(`Java execution failed with code ${code}`, { stdout, stderr });
          resolve({
            success: false,
            error: `Java execution failed with exit code ${code}`,
          });
        }
      });

      javaProcess.on('error', (error) => {
        this.logger.error(`Failed to execute Java ${majorVersion}`, error);
        resolve({
          success: false,
          error: `Failed to execute Java: ${error.message}`,
        });
      });
    });
  }

  /**
   * Parse Java version string and extract major version
   * @param versionString Full version string (e.g., "1.8.0_292" or "17.0.9")
   * @returns Major version number
   */
  private parseJavaMajorVersion(versionString: string): number {
    // Handle Java 8 and earlier (format: 1.8.0_292)
    if (versionString.startsWith('1.')) {
      const match = versionString.match(/1\.(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    }
    
    // Handle Java 9+ (format: 17.0.9)
    const match = versionString.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Verify that the runtime version matches the expected major version
   * @param majorVersion Expected major version
   * @param fullVersion Full version string from java -version
   * @returns true if versions match
   */
  public verifyRuntimeVersion(majorVersion: number, fullVersion: string): boolean {
    const actualMajorVersion = this.parseJavaMajorVersion(fullVersion);
    const matches = actualMajorVersion === majorVersion;
    
    if (!matches) {
      this.logger.error(`Runtime version mismatch for Java ${majorVersion}`, {
        expected: majorVersion,
        actual: actualMajorVersion,
        fullVersion,
      });
    }
    
    return matches;
  }

  /**
   * Test and verify a bundled runtime
   * Executes java -version and verifies the version matches expected
   * @param majorVersion Major Java version
   * @returns true if runtime executes successfully and version matches
   */
  public async testAndVerifyRuntime(majorVersion: number): Promise<boolean> {
    try {
      const result = await this.testRuntimeExecution(majorVersion);
      
      if (!result.success) {
        this.logger.error(`Runtime execution test failed for Java ${majorVersion}: ${result.error}`);
        return false;
      }

      if (!result.version) {
        this.logger.error(`No version returned from runtime test for Java ${majorVersion}`);
        return false;
      }

      // Verify version matches expected
      const versionMatches = this.verifyRuntimeVersion(majorVersion, result.version);
      
      if (!versionMatches) {
        return false;
      }

      this.logger.info(`Runtime test and verification successful for Java ${majorVersion}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to test and verify runtime for Java ${majorVersion}`, error);
      return false;
    }
  }

  /**
   * Quick file existence check for a runtime
   * @param majorVersion Major Java version
   * @returns true if runtime files exist
   */
  public quickVerifyRuntime(majorVersion: number): boolean {
    const javaExePath = this.getJavaExecutablePath(majorVersion);
    const exists = fs.existsSync(javaExePath);
    
    if (!exists) {
      this.logger.warn(`Quick verification failed: Java ${majorVersion} executable not found`);
    }
    
    return exists;
  }

  /**
   * Perform full verification of a runtime (checksum + execution test)
   * @param majorVersion Major Java version
   * @returns true if runtime passes all verification checks
   */
  public async fullVerifyRuntime(majorVersion: number): Promise<boolean> {
    this.logger.info(`Performing full verification for Java ${majorVersion}`);
    
    try {
      // Step 1: Quick file existence check
      if (!this.quickVerifyRuntime(majorVersion)) {
        return false;
      }

      // Step 2: Checksum verification (if checksum available)
      const runtime = this.availableRuntimes.get(majorVersion);
      if (runtime && runtime.checksum) {
        const checksumValid = await this.verifyRuntimeChecksum(majorVersion);
        if (!checksumValid) {
          this.logger.error(`Checksum verification failed for Java ${majorVersion}`);
          return false;
        }
      }

      // Step 3: Execution test
      const executionValid = await this.testAndVerifyRuntime(majorVersion);
      if (!executionValid) {
        this.logger.error(`Execution test failed for Java ${majorVersion}`);
        return false;
      }

      this.logger.info(`Full verification successful for Java ${majorVersion}`);
      
      // Update runtime info
      if (runtime) {
        runtime.verified = true;
        this.availableRuntimes.set(majorVersion, runtime);
      }
      
      // Cache verification result
      this.cacheVerificationResult(majorVersion, true);
      
      return true;
    } catch (error) {
      this.logger.error(`Full verification failed for Java ${majorVersion}`, error);
      this.cacheVerificationResult(majorVersion, false);
      return false;
    }
  }

  /**
   * Cache verification result with timestamp
   * @param majorVersion Major Java version
   * @param verified Verification result
   */
  private cacheVerificationResult(majorVersion: number, verified: boolean): void {
    this.verificationCache.set(majorVersion, {
      timestamp: Date.now(),
      verified,
    });
  }

  /**
   * Check if cached verification is still valid
   * @param majorVersion Major Java version
   * @returns true if cache is valid and runtime was verified
   */
  private isCachedVerificationValid(majorVersion: number): boolean {
    const cached = this.verificationCache.get(majorVersion);
    
    if (!cached) {
      return false;
    }

    const age = Date.now() - cached.timestamp;
    const isExpired = age > this.VERIFICATION_CACHE_DURATION;
    
    if (isExpired) {
      this.logger.debug(`Verification cache expired for Java ${majorVersion}`);
      return false;
    }

    return cached.verified;
  }

  /**
   * Verify runtime with caching support
   * Uses cached result if available and not expired, otherwise performs full verification
   * @param majorVersion Major Java version
   * @returns true if runtime is verified
   */
  public async verifyRuntimeWithCache(majorVersion: number): Promise<boolean> {
    // Check cache first
    if (this.isCachedVerificationValid(majorVersion)) {
      this.logger.debug(`Using cached verification result for Java ${majorVersion}`);
      return true;
    }

    // Perform full verification
    return await this.fullVerifyRuntime(majorVersion);
  }

  /**
   * Perform startup verification for all extracted runtimes
   * Does quick checks on startup, defers full verification
   */
  public async performStartupVerification(): Promise<void> {
    this.logger.info('Performing startup verification of bundled runtimes');

    try {
      const runtimes = Array.from(this.availableRuntimes.keys());
      
      for (const majorVersion of runtimes) {
        // Quick check on startup
        const quickCheckPassed = this.quickVerifyRuntime(majorVersion);
        
        const runtime = this.availableRuntimes.get(majorVersion);
        if (!runtime) continue;
        
        if (!quickCheckPassed) {
          this.logger.warn(`Startup verification failed for Java ${majorVersion}`);
          runtime.verified = false;
          this.availableRuntimes.set(majorVersion, runtime);
        } else {
          this.logger.info(`Startup quick check passed for Java ${majorVersion}`);
          // Mark as verified after quick check passes
          runtime.verified = true;
          this.availableRuntimes.set(majorVersion, runtime);
        }
      }

      this.logger.info('Startup verification complete');
    } catch (error) {
      this.logger.error('Failed to perform startup verification', error);
    }
  }

  /**
   * Verify runtime before first use
   * Performs full verification if not already verified or cache expired
   * If verification fails, attempts re-extraction once
   * @param majorVersion Major Java version
   * @returns true if runtime is verified and ready to use
   */
  public async verifyBeforeFirstUse(majorVersion: number): Promise<boolean> {
    this.logger.info(`Verifying Java ${majorVersion} before first use`);
    
    const runtime = this.availableRuntimes.get(majorVersion);
    
    if (!runtime) {
      this.logger.error(`Runtime not found for Java ${majorVersion}`);
      return false;
    }

    // If already verified and cache is valid, return true
    if (runtime.verified && this.isCachedVerificationValid(majorVersion)) {
      this.logger.info(`Java ${majorVersion} already verified`);
      return true;
    }

    // Perform full verification
    const verified = await this.fullVerifyRuntime(majorVersion);
    
    if (verified) {
      runtime.verified = true;
      this.availableRuntimes.set(majorVersion, runtime);
      return true;
    }

    // Verification failed - attempt re-extraction
    this.logger.warn(
      `Java ${majorVersion} verification failed, attempting re-extraction from bundle`
    );
    
    try {
      // Delete corrupted runtime directory
      const runtimeDir = this.getRuntimeDirectory(majorVersion);
      await this.deleteDirectory(runtimeDir);
      
      // Re-extract from bundle
      await this.extractBundledRuntime(majorVersion);
      
      // Verify again after re-extraction
      const reVerified = await this.fullVerifyRuntime(majorVersion);
      
      if (reVerified) {
        this.logger.info(`Java ${majorVersion} successfully re-extracted and verified`);
        runtime.verified = true;
        runtime.extracted = true;
        this.availableRuntimes.set(majorVersion, runtime);
        return true;
      } else {
        this.logger.error(
          `Java ${majorVersion} re-extraction failed verification, runtime is corrupted`
        );
        runtime.verified = false;
        this.availableRuntimes.set(majorVersion, runtime);
        return false;
      }
    } catch (error) {
      this.logger.error(`Failed to re-extract Java ${majorVersion} runtime`, error);
      runtime.verified = false;
      this.availableRuntimes.set(majorVersion, runtime);
      return false;
    }
  }

  /**
   * Clear verification cache for a specific runtime or all runtimes
   * @param majorVersion Optional major version, if not provided clears all cache
   */
  public clearVerificationCache(majorVersion?: number): void {
    if (majorVersion !== undefined) {
      this.verificationCache.delete(majorVersion);
      this.logger.info(`Cleared verification cache for Java ${majorVersion}`);
    } else {
      this.verificationCache.clear();
      this.logger.info('Cleared all verification cache');
    }
  }

  /**
   * Delete a directory recursively
   * @param dirPath Path to directory to delete
   */
  private async deleteDirectory(dirPath: string): Promise<void> {
    try {
      if (fs.existsSync(dirPath)) {
        this.logger.info(`Deleting directory: ${dirPath}`);
        await fsPromises.rm(dirPath, { recursive: true, force: true });
        this.logger.info(`Successfully deleted directory: ${dirPath}`);
      }
    } catch (error) {
      this.logger.error(`Failed to delete directory: ${dirPath}`, error);
      throw error;
    }
  }

  /**
   * Handle corrupted runtime by attempting re-extraction
   * @param majorVersion Major Java version
   * @returns true if re-extraction and verification successful
   */
  public async handleCorruptedRuntime(majorVersion: number): Promise<boolean> {
    this.logger.warn(`Handling corrupted Java ${majorVersion} runtime`);
    
    try {
      // Delete corrupted runtime
      const runtimeDir = this.getRuntimeDirectory(majorVersion);
      await this.deleteDirectory(runtimeDir);
      
      // Re-extract from bundle
      await this.extractBundledRuntime(majorVersion);
      
      // Verify the re-extracted runtime
      const verified = await this.fullVerifyRuntime(majorVersion);
      
      if (verified) {
        this.logger.info(`Successfully recovered corrupted Java ${majorVersion} runtime`);
        const runtime = this.availableRuntimes.get(majorVersion);
        if (runtime) {
          runtime.verified = true;
          runtime.extracted = true;
          this.availableRuntimes.set(majorVersion, runtime);
        }
        return true;
      } else {
        this.logger.error(`Failed to recover corrupted Java ${majorVersion} runtime`);
        return false;
      }
    } catch (error) {
      this.logger.error(`Error handling corrupted Java ${majorVersion} runtime`, error);
      return false;
    }
  }

  /**
   * Check if there is sufficient disk space for extraction
   * @param targetPath Path where extraction will occur
   * @param requiredBytes Required space in bytes
   * @returns true if sufficient space available
   */
  private async checkDiskSpace(targetPath: string, requiredBytes: number): Promise<boolean> {
    try {
      // Get the parent directory if target doesn't exist yet
      let checkPath = targetPath;
      while (!fs.existsSync(checkPath)) {
        const parent = path.dirname(checkPath);
        if (parent === checkPath) {
          // Reached root, use current path
          break;
        }
        checkPath = parent;
      }

      // Use fs.statfs on Unix or check available space on Windows
      if (process.platform === 'win32') {
        // On Windows, we'll use a simple heuristic by checking if we can write
        // For a more accurate check, we'd need a native module
        // For now, we'll assume space is available and let the extraction fail if not
        this.logger.debug('Disk space check: Windows platform, assuming sufficient space');
        return true;
      } else {
        // On Unix systems, use statfs
        const stats = await fsPromises.statfs(checkPath);
        const availableBytes = stats.bavail * stats.bsize;
        
        this.logger.debug(`Disk space check: ${availableBytes} bytes available, ${requiredBytes} bytes required`);
        
        if (availableBytes < requiredBytes) {
          this.logger.warn(
            `Insufficient disk space: ${availableBytes} bytes available, ${requiredBytes} bytes required`
          );
          return false;
        }
        
        return true;
      }
    } catch (error) {
      // If we can't check disk space, log warning and proceed
      this.logger.warn('Could not check disk space, proceeding with extraction', error);
      return true;
    }
  }

  /**
   * Check write permissions for a directory
   * @param dirPath Directory path to check
   * @returns true if directory is writable
   */
  private async checkWritePermissions(dirPath: string): Promise<boolean> {
    try {
      // Ensure directory exists
      await fsPromises.mkdir(dirPath, { recursive: true });
      
      // Try to create a test file
      const testFile = path.join(dirPath, '.permission-test');
      await fsPromises.writeFile(testFile, 'test');
      await fsPromises.unlink(testFile);
      
      this.logger.debug(`Write permissions verified for ${dirPath}`);
      return true;
    } catch (error) {
      this.logger.error(`No write permissions for ${dirPath}`, error);
      return false;
    }
  }
}
