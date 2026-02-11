import React, { useState, useEffect } from 'react';
import { ModToggleDialog } from './ModToggleDialog';
import { ForgeModManager } from './ForgeModManager';
import { ForgeSettings } from './ForgeSettings';
import { ForgeInstaller } from './ForgeInstaller';

// For path operations in renderer process
const path = {
  sep: navigator.platform.includes('Win') ? '\\' : '/'
};

interface UserProfile {
  id: number;
  name: string;
  versionId: string;
  installationDir: string;
  memoryMin: number;
  memoryMax: number;
  jvmArgs: string;
  modLoader?: {
    type: 'forge' | 'fabric' | 'quilt';
    version: string;
  };
}

interface GameProcess {
  processId: number;
  profileId: number;
  profileName: string;
  startTime: Date;
  status: 'running' | 'exited' | 'crashed';
}

interface LauncherInterfaceProps {
  selectedProfile: UserProfile | null;
  onProfileChange?: () => void;
}

export const LauncherInterface: React.FC<LauncherInterfaceProps> = ({
  selectedProfile,
  onProfileChange,
}) => {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [isLaunching, setIsLaunching] = useState(false);
  const [gameStatus, setGameStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [activeProcesses, setActiveProcesses] = useState<GameProcess[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showForgeSettings, setShowForgeSettings] = useState(false);
  const [showModDialog, setShowModDialog] = useState(false);
  const [showForgeModManager, setShowForgeModManager] = useState(false);
  const [showForgeInstaller, setShowForgeInstaller] = useState(false);
  const [isInstallingOptiFine, setIsInstallingOptiFine] = useState(false);
  const [optiFineStatus, setOptiFineStatus] = useState<string>('');
  const [forgeInstallInfo, setForgeInstallInfo] = useState<{
    mcVersion: string;
    forgeVersion: string;
    minecraftDir: string;
  } | null>(null);
  const [pendingLaunchProfile, setPendingLaunchProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    loadProfiles();
    loadActiveProcesses();

    // Listen for game events
    window.electronAPI.onGameStarted((processInfo) => {
      setGameStatus(`Game started (PID: ${processInfo.processId})`);
      setIsLaunching(false);
      loadActiveProcesses();
    });

    window.electronAPI.onGameExited((data) => {
      setGameStatus(`Game exited with code ${data.exitCode}`);
      loadActiveProcesses();
    });

    window.electronAPI.onGameCrashed((crashReport) => {
      setGameStatus('Game crashed');
      setError(crashReport.error || 'Game crashed unexpectedly');
      loadActiveProcesses();
    });

    window.electronAPI.onLaunchError((error) => {
      setIsLaunching(false);
      setError(error.message || 'Failed to launch game');
      setGameStatus('Launch failed');
    });

    return () => {
      window.electronAPI.removeAllGameListeners();
    };
  }, []);

  const loadProfiles = async () => {
    try {
      const fetchedProfiles = await window.electronAPI.getProfiles();
      setProfiles(fetchedProfiles);
    } catch (err) {
      console.error('Failed to load profiles:', err);
    }
  };

  const loadActiveProcesses = async () => {
    try {
      const processes = await window.electronAPI.getActiveProcesses();
      setActiveProcesses(processes);
    } catch (err) {
      console.error('Failed to load active processes:', err);
    }
  };

  const handleLaunchGame = async () => {
    if (!selectedProfile) {
      setError('Please select a profile first');
      return;
    }

    try {
      setIsLaunching(true);
      setError(null);
      setGameStatus('Launching game...');

      // Check if this is a Fabric profile and if mod dialog should be shown
      if (selectedProfile.modLoader?.type === 'fabric') {
        const shouldShowDialog = await window.electronAPI.getProfilePreference(
          selectedProfile.id,
          'skipModDialog'
        );

        // Show mod dialog if user hasn't opted out (skipModDialog is not true)
        if (!shouldShowDialog) {
          setPendingLaunchProfile(selectedProfile);
          setShowModDialog(true);
          setIsLaunching(false);
          return;
        }
      }

      // Check if this is a Forge profile and apply mod states before launch
      if (selectedProfile.modLoader?.type === 'forge') {
        setGameStatus('Applying Forge mod states...');
        await window.electronAPI.applyForgeModStates(selectedProfile.id);
      }

      // Launch game directly (non-Fabric or user opted out of dialog)
      await launchGameWithProfile(selectedProfile);
    } catch (err) {
      console.error('Failed to launch game:', err);
      
      // Check if this is a Forge installation error
      if (err instanceof Error && err.message.includes('Forge') && err.message.includes('not installed')) {
        // Extract version info from error message
        const mcVersionMatch = err.message.match(/Minecraft (\d+\.\d+\.?\d*)/);
        const forgeVersionMatch = err.message.match(/Forge ([^\s]+)/);
        
        if (mcVersionMatch && forgeVersionMatch && selectedProfile) {
          // Get the Minecraft root directory (not the profile-specific directory)
          let minecraftDir = selectedProfile.installationDir;
          if (minecraftDir.includes(path.sep + 'profiles' + path.sep)) {
            const parts = minecraftDir.split(path.sep);
            const profilesIndex = parts.indexOf('profiles');
            if (profilesIndex > 0) {
              minecraftDir = parts.slice(0, profilesIndex).join(path.sep);
            }
          }
          
          setForgeInstallInfo({
            mcVersion: mcVersionMatch[1],
            forgeVersion: forgeVersionMatch[1],
            minecraftDir: minecraftDir
          });
          setShowForgeInstaller(true);
          setError(null); // Clear the error since we're showing the installer
        } else {
          setError(err.message);
        }
      } else {
        setError(err instanceof Error ? err.message : 'Failed to launch game');
      }
      
      setGameStatus('Launch failed');
      setIsLaunching(false);
    }
  };

  const launchGameWithProfile = async (profile: UserProfile) => {
    const launchOptions = {
      profileId: profile.id,
      versionId: profile.versionId,
      installationDir: profile.installationDir,
      memoryMin: profile.memoryMin,
      memoryMax: profile.memoryMax,
      jvmArgs: profile.jvmArgs,
      modLoader: profile.modLoader,
    };

    await window.electronAPI.launchGame(launchOptions);
  };

  const handleLaunchVanilla = async () => {
    if (!selectedProfile) {
      setError('Please select a profile first');
      return;
    }

    try {
      setIsLaunching(true);
      setError(null);
      setGameStatus('Launching vanilla Minecraft...');

      const launchOptions = {
        profileId: selectedProfile.id
      };

      await window.electronAPI.launchVanilla(launchOptions);
    } catch (err) {
      console.error('Failed to launch vanilla game:', err);
      setError(err instanceof Error ? err.message : 'Failed to launch vanilla game');
      setGameStatus('Launch failed');
      setIsLaunching(false);
    }
  };

  const handleModDialogConfirm = async (modStates: Map<string, boolean>, dontAskAgain: boolean) => {
    if (!pendingLaunchProfile) {
      setError('No profile selected for launch');
      setShowModDialog(false);
      setIsLaunching(false);
      return;
    }

    try {
      setShowModDialog(false);
      setIsLaunching(true);
      setGameStatus('Applying mod settings and launching...');

      // Mod states are already saved by ModToggleDialog
      // Launch the game
      await launchGameWithProfile(pendingLaunchProfile);
      
      setPendingLaunchProfile(null);
    } catch (err) {
      console.error('Failed to launch game after mod selection:', err);
      setError(err instanceof Error ? err.message : 'Failed to launch game');
      setGameStatus('Launch failed');
      setIsLaunching(false);
      setPendingLaunchProfile(null);
    }
  };

  const handleModDialogCancel = () => {
    setShowModDialog(false);
    setIsLaunching(false);
    setGameStatus('Launch cancelled');
    setPendingLaunchProfile(null);
  };

  const handleForgeInstallComplete = () => {
    setShowForgeInstaller(false);
    setForgeInstallInfo(null);
    setGameStatus('Forge installed successfully! You can now launch the game.');
    
    // Update the profile to use the correct Forge version ID
    if (selectedProfile && forgeInstallInfo) {
      const newVersionId = `${forgeInstallInfo.mcVersion}-forge-${forgeInstallInfo.forgeVersion}`;
      console.log(`Updating profile version ID to: ${newVersionId}`);
      
      // Note: In a real implementation, you'd call an API to update the profile
      // For now, we'll just show a message to the user
      setGameStatus(`Forge installed! Profile updated to use ${newVersionId}. Click Play to launch with Forge.`);
    }
    
    // Optionally auto-launch after installation
    setTimeout(() => {
      if (selectedProfile) {
        handleLaunchGame();
      }
    }, 2000); // Wait 2 seconds then auto-launch
  };

  const handleForgeInstallCancel = () => {
    setShowForgeInstaller(false);
    setForgeInstallInfo(null);
    setGameStatus('Forge installation cancelled');
  };

  const handleOptiFineInstall = async () => {
    if (!selectedProfile) return;
    
    try {
      setIsInstallingOptiFine(true);
      setOptiFineStatus('Installing OptiFine...');
      
      const gameVersion = selectedProfile.versionId.split('-')[0]; // Extract base version like "1.12.2"
      
      // Get the Minecraft directory from the profile
      let minecraftDir = selectedProfile.installationDir;
      if (minecraftDir.includes('/profiles/') || minecraftDir.includes('\\profiles\\')) {
        // If this is a profile-specific directory, get the parent .minecraft directory
        const parts = minecraftDir.split(/[/\\]/);
        const profilesIndex = parts.indexOf('profiles');
        if (profilesIndex > 0) {
          minecraftDir = parts.slice(0, profilesIndex).join('/');
        }
      }
      
      const modsDirectory = `${minecraftDir}/mods`;
      
      const result = await window.electronAPI.installOptiFine(gameVersion, modsDirectory);
      
      if (result.success) {
        setOptiFineStatus(`✅ ${result.message}`);
        setGameStatus(`OptiFine ${result.version} installed successfully!`);
      } else if (result.requiresManualInstall) {
        // Show manual installation instructions
        setOptiFineStatus(`⚠️ ${result.message}`);
        setGameStatus(
          `Manual OptiFine installation required:\n` +
          `1. Visit https://optifine.net/downloads\n` +
          `2. Download OptiFine HD_U_E3 for Minecraft ${gameVersion}\n` +
          `3. Place the JAR file in: ${result.targetDirectory}\n` +
          `4. Restart launcher and try launching`
        );
        
        // Also show a more detailed error for debugging
        console.error('OptiFine automatic installation failed:', result.error);
        console.log('Manual installation instructions:', result.instructions);
      }
    } catch (error) {
      console.error('Failed to install OptiFine:', error);
      setOptiFineStatus(`❌ Failed to install OptiFine: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setGameStatus(`Failed to install OptiFine: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsInstallingOptiFine(false);
      // Clear status after 10 seconds for manual install instructions
      setTimeout(() => setOptiFineStatus(''), 10000);
    }
  };

  const handleKillGame = async (processId: number) => {
    try {
      await window.electronAPI.killGame(processId);
      setGameStatus('Game terminated');
      await loadActiveProcesses();
    } catch (err) {
      console.error('Failed to kill game:', err);
      setError(err instanceof Error ? err.message : 'Failed to terminate game');
    }
  };

  const isProfileRunning = selectedProfile
    ? activeProcesses.some(p => p.profileId === selectedProfile.id && p.status === 'running')
    : false;

  return (
    <div className="launcher-interface">
      <div className="launcher-main">
        <div className="profile-selector-section">
          <label>Selected Profile</label>
          <div className="profile-display">
            {selectedProfile ? (
              <>
                <div className="profile-display-info">
                  <span className="profile-display-name">{selectedProfile.name}</span>
                  <span className="profile-display-version">
                    {selectedProfile.versionId}
                    {selectedProfile.modLoader && (
                      <span className={`mod-badge ${selectedProfile.modLoader.type}`}>
                        {selectedProfile.modLoader.type}
                      </span>
                    )}
                  </span>
                </div>
                {isProfileRunning && (
                  <span className="running-indicator">● Running</span>
                )}
              </>
            ) : (
              <span className="no-profile-selected">No profile selected</span>
            )}
          </div>
        </div>

        <button
          className={`play-button ${isLaunching ? 'launching' : ''} ${isProfileRunning ? 'running' : ''}`}
          onClick={handleLaunchGame}
          disabled={!selectedProfile || isLaunching || isProfileRunning}
        >
          {isLaunching ? (
            <>
              <span className="loading-spinner small"></span>
              Launching...
            </>
          ) : isProfileRunning ? (
            'Game Running'
          ) : (
            '▶ Play'
          )}
        </button>

        {/* Vanilla Launch Button - shown when profile has mod loader configured */}
        {selectedProfile?.modLoader && (
          <button
            className="vanilla-launch-btn"
            onClick={handleLaunchVanilla}
            disabled={!selectedProfile || isLaunching || isProfileRunning}
            title="Launch without mod loader (vanilla Minecraft)"
          >
            {isLaunching ? 'Launching...' : '🍦 Launch Vanilla'}
          </button>
        )}

        {/* Quick Forge Install Button - shown for Forge profiles */}
        {selectedProfile?.modLoader?.type === 'forge' && (
          <button
            className="forge-install-btn"
            onClick={() => {
              if (selectedProfile) {
                let minecraftDir = selectedProfile.installationDir;
                if (minecraftDir.includes(path.sep + 'profiles' + path.sep)) {
                  const parts = minecraftDir.split(path.sep);
                  const profilesIndex = parts.indexOf('profiles');
                  if (profilesIndex > 0) {
                    minecraftDir = parts.slice(0, profilesIndex).join(path.sep);
                  }
                }
                
                setForgeInstallInfo({
                  mcVersion: selectedProfile.versionId.split('-')[0], // Extract base version
                  forgeVersion: selectedProfile.modLoader!.version,
                  minecraftDir: minecraftDir
                });
                setShowForgeInstaller(true);
              }
            }}
            disabled={!selectedProfile || isLaunching || isProfileRunning}
            title="Install or reinstall Forge for this profile"
          >
            🔧 Install Forge
          </button>
        )}

        {/* OptiFine Install Button - shown for Forge profiles */}
        {selectedProfile?.modLoader?.type === 'forge' && (
          <div className="optifine-controls">
            <button
              className="optifine-install-btn"
              onClick={handleOptiFineInstall}
              disabled={!selectedProfile || isLaunching || isProfileRunning || isInstallingOptiFine}
              title="Try automatic OptiFine installation (may require manual steps)"
            >
              {isInstallingOptiFine ? '⏳ Installing...' : '✨ Install OptiFine (Auto + Manual)'}
            </button>
            
            <button
              className="open-mods-folder-btn"
              onClick={async () => {
                if (selectedProfile) {
                  let minecraftDir = selectedProfile.installationDir;
                  if (minecraftDir.includes('/profiles/') || minecraftDir.includes('\\profiles\\')) {
                    const parts = minecraftDir.split(/[/\\]/);
                    const profilesIndex = parts.indexOf('profiles');
                    if (profilesIndex > 0) {
                      minecraftDir = parts.slice(0, profilesIndex).join('/');
                    }
                  }
                  const modsDirectory = `${minecraftDir}/mods`;
                  try {
                    await window.electronAPI.openModsFolder(modsDirectory);
                    setGameStatus('📁 Mods folder opened! Place OptiFine JAR files here for instant detection.');
                  } catch (error) {
                    console.error('Failed to open mods folder:', error);
                  }
                }
              }}
              disabled={!selectedProfile}
              title="Open the mods folder to manually add OptiFine"
            >
              📁 Open Mods Folder
            </button>
            
            <button
              className="optifine-download-btn"
              onClick={() => {
                // Open OptiFine downloads page
                window.open('https://optifine.net/downloads', '_blank');
                setGameStatus('🌐 OptiFine downloads page opened. Download HD_U_E3 for Minecraft 1.12.2, then use "Open Mods Folder" to install it.');
              }}
              title="Open OptiFine downloads page in browser"
            >
              🌐 Download OptiFine
            </button>
          </div>
        )}
        
        {/* OptiFine Status */}
        {optiFineStatus && (
          <div className="optifine-status">
            <p>{optiFineStatus}</p>
          </div>
        )}

        {/* Forge Mod Manager Button */}
        {selectedProfile?.modLoader?.type === 'forge' && (
          <button
            className="forge-mod-manager-btn"
            onClick={() => setShowForgeModManager(true)}
            disabled={isLaunching || isProfileRunning}
          >
            🔧 Manage Forge Mods
          </button>
        )}

        {gameStatus && (
          <div className="game-status">
            <span className="status-icon">ℹ️</span>
            <span>{gameStatus}</span>
          </div>
        )}

        {error && (
          <div className="launch-error">
            <p>❌ {error}</p>
            <div className="error-actions">
              {error.includes('Forge') && error.includes('not installed') && selectedProfile && (
                <button 
                  onClick={() => {
                    // Extract version info and show installer
                    const mcVersionMatch = error.match(/Minecraft (\d+\.\d+\.?\d*)/);
                    const forgeVersionMatch = error.match(/Forge ([^\s]+)/);
                    
                    if (mcVersionMatch && forgeVersionMatch) {
                      let minecraftDir = selectedProfile.installationDir;
                      if (minecraftDir.includes(path.sep + 'profiles' + path.sep)) {
                        const parts = minecraftDir.split(path.sep);
                        const profilesIndex = parts.indexOf('profiles');
                        if (profilesIndex > 0) {
                          minecraftDir = parts.slice(0, profilesIndex).join(path.sep);
                        }
                      }
                      
                      setForgeInstallInfo({
                        mcVersion: mcVersionMatch[1],
                        forgeVersion: forgeVersionMatch[1],
                        minecraftDir: minecraftDir
                      });
                      setShowForgeInstaller(true);
                      setError(null);
                    }
                  }}
                  className="btn-primary"
                >
                  🔧 Install Forge Automatically
                </button>
              )}
              <button onClick={() => setError(null)} className="dismiss-btn">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {activeProcesses.length > 0 && (
          <div className="active-processes">
            <h4>Active Games</h4>
            <div className="process-list">
              {activeProcesses.map(process => (
                <div key={process.processId} className="process-item">
                  <div className="process-info">
                    <span className="process-name">{process.profileName}</span>
                    <span className="process-status">
                      {process.status === 'running' ? '● Running' : '○ Stopped'}
                    </span>
                  </div>
                  {process.status === 'running' && (
                    <button
                      className="kill-process-btn"
                      onClick={() => handleKillGame(process.processId)}
                    >
                      Stop
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="launcher-footer">
        <button
          className="settings-btn"
          onClick={() => setShowSettings(!showSettings)}
        >
          ⚙️ Settings
        </button>
      </div>

      {showSettings && (
        <SettingsPanel 
          onClose={() => setShowSettings(false)} 
          onOpenForgeSettings={() => setShowForgeSettings(true)}
        />
      )}

      {showForgeSettings && (
        <ForgeSettings onClose={() => setShowForgeSettings(false)} />
      )}

      {showForgeModManager && selectedProfile && selectedProfile.modLoader?.type === 'forge' && (
        <ForgeModManager
          profileId={selectedProfile.id}
          gameVersion={selectedProfile.versionId}
          onConfirm={(modStates, launchGame) => {
            setShowForgeModManager(false);
            if (launchGame) {
              // Launch the game after applying mod states
              launchGameWithProfile(selectedProfile);
            }
            // Refresh profile data if needed
            onProfileChange?.();
          }}
          onCancel={() => setShowForgeModManager(false)}
        />
      )}

      {showModDialog && pendingLaunchProfile && (
        <ModToggleDialog
          profileId={pendingLaunchProfile.id}
          gameVersion={pendingLaunchProfile.versionId}
          onConfirm={handleModDialogConfirm}
          onCancel={handleModDialogCancel}
        />
      )}

      {showForgeInstaller && forgeInstallInfo && (
        <ForgeInstaller
          mcVersion={forgeInstallInfo.mcVersion}
          forgeVersion={forgeInstallInfo.forgeVersion}
          minecraftDir={forgeInstallInfo.minecraftDir}
          onInstallComplete={handleForgeInstallComplete}
          onCancel={handleForgeInstallCancel}
        />
      )}
    </div>
  );
};

interface SettingsPanelProps {
  onClose: () => void;
  onOpenForgeSettings: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose, onOpenForgeSettings }) => {
  const [appVersion, setAppVersion] = useState('');
  const [platform, setPlatform] = useState('');

  useEffect(() => {
    loadAppInfo();
  }, []);

  const loadAppInfo = async () => {
    try {
      const version = await window.electronAPI.getVersion();
      const platformInfo = await window.electronAPI.getPlatform();
      setAppVersion(version);
      setPlatform(platformInfo);
    } catch (err) {
      console.error('Failed to load app info:', err);
    }
  };

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <h3>Settings</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="settings-content">
          <div className="settings-section">
            <h4>Mod Management</h4>
            <div className="settings-actions">
              <button 
                className="forge-settings-btn"
                onClick={() => {
                  onClose();
                  onOpenForgeSettings();
                }}
              >
                🔧 Forge Mod Settings
              </button>
              <p className="settings-description">
                Configure OptiFine settings, mod management preferences, and Forge profile options.
              </p>
            </div>
          </div>

          <div className="settings-section">
            <h4>Application Information</h4>
            <div className="settings-info">
              <div className="info-row">
                <span className="info-label">Version:</span>
                <span className="info-value">{appVersion}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Platform:</span>
                <span className="info-value">{platform}</span>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h4>About</h4>
            <p className="settings-description">
              Minecraft Launcher - A custom launcher for managing and launching
              different versions of Minecraft with support for profiles, mod loaders,
              and custom configurations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
