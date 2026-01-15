import axios from 'axios';
import { promises as fs } from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export interface ModLoaderInfo {
  type: 'forge' | 'fabric' | 'quilt';
  version: string;
  gameVersion: string;
  stable: boolean;
  recommended?: boolean;
  installerUrl?: string;
}

export interface ForgeVersion {
  version: string;
  mcversion: string;
  recommended: boolean;
  latest: boolean;
  installer: string;
}

export interface FabricVersion {
  version: string;
  stable: boolean;
}

export interface QuiltVersion {
  version: string;
  stable: boolean;
}

export class ModLoaderService {
  private readonly forgeApiUrl = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
  private readonly fabricApiUrl = 'https://meta.fabricmc.net/v2';
  private readonly quiltApiUrl = 'https://meta.quiltmc.org/v3';

  /**
   * Detect available mod loaders for a specific Minecraft version
   */
  async detectModLoaders(gameVersion: string): Promise<ModLoaderInfo[]> {
    const modLoaders: ModLoaderInfo[] = [];

    try {
      // Detect Forge versions
      const forgeVersions = await this.getForgeVersions(gameVersion);
      modLoaders.push(...forgeVersions);

      // Detect Fabric versions
      const fabricVersions = await this.getFabricVersions(gameVersion);
      modLoaders.push(...fabricVersions);

      // Detect Quilt versions
      const quiltVersions = await this.getQuiltVersions(gameVersion);
      modLoaders.push(...quiltVersions);
    } catch (error) {
      console.error('Error detecting mod loaders:', error);
    }

    return modLoaders;
  }

  /**
   * Get available Forge versions for a game version
   */
  private async getForgeVersions(gameVersion: string): Promise<ModLoaderInfo[]> {
    try {
      const response = await axios.get(this.forgeApiUrl);
      const data = response.data;
      
      const versions: ModLoaderInfo[] = [];
      
      // Get recommended version if available
      const recommendedKey = `${gameVersion}-recommended`;
      if (data.promos[recommendedKey]) {
        const forgeVersion = data.promos[recommendedKey];
        versions.push({
          type: 'forge',
          version: forgeVersion,
          gameVersion,
          stable: true,
          recommended: true,
          installerUrl: `https://maven.minecraftforge.net/net/minecraftforge/forge/${gameVersion}-${forgeVersion}/forge-${gameVersion}-${forgeVersion}-installer.jar`
        });
      }

      // Get latest version
      const latestKey = `${gameVersion}-latest`;
      if (data.promos[latestKey]) {
        const forgeVersion = data.promos[latestKey];
        if (!versions.some(v => v.version === forgeVersion)) {
          versions.push({
            type: 'forge',
            version: forgeVersion,
            gameVersion,
            stable: false,
            recommended: false,
            installerUrl: `https://maven.minecraftforge.net/net/minecraftforge/forge/${gameVersion}-${forgeVersion}/forge-${gameVersion}-${forgeVersion}-installer.jar`
          });
        }
      }

      return versions;
    } catch (error) {
      console.error('Error fetching Forge versions:', error);
      return [];
    }
  }

  /**
   * Get available Fabric versions for a game version
   */
  private async getFabricVersions(gameVersion: string): Promise<ModLoaderInfo[]> {
    try {
      // Check if game version is supported by Fabric
      const gameVersionsResponse = await axios.get(`${this.fabricApiUrl}/versions/game`);
      const supportedVersions = gameVersionsResponse.data;
      
      if (!supportedVersions.some((v: any) => v.version === gameVersion)) {
        return [];
      }

      // Get Fabric loader versions
      const loaderResponse = await axios.get(`${this.fabricApiUrl}/versions/loader`);
      const loaderVersions = loaderResponse.data;

      return loaderVersions.slice(0, 5).map((loader: FabricVersion) => ({
        type: 'fabric' as const,
        version: loader.version,
        gameVersion,
        stable: loader.stable,
        recommended: loader.stable
      }));
    } catch (error) {
      console.error('Error fetching Fabric versions:', error);
      return [];
    }
  }

