import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface MemoryConfiguration {
  min: number;
  max: number;
  recommended: {
    min: number;
    max: number;
  };
  systemLimits: {
    totalMemory: number;
    availableMemory: number;
    maxRecommended: number;
  };
}

export interface JvmPreset {
  name: string;
  description: string;
  args: string[];
  category: 'performance' | 'compatibility' | 'debugging' | 'custom';
  minMemory?: number;
  maxMemory?: number;
  javaVersion?: number;
}

export interface SystemSpecification {
  category: 'low' | 'medium' | 'high' | 'ultra';
  name: string;
  description: string;
  memoryMin: number;
  memoryMax: number;
  jvmArgs: string[];
}

export interface InstallationDirectoryInfo {
  path: string;
  exists: boolean;
  writable: boolean;
  freeSpace: number; // in bytes
  isDefault: boolean;
  isValid: boolean;
  error?: string;
}

export class ProfileConfigService {
  private static readonly DEFAULT_MEMORY_MIN = 1024; // 1GB
  private static readonly DEFAULT_MEMORY_MAX = 2048; // 2GB
  private static readonly MIN_MEMORY_REQUIREMENT = 512; // 512MB
  private static readonly MAX_MEMORY_LIMIT = 32768; // 32GB

  /**
   * Get memory configuration recommendations based on system specs
   */
  public async getMemoryConfiguration(): Promise<MemoryConfiguration> {
    const totalMemoryBytes = os.totalmem();
    const freeMemoryBytes = os.freemem();
    const totalMemoryMB = Math.floor(totalMemoryBytes / (1024 * 1024));
    const freeMemoryMB = Math.floor(freeMemoryBytes / (1024 * 1024));

    // Calculate recommended memory allocation (leave 25% for system)
    const maxRecommendedMB = Math.floor(totalMemoryMB * 0.75);
    const recommendedMinMB = Math.min(2048, Math.floor(totalMemoryMB * 0.25));
    const recommendedMaxMB = Math.min(maxRecommendedMB, Math.floor(totalMemoryMB * 0.5));

    return {
      min: ProfileConfigService.DEFAULT_MEMORY_MIN,
      max: ProfileConfigService.DEFAULT_MEMORY_MAX,
      recommended: {
        min: Math.max(ProfileConfigService.MIN_MEMORY_REQUIREMENT, recommendedMinMB),
        max: Math.max(ProfileConfigService.DEFAULT_MEMORY_MAX, recommendedMaxMB),
      },
      systemLimits: {
        totalMemory: totalMemoryMB,
        availableMemory: freeMemoryMB,
        maxRecommended: maxRecommendedMB,
      },
    };
  }

  /**
   * Validate memory allocation settings
   */
  public validateMemoryAllocation(min: number, max: number): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic range validation
    if (min < ProfileConfigService.MIN_MEMORY_REQUIREMENT) {
      errors.push(`Minimum memory must be at least ${ProfileConfigService.MIN_MEMORY_REQUIREMENT}MB`);
    }

    if (max > ProfileConfigService.MAX_MEMORY_LIMIT) {
      errors.push(`Maximum memory cannot exceed ${ProfileConfigService.MAX_MEMORY_LIMIT}MB`);
    }

    if (min > max) {
      errors.push('Minimum memory cannot be greater than maximum memory');
    }

    // System-based validation
    const totalMemoryMB = Math.floor(os.totalmem() / (1024 * 1024));
    if (max > totalMemoryMB) {
      errors.push(`Maximum memory (${max}MB) exceeds system memory (${totalMemoryMB}MB)`);
    }

