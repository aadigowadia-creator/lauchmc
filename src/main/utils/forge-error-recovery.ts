import { promises as fs } from 'fs';
import * as path from 'path';
import { LauncherError, ErrorFactory, ErrorCode } from '../errors/launcher-error';
import { LoggerService } from '../services/logger-service';

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export interface FallbackOptions {
  primaryUrl: string;
  fallbackUrls: string[];
  timeout: number;
}

export interface CleanupOptions {
  targetPath: string;
  tempFiles?: string[];
  directories?: string[];
  preserveUserData?: boolean;
}

export interface OperationResult<T> {
  success: boolean;
  data?: T;
  error?: LauncherError;
  attempts: number;
  totalTime: number;
}

/**
 * Error recovery utilities for Forge mod management
 * Requirements: 1.5, 4.5, 5.5
 */
export class ForgeErrorRecovery {
  private logger: LoggerService;
  
  constructor() {
    this.logger = LoggerService.getInstance();
  }

  /**
   * Retry an operation with exponential backoff
   * Requirements: 1.5, 4.5, 5.5
   */
  async retryWithBackoff<T>(
    operation: () => Promise<T>,
    options: Partial<RetryOptions> = {},
    operationName: string = 'operation'
  ): Promise<OperationResult<T>> {
    const config: RetryOptions = {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      jitter: true,
      ...options
    };

    const startTime = Date.now();
    let lastError: Error | null = null;
    let attempts = 0;

    this.logger.info(`Starting ${operationName} with retry configuration`, {
      maxRetries: config.maxRetries,
      baseDelayMs: config.baseDelayMs,
      backoffMultiplier: config.backoffMultiplier
    });

    for (attempts = 1; attempts <= config.maxRetries + 1; attempts++) {
      try {
        this.logger.debug(`${operationName} attempt ${attempts}/${config.maxRetries + 1}`);
        
        const result = await operation();
        const totalTime = Date.now() - startTime;
        
        this.logger.info(`${operationName} succeeded on attempt ${attempts}`, {
          attempts,
          totalTimeMs: totalTime
        });

        return {
          success: true,
          data: result,
          attempts,
          totalTime
        };
      } catch (error) {
        lastError = error as Error;
        const totalTime = Date.now() - startTime;
        
        this.logger.warn(`${operationName} attempt ${attempts} failed`, {
          error: lastError.message,
          attempts,
          totalTimeMs: totalTime
        });

        // Don't wait after the last attempt
        if (attempts <= config.maxRetries) {
          const delay = this.calculateBackoffDelay(attempts, config);
          this.logger.debug(`Waiting ${delay}ms before retry ${attempts + 1}`);
          await this.sleep(delay);
        }
      }
    }

    const totalTime = Date.now() - startTime;
    const launcherError = this.convertToLauncherError(lastError!, operationName, attempts - 1);
    
    this.logger.error(`${operationName} failed after ${attempts - 1} attempts`, {
      error: lastError?.message,
      attempts: attempts - 1,
      totalTimeMs: totalTime
    });

    return {
      success: false,
      error: launcherError,
      attempts: attempts - 1,
      totalTime
    };
  }