  /**
   * Get available Quilt versions for a game version
   */
  private async getQuiltVersions(gameVersion: string): Promise<ModLoaderInfo[]> {
    try {
      // Check if game version is supported by Quilt
      const gameVersionsResponse = await axios.get(`${this.quiltApiUrl}/versions/game`);
      const supportedVersions = gameVersionsResponse.data;
      
      if (!supportedVersions.some((v: any) => v.version === gameVersion)) {
        return [];
      }

      // Get Quilt loader versions
      const loaderResponse = await axios.get(`${this.quiltApiUrl}/versions/loader`);
      const loaderVersions = loaderResponse.data;

      return loaderVersions.slice(0, 5).map((loader: QuiltVersion) => ({
        type: 'quilt' as const,
        version: loader.version,
        gameVersion,
        stable: loader.stable,
        recommended: loader.stable
      }));
    } catch (error) {
      console.error('Error fetching Quilt versions:', error);
      return [];
    }
  }

  /**
   * Install a mod loader for a specific game version
   */
  async installModLoader(
    modLoaderInfo: ModLoaderInfo,
    installationDir: string,
    onProgress?: (progress: { stage: string; percentage: number }) => void
  ): Promise<boolean> {
    try {
      onProgress?.({ stage: 'Preparing installation', percentage: 0 });

      switch (modLoaderInfo.type) {
        case 'forge':
          return await this.installForge(modLoaderInfo, installationDir, onProgress);
        case 'fabric':
          return await this.installFabric(modLoaderInfo, installationDir, onProgress);
        case 'quilt':
          return await this.installQuilt(modLoaderInfo, installationDir, onProgress);
        default:
          throw new Error(`Unsupported mod loader type: ${modLoaderInfo.type}`);
      }
    } catch (error) {
      console.error('Error installing mod loader:', error);
      return false;
    }
  }