    if (max > totalMemoryMB * 0.9) {
      errors.push(`Warning: Allocating more than 90% of system memory may cause system instability`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get predefined JVM argument presets
   */
  public getJvmPresets(): JvmPreset[] {
    return [
      {
        name: 'Default',
        description: 'Standard JVM settings for most users',
        category: 'performance',
        args: [],
      },
      {
        name: 'Performance Optimized',
        description: 'Optimized for better performance on modern systems',
        category: 'performance',
        minMemory: 2048,
        args: [
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
          '-XX:MaxTenuringThreshold=1',
        ],
      },
      {
        name: 'Low Memory',
        description: 'Optimized for systems with limited RAM',
        category: 'performance',
        maxMemory: 2048,
        args: [
          '-XX:+UseSerialGC',
          '-XX:+UnlockExperimentalVMOptions',
          '-XX:+UseCompressedOops',
          '-Xss1M',
        ],
      },
      {
        name: 'High Memory',
        description: 'For systems with 8GB+ RAM and high-end hardware',
        category: 'performance',
        minMemory: 4096,
        args: [
          '-XX:+UseG1GC',
          '-XX:+ParallelRefProcEnabled',
          '-XX:MaxGCPauseMillis=200',
          '-XX:+UnlockExperimentalVMOptions',
          '-XX:+DisableExplicitGC',
          '-XX:+AlwaysPreTouch',
          '-XX:G1NewSizePercent=40',
          '-XX:G1MaxNewSizePercent=50',
          '-XX:G1HeapRegionSize=16M',
          '-XX:G1ReservePercent=20',
          '-XX:G1HeapWastePercent=5',
          '-XX:G1MixedGCCountTarget=4',
          '-XX:InitiatingHeapOccupancyPercent=15',
          '-XX:G1MixedGCLiveThresholdPercent=90',
          '-XX:G1RSetUpdatingPauseTimePercent=5',
          '-XX:SurvivorRatio=32',
          '-XX:+PerfDisableSharedMem',
          '-XX:MaxTenuringThreshold=1',
          '-Dfml.ignoreInvalidMinecraftCertificates=true',
          '-Dfml.ignorePatchDiscrepancies=true',
        ],
      },
      {
        name: 'Compatibility Mode',
        description: 'Conservative settings for maximum compatibility',
        category: 'compatibility',
        args: [
          '-XX:+UseSerialGC',
          '-Djava.net.preferIPv4Stack=true',
          '-Dsun.rmi.dgc.server.gcInterval=2147483646',
        ],
      },
      {
        name: 'Debug Mode',
        description: 'Enable debugging and verbose logging',
        category: 'debugging',
        args: [
          '-XX:+UnlockDiagnosticVMOptions',
          '-XX:+LogVMOutput',
          '-XX:+UseG1GC',
          '-XX:+PrintGC',
          '-XX:+PrintGCDetails',
          '-XX:+PrintGCTimeStamps',
          '-XX:+PrintGCApplicationStoppedTime',
          '-Dfml.debugClassLoading=true',
          '-Dfml.debugClassLoadingSave=true',
        ],
      },
      {
        name: 'Modded Performance',
        description: 'Optimized for heavily modded Minecraft instances',
        category: 'performance',
        minMemory: 3072,
        args: [
          '-XX:+UseG1GC',
          '-XX:+ParallelRefProcEnabled',
          '-XX:MaxGCPauseMillis=200',
          '-XX:+UnlockExperimentalVMOptions',
          '-XX:+DisableExplicitGC',
          '-XX:+AlwaysPreTouch',
          '-XX:G1NewSizePercent=20',
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
          '-XX:MaxTenuringThreshold=1',
          '-Dfml.ignoreInvalidMinecraftCertificates=true',
          '-Dfml.ignorePatchDiscrepancies=true',
          '-Dfml.readTimeout=180',
        ],
      },
    ];
  }

  /**
   * Get system specification presets
   */
  public getSystemSpecifications(): SystemSpecification[] {
    const memoryConfig = os.totalmem() / (1024 * 1024); // Convert to MB

    return [
      {
        category: 'low',
        name: 'Low-End System',
        description: 'For systems with 4GB RAM or less',
        memoryMin: 512,
        memoryMax: 1024,
        jvmArgs: ['-XX:+UseSerialGC', '-XX:+UseCompressedOops'],
      },
      {
        category: 'medium',
        name: 'Mid-Range System',
        description: 'For systems with 4-8GB RAM',
        memoryMin: 1024,
        memoryMax: 2048,
        jvmArgs: ['-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled'],
      },
      {
        category: 'high',
        name: 'High-End System',
        description: 'For systems with 8-16GB RAM',
        memoryMin: 2048,
        memoryMax: 4096,
        jvmArgs: [
          '-XX:+UseG1GC',
          '-XX:+ParallelRefProcEnabled',
          '-XX:MaxGCPauseMillis=200',
          '-XX:+UnlockExperimentalVMOptions',
          '-XX:+DisableExplicitGC',
        ],
      },
      {
        category: 'ultra',
        name: 'Ultra High-End System',
        description: 'For systems with 16GB+ RAM',
        memoryMin: 4096,
        memoryMax: 8192,
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
        ],
      },
    ];
  }

  /**
   * Get recommended system specification based on current system
   */
  public getRecommendedSystemSpec(): SystemSpecification {
    const totalMemoryMB = Math.floor(os.totalmem() / (1024 * 1024));
    const specs = this.getSystemSpecifications();

    if (totalMemoryMB <= 4096) {
      return specs.find(s => s.category === 'low')!;
    } else if (totalMemoryMB <= 8192) {
      return specs.find(s => s.category === 'medium')!;
    } else if (totalMemoryMB <= 16384) {
      return specs.find(s => s.category === 'high')!;
    } else {
      return specs.find(s => s.category === 'ultra')!;
    }
  }

  /**
   * Validate JVM arguments
   */
  public validateJvmArguments(args: string[]): { isValid: boolean; warnings: string[]; errors: string[] } {
    const warnings: string[] = [];
    const errors: string[] = [];

    for (const arg of args) {
      // Check for dangerous arguments
      if (this.isDangerousArgument(arg)) {
        warnings.push(`Potentially dangerous argument: ${arg}`);
      }

      // Check for invalid format
      if (!this.isValidJvmArgument(arg)) {
        errors.push(`Invalid JVM argument format: ${arg}`);
      }

      // Check for conflicting arguments
      const conflicts = this.getArgumentConflicts(arg, args);
      if (conflicts.length > 0) {
        warnings.push(`Argument ${arg} conflicts with: ${conflicts.join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      warnings,
      errors,
    };
  }

  /**
   * Get installation directory information
   */
  public async getInstallationDirectoryInfo(dirPath: string): Promise<InstallationDirectoryInfo> {
    const resolvedPath = path.resolve(dirPath);
    const defaultPath = this.getDefaultInstallationDirectory();
    
    const info: InstallationDirectoryInfo = {
      path: resolvedPath,
      exists: false,
      writable: false,
      freeSpace: 0,
      isDefault: resolvedPath === defaultPath,
      isValid: true,
    };

    try {
      // Check if directory exists
      const stats = await fs.stat(resolvedPath);
      info.exists = stats.isDirectory();

      if (info.exists) {
        // Check if writable
        try {
          await fs.access(resolvedPath, fs.constants.W_OK);
          info.writable = true;
        } catch {
          info.writable = false;
          info.error = 'Directory is not writable';
        }

        // Get free space (simplified - actual implementation would use statvfs)
        info.freeSpace = await this.getFreeSpace(resolvedPath);
      }

      // Validate path
      if (this.isSystemDirectory(resolvedPath)) {
        info.isValid = false;
        info.error = 'Cannot use system directories for Minecraft installation';
      }

    } catch (error) {
      info.exists = false;
      info.error = `Directory access error: ${error}`;
    }

    return info;
  }

  /**
   * Create installation directory
   */
  public async createInstallationDirectory(dirPath: string): Promise<void> {
    const resolvedPath = path.resolve(dirPath);
    
    if (this.isSystemDirectory(resolvedPath)) {
      throw new Error('Cannot create installation directory in system location');
    }

    await fs.mkdir(resolvedPath, { recursive: true });
  }

  /**
   * Get default installation directory
   */
  public getDefaultInstallationDirectory(): string {
    const homeDir = os.homedir();
    
    switch (process.platform) {
      case 'win32':
        return path.join(homeDir, 'AppData', 'Roaming', '.minecraft');
      case 'darwin':
        return path.join(homeDir, 'Library', 'Application Support', 'minecraft');
      default:
        return path.join(homeDir, '.minecraft');
    }
  }

  /**
   * Generate profile-specific installation directory
   */
  public generateProfileInstallationDirectory(profileName: string, baseDir?: string): string {
    const safeName = profileName.replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
    const base = baseDir || this.getDefaultInstallationDirectory();
    return path.join(base, 'profiles', safeName);
  }

  // Private helper methods

  private isDangerousArgument(arg: string): boolean {
    const dangerousPatterns = [
      /^-XX:\+UnlockExperimentalVMOptions$/,
      /^-XX:\+UseZGC$/,
      /^-XX:\+UseShenandoahGC$/,
      /^-Xverify:none$/,
      /^-XX:-UseCompressedOops$/,
    ];

    return dangerousPatterns.some(pattern => pattern.test(arg));
  }

  private isValidJvmArgument(arg: string): boolean {
    // Valid JVM arguments start with -X, -D, or -XX:
    return /^(-X|-D|-XX:)/.test(arg) || arg.startsWith('-javaagent:');
  }

  private getArgumentConflicts(arg: string, allArgs: string[]): string[] {
    const conflicts: string[] = [];
    
    // Define conflicting argument groups
    const conflictGroups = [
      ['-XX:+UseG1GC', '-XX:+UseParallelGC', '-XX:+UseSerialGC', '-XX:+UseConcMarkSweepGC'],
      ['-XX:+UseCompressedOops', '-XX:-UseCompressedOops'],
    ];

    for (const group of conflictGroups) {
      if (group.includes(arg)) {
        const otherConflicts = group.filter(conflictArg => 
          conflictArg !== arg && allArgs.includes(conflictArg)
        );
        conflicts.push(...otherConflicts);
      }
    }

    return conflicts;
  }

  private isSystemDirectory(dirPath: string): boolean {
    const systemDirs = process.platform === 'win32' 
      ? ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\System32']
      : ['/System', '/usr', '/bin', '/sbin', '/etc', '/var', '/tmp'];

    return systemDirs.some(sysDir => 
      dirPath.toLowerCase().startsWith(sysDir.toLowerCase())
    );
  }

  private async getFreeSpace(dirPath: string): Promise<number> {
    // Simplified implementation - in a real app, you'd use a native module
    // or system call to get actual free space
    try {
      const stats = await fs.stat(dirPath);
      return 10 * 1024 * 1024 * 1024; // Return 10GB as placeholder
    } catch {
      return 0;
    }
  }
}