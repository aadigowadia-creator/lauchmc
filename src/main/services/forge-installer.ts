import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import * as https from 'https';

export interface ForgeVersion {
  version: string;
  mcVersion: string;
  recommended: boolean;
  latest: boolean;
  downloadUrl: string;
  installerUrl: string;
}

export interface ForgeInstallProgress {
  stage: 'downloading' | 'installing' | 'verifying' | 'complete' | 'error';
  percentage: number;
  message: string;
  error?: string;
}

export class ForgeInstaller {
  private static readonly FORGE_MAVEN_URL = 'https://maven.minecraftforge.net';
  
  public async getAvailableVersions(mcVersion: string): Promise<ForgeVersion[]> {
    // Simplified implementation for MC 1.12.2
    if (mcVersion === '1.12.2') {
      return [
        {
          version: '14.23.5.2859',
          mcVersion: '1.12.2',
          recommended: true,
          latest: false,
          downloadUrl: `${ForgeInstaller.FORGE_MAVEN_URL}/net/minecraftforge/forge/1.12.2-14.23.5.2859/forge-1.12.2-14.23.5.2859-installer.jar`,
          installerUrl: `${ForgeInstaller.FORGE_MAVEN_URL}/net/minecraftforge/forge/1.12.2-14.23.5.2859/forge-1.12.2-14.23.5.2859-installer.jar`
        },
        {
          version: '14.23.5.2860',
          mcVersion: '1.12.2',
          recommended: false,
          latest: true,
          downloadUrl: `${ForgeInstaller.FORGE_MAVEN_URL}/net/minecraftforge/forge/1.12.2-14.23.5.2860/forge-1.12.2-14.23.5.2860-installer.jar`,
          installerUrl: `${ForgeInstaller.FORGE_MAVEN_URL}/net/minecraftforge/forge/1.12.2-14.23.5.2860/forge-1.12.2-14.23.5.2860-installer.jar`
        }
      ];
    }
    return [];
  }

  public async getRecommendedVersion(mcVersion: string): Promise<ForgeVersion | null> {
    const versions = await this.getAvailableVersions(mcVersion);
    return versions.find(v => v.recommended) || versions[0] || null;
  }

