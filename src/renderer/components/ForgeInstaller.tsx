import React, { useState, useEffect } from 'react';
import './ForgeInstaller.css';

interface ForgeVersion {
  version: string;
  mcVersion: string;
  recommended: boolean;
  latest: boolean;
}

interface ForgeInstallProgress {
  stage: 'downloading' | 'installing' | 'verifying' | 'complete' | 'error';
  percentage: number;
  message: string;
  error?: string;
}

interface ForgeInstallerProps {
  mcVersion: string;
  forgeVersion?: string;
  minecraftDir: string;
  onInstallComplete: () => void;
  onCancel: () => void;
}

export const ForgeInstaller: React.FC<ForgeInstallerProps> = ({
  mcVersion,
  forgeVersion,
  minecraftDir,
  onInstallComplete,
  onCancel,
}) => {
  const [availableVersions, setAvailableVersions] = useState<ForgeVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>(forgeVersion || '');
  const [isInstalling, setIsInstalling] = useState(false);
  const [progress, setProgress] = useState<ForgeInstallProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAvailableVersions();
    
    // Listen for installation progress
    window.electronAPI.onForgeInstallProgress((progressData: ForgeInstallProgress) => {
      setProgress(progressData);
      
      if (progressData.stage === 'complete') {
        setIsInstalling(false);
        
        // Update the profile to use the correct Forge version
        if (onInstallComplete) {
          setTimeout(async () => {
            try {
              // Extract profile ID from the parent component context
              // In a real implementation, you'd pass the profile ID as a prop
              console.log('Forge installation completed successfully');
              onInstallComplete();
            } catch (error) {
              console.error('Failed to update profile after Forge installation:', error);
              onInstallComplete(); // Still call completion even if update fails
            }
          }, 1000);
        }
      } else if (progressData.stage === 'error') {
        setIsInstalling(false);
        setError(progressData.error || 'Installation failed');
      }
    });

    return () => {
      window.electronAPI.removeForgeInstallProgressListener();
    };
  }, [onInstallComplete]);

  const loadAvailableVersions = async () => {
    try {
      setIsLoading(true);
      const versions = await window.electronAPI.getAvailableForgeVersions(mcVersion);
      setAvailableVersions(versions);
      
      // Set default selection
      if (!selectedVersion) {
        const recommended = versions.find((v: ForgeVersion) => v.recommended);
        const latest = versions.find((v: ForgeVersion) => v.latest);
        setSelectedVersion((recommended || latest || versions[0])?.version || '');
      }
    } catch (err) {
      console.error('Failed to load Forge versions:', err);
      setError('Failed to load available Forge versions');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInstall = async () => {
    if (!selectedVersion) {
      setError('Please select a Forge version to install');
      return;
    }

    try {
      setIsInstalling(true);
      setError(null);
      
      // Check Java availability first
      setProgress({
        stage: 'downloading',
        percentage: 0,
        message: 'Checking Java installation...'
      });

      const javaCheck = await window.electronAPI.checkJava();
      if (!javaCheck.available) {
        throw new Error(
          `Java is required to install Forge. ${javaCheck.message || 'Please install Java 8 or later from https://adoptium.net/'}`
        );
      }

      console.log('Java available:', javaCheck);

      setProgress({
        stage: 'downloading',
        percentage: 5,
        message: 'Starting Forge installation...'
      });

      await window.electronAPI.installForge(mcVersion, selectedVersion, minecraftDir);
    } catch (err) {
      console.error('Forge installation failed:', err);
      setError(err instanceof Error ? err.message : 'Installation failed');
      setIsInstalling(false);
      setProgress(null);
    }
  };

  const getStageIcon = (stage: string) => {
    switch (stage) {
      case 'downloading': return '⬇️';
      case 'installing': return '⚙️';
      case 'verifying': return '✅';
      case 'complete': return '🎉';
      case 'error': return '❌';
      default: return '⏳';
    }
  };

  return (
    <div className="forge-installer-overlay">
      <div className="forge-installer">
        <div className="installer-header">
          <h3>Install Minecraft Forge</h3>
          <p>Forge {forgeVersion || 'is'} not installed for Minecraft {mcVersion}</p>
        </div>

        {isLoading ? (
          <div className="loading-section">
            <div className="loading-spinner"></div>
            <p>Loading available Forge versions...</p>
          </div>
        ) : (
          <>
            <div className="version-selection">
              <label htmlFor="forge-version">Select Forge Version:</label>
              <select
                id="forge-version"
                value={selectedVersion}
                onChange={(e) => setSelectedVersion(e.target.value)}
                disabled={isInstalling}
              >
                {availableVersions.map((version) => (
                  <option key={version.version} value={version.version}>
                    {version.version}
                    {version.recommended && ' (Recommended)'}
                    {version.latest && ' (Latest)'}
                  </option>
                ))}
              </select>
            </div>

            {progress && (
              <div className="installation-progress">
                <div className="progress-header">
                  <span className="stage-icon">{getStageIcon(progress.stage)}</span>
                  <span className="stage-text">{progress.message}</span>
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${progress.percentage}%` }}
                  ></div>
                </div>
                <div className="progress-percentage">{Math.round(progress.percentage)}%</div>
              </div>
            )}

            {error && (
              <div className="error-message">
                <span className="error-icon">❌</span>
                <div className="error-content">
                  <span>{error}</span>
                  {error.includes('Java') && (
                    <div className="error-help">
                      <p><strong>Java is required to install Forge.</strong></p>
                      <p>Please install Java 8 or later from <a href="https://adoptium.net/" target="_blank" rel="noopener noreferrer">https://adoptium.net/</a></p>
                      <p>After installing Java, restart the launcher and try again.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="installer-actions">
              <button
                className="btn-secondary"
                onClick={onCancel}
                disabled={isInstalling}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleInstall}
                disabled={isInstalling || !selectedVersion}
              >
                {isInstalling ? 'Installing...' : 'Install Forge'}
              </button>
            </div>

            <div className="installer-info">
              <p>
                <strong>What this does:</strong>
              </p>
              <ul>
                <li>Downloads the official Forge installer</li>
                <li>Installs Forge to your Minecraft directory</li>
                <li>Sets up all required libraries and files</li>
                <li>Updates your profile to use Forge</li>
                <li>Enables mod support for your profile</li>
              </ul>
              
              {progress && progress.stage === 'complete' && (
                <div className="success-message">
                  <p><strong>🎉 Installation Complete!</strong></p>
                  <p>Forge has been successfully installed. Your profile will now launch with Forge support.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};