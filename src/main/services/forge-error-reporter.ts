import { LauncherError, ErrorFactory, ErrorCode } from '../errors/launcher-error';
import { LoggerService } from './logger-service';
import { ForgeErrorRecovery } from '../utils/forge-error-recovery';

export interface ErrorContext {
  operation: string;
  gameVersion?: string;
  forgeVersion?: string;
  optifineVersion?: string;
  profileName?: string;
  modName?: string;
  filePath?: string;
  timestamp: Date;
  userAgent?: string;
  systemInfo?: {
    platform: string;
    arch: string;
    nodeVersion: string;
    electronVersion: string;
  };
}

export interface FormattedError {
  title: string;
  message: string;
  details: string;
  solutions: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'network' | 'filesystem' | 'compatibility' | 'configuration' | 'system';
  recoverable: boolean;
  retryable: boolean;
  contactSupport: boolean;
}

export interface ErrorReport {
  id: string;
  error: LauncherError;
  context: ErrorContext;
  formatted: FormattedError;
  timestamp: Date;
  resolved: boolean;
}

/**
 * Service for formatting and reporting Forge-specific errors with user-friendly messages
 * Requirements: 1.5, 4.5, 5.5, 6.5
 */
export class ForgeErrorReporter {
  private logger: LoggerService;
  private errorRecovery: ForgeErrorRecovery;
  private errorReports: Map<string, ErrorReport> = new Map();

  constructor() {
    this.logger = LoggerService.getInstance();
    this.errorRecovery = new ForgeErrorRecovery();
  }

  /**
   * Format error for user display with context-aware messaging
   * Requirements: 1.5, 4.5, 5.5, 6.5
   */
  formatError(error: LauncherError, context: Partial<ErrorContext>): FormattedError {
    const fullContext: ErrorContext = {
      operation: 'unknown',
      timestamp: new Date(),
      ...context
    };

    this.logger.debug('Formatting error for user display', {
      errorCode: error.code,
      operation: fullContext.operation,
      gameVersion: fullContext.gameVersion,
      forgeVersion: fullContext.forgeVersion
    });

    // Get base formatting from error code
    const baseFormatting = this.getBaseErrorFormatting(error.code);
    
    // Enhance with context-specific information
    const contextualFormatting = this.enhanceWithContext(baseFormatting, error, fullContext);
    
    // Add recovery suggestions
    const finalFormatting = this.addRecoverySuggestions(contextualFormatting, error, fullContext);

    this.logger.info('Error formatted for user display', {
      errorCode: error.code,
      severity: finalFormatting.severity,
      category: finalFormatting.category,
      recoverable: finalFormatting.recoverable
    });

    return finalFormatting;
  }

  /**
   * Create detailed error report with logging
   * Requirements: 1.5, 4.5, 5.5, 6.5
   */
  reportError(error: LauncherError, context: Partial<ErrorContext>): ErrorReport {
    const reportId = this.generateReportId();
    const fullContext: ErrorContext = {
      operation: 'unknown',
      timestamp: new Date(),
      systemInfo: this.getSystemInfo(),
      ...context
    };

    const formatted = this.formatError(error, fullContext);
    
    const report: ErrorReport = {
      id: reportId,
      error,
      context: fullContext,
      formatted,
      timestamp: new Date(),
      resolved: false
    };

    // Store report for tracking
    this.errorReports.set(reportId, report);

    // Log detailed error information
    this.logDetailedError(report);

    this.logger.info('Error report created', {
      reportId,
      errorCode: error.code,
      operation: fullContext.operation,
      severity: formatted.severity
    });

    return report;
  }