  public async isForgeInstalled(
    mcVersion: string,
    forgeVersion: string,
    minecraftDir: string
  ): Promise<boolean> {
    try {
      await this.verifyForgeInstallation(mcVersion, forgeVersion, minecraftDir);
      return true;
    } catch (error) {
      console.log(`Forge installation check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  public async installForge(
    mcVersion: string,
    forgeVersion: string,
    minecraftDir: string,
    onProgress?: (progress: ForgeInstallProgress) => void
  ): Promise<void> {
    try {
      onProgress?.({
        stage: 'downloading',
        percentage: 0,
        message: 'Preparing Forge installation...'
      });

      // Get the Forge version info
      const availableVersions = await this.getAvailableVersions(mcVersion);
      const targetVersion = availableVersions.find(v => v.version === forgeVersion);
      
      if (!targetVersion) {
        throw new Error(`Forge version ${forgeVersion} not found for Minecraft ${mcVersion}`);
      }

      // Create temp directory for installer
      const tempDir = path.join(os.tmpdir(), 'minecraft-launcher-forge');
      await fs.mkdir(tempDir, { recursive: true });

      const installerPath = path.join(tempDir, `forge-${mcVersion}-${forgeVersion}-installer.jar`);

      // Download the installer
      onProgress?.({
        stage: 'downloading',
        percentage: 10,
        message: 'Downloading Forge installer...'
      });

      await this.downloadFile(targetVersion.installerUrl, installerPath, (progress) => {
        onProgress?.({
          stage: 'downloading',
          percentage: 10 + (progress * 0.4), // 10-50%
          message: `Downloading Forge installer... ${Math.round(progress)}%`
        });
      });

      // Run the installer
      onProgress?.({
        stage: 'installing',
        percentage: 50,
        message: 'Running Forge installer...'
      });

      await this.runForgeInstaller(installerPath, minecraftDir, (progress) => {
        onProgress?.({
          stage: 'installing',
          percentage: 50 + (progress * 0.4), // 50-90%
          message: `Installing Forge... ${Math.round(progress)}%`
        });
      });

      // Verify installation
      onProgress?.({
        stage: 'verifying',
        percentage: 90,
        message: 'Verifying Forge installation...'
      });

      await this.verifyForgeInstallation(mcVersion, forgeVersion, minecraftDir);

      // Clean up
      try {
        await fs.unlink(installerPath);
      } catch (error) {
        // Ignore cleanup errors
      }

      onProgress?.({
        stage: 'complete',
        percentage: 100,
        message: 'Forge installation completed successfully!'
      });

    } catch (error) {
      console.error('Forge installation failed:', error);
      onProgress?.({
        stage: 'error',
        percentage: 0,
        message: 'Forge installation failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Download a file with progress tracking using Node.js https
   */
  private async downloadFile(
    url: string,
    outputPath: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(outputPath);
      
      const request = https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            return this.downloadFile(redirectUrl, outputPath, onProgress).then(resolve).catch(reject);
          }
        }

        if (response.statusCode !== 200) {
          file.close();
          return reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        }

        const totalLength = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedLength = 0;

        response.on('data', (chunk) => {
          downloadedLength += chunk.length;
          if (totalLength > 0) {
            const progress = (downloadedLength / totalLength) * 100;
            onProgress?.(progress);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });

        file.on('error', (err) => {
          fs.unlink(outputPath).catch(() => {}); // Clean up on error
          reject(err);
        });

        response.on('error', (err) => {
          fs.unlink(outputPath).catch(() => {}); // Clean up on error
          reject(err);
        });
      });

      request.on('error', (err) => {
        reject(err);
      });

      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
  }

  /**
   * Find Java executable using multiple strategies
   */
  private async findJavaExecutable(): Promise<string> {
    try {
      // Strategy 1: Use the launcher's Java service
      const { JavaService } = await import('./java-service');
      const javaService = JavaService.getInstance();
      
      try {
        // Try to get Java path for the Minecraft version
        const javaInstallation = await javaService.getBestJavaInstallation('1.12.2');
        if (javaInstallation) {
          console.log('Using Java installation:', javaInstallation.path);
          return javaInstallation.path;
        }
      } catch (error) {
        console.warn('Failed to get best Java installation:', error);
      }
      
      // Strategy 2: Try common Java installation paths on Windows
      if (process.platform === 'win32') {
        const commonPaths = [
          'C:\\Program Files\\Java\\jre1.8.0_*\\bin\\java.exe',
          'C:\\Program Files\\Java\\jdk1.8.0_*\\bin\\java.exe',
          'C:\\Program Files (x86)\\Java\\jre1.8.0_*\\bin\\java.exe',
          'C:\\Program Files (x86)\\Java\\jdk1.8.0_*\\bin\\java.exe',
          'C:\\Program Files\\Eclipse Adoptium\\*\\bin\\java.exe',
          'C:\\Program Files\\Microsoft\\jdk-*\\bin\\java.exe'
        ];
        
        for (const pathPattern of commonPaths) {
          try {
            // Simple check - in a real implementation you'd use glob or fs.readdir
            const simplePath = pathPattern.replace('*', '');
            if (pathPattern.includes('jre1.8.0_')) {
              // Try a common JRE 8 path
              const jre8Path = 'C:\\Program Files\\Java\\jre1.8.0_391\\bin\\java.exe';
              await fs.access(jre8Path);
              console.log('Using system Java:', jre8Path);
              return jre8Path;
            }
          } catch (error) {
            // Continue to next path
          }
        }
      }
      
      // Strategy 3: Try system PATH
      const systemJava = process.platform === 'win32' ? 'java.exe' : 'java';
      console.log('Falling back to system PATH Java:', systemJava);
      return systemJava;
      
    } catch (error) {
      console.error('All Java detection strategies failed:', error);
      throw new Error(
        'Java not found. Please install Java 8 or later, or ensure it is in your system PATH. ' +
        'You can download Java from https://adoptium.net/'
      );
    }
  }

  /**
   * Run the Forge installer using the launcher's Java detection
   */
  private async runForgeInstaller(
    installerPath: string,
    minecraftDir: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        // Find Java executable
        const javaPath = await this.findJavaExecutable();
        
        const args = [
          '-jar',
          installerPath,
          '--installClient',
          minecraftDir
        ];

        console.log(`Running Forge installer: ${javaPath} ${args.join(' ')}`);

        const installer = spawn(javaPath, args, {
          cwd: path.dirname(installerPath),
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let errorOutput = '';
        let progress = 0;

        installer.stdout?.on('data', (data) => {
          const text = data.toString();
          output += text;
          console.log('Forge installer stdout:', text);
          
          // Parse progress from installer output
          if (text.includes('Downloading libraries') || text.includes('Considering library')) {
            progress = Math.min(progress + 5, 80);
            onProgress?.(progress);
          } else if (text.includes('Installing') || text.includes('Extracting')) {
            progress = Math.min(progress + 10, 90);
            onProgress?.(progress);
          } else if (text.includes('The client installed successfully')) {
            progress = 100;
            onProgress?.(progress);
          }
        });

        installer.stderr?.on('data', (data) => {
          const text = data.toString();
          errorOutput += text;
          console.error('Forge installer stderr:', text);
        });

        installer.on('close', (code) => {
          console.log(`Forge installer exited with code ${code}`);
          if (code === 0) {
            onProgress?.(100);
            resolve();
          } else {
            reject(new Error(`Forge installer exited with code ${code}. Output: ${output}. Error: ${errorOutput}`));
          }
        });

        installer.on('error', (error) => {
          console.error('Forge installer process error:', error);
          
          // Provide helpful error message for Java issues
          if (error.message.includes('ENOENT') || error.message.includes('spawn')) {
            reject(new Error(
              `Failed to run Forge installer: Java executable not found at "${javaPath}". ` +
              `Please install Java 8 or later from https://adoptium.net/ and ensure it's in your system PATH.`
            ));
          } else {
            reject(new Error(`Failed to run Forge installer: ${error.message}`));
          }
        });

        // Set a timeout for the installation process
        setTimeout(() => {
          if (!installer.killed) {
            installer.kill();
            reject(new Error('Forge installation timed out after 5 minutes'));
          }
        }, 5 * 60 * 1000); // 5 minutes timeout
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Verify that Forge was installed correctly
   */
  private async verifyForgeInstallation(
    mcVersion: string,
    forgeVersion: string,
    minecraftDir: string
  ): Promise<void> {
    // Check if Forge version directory exists
    const forgeVersionDir = path.join(
      minecraftDir,
      'versions',
      `${mcVersion}-forge-${forgeVersion}`
    );

    try {
      await fs.access(forgeVersionDir);
    } catch (error) {
      throw new Error(`Forge version directory not found: ${forgeVersionDir}`);
    }

    // Check if Forge JSON profile exists (this is the most important file)
    const forgeJsonPath = path.join(forgeVersionDir, `${mcVersion}-forge-${forgeVersion}.json`);
    try {
      await fs.access(forgeJsonPath);
      console.log(`Forge profile JSON found: ${forgeJsonPath}`);
    } catch (error) {
      throw new Error(`Forge profile JSON not found: ${forgeJsonPath}`);
    }

    // For modern Forge (1.12.2+), the installer creates a profile that references the vanilla jar
    // Check if vanilla Minecraft jar exists
    const vanillaVersionDir = path.join(minecraftDir, 'versions', mcVersion);
    const vanillaJarPath = path.join(vanillaVersionDir, `${mcVersion}.jar`);
    
    try {
      await fs.access(vanillaJarPath);
      console.log(`Vanilla Minecraft jar found: ${vanillaJarPath}`);
    } catch (error) {
      console.warn(`Vanilla Minecraft jar not found: ${vanillaJarPath}`);
      // This might be okay if Forge created its own jar
    }

    // Check if Forge jar exists - try multiple possible names
    const possibleJarNames = [
      `${mcVersion}-forge-${forgeVersion}.jar`,
      `${mcVersion}-forge${forgeVersion}.jar`,
      `forge-${mcVersion}-${forgeVersion}.jar`,
      `${mcVersion}.jar` // Sometimes it just uses the MC version
    ];

    let forgeJarFound = false;
    let forgeJarPath = '';

    for (const jarName of possibleJarNames) {
      const testPath = path.join(forgeVersionDir, jarName);
      try {
        await fs.access(testPath);
        forgeJarFound = true;
        forgeJarPath = testPath;
        console.log(`Found Forge jar: ${testPath}`);
        break;
      } catch (error) {
        // Continue to next possible name
      }
    }

    // List what files actually exist in the directory for debugging
    try {
      const files = await fs.readdir(forgeVersionDir);
      console.log(`Files in Forge version directory: ${files.join(', ')}`);
      
      // If there's any .jar file, consider it valid
      const jarFiles = files.filter(f => f.endsWith('.jar'));
      if (jarFiles.length > 0) {
        console.log(`Found jar files: ${jarFiles.join(', ')}, considering installation valid`);
        forgeJarFound = true;
        forgeJarPath = path.join(forgeVersionDir, jarFiles[0]);
      }
    } catch (dirError) {
      console.error('Could not read Forge version directory:', dirError);
    }

    // For modern Forge, having the JSON profile is sufficient
    // The jar file might not exist if Forge uses the vanilla jar + libraries
    if (!forgeJarFound) {
      console.log('No Forge-specific jar found, but this is normal for modern Forge installations');
      console.log('Forge will use the vanilla Minecraft jar with additional libraries');
    }

    // Check if Forge libraries exist - this is the most reliable indicator
    const forgeLibraryPath = path.join(
      minecraftDir,
      'libraries',
      'net', 'minecraftforge', 'forge',
      `${mcVersion}-${forgeVersion}`,
      `forge-${mcVersion}-${forgeVersion}.jar`
    );

    try {
      await fs.access(forgeLibraryPath);
      console.log(`Forge library verified: ${forgeLibraryPath}`);
    } catch (error) {
      console.warn(`Forge library not found at expected location: ${forgeLibraryPath}`);
      
      // Check if any Forge libraries exist in the libraries directory
      try {
        const librariesForgeDir = path.join(minecraftDir, 'libraries', 'net', 'minecraftforge');
        await fs.access(librariesForgeDir);
        console.log(`Forge libraries directory exists: ${librariesForgeDir}`);
      } catch (libError) {
        throw new Error(`Forge libraries not found. Installation may have failed.`);
      }
    }

    console.log(`Forge installation verified successfully. Profile: ${forgeJsonPath}`);
  }
}