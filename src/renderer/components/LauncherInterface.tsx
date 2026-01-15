import React, { useState, useEffect } from 'react';

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

      const launchOptions = {
        profileId: selectedProfile.id,
        versionId: selectedProfile.versionId,
        installationDir: selectedProfile.installationDir,
        memoryMin: selectedProfile.memoryMin,
        memoryMax: selectedProfile.memoryMax,
        jvmArgs: selectedProfile.jvmArgs,
        modLoader: selectedProfile.modLoader,
      };

      await window.electronAPI.launchGame(launchOptions);
    } catch (err) {
      console.error('Failed to launch game:', err);
      setError(err instanceof Error ? err.message : 'Failed to launch game');
      setGameStatus('Launch failed');
      setIsLaunching(false);
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

        {gameStatus && (
          <div className="game-status">
            <span className="status-icon">ℹ️</span>
            <span>{gameStatus}</span>
          </div>
        )}

        {error && (
          <div className="launch-error">
            <p>❌ {error}</p>
            <button onClick={() => setError(null)} className="dismiss-btn">
              Dismiss
            </button>
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
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
};

interface SettingsPanelProps {
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
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