  /**
   * Get recovery suggestions for specific error scenarios
   * Requirements: 1.5, 4.5, 5.5, 6.5
   */
  getRecoverySuggestions(error: LauncherError, context: ErrorContext): string[] {
    const suggestions: string[] = [];

    // Add context-specific suggestions
    switch (error.code) {
      case ErrorCode.FORGE_INSTALL_FAILED:
        suggestions.push(...this.getForgeInstallRecovery(context));
        break;
      
      case ErrorCode.OPTIFINE_DOWNLOAD_FAILED:
        suggestions.push(...this.getOptiFineDownloadRecovery(context));
        break;
      
      case ErrorCode.OPTIFINE_INCOMPATIBLE:
        suggestions.push(...this.getOptiFineCompatibilityRecovery(context));
        break;
      
      case ErrorCode.FORGE_MOD_STATE_FAILED:
        suggestions.push(...this.getModStateRecovery(context));
        break;
      
      case ErrorCode.FORGE_DIRECTORY_ACCESS_FAILED:
        suggestions.push(...this.getDirectoryAccessRecovery(context));
        break;
      
      case ErrorCode.NETWORK_ERROR:
        suggestions.push(...this.getNetworkErrorRecovery(context));
        break;
      
      case ErrorCode.PERMISSION_DENIED:
        suggestions.push(...this.getPermissionErrorRecovery(context));
        break;
      
      case ErrorCode.DISK_SPACE_INSUFFICIENT:
        suggestions.push(...this.getDiskSpaceRecovery(context));
        break;
    }

    // Add general recovery suggestions
    suggestions.push(...this.getGeneralRecovery(error.code));

    return suggestions;
  }

  /**
   * Mark error report as resolved
   * Requirements: 1.5, 4.5, 5.5
   */
  markResolved(reportId: string): boolean {
    const report = this.errorReports.get(reportId);
    if (report) {
      report.resolved = true;
      this.logger.info('Error report marked as resolved', { reportId });
      return true;
    }
    return false;
  }

  /**
   * Get all unresolved error reports
   * Requirements: 1.5, 4.5, 5.5
   */
  getUnresolvedReports(): ErrorReport[] {
    return Array.from(this.errorReports.values()).filter(report => !report.resolved);
  }

  /**
   * Clear old error reports (older than 24 hours)
   * Requirements: 1.5, 4.5, 5.5
   */
  clearOldReports(): number {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    let cleared = 0;

    for (const [id, report] of this.errorReports.entries()) {
      if (report.timestamp < cutoffTime) {
        this.errorReports.delete(id);
        cleared++;
      }
    }

    if (cleared > 0) {
      this.logger.info(`Cleared ${cleared} old error reports`);
    }

    return cleared;
  }

  /**
   * Get formatted error message for display to user
   * Requirements: 1.5, 4.5, 5.5, 6.5
   */
  getFormattedErrorMessage(error: LauncherError, context: Partial<ErrorContext> = {}): string {
    const formatted = this.formatError(error, context);
    
    let message = `${formatted.title}\n\n${formatted.message}`;
    
    if (formatted.solutions.length > 0) {
      message += '\n\nSuggested solutions:\n';
      formatted.solutions.forEach((solution, index) => {
        message += `${index + 1}. ${solution}\n`;
      });
    }
    
    return message;
  }

  /**
   * Get error report by ID
   * Requirements: 1.5, 4.5, 5.5
   */
  getErrorReport(reportId: string): ErrorReport | undefined {
    return this.errorReports.get(reportId);
  }

  /**
   * Get all error reports
   * Requirements: 1.5, 4.5, 5.5
   */
  getAllErrorReports(): ErrorReport[] {
    return Array.from(this.errorReports.values());
  }

  // Private helper methods

