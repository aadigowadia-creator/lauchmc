export enum ErrorCode {
  // Authentication errors
  AUTH_FAILED = 'AUTH_FAILED',
  AUTH_CANCELLED = 'AUTH_CANCELLED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  NO_MINECRAFT_LICENSE = 'NO_MINECRAFT_LICENSE',
  
  // Profile errors
  PROFILE_NOT_FOUND = 'PROFILE_NOT_FOUND',
  PROFILE_CREATION_FAILED = 'PROFILE_CREATION_FAILED',
  PROFILE_UPDATE_FAILED = 'PROFILE_UPDATE_FAILED',
  PROFILE_DELETE_FAILED = 'PROFILE_DELETE_FAILED',
  
  // Version errors
  VERSION_NOT_FOUND = 'VERSION_NOT_FOUND',
  VERSION_DOWNLOAD_FAILED = 'VERSION_DOWNLOAD_FAILED',
  VERSION_INSTALL_FAILED = 'VERSION_INSTALL_FAILED',
  VERSION_VALIDATION_FAILED = 'VERSION_VALIDATION_FAILED',
  
  // Game launch errors
  GAME_LAUNCH_FAILED = 'GAME_LAUNCH_FAILED',
  GAME_CRASHED = 'GAME_CRASHED',
  JAVA_NOT_FOUND = 'JAVA_NOT_FOUND',
  INSUFFICIENT_MEMORY = 'INSUFFICIENT_MEMORY',
  
  // Mod loader errors
  MOD_LOADER_INSTALL_FAILED = 'MOD_LOADER_INSTALL_FAILED',
  MOD_LOADER_NOT_FOUND = 'MOD_LOADER_NOT_FOUND',
  MOD_LOADER_INCOMPATIBLE = 'MOD_LOADER_INCOMPATIBLE',
  
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  DOWNLOAD_FAILED = 'DOWNLOAD_FAILED',
  
  // File system errors
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_WRITE_FAILED = 'FILE_WRITE_FAILED',
  DISK_SPACE_INSUFFICIENT = 'DISK_SPACE_INSUFFICIENT',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  
  // Bundled Java errors
  BUNDLED_JAVA_MISSING = 'BUNDLED_JAVA_MISSING',
  BUNDLED_JAVA_CORRUPTED = 'BUNDLED_JAVA_CORRUPTED',
  BUNDLED_JAVA_EXTRACTION_FAILED = 'BUNDLED_JAVA_EXTRACTION_FAILED',
  
  // Database errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  
  // Unknown errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

interface ErrorSolution {
  message: string;
  steps: string[];
}

export class LauncherError extends Error {
  public readonly code: ErrorCode;
  public readonly userMessage: string;
  public readonly solution: ErrorSolution;
  public readonly originalError?: Error;

  constructor(
    code: ErrorCode,
    userMessage: string,
    solution: ErrorSolution,
    originalError?: Error
  ) {
    super(userMessage);
    this.name = 'LauncherError';
    this.code = code;
    this.userMessage = userMessage;
    this.solution = solution;
    this.originalError = originalError;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LauncherError);
    }
  }

  public toJSON() {
    return {
      name: this.name,
      code: this.code,
      userMessage: this.userMessage,
      solution: this.solution,
      stack: this.stack,
      originalError: this.originalError ? {
        message: this.originalError.message,
        stack: this.originalError.stack,
      } : undefined,
    };
  }
}

// Error factory functions for common errors
export class ErrorFactory {
  static authenticationFailed(originalError?: Error): LauncherError {
    return new LauncherError(
      ErrorCode.AUTH_FAILED,
      'Authentication failed. Unable to sign in to your Microsoft account.',
      {
        message: 'We couldn\'t authenticate your Microsoft account.',
        steps: [
          'Check your internet connection',
          'Make sure you\'re using the correct Microsoft account',
          'Try signing out and signing in again',
          'Check if Microsoft services are operational',
        ],
      },
      originalError
    );
  }

  static noMinecraftLicense(): LauncherError {
    return new LauncherError(
      ErrorCode.NO_MINECRAFT_LICENSE,
      'No Minecraft license found on this account.',
      {
        message: 'Your Microsoft account doesn\'t have a Minecraft license.',
        steps: [
          'Purchase Minecraft from minecraft.net',
          'Make sure you\'re signed in with the correct account',
          'Wait a few minutes after purchase for the license to activate',
        ],
      }
    );
  }

  static versionDownloadFailed(versionId: string, originalError?: Error): LauncherError {
    return new LauncherError(
      ErrorCode.VERSION_DOWNLOAD_FAILED,
      `Failed to download Minecraft version ${versionId}.`,
      {
        message: 'The version download was interrupted or failed.',
        steps: [
          'Check your internet connection',
          'Make sure you have enough disk space',
          'Try downloading the version again',
          'Check if Mojang servers are operational',
        ],
      },
      originalError
    );
  }

  static gameLaunchFailed(reason: string, originalError?: Error): LauncherError {
    return new LauncherError(
      ErrorCode.GAME_LAUNCH_FAILED,
      `Failed to launch Minecraft: ${reason}`,
      {
        message: 'The game couldn\'t be started.',
        steps: [
          'Make sure Java is installed and accessible',
          'Check if the game version is properly installed',
          'Verify your profile settings',
          'Try restarting the launcher',
        ],
      },
      originalError
    );
  }

  static javaNotFound(): LauncherError {
    return new LauncherError(
      ErrorCode.JAVA_NOT_FOUND,
      'Java installation not found.',
      {
        message: 'Java is required to run Minecraft but wasn\'t found on your system.',
        steps: [
          'Download and install Java from adoptium.net',
          'Make sure Java is added to your system PATH',
          'Restart the launcher after installing Java',
          'Specify a custom Java path in profile settings',
        ],
      }
    );
  }

  static modLoaderInstallFailed(loaderType: string, originalError?: Error): LauncherError {
    return new LauncherError(
      ErrorCode.MOD_LOADER_INSTALL_FAILED,
      `Failed to install ${loaderType} mod loader.`,
      {
        message: `The ${loaderType} installation encountered an error.`,
        steps: [
          'Check your internet connection',
          'Make sure the game version is compatible',
          'Try installing a different mod loader version',
          'Check if you have write permissions to the installation directory',
        ],
      },
      originalError
    );
  }

  static networkError(originalError?: Error): LauncherError {
    return new LauncherError(
      ErrorCode.NETWORK_ERROR,
      'Network connection error.',
      {
        message: 'Unable to connect to required services.',
        steps: [
          'Check your internet connection',
          'Disable VPN or proxy if enabled',
          'Check your firewall settings',
          'Try again in a few moments',
        ],
      },
      originalError
    );
  }

  static diskSpaceInsufficient(requiredSpace: string): LauncherError {
    return new LauncherError(
      ErrorCode.DISK_SPACE_INSUFFICIENT,
      'Insufficient disk space.',
      {
        message: `You need at least ${requiredSpace} of free disk space.`,
        steps: [
          'Free up disk space on your drive',
          'Choose a different installation directory',
          'Delete unused game versions or profiles',
        ],
      }
    );
  }

  static bundledJavaMissing(version: number): LauncherError {
    return new LauncherError(
      ErrorCode.BUNDLED_JAVA_MISSING,
      `Bundled Java ${version} runtime is missing.`,
      {
        message: `The bundled Java ${version} runtime could not be found.`,
        steps: [
          'The launcher will attempt to use system Java instead',
          'If issues persist, try reinstalling the launcher',
          'You can manually install Java from adoptium.net',
        ],
      }
    );
  }

  static bundledJavaCorrupted(version: number): LauncherError {
    return new LauncherError(
      ErrorCode.BUNDLED_JAVA_CORRUPTED,
      `Bundled Java ${version} runtime is corrupted.`,
      {
        message: `The bundled Java ${version} runtime failed verification.`,
        steps: [
          'The launcher will attempt to re-extract the runtime',
          'If re-extraction fails, system Java will be used',
          'Consider reinstalling the launcher if the issue persists',
        ],
      }
    );
  }

  static bundledJavaExtractionFailed(version: number, reason: string): LauncherError {
    return new LauncherError(
      ErrorCode.BUNDLED_JAVA_EXTRACTION_FAILED,
      `Failed to extract bundled Java ${version} runtime.`,
      {
        message: `Could not extract Java ${version}: ${reason}`,
        steps: [
          'Check if you have enough disk space',
          'Verify you have write permissions to the installation directory',
          'The launcher will fall back to system Java',
          'Try reinstalling the launcher if the issue persists',
        ],
      }
    );
  }

  static permissionDenied(operation: string): LauncherError {
    return new LauncherError(
      ErrorCode.PERMISSION_DENIED,
      `Permission denied: ${operation}`,
      {
        message: 'The launcher does not have permission to perform this operation.',
        steps: [
          'Check file and folder permissions',
          'Try running the launcher with appropriate permissions',
          'Make sure antivirus is not blocking the launcher',
        ],
      }
    );
  }

  static databaseError(operation: string, originalError?: Error): LauncherError {
    return new LauncherError(
      ErrorCode.DATABASE_ERROR,
      `Database operation failed: ${operation}`,
      {
        message: 'An error occurred while accessing the launcher database.',
        steps: [
          'Restart the launcher',
          'Check if the launcher has write permissions',
          'Try deleting the database file (profiles will be lost)',
          'Contact support if the issue persists',
        ],
      },
      originalError
    );
  }

  static fromError(error: Error): LauncherError {
    if (error instanceof LauncherError) {
      return error;
    }

    return new LauncherError(
      ErrorCode.UNKNOWN_ERROR,
      error.message || 'An unexpected error occurred.',
      {
        message: 'Something went wrong.',
        steps: [
          'Try the operation again',
          'Restart the launcher',
          'Check the error logs for more details',
          'Contact support if the issue persists',
        ],
      },
      error
    );
  }
}
