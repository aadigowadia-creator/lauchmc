import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { BundledJavaService } from './bundled-java-service';
import { LoggerService } from './logger-service';
import { ErrorFactory } from '../errors/launcher-error';

const execAsync = promisify(exec);

export interface JavaInstallation {
  path: string;
  version: string;
  majorVersion: number;
  architecture: string;
  vendor?: string;
  isBundled?: boolean; // Flag to indicate if this is a bundled runtime
}

export interface JavaCompatibility {
  isCompatible: boolean;
  requiredVersion: number;
  actualVersion: number;
  issues: string[];
}

export class JavaService {
  private static instance: JavaService;
  private cachedInstallations: JavaInstallation[] | null = null;
  private bundledJavaService: BundledJavaService;
  private logger: LoggerService;

  private constructor() {
    this.bundledJavaService = BundledJavaService.getInstance();
    this.logger = LoggerService.getInstance();
  }

  public static getInstance(): JavaService {
    if (!JavaService.instance) {
      JavaService.instance = new JavaService();
    }
    return JavaService.instance;
  }

  /**
   * Detect all Java installations on the system
   */
  public async detectJavaInstallations(): Promise<JavaInstallation[]> {
    if (this.cachedInstallations) {
      return this.cachedInstallations;
    }

    const installations: JavaInstallation[] = [];
    
    try {
      // First, add bundled runtimes to the list
      const bundledRuntimes = this.bundledJavaService.getAllBundledRuntimes();
      for (const runtime of bundledRuntimes) {
        if (runtime.extracted && runtime.verified) {
          installations.push({
            path: runtime.path,
            version: runtime.fullVersion,
            majorVersion: runtime.version,
            architecture: runtime.architecture,
            vendor: 'Bundled',
            isBundled: true,
          });
        }
      }

      // Check JAVA_HOME environment variable
      const javaHome = process.env.JAVA_HOME;
      if (javaHome) {
        const javaPath = path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
        const installation = await this.getJavaInfo(javaPath);
        if (installation) {
          installations.push(installation);
        }
      }

      // Check system PATH
      try {
        const { stdout } = await execAsync(process.platform === 'win32' ? 'where java' : 'which java');
        const javaPaths = stdout.trim().split('\n').filter(p => p.trim());
        
        for (const javaPath of javaPaths) {
          const installation = await this.getJavaInfo(javaPath.trim());
          if (installation && !installations.find(i => i.path === installation.path)) {
            installations.push(installation);
          }
        }
      } catch (error) {
        // Java not found in PATH
      }

      // Platform-specific detection
      const platformInstallations = await this.detectPlatformSpecificJava();
      for (const installation of platformInstallations) {
        if (!installations.find(i => i.path === installation.path)) {
          installations.push(installation);
        }
      }

    } catch (error) {
      console.error('Error detecting Java installations:', error);
    }

    this.cachedInstallations = installations;
    return installations;
  }