  private getBaseErrorFormatting(errorCode: ErrorCode): Partial<FormattedError> {
    const errorMappings: Partial<Record<ErrorCode, Partial<FormattedError>>> = {
      [ErrorCode.FORGE_INSTALL_FAILED]: {
        title: 'Forge Installation Failed',
        severity: 'high',
        category: 'system',
        recoverable: true,
        retryable: true,
        contactSupport: false
      },
      [ErrorCode.FORGE_VERSION_INCOMPATIBLE]: {
        title: 'Incompatible Forge Version',
        severity: 'medium',
        category: 'compatibility',
        recoverable: true,
        retryable: false,
        contactSupport: false
      },
      [ErrorCode.OPTIFINE_DOWNLOAD_FAILED]: {
        title: 'OptiFine Download Failed',
        severity: 'medium',
        category: 'network',
        recoverable: true,
        retryable: true,
        contactSupport: false
      },
      [ErrorCode.OPTIFINE_INCOMPATIBLE]: {
        title: 'OptiFine Compatibility Issue',
        severity: 'low',
        category: 'compatibility',
        recoverable: true,
        retryable: false,
        contactSupport: false
      },
      [ErrorCode.OPTIFINE_INSTALL_FAILED]: {
        title: 'OptiFine Installation Failed',
        severity: 'medium',
        category: 'filesystem',
        recoverable: true,
        retryable: true,
        contactSupport: false
      },
      [ErrorCode.FORGE_MOD_STATE_FAILED]: {
        title: 'Mod State Change Failed',
        severity: 'medium',
        category: 'filesystem',
        recoverable: true,
        retryable: true,
        contactSupport: false
      },
      [ErrorCode.FORGE_DIRECTORY_ACCESS_FAILED]: {
        title: 'Directory Access Error',
        severity: 'high',
        category: 'filesystem',
        recoverable: true,
        retryable: false,
        contactSupport: false
      },
      [ErrorCode.NETWORK_ERROR]: {
        title: 'Network Connection Error',
        severity: 'medium',
        category: 'network',
        recoverable: true,
        retryable: true,
        contactSupport: false
      },
      [ErrorCode.PERMISSION_DENIED]: {
        title: 'Permission Denied',
        severity: 'high',
        category: 'system',
        recoverable: true,
        retryable: false,
        contactSupport: false
      },
      [ErrorCode.DISK_SPACE_INSUFFICIENT]: {
        title: 'Insufficient Disk Space',
        severity: 'high',
        category: 'system',
        recoverable: true,
        retryable: false,
        contactSupport: false
      }
    };

    return errorMappings[errorCode] || {
      title: 'Unknown Error',
      severity: 'medium',
      category: 'system',
      recoverable: false,
      retryable: false,
      contactSupport: true
    };
  }

  private enhanceWithContext(
    baseFormatting: Partial<FormattedError>,
    error: LauncherError,
    context: ErrorContext
  ): FormattedError {
    let message = error.userMessage;
    let details = error.message;

    // Add context-specific information to message and details
    if (context.gameVersion) {
      details += `\nMinecraft Version: ${context.gameVersion}`;
    }
    if (context.forgeVersion) {
      details += `\nForge Version: ${context.forgeVersion}`;
    }
    if (context.optifineVersion) {
      details += `\nOptiFine Version: ${context.optifineVersion}`;
    }
    if (context.profileName) {
      details += `\nProfile: ${context.profileName}`;
    }
    if (context.modName) {
      details += `\nMod: ${context.modName}`;
    }
    if (context.filePath) {
      details += `\nFile Path: ${context.filePath}`;
    }

    details += `\nOperation: ${context.operation}`;
    details += `\nTimestamp: ${context.timestamp.toISOString()}`;

    if (context.systemInfo) {
      details += `\nSystem: ${context.systemInfo.platform} ${context.systemInfo.arch}`;
      details += `\nNode: ${context.systemInfo.nodeVersion}`;
      details += `\nElectron: ${context.systemInfo.electronVersion}`;
    }

    return {
      title: baseFormatting.title || 'Error',
      message,
      details,
      solutions: error.solution?.steps || [],
      severity: baseFormatting.severity || 'medium',
      category: baseFormatting.category || 'system',
      recoverable: baseFormatting.recoverable || false,
      retryable: baseFormatting.retryable || false,
      contactSupport: baseFormatting.contactSupport || false
    };
  }

  private addRecoverySuggestions(
    formatting: FormattedError,
    error: LauncherError,
    context: ErrorContext
  ): FormattedError {
    const recoverySuggestions = this.getRecoverySuggestions(error, context);
    
    // Combine original solutions with recovery suggestions, removing duplicates
    const allSolutions = [...formatting.solutions, ...recoverySuggestions];
    const uniqueSolutions = Array.from(new Set(allSolutions));

    return {
      ...formatting,
      solutions: uniqueSolutions
    };
  }

  private getForgeInstallRecovery(context: ErrorContext): string[] {
    const suggestions = [
      'Verify you have a stable internet connection',
      'Check if you have sufficient disk space (at least 500MB free)',
      'Ensure the launcher has write permissions to the installation directory',
      'Try installing a different Forge version for the same Minecraft version',
      'Temporarily disable antivirus software during installation'
    ];

    if (context.gameVersion) {
      suggestions.push(`Verify that Forge supports Minecraft ${context.gameVersion}`);
    }

    return suggestions;
  }