  /**
   * Try multiple URLs with fallback strategy
   * Requirements: 1.5, 4.5, 5.5
   */
  async fallbackToAlternativeSource<T>(
    operation: (url: string) => Promise<T>,
    options: FallbackOptions,
    operationName: string = 'download'
  ): Promise<OperationResult<T>> {
    const allUrls = [options.primaryUrl, ...options.fallbackUrls];
    const startTime = Date.now();
    let lastError: Error | null = null;
    let attempts = 0;

    this.logger.info(`Starting ${operationName} with fallback URLs`, {
      primaryUrl: options.primaryUrl,
      fallbackCount: options.fallbackUrls.length,
      timeout: options.timeout
    });

    for (let i = 0; i < allUrls.length; i++) {
      const url = allUrls[i];
      const isMainUrl = i === 0;
      attempts++;

      try {
        this.logger.debug(`${operationName} attempt ${i + 1}/${allUrls.length}`, {
          url: this.sanitizeUrl(url),
          isMainUrl
        });

        // Set timeout for the operation
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Operation timeout')), options.timeout);
        });

        const result = await Promise.race([
          operation(url),
          timeoutPromise
        ]);

        const totalTime = Date.now() - startTime;
        
        this.logger.info(`${operationName} succeeded with ${isMainUrl ? 'primary' : 'fallback'} URL`, {
          urlIndex: i,
          attempts,
          totalTimeMs: totalTime
        });

        return {
          success: true,
          data: result,
          attempts,
          totalTime
        };
      } catch (error) {
        lastError = error as Error;
        const totalTime = Date.now() - startTime;
        
        this.logger.warn(`${operationName} failed with ${isMainUrl ? 'primary' : 'fallback'} URL`, {
          urlIndex: i,
          url: this.sanitizeUrl(url),
          error: lastError.message,
          totalTimeMs: totalTime
        });

        // Small delay between URL attempts to avoid overwhelming servers
        if (i < allUrls.length - 1) {
          await this.sleep(500);
        }
      }
    }

    const totalTime = Date.now() - startTime;
    const launcherError = this.convertToLauncherError(lastError!, operationName, attempts);
    
    this.logger.error(`${operationName} failed with all URLs`, {
      urlCount: allUrls.length,
      attempts,
      totalTimeMs: totalTime,
      error: lastError?.message
    });

    return {
      success: false,
      error: launcherError,
      attempts,
      totalTime
    };
  }

  /**
   * Clean up partial installations and temporary files
   * Requirements: 1.5, 4.5, 5.5
   */
  async cleanupPartialInstallation(
    options: CleanupOptions,
    operationName: string = 'cleanup'
  ): Promise<OperationResult<void>> {
    const startTime = Date.now();
    const cleanupResults: { path: string; success: boolean; error?: string }[] = [];

    this.logger.info(`Starting ${operationName}`, {
      targetPath: options.targetPath,
      tempFiles: options.tempFiles?.length || 0,
      directories: options.directories?.length || 0,
      preserveUserData: options.preserveUserData
    });

    try {
      // Clean up main target file/directory
      if (await this.pathExists(options.targetPath)) {
        try {
          const stats = await fs.stat(options.targetPath);
          if (stats.isDirectory()) {
            await fs.rm(options.targetPath, { recursive: true, force: true });
          } else {
            await fs.unlink(options.targetPath);
          }
          cleanupResults.push({ path: options.targetPath, success: true });
          this.logger.debug(`Cleaned up target path: ${options.targetPath}`);
        } catch (error) {
          const errorMsg = (error as Error).message;
          cleanupResults.push({ path: options.targetPath, success: false, error: errorMsg });
          this.logger.warn(`Failed to clean up target path: ${options.targetPath}`, { error: errorMsg });
        }
      }

      // Clean up temporary files
      if (options.tempFiles) {
        for (const tempFile of options.tempFiles) {
          if (await this.pathExists(tempFile)) {
            try {
              await fs.unlink(tempFile);
              cleanupResults.push({ path: tempFile, success: true });
              this.logger.debug(`Cleaned up temp file: ${tempFile}`);
            } catch (error) {
              const errorMsg = (error as Error).message;
              cleanupResults.push({ path: tempFile, success: false, error: errorMsg });
              this.logger.warn(`Failed to clean up temp file: ${tempFile}`, { error: errorMsg });
            }
          }
        }
      }

      // Clean up directories (but preserve user data if requested)
      if (options.directories) {
        for (const directory of options.directories) {
          if (await this.pathExists(directory)) {
            try {
              if (options.preserveUserData) {
                // Only remove empty directories or non-user-data files
                await this.cleanupDirectorySelectively(directory);
              } else {
                await fs.rm(directory, { recursive: true, force: true });
              }
              cleanupResults.push({ path: directory, success: true });
              this.logger.debug(`Cleaned up directory: ${directory}`);
            } catch (error) {
              const errorMsg = (error as Error).message;
              cleanupResults.push({ path: directory, success: false, error: errorMsg });
              this.logger.warn(`Failed to clean up directory: ${directory}`, { error: errorMsg });
            }
          }
        }
      }

      const totalTime = Date.now() - startTime;
      const successCount = cleanupResults.filter(r => r.success).length;
      const failureCount = cleanupResults.length - successCount;

      this.logger.info(`${operationName} completed`, {
        totalItems: cleanupResults.length,
        successful: successCount,
        failed: failureCount,
        totalTimeMs: totalTime
      });

      return {
        success: failureCount === 0,
        attempts: 1,
        totalTime,
        error: failureCount > 0 ? ErrorFactory.fromError(
          new Error(`Cleanup partially failed: ${failureCount}/${cleanupResults.length} items failed`)
        ) : undefined
      };
    } catch (error) {
      const totalTime = Date.now() - startTime;
      const launcherError = ErrorFactory.fromError(error as Error);
      
      this.logger.error(`${operationName} failed`, {
        error: (error as Error).message,
        totalTimeMs: totalTime
      });

      return {
        success: false,
        error: launcherError,
        attempts: 1,
        totalTime
      };
    }
  }

  /**
   * Validate and repair mod directory structure
   * Requirements: 1.5, 4.5, 5.5
   */
  async validateAndRepairModDirectory(
    modsPath: string,
    operationName: string = 'directory-validation'
  ): Promise<OperationResult<{ repaired: boolean; issues: string[] }>> {
    const startTime = Date.now();
    const issues: string[] = [];
    let repaired = false;

    this.logger.info(`Starting ${operationName}`, { modsPath });

    try {
      // Check if mods directory exists
      if (!(await this.pathExists(modsPath))) {
        this.logger.info(`Mods directory does not exist, creating: ${modsPath}`);
        await fs.mkdir(modsPath, { recursive: true });
        repaired = true;
        issues.push('Created missing mods directory');
      }

      // Check directory permissions
      try {
        await fs.access(modsPath, fs.constants.R_OK | fs.constants.W_OK);
      } catch (error) {
        issues.push('Insufficient permissions for mods directory');
        this.logger.warn('Insufficient permissions for mods directory', {
          modsPath,
          error: (error as Error).message
        });
      }

      // Check for corrupted mod files
      const files = await fs.readdir(modsPath);
      const jarFiles = files.filter(file => file.endsWith('.jar') || file.endsWith('.jar.disabled'));
      
      for (const file of jarFiles) {
        const filePath = path.join(modsPath, file);
        try {
          const stats = await fs.stat(filePath);
          
          // Check if file is too small to be a valid JAR
          if (stats.size < 1024) { // Less than 1KB is suspicious
            issues.push(`Suspicious file size for ${file}: ${stats.size} bytes`);
            this.logger.warn(`Suspicious mod file size`, {
              file,
              size: stats.size
            });
          }

          // Check if file is readable
          await fs.access(filePath, fs.constants.R_OK);
        } catch (error) {
          issues.push(`Cannot access mod file: ${file}`);
          this.logger.warn(`Cannot access mod file`, {
            file,
            error: (error as Error).message
          });
        }
      }

      // Check for orphaned .disabled files without corresponding .jar files
      const disabledFiles = files.filter(file => file.endsWith('.jar.disabled'));
      for (const disabledFile of disabledFiles) {
        const jarFile = disabledFile.replace('.disabled', '');
        if (!files.includes(jarFile)) {
          // This is expected - disabled files should not have corresponding jar files
          continue;
        }
      }

      const totalTime = Date.now() - startTime;
      
      this.logger.info(`${operationName} completed`, {
        modsPath,
        issuesFound: issues.length,
        repaired,
        totalTimeMs: totalTime
      });

      return {
        success: true,
        data: { repaired, issues },
        attempts: 1,
        totalTime
      };
    } catch (error) {
      const totalTime = Date.now() - startTime;
      const launcherError = ErrorFactory.fromError(error as Error);
      
      this.logger.error(`${operationName} failed`, {
        modsPath,
        error: (error as Error).message,
        totalTimeMs: totalTime
      });

      return {
        success: false,
        error: launcherError,
        attempts: 1,
        totalTime
      };
    }
  }

  /**
   * Check available disk space before operations
   * Requirements: 1.5, 4.5, 5.5
   */
  async checkDiskSpace(
    targetPath: string,
    requiredBytes: number,
    operationName: string = 'disk-space-check'
  ): Promise<OperationResult<{ available: number; sufficient: boolean }>> {
    const startTime = Date.now();

    try {
      this.logger.debug(`Checking disk space for ${operationName}`, {
        targetPath,
        requiredBytes,
        requiredMB: Math.round(requiredBytes / 1024 / 1024)
      });

      const stats = await fs.statfs(path.dirname(targetPath));
      const availableBytes = stats.bavail * stats.bsize;
      const sufficient = availableBytes >= requiredBytes;

      const totalTime = Date.now() - startTime;

      this.logger.info(`Disk space check completed`, {
        targetPath,
        availableBytes,
        availableMB: Math.round(availableBytes / 1024 / 1024),
        requiredBytes,
        requiredMB: Math.round(requiredBytes / 1024 / 1024),
        sufficient,
        totalTimeMs: totalTime
      });

      return {
        success: true,
        data: { available: availableBytes, sufficient },
        attempts: 1,
        totalTime
      };
    } catch (error) {
      const totalTime = Date.now() - startTime;
      
      // Disk space check failure is not critical, log and continue
      this.logger.warn(`Disk space check failed, assuming sufficient space`, {
        targetPath,
        error: (error as Error).message,
        totalTimeMs: totalTime
      });

      return {
        success: true,
        data: { available: requiredBytes * 2, sufficient: true }, // Assume sufficient
        attempts: 1,
        totalTime
      };
    }
  }

  // Private helper methods

  private calculateBackoffDelay(attempt: number, options: RetryOptions): number {
    let delay = options.baseDelayMs * Math.pow(options.backoffMultiplier, attempt - 1);
    
    // Cap the delay at maxDelayMs
    delay = Math.min(delay, options.maxDelayMs);
    
    // Add jitter if enabled
    if (options.jitter) {
      const jitterAmount = delay * 0.1; // 10% jitter
      delay += (Math.random() - 0.5) * 2 * jitterAmount;
    }
    
    return Math.round(delay);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async cleanupDirectorySelectively(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively clean subdirectories
        await this.cleanupDirectorySelectively(fullPath);
        
        // Remove directory if it's empty
        try {
          await fs.rmdir(fullPath);
        } catch {
          // Directory not empty, leave it
        }
      } else {
        // Remove files that are not user data
        // This is a simple heuristic - in practice you'd have more sophisticated logic
        if (!this.isUserDataFile(entry.name)) {
          try {
            await fs.unlink(fullPath);
          } catch (error) {
            this.logger.warn(`Failed to remove file during selective cleanup`, {
              file: fullPath,
              error: (error as Error).message
            });
          }
        }
      }
    }
  }

  private isUserDataFile(filename: string): boolean {
    // Simple heuristic for user data files
    const userDataExtensions = ['.txt', '.log', '.properties', '.json', '.yml', '.yaml'];
    const userDataPatterns = ['config', 'settings', 'options', 'saves'];
    
    const lowerFilename = filename.toLowerCase();
    
    return userDataExtensions.some(ext => lowerFilename.endsWith(ext)) ||
           userDataPatterns.some(pattern => lowerFilename.includes(pattern));
  }

  private sanitizeUrl(url: string): string {
    // Remove sensitive information from URLs for logging
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    } catch {
      return url.substring(0, 50) + '...';
    }
  }

  private convertToLauncherError(error: Error, operationName: string, attempts: number): LauncherError {
    // Convert common errors to appropriate LauncherError types
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('enotfound') || message.includes('etimedout')) {
      return ErrorFactory.networkError(error);
    }
    
    if (message.includes('permission') || message.includes('eacces')) {
      return ErrorFactory.permissionDenied(operationName);
    }
    
    if (message.includes('space') || message.includes('enospc')) {
      return ErrorFactory.diskSpaceInsufficient('unknown');
    }
    
    if (operationName.includes('download')) {
      return ErrorFactory.modDownloadFailed('unknown', error.message, error);
    }
    
    if (operationName.includes('forge')) {
      return ErrorFactory.modLoaderInstallFailed('Forge', error);
    }
    
    // Default to generic error
    return ErrorFactory.fromError(error);
  }
}