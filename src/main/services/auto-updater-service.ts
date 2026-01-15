import { autoUpdater } from 'electron-updater';
import { BrowserWindow, dialog } from 'electron';
import { LoggerService } from './logger-service';

export class AutoUpdaterService {
  private static instance: AutoUpdaterService;
  private logger: LoggerService;
  private mainWindow: BrowserWindow | null = null;

  private constructor() {
    this.logger = LoggerService.getInstance();
    this.setupAutoUpdater();
  }

  public static getInstance(): AutoUpdaterService {
    if (!AutoUpdaterService.instance) {
      AutoUpdaterService.instance = new AutoUpdaterService();
    }
    return AutoUpdaterService.instance;
  }

  public setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private setupAutoUpdater(): void {
    // Configure auto-updater
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // Logging
    autoUpdater.logger = {
      info: (message) => this.logger.info(`AutoUpdater: ${message}`),
      warn: (message) => this.logger.warn(`AutoUpdater: ${message}`),
      error: (message) => this.logger.error(`AutoUpdater: ${message}`),
      debug: (message) => this.logger.debug(`AutoUpdater: ${message}`),
    };

    // Event handlers
    autoUpdater.on('checking-for-update', () => {
      this.logger.info('Checking for updates...');
      this.sendStatusToWindow('Checking for updates...');
    });

    autoUpdater.on('update-available', (info) => {
      this.logger.info('Update available:', info);
      this.sendStatusToWindow('Update available');
      
      // Ask user if they want to download the update
      if (this.mainWindow) {
        dialog.showMessageBox(this.mainWindow, {
          type: 'info',
          title: 'Update Available',
          message: `A new version (${info.version}) is available. Would you like to download it now?`,
          buttons: ['Download', 'Later'],
          defaultId: 0,
          cancelId: 1,
        }).then((result) => {
          if (result.response === 0) {
            autoUpdater.downloadUpdate();
          }
        });
      }
    });

    autoUpdater.on('update-not-available', (info) => {
      this.logger.info('Update not available:', info);
      this.sendStatusToWindow('App is up to date');
    });

    autoUpdater.on('error', (err) => {
      this.logger.error('Error in auto-updater:', err);
      this.sendStatusToWindow('Error checking for updates');
    });

    autoUpdater.on('download-progress', (progressObj) => {
      const message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
      this.logger.info(message);
      this.sendStatusToWindow(message);
      
      // Send progress to renderer
      if (this.mainWindow) {
        this.mainWindow.webContents.send('update:downloadProgress', {
          percent: progressObj.percent,
          transferred: progressObj.transferred,
          total: progressObj.total,
          bytesPerSecond: progressObj.bytesPerSecond,
        });
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.logger.info('Update downloaded:', info);
      this.sendStatusToWindow('Update downloaded');
      
      // Ask user if they want to install now
      if (this.mainWindow) {
        dialog.showMessageBox(this.mainWindow, {
          type: 'info',
          title: 'Update Ready',
          message: 'Update downloaded. The application will restart to install the update.',
          buttons: ['Restart Now', 'Later'],
          defaultId: 0,
          cancelId: 1,
        }).then((result) => {
          if (result.response === 0) {
            autoUpdater.quitAndInstall(false, true);
          }
        });
      }
    });
  }

  private sendStatusToWindow(message: string): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('update:status', message);
    }
  }

  public checkForUpdates(): void {
    // Only check for updates in production
    if (process.env.NODE_ENV === 'production') {
      autoUpdater.checkForUpdates();
    } else {
      this.logger.info('Skipping update check in development mode');
    }
  }

  public downloadUpdate(): void {
    autoUpdater.downloadUpdate();
  }

  public quitAndInstall(): void {
    autoUpdater.quitAndInstall(false, true);
  }
}