  private getOptiFineDownloadRecovery(context: ErrorContext): string[] {
    const suggestions = [
      'Check your internet connection',
      'Verify OptiFine servers are operational at optifine.net',
      'Try downloading OptiFine manually and placing it in the mods folder',
      'Check if a firewall or antivirus is blocking the download',
      'Wait a few minutes and try again - OptiFine servers may be busy'
    ];

    if (context.gameVersion && context.forgeVersion) {
      suggestions.push(`Verify OptiFine compatibility with Minecraft ${context.gameVersion} and Forge ${context.forgeVersion}`);
    }

    return suggestions;
  }

  private getOptiFineCompatibilityRecovery(context: ErrorContext): string[] {
    const suggestions = [
      'Try using a different Forge version that\'s compatible with OptiFine',
      'Check optifine.net for version compatibility information',
      'Consider using alternative performance mods like Sodium (requires Fabric)',
      'Continue without OptiFine for now and add it later when compatible versions are available'
    ];

    if (context.gameVersion) {
      suggestions.push(`Look for OptiFine versions specifically made for Minecraft ${context.gameVersion}`);
    }

    return suggestions;
  }

  private getModStateRecovery(context: ErrorContext): string[] {
    const suggestions = [
      'Check if you have write permissions to the mods directory',
      'Verify the mod file exists and is not corrupted',
      'Close any programs that might be using the mod file',
      'Try restarting the launcher',
      'Check if antivirus software is interfering with file operations'
    ];

    if (context.modName) {
      suggestions.push(`Try removing and re-adding the mod "${context.modName}"`);
    }

    return suggestions;
  }

  private getDirectoryAccessRecovery(context: ErrorContext): string[] {
    const suggestions = [
      'Check if the directory exists and is accessible',
      'Verify you have read/write permissions to the directory',
      'Ensure the directory is not being used by another program',
      'Try running the launcher with appropriate permissions',
      'Check if antivirus software is blocking directory access'
    ];

    if (context.filePath) {
      suggestions.push(`Verify the path exists: ${context.filePath}`);
    }

    return suggestions;
  }

  private getNetworkErrorRecovery(context: ErrorContext): string[] {
    return [
      'Check your internet connection',
      'Disable VPN or proxy if enabled',
      'Check your firewall settings',
      'Try again in a few moments',
      'Verify that required services are not blocked by your network'
    ];
  }

  private getPermissionErrorRecovery(context: ErrorContext): string[] {
    return [
      'Check file and folder permissions',
      'Try running the launcher with appropriate permissions',
      'Make sure antivirus is not blocking the launcher',
      'Verify you have write access to the installation directory'
    ];
  }

  private getDiskSpaceRecovery(context: ErrorContext): string[] {
    return [
      'Free up disk space on your drive',
      'Choose a different installation directory with more space',
      'Delete unused game versions or profiles',
      'Clear temporary files and caches'
    ];
  }

  private getGeneralRecovery(errorCode: ErrorCode): string[] {
    const generalSuggestions = [
      'Try the operation again',
      'Restart the launcher',
      'Check the error logs for more details'
    ];

    // Add contact support for critical errors
    if (this.isCriticalError(errorCode)) {
      generalSuggestions.push('Contact support if the issue persists');
    }

    return generalSuggestions;
  }

  private isCriticalError(errorCode: ErrorCode): boolean {
    const criticalErrors = [
      ErrorCode.DATABASE_ERROR,
      ErrorCode.UNKNOWN_ERROR
    ];
    return criticalErrors.includes(errorCode);
  }

  private logDetailedError(report: ErrorReport): void {
    this.logger.error('Detailed error report', {
      reportId: report.id,
      errorCode: report.error.code,
      userMessage: report.error.userMessage,
      operation: report.context.operation,
      gameVersion: report.context.gameVersion,
      forgeVersion: report.context.forgeVersion,
      optifineVersion: report.context.optifineVersion,
      profileName: report.context.profileName,
      modName: report.context.modName,
      filePath: report.context.filePath,
      systemInfo: report.context.systemInfo,
      severity: report.formatted.severity,
      category: report.formatted.category,
      recoverable: report.formatted.recoverable,
      retryable: report.formatted.retryable,
      solutionCount: report.formatted.solutions.length,
      originalError: report.error.originalError ? {
        message: report.error.originalError.message,
        stack: report.error.originalError.stack
      } : undefined
    });
  }

  private generateReportId(): string {
    return `forge-error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getSystemInfo() {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron || 'unknown'
    };
  }
}