  /**
   * Install Forge mod loader
   */
  private async installForge(
    modLoaderInfo: ModLoaderInfo,
    installationDir: string,
    onProgress?: (progress: { stage: string; percentage: number }) => void
  ): Promise<boolean> {
    if (!modLoaderInfo.installerUrl) {
      throw new Error('Forge installer URL not available');
    }

    onProgress?.({ stage: 'Downloading Forge installer', percentage: 20 });

    // Download installer
    const installerPath = path.join(installationDir, 'forge-installer.jar');
    const response = await axios.get(modLoaderInfo.installerUrl, { responseType: 'stream' });
    const writer = require('fs').createWriteStream(installerPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    onProgress?.({ stage: 'Running Forge installer', percentage: 60 });

    // Run installer
    return new Promise((resolve) => {
      const installer = spawn('java', [
        '-jar',
        installerPath,
        '--installClient',
        installationDir
      ], {
        cwd: installationDir
      });

      installer.on('close', async (code) => {
        // Clean up installer
        try {
          await fs.unlink(installerPath);
        } catch (error) {
          console.warn('Failed to clean up installer:', error);
        }

        onProgress?.({ stage: 'Installation complete', percentage: 100 });
        resolve(code === 0);
      });

      installer.on('error', (error) => {
        console.error('Forge installer error:', error);
        resolve(false);
      });
    });
  }

  /**
   * Install Fabric mod loader
   */
  private async installFabric(
    modLoaderInfo: ModLoaderInfo,
    installationDir: string,
    onProgress?: (progress: { stage: string; percentage: number }) => void
  ): Promise<boolean> {
    onProgress?.({ stage: 'Downloading Fabric installer', percentage: 20 });

    // Download Fabric installer
    const installerUrl = 'https://maven.fabricmc.net/net/fabricmc/fabric-installer/0.11.2/fabric-installer-0.11.2.jar';
    const installerPath = path.join(installationDir, 'fabric-installer.jar');
    
    const response = await axios.get(installerUrl, { responseType: 'stream' });
    const writer = require('fs').createWriteStream(installerPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    onProgress?.({ stage: 'Running Fabric installer', percentage: 60 });

    // Run installer
    return new Promise((resolve) => {
      const installer = spawn('java', [
        '-jar',
        installerPath,
        'client',
        '-mcversion', modLoaderInfo.gameVersion,
        '-loader', modLoaderInfo.version,
        '-dir', installationDir
      ], {
        cwd: installationDir
      });

      installer.on('close', async (code) => {
        // Clean up installer
        try {
          await fs.unlink(installerPath);
        } catch (error) {
          console.warn('Failed to clean up installer:', error);
        }

        onProgress?.({ stage: 'Installation complete', percentage: 100 });
        resolve(code === 0);
      });

      installer.on('error', (error) => {
        console.error('Fabric installer error:', error);
        resolve(false);
      });
    });
  }

  /**
   * Install Quilt mod loader
   */
  private async installQuilt(
    modLoaderInfo: ModLoaderInfo,
    installationDir: string,
    onProgress?: (progress: { stage: string; percentage: number }) => void
  ): Promise<boolean> {
    onProgress?.({ stage: 'Downloading Quilt installer', percentage: 20 });

    // Download Quilt installer
    const installerUrl = 'https://maven.quiltmc.org/repository/release/org/quiltmc/quilt-installer/0.7.4/quilt-installer-0.7.4.jar';
    const installerPath = path.join(installationDir, 'quilt-installer.jar');
    
    const response = await axios.get(installerUrl, { responseType: 'stream' });
    const writer = require('fs').createWriteStream(installerPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    onProgress?.({ stage: 'Running Quilt installer', percentage: 60 });

    // Run installer
    return new Promise((resolve) => {
      const installer = spawn('java', [
        '-jar',
        installerPath,
        'install',
        'client',
        modLoaderInfo.gameVersion,
        '--install-dir', installationDir,
        '--loader-version', modLoaderInfo.version
      ], {
        cwd: installationDir
      });

      installer.on('close', async (code) => {
        // Clean up installer
        try {
          await fs.unlink(installerPath);
        } catch (error) {
          console.warn('Failed to clean up installer:', error);
        }

        onProgress?.({ stage: 'Installation complete', percentage: 100 });
        resolve(code === 0);
      });

      installer.on('error', (error) => {
        console.error('Quilt installer error:', error);
        resolve(false);
      });
    });
  }

  /**
   * Check if a mod loader is installed for a specific game version
   */
  async isModLoaderInstalled(
    type: 'forge' | 'fabric' | 'quilt',
    gameVersion: string,
    loaderVersion: string,
    installationDir: string
  ): Promise<boolean> {
    try {
      const versionsDir = path.join(installationDir, 'versions');
      
      let versionId: string;
      switch (type) {
        case 'forge':
          versionId = `${gameVersion}-forge-${loaderVersion}`;
          break;
        case 'fabric':
          versionId = `fabric-loader-${loaderVersion}-${gameVersion}`;
          break;
        case 'quilt':
          versionId = `quilt-loader-${loaderVersion}-${gameVersion}`;
          break;
      }

      const versionDir = path.join(versionsDir, versionId);
      const jsonFile = path.join(versionDir, `${versionId}.json`);
      
      try {
        await fs.access(jsonFile);
        return true;
      } catch {
        return false;
      }
    } catch (error) {
      console.error('Error checking mod loader installation:', error);
      return false;
    }
  }

  /**
   * Get installed mod loaders in the installation directory
   */
  async getInstalledModLoaders(installationDir: string): Promise<ModLoaderInfo[]> {
    try {
      const versionsDir = path.join(installationDir, 'versions');
      const versions = await fs.readdir(versionsDir);
      
      const modLoaders: ModLoaderInfo[] = [];
      
      for (const versionId of versions) {
        const versionDir = path.join(versionsDir, versionId);
        const jsonFile = path.join(versionDir, `${versionId}.json`);
        
        try {
          const jsonContent = await fs.readFile(jsonFile, 'utf-8');
          const versionData = JSON.parse(jsonContent);
          
          // Check for Forge
          if (versionId.includes('forge')) {
            const match = versionId.match(/^(.+)-forge-(.+)$/);
            if (match) {
              modLoaders.push({
                type: 'forge',
                version: match[2],
                gameVersion: match[1],
                stable: true
              });
            }
          }
          
          // Check for Fabric
          if (versionId.includes('fabric-loader')) {
            const match = versionId.match(/^fabric-loader-(.+)-(.+)$/);
            if (match) {
              modLoaders.push({
                type: 'fabric',
                version: match[1],
                gameVersion: match[2],
                stable: true
              });
            }
          }
          
          // Check for Quilt
          if (versionId.includes('quilt-loader')) {
            const match = versionId.match(/^quilt-loader-(.+)-(.+)$/);
            if (match) {
              modLoaders.push({
                type: 'quilt',
                version: match[1],
                gameVersion: match[2],
                stable: true
              });
            }
          }
        } catch (error) {
          // Skip invalid version files
          continue;
        }
      }
      
      return modLoaders;
    } catch (error) {
      console.error('Error getting installed mod loaders:', error);
      return [];
    }
  }
}