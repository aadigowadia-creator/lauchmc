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
  
  // Mod management errors
  MOD_DOWNLOAD_FAILED = 'MOD_DOWNLOAD_FAILED',
  MOD_INTEGRITY_CHECK_FAILED = 'MOD_INTEGRITY_CHECK_FAILED',
  MOD_VERSION_NOT_FOUND = 'MOD_VERSION_NOT_FOUND',
  MOD_ALREADY_INSTALLED = 'MOD_ALREADY_INSTALLED',
  MOD_NOT_FOUND = 'MOD_NOT_FOUND',
  MOD_STATE_UPDATE_FAILED = 'MOD_STATE_UPDATE_FAILED',
  MOD_DEPENDENCY_MISSING = 'MOD_DEPENDENCY_MISSING',
  MOD_INCOMPATIBLE_VERSION = 'MOD_INCOMPATIBLE_VERSION',
  MOD_INVALID_URL = 'MOD_INVALID_URL',
  MOD_API_ERROR = 'MOD_API_ERROR',
  
  // Forge-specific errors
  FORGE_INSTALL_FAILED = 'FORGE_INSTALL_FAILED',
  FORGE_VERSION_INCOMPATIBLE = 'FORGE_VERSION_INCOMPATIBLE',
  FORGE_PROFILE_CREATION_FAILED = 'FORGE_PROFILE_CREATION_FAILED',
  OPTIFINE_DOWNLOAD_FAILED = 'OPTIFINE_DOWNLOAD_FAILED',
  OPTIFINE_INCOMPATIBLE = 'OPTIFINE_INCOMPATIBLE',
  OPTIFINE_INSTALL_FAILED = 'OPTIFINE_INSTALL_FAILED',
  FORGE_MOD_STATE_FAILED = 'FORGE_MOD_STATE_FAILED',
  FORGE_DIRECTORY_ACCESS_FAILED = 'FORGE_DIRECTORY_ACCESS_FAILED',
  
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

  static modDownloadFailed(modName: string, reason: string, originalError?: Error): LauncherError {
    return new LauncherError(
      ErrorCode.MOD_DOWNLOAD_FAILED,
      `Failed to download ${modName}: ${reason}`,
      {
        message: `The mod "${modName}" could not be downloaded.`,
        steps: [
          'Check your internet connection',
          'Verify the mod is available on the source platform',
          'Try downloading the mod again',
          'Check if the mod source (Modrinth/CurseForge) is operational',
        ],
      },
      originalError
    );
  }

  static modIntegrityCheckFailed(modName: string): LauncherError {
    return new LauncherError(
      ErrorCode.MOD_INTEGRITY_CHECK_FAILED,
      `Integrity check failed for ${modName}`,
      {
        message: `The downloaded file for "${modName}" is corrupted or incomplete.`,
        steps: [
          'Try downloading the mod again',
          'Check your internet connection stability',
          'Verify you have enough disk space',
          'Contact support if the issue persists',
        ],
      }
    );
  }

  static modVersionNotFound(modName: string, gameVersion: string): LauncherError {
    return new LauncherError(
      ErrorCode.MOD_VERSION_NOT_FOUND,
      `No compatible version found for ${modName}`,
      {
        message: `"${modName}" doesn't have a version compatible with Minecraft ${gameVersion}.`,
        steps: [
          'Check if the mod supports your Minecraft version',
          'Try using a different Minecraft version',
          'Look for alternative mods with similar functionality',
          'Check the mod page for version compatibility information',
        ],
      }
    );
  }

  static modAlreadyInstalled(modName: string): LauncherError {
    return new LauncherError(
      ErrorCode.MOD_ALREADY_INSTALLED,
      `${modName} is already installed`,
      {
        message: `The mod "${modName}" is already installed in this profile.`,
        steps: [
          'Check your installed mods list',
          'Remove the existing mod if you want to reinstall it',
          'Try a different version of the mod',
        ],
      }
    );
  }

  static modNotFound(modId: string): LauncherError {
    return new LauncherError(
      ErrorCode.MOD_NOT_FOUND,
      `Mod not found: ${modId}`,
      {
        message: 'The requested mod could not be found.',
        steps: [
          'Verify the mod URL is correct',
          'Check if the mod still exists on the platform',
          'Try searching for the mod by name',
        ],
      }
    );
  }

  static modStateUpdateFailed(modName: string, originalError?: Error): LauncherError {
    return new LauncherError(
      ErrorCode.MOD_STATE_UPDATE_FAILED,
      `Failed to update state for ${modName}`,
      {
        message: `Could not enable/disable "${modName}".`,
        steps: [
          'Check if you have write permissions to the mods folder',
          'Verify the mod file exists',
          'Try restarting the launcher',
          'Check if another program is using the mod file',
        ],
      },
      originalError
    );
  }

  static modDependencyMissing(modName: string, dependencies: string[]): LauncherError {
    return new LauncherError(
      ErrorCode.MOD_DEPENDENCY_MISSING,
      `${modName} requires missing dependencies`,
      {
        message: `"${modName}" requires the following mods to be enabled: ${dependencies.join(', ')}`,
        steps: [
          'Enable the required dependency mods',
          'Install missing dependencies if not present',
          'Check the mod documentation for dependency information',
        ],
      }
    );
  }

  static modIncompatibleVersion(modName: string, gameVersion: string): LauncherError {
    return new LauncherError(
      ErrorCode.MOD_INCOMPATIBLE_VERSION,
      `${modName} is not compatible with Minecraft ${gameVersion}`,
      {
        message: `"${modName}" doesn't support Minecraft ${gameVersion}.`,
        steps: [
          'Check the mod page for supported versions',
          'Try using a different Minecraft version',
          'Look for an updated version of the mod',
          'Consider using an alternative mod',
        ],
      }
    );
  }

  static modInvalidUrl(url: string): LauncherError {
    return new LauncherError(
      ErrorCode.MOD_INVALID_URL,
      'Invalid mod URL',
      {
        message: 'The provided URL is not a valid Modrinth or CurseForge mod link.',
        steps: [
          'Make sure you\'re using a direct mod page URL',
          'Supported formats: modrinth.com/mod/[slug] or curseforge.com/minecraft/mc-mods/[slug]',
          'Copy the URL from your browser\'s address bar',
          'Verify the URL is complete and not truncated',
        ],
      }
    );
  }

  static modApiError(platform: string, originalError?: Error): LauncherError {
    return new LauncherError(
      ErrorCode.MOD_API_ERROR,
      `Failed to connect to ${platform} API`,
      {
        message: `Unable to fetch mod information from ${platform}.`,
        steps: [
          'Check your internet connection',
          `Verify ${platform} is operational`,
          'Try again in a few moments',
          'Check if a firewall is blocking the connection',
        ],
      },
      originalError
    );
  }

  // Forge-specific error factory methods

  static forgeInstallFailed(gameVersion: string, forgeVersion: string, reason: string, originalError?: Error): LauncherError {
    return new LauncherError(
      ErrorCode.FORGE_INSTALL_FAILED,
      `Failed to install Forge ${forgeVersion} for Minecraft ${gameVersion}`,
      {
        message: `Forge installation encountered an error: ${reason}`,
        steps: [
          'Check your internet connection',
          'Verify you have sufficient disk space',
          'Ensure you have write permissions to the installation directory',
          'Try installing a different Forge version',
          'Check if antivirus software is blocking the installation',
        ],
      },
      originalError
    );
  }

  static forgeVersionIncompatible(gameVersion: string, forgeVersion: string): LauncherError {
    return new LauncherError(
      ErrorCode.FORGE_VERSION_INCOMPATIBLE,
      `Forge ${forgeVersion} is not compatible with Minecraft ${gameVersion}`,
      {
        message: `The selected Forge version doesn't support this Minecraft version.`,
        steps: [
          'Choose a different Forge version from the compatibility list',
          'Update to a supported Minecraft version',
          'Check the Forge website for version compatibility information',
          'Try using the recommended Forge version for this Minecraft version',
        ],
      }
    );
  }

  static forgeProfileCreationFailed(profileName: string, reason: string, originalError?: Error): LauncherError {
    return new LauncherError(
      ErrorCode.FORGE_PROFILE_CREATION_FAILED,
      `Failed to create Forge profile "${profileName}"`,
      {
        message: `Profile creation failed: ${reason}`,
        steps: [
          'Try using a different profile name',
          'Check if you have write permissions to the profiles directory',
          'Ensure sufficient disk space is available',
          'Verify the installation directory is accessible',
          'Try restarting the launcher',
        ],
      },
      originalError
    );
  }

  static optifineDownloadFailed(gameVersion: string, reason: string, originalError?: Error): LauncherError {
    return new LauncherError(
      ErrorCode.OPTIFINE_DOWNLOAD_FAILED,
      `Failed to download OptiFine for Minecraft ${gameVersion}`,
      {
        message: `OptiFine download encountered an error: ${reason}`,
        steps: [
          'Check your internet connection',
          'Verify OptiFine servers are operational',
          'Try downloading OptiFine manually from optifine.net',
          'Check if a firewall is blocking the download',
          'Try again in a few minutes',
        ],
      },
      originalError
    );
  }

  static optifineIncompatible(gameVersion: string, forgeVersion: string): LauncherError {
    return new LauncherError(
      ErrorCode.OPTIFINE_INCOMPATIBLE,
      `OptiFine is not compatible with Minecraft ${gameVersion} and Forge ${forgeVersion}`,
      {
        message: `No compatible OptiFine version found for this combination.`,
        steps: [
          'Try using a different Forge version',
          'Check if OptiFine supports this Minecraft version',
          'Consider using alternative performance mods like Sodium (for Fabric)',
          'Visit optifine.net to check version compatibility',
          'Continue without OptiFine for now',
        ],
      }
    );
  }

  static optifineInstallFailed(reason: string, originalError?: Error): LauncherError {
    return new LauncherError(
      ErrorCode.OPTIFINE_INSTALL_FAILED,
      `Failed to install OptiFine`,
      {
        message: `OptiFine installation failed: ${reason}`,
        steps: [
          'Check if you have write permissions to the mods directory',
          'Verify sufficient disk space is available',
          'Try downloading OptiFine again',
          'Check if antivirus software is blocking the installation',
          'Continue without OptiFine if the issue persists',
        ],
      },
      originalError
    );
  }

  static forgeModStateFailed(modName: string, operation: string, originalError?: Error): LauncherError {
    return new LauncherError(
      ErrorCode.FORGE_MOD_STATE_FAILED,
      `Failed to ${operation} mod "${modName}"`,
      {
        message: `Could not change the state of the mod.`,
        steps: [
          'Check if you have write permissions to the mods directory',
          'Verify the mod file exists and is not corrupted',
          'Close any programs that might be using the mod file',
          'Try restarting the launcher',
          'Check if antivirus software is interfering',
        ],
      },
      originalError
    );
  }

  static forgeDirectoryAccessFailed(directory: string, operation: string, originalError?: Error): LauncherError {
    return new LauncherError(
      ErrorCode.FORGE_DIRECTORY_ACCESS_FAILED,
      `Cannot access Forge directory for ${operation}`,
      {
        message: `Unable to access the directory: ${directory}`,
        steps: [
          'Check if the directory exists',
          'Verify you have read/write permissions to the directory',
          'Ensure the directory is not being used by another program',
          'Try running the launcher with appropriate permissions',
          'Check if antivirus software is blocking access',
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