  /**
   * Get detailed information about a Java installation
   */
  private async getJavaInfo(javaPath: string): Promise<JavaInstallation | null> {
    try {
      // Check if file exists
      await fs.access(javaPath);

      // Get version information
      const { stdout } = await execAsync(`"${javaPath}" -version`);
      const versionOutput = stdout || '';
      
      // Parse version string (e.g., "17.0.1", "1.8.0_291", "11.0.12")
      const versionMatch = versionOutput.match(/version "([^"]+)"/);
      if (!versionMatch) {
        return null;
      }

      const fullVersion = versionMatch[1];
      const majorVersion = this.parseMajorVersion(fullVersion);
      
      // Get architecture
      const archMatch = versionOutput.match(/(\d+)-bit/);
      const architecture = archMatch ? `${archMatch[1]}-bit` : 'unknown';

      // Get vendor information
      const vendorMatch = versionOutput.match(/(OpenJDK|Oracle|Eclipse|Amazon|Microsoft)/i);
      const vendor = vendorMatch ? vendorMatch[1] : undefined;

      return {
        path: javaPath,
        version: fullVersion,
        majorVersion,
        architecture,
        vendor
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse major version from version string
   */
  private parseMajorVersion(versionString: string): number {
    // Handle different version formats:
    // Java 8: "1.8.0_291" -> 8
    // Java 9+: "17.0.1" -> 17
    if (versionString.startsWith('1.')) {
      const match = versionString.match(/^1\.(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    } else {
      const match = versionString.match(/^(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    }
  }

  /**
   * Detect Java installations in platform-specific locations
   */
  private async detectPlatformSpecificJava(): Promise<JavaInstallation[]> {
    const installations: JavaInstallation[] = [];
    
    try {
      switch (process.platform) {
        case 'win32':
          await this.detectWindowsJava(installations);
          break;
        case 'darwin':
          await this.detectMacOSJava(installations);
          break;
        case 'linux':
          await this.detectLinuxJava(installations);
          break;
      }
    } catch (error) {
      console.error('Error in platform-specific Java detection:', error);
    }

    return installations;
  }

  /**
   * Detect Java installations on Windows
   */
  private async detectWindowsJava(installations: JavaInstallation[]): Promise<void> {
    const commonPaths = [
      'C:\\Program Files\\Java',
      'C:\\Program Files (x86)\\Java',
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Microsoft\\jdk',
      'C:\\Program Files\\Amazon Corretto'
    ];

    for (const basePath of commonPaths) {
      try {
        const entries = await fs.readdir(basePath);
        for (const entry of entries) {
          const javaPath = path.join(basePath, entry, 'bin', 'java.exe');
          const installation = await this.getJavaInfo(javaPath);
          if (installation) {
            installations.push(installation);
          }
        }
      } catch (error) {
        // Directory doesn't exist or can't be read
      }
    }
  }

  /**
   * Detect Java installations on macOS
   */
  private async detectMacOSJava(installations: JavaInstallation[]): Promise<void> {
    const commonPaths = [
      '/Library/Java/JavaVirtualMachines',
      '/System/Library/Java/JavaVirtualMachines',
      '/usr/libexec/java_home'
    ];

    // Check JavaVirtualMachines directories
    for (const basePath of commonPaths.slice(0, 2)) {
      try {
        const entries = await fs.readdir(basePath);
        for (const entry of entries) {
          const javaPath = path.join(basePath, entry, 'Contents', 'Home', 'bin', 'java');
          const installation = await this.getJavaInfo(javaPath);
          if (installation) {
            installations.push(installation);
          }
        }
      } catch (error) {
        // Directory doesn't exist or can't be read
      }
    }

    // Use java_home utility if available
    try {
      const { stdout } = await execAsync('/usr/libexec/java_home -V 2>&1');
      const lines = stdout.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*([^,]+),\s*[^:]+:\s*(.+)$/);
        if (match) {
          const javaPath = path.join(match[2].trim(), 'bin', 'java');
          const installation = await this.getJavaInfo(javaPath);
          if (installation) {
            installations.push(installation);
          }
        }
      }
    } catch (error) {
      // java_home not available
    }
  }

  /**
   * Detect Java installations on Linux
   */
  private async detectLinuxJava(installations: JavaInstallation[]): Promise<void> {
    const commonPaths = [
      '/usr/lib/jvm',
      '/usr/java',
      '/opt/java',
      '/snap/openjdk'
    ];

    for (const basePath of commonPaths) {
      try {
        const entries = await fs.readdir(basePath);
        for (const entry of entries) {
          const javaPath = path.join(basePath, entry, 'bin', 'java');
          const installation = await this.getJavaInfo(javaPath);
          if (installation) {
            installations.push(installation);
          }
        }
      } catch (error) {
        // Directory doesn't exist or can't be read
      }
    }
  }

  /**
   * Validate Java compatibility with Minecraft version
   */
  public validateJavaCompatibility(
    javaInstallation: JavaInstallation,
    minecraftVersion: string
  ): JavaCompatibility {
    const requiredVersion = this.getRequiredJavaVersion(minecraftVersion);
    const actualVersion = javaInstallation.majorVersion;
    const issues: string[] = [];

    let isCompatible = true;

    // Check minimum version requirement
    if (actualVersion < requiredVersion) {
      isCompatible = false;
      issues.push(`Java ${requiredVersion} or higher is required for Minecraft ${minecraftVersion}`);
    }

    // Check for known compatibility issues
    if (actualVersion > 17 && this.isOlderMinecraftVersion(minecraftVersion)) {
      issues.push(`Java ${actualVersion} may have compatibility issues with older Minecraft versions`);
    }

    // Check architecture (prefer 64-bit for better performance)
    if (javaInstallation.architecture === '32-bit') {
      issues.push('32-bit Java may have memory limitations. Consider using 64-bit Java for better performance');
    }

    return {
      isCompatible,
      requiredVersion,
      actualVersion,
      issues
    };
  }

  /**
   * Get required Java version for Minecraft version
   * Based on requirement 2.1: Use Java 17 for Minecraft 1.17+, Java 8 for older versions
   * Updated: Minecraft 1.21+ requires Java 21
   */
  private getRequiredJavaVersion(minecraftVersion: string): number {
    // Minecraft version to Java version mapping
    const versionParts = minecraftVersion.split('.');
    const major = parseInt(versionParts[0], 10);
    const minor = parseInt(versionParts[1], 10);

    // Minecraft 1.21+ requires Java 21
    if (major > 1 || (major === 1 && minor >= 21)) {
      return 21;
    }
    
    // Minecraft 1.17-1.20 requires Java 17
    if (major === 1 && minor >= 17) {
      return 17;
    }
    
    // Older versions use Java 8 (bundled runtime)
    return 8;
  }

  /**
   * Check if Minecraft version is considered older
   */
  private isOlderMinecraftVersion(minecraftVersion: string): boolean {
    const versionParts = minecraftVersion.split('.');
    const major = parseInt(versionParts[0], 10);
    const minor = parseInt(versionParts[1], 10);

    return major === 1 && minor < 17;
  }

  /**
   * Get Java download suggestions for missing installations
   */
  public getJavaDownloadSuggestions(): Array<{
    name: string;
    url: string;
    description: string;
    recommended: boolean;
  }> {
    return [
      {
        name: 'Eclipse Temurin (Adoptium)',
        url: 'https://adoptium.net/temurin/releases/',
        description: 'Free, open-source OpenJDK distribution with long-term support',
        recommended: true
      },
      {
        name: 'Oracle JDK',
        url: 'https://www.oracle.com/java/technologies/downloads/',
        description: 'Official Oracle Java Development Kit',
        recommended: false
      },
      {
        name: 'Amazon Corretto',
        url: 'https://aws.amazon.com/corretto/',
        description: 'Free, multiplatform OpenJDK distribution by Amazon',
        recommended: true
      },
      {
        name: 'Microsoft OpenJDK',
        url: 'https://www.microsoft.com/openjdk',
        description: 'Microsoft\'s distribution of OpenJDK',
        recommended: true
      }
    ];
  }

  /**
   * Clear cached installations to force re-detection
   */
  public clearCache(): void {
    this.cachedInstallations = null;
  }

  /**
   * Get bundled Java installation for a specific major version
   * @param majorVersion Major Java version (8, 17, etc.)
   * @returns JavaInstallation object if bundled runtime exists and is verified, null otherwise
   */
  public async getBundledJavaInstallation(majorVersion: number): Promise<JavaInstallation | null> {
    try {
      // Check if bundled runtime is available
      if (!this.bundledJavaService.isBundledRuntimeAvailable(majorVersion)) {
        this.logger.warn(
          `Bundled Java ${majorVersion} runtime not available, will fall back to system Java`
        );
        return null;
      }

      // Get bundled runtime info
      const runtimeInfo = this.bundledJavaService.getBundledRuntimeInfo(majorVersion);
      if (!runtimeInfo) {
        this.logger.warn(`Could not get bundled runtime info for Java ${majorVersion}`);
        return null;
      }

      // Verify runtime before first use
      const verified = await this.bundledJavaService.verifyBeforeFirstUse(majorVersion);
      if (!verified) {
        this.logger.warn(
          `Bundled Java ${majorVersion} runtime failed verification, falling back to system Java`
        );
        return null;
      }

      this.logger.info(`Using bundled Java ${majorVersion} runtime`);

      // Return JavaInstallation object for bundled runtime
      return {
        path: runtimeInfo.path,
        version: runtimeInfo.fullVersion,
        majorVersion: runtimeInfo.version,
        architecture: runtimeInfo.architecture,
        vendor: 'Bundled',
        isBundled: true,
      };
    } catch (error) {
      this.logger.error(
        `Error getting bundled Java installation for version ${majorVersion}, falling back to system Java`,
        error
      );
      return null;
    }
  }

  /**
   * Get the best Java installation for a given Minecraft version
   */
  public async getBestJavaInstallation(minecraftVersion: string): Promise<JavaInstallation | null> {
    const requiredVersion = this.getRequiredJavaVersion(minecraftVersion);

    // Priority 1: Check bundled runtime for required version
    const bundledJava = await this.getBundledJavaInstallation(requiredVersion);
    if (bundledJava) {
      this.logger.info(
        `Selected bundled Java ${requiredVersion} for Minecraft ${minecraftVersion}`
      );
      return bundledJava;
    }

    this.logger.info(
      `Bundled Java ${requiredVersion} not available, checking system installations`
    );

    // Priority 2: Check system Java installations
    const installations = await this.detectJavaInstallations();
    
    if (installations.length === 0) {
      this.logger.warn('No Java installations found on system');
      
      // Priority 3: Fallback to any bundled runtime if no system Java
      // Try Java 21 first, then Java 17, then Java 8
      const fallbackVersions = [21, 17, 8];
      for (const version of fallbackVersions) {
        this.logger.info(`Attempting fallback to bundled Java ${version}`);
        const fallbackBundled = await this.getBundledJavaInstallation(version);
        if (fallbackBundled) {
          this.logger.warn(
            `Using bundled Java ${version} as fallback (required: Java ${requiredVersion})`
          );
          return fallbackBundled;
        }
      }
      
      this.logger.error('No Java installations available (bundled or system)');
      return null;
    }

    // Filter compatible installations
    const compatibleInstallations = installations.filter(installation => {
      const compatibility = this.validateJavaCompatibility(installation, minecraftVersion);
      return compatibility.isCompatible;
    });

    if (compatibleInstallations.length === 0) {
      this.logger.warn('No compatible system Java installations found');
      
      // Priority 3: Fallback to any bundled runtime if no compatible system Java
      // Try Java 21 first, then Java 17, then Java 8
      const fallbackVersions = [21, 17, 8];
      for (const version of fallbackVersions) {
        this.logger.info(`Attempting fallback to bundled Java ${version}`);
        const fallbackBundled = await this.getBundledJavaInstallation(version);
        if (fallbackBundled) {
          this.logger.warn(
            `Using bundled Java ${version} as fallback (required: Java ${requiredVersion})`
          );
          return fallbackBundled;
        }
      }
      
      this.logger.error('No compatible Java installations available');
      return null;
    }

    // Sort by preference: 64-bit, newer versions, known vendors
    const selectedJava = compatibleInstallations.sort((a, b) => {
      // Prefer 64-bit
      if (a.architecture.includes('64') && !b.architecture.includes('64')) return -1;
      if (!a.architecture.includes('64') && b.architecture.includes('64')) return 1;

      // Prefer appropriate version (not too new, not too old)
      const aDiff = Math.abs(a.majorVersion - requiredVersion);
      const bDiff = Math.abs(b.majorVersion - requiredVersion);
      if (aDiff !== bDiff) return aDiff - bDiff;

      // Prefer known vendors
      const preferredVendors = ['Eclipse', 'Amazon', 'Microsoft'];
      const aVendorScore = a.vendor && preferredVendors.includes(a.vendor) ? 1 : 0;
      const bVendorScore = b.vendor && preferredVendors.includes(b.vendor) ? 1 : 0;
      
      return bVendorScore - aVendorScore;
    })[0];

    this.logger.info(
      `Selected system Java ${selectedJava.majorVersion} (${selectedJava.vendor || 'Unknown'}) for Minecraft ${minecraftVersion}`
    );

    return selectedJava;
  }
}