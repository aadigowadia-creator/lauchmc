import React, { useState, useEffect } from 'react';
import './OptiFineStatus.css';

interface OptiFineConfig {
  id?: number;
  profileId: string;
  version: string;
  enabled: boolean;
  downloadUrl?: string;
  filePath?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface OptiFineStatusProps {
  profileId: number;
  gameVersion: string;
  onConfigChange?: (config: OptiFineConfig) => void;
}

export const OptiFineStatus: React.FC<OptiFineStatusProps> = ({
  profileId,
  gameVersion,
  onConfigChange
}) => {
  const [config, setConfig] = useState<OptiFineConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    loadOptiFineConfig();
  }, [profileId]);

  const loadOptiFineConfig = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // For now, use placeholder OptiFine config
      const optifineConfig = {
        id: 1,
        profileId: profileId.toString(),
        version: 'HD_U_I5',
        enabled: true,
        downloadUrl: 'https://optifine.net/adloadx?f=OptiFine_1.20.1_HD_U_I5.jar',
        filePath: '/path/to/optifine.jar',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      setConfig(optifineConfig);
    } catch (err) {
      console.error('Failed to load OptiFine config:', err);
      setError('Failed to load OptiFine configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleOptiFine = async () => {
    if (!config) return;

    try {
      setIsUpdating(true);
      setError(null);

      const newEnabled = !config.enabled;
      // For now, just simulate the update
      console.log('Updating OptiFine config:', { enabled: newEnabled });

      const updatedConfig = { ...config, enabled: newEnabled };
      setConfig(updatedConfig);
      onConfigChange?.(updatedConfig);
    } catch (err) {
      console.error('Failed to update OptiFine config:', err);
      setError('Failed to update OptiFine configuration');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReinstallOptiFine = async () => {
    try {
      setIsUpdating(true);
      setError(null);

      // For now, simulate OptiFine reinstallation
      console.log('Reinstalling OptiFine for profile:', profileId, 'game version:', gameVersion);
      await loadOptiFineConfig(); // Reload config after reinstall
    } catch (err) {
      console.error('Failed to reinstall OptiFine:', err);
      setError('Failed to reinstall OptiFine');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="optifine-status loading">
        <div className="optifine-icon">🔍</div>
        <div className="optifine-info">
          <div className="optifine-name">OptiFine</div>
          <div className="optifine-description">Loading configuration...</div>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="optifine-status not-installed">
        <div className="optifine-icon">⚠️</div>
        <div className="optifine-info">
          <div className="optifine-name">OptiFine</div>
          <div className="optifine-description">Not installed for this profile</div>
        </div>
        <div className="optifine-actions">
          <button
            className="install-optifine-btn"
            onClick={handleReinstallOptiFine}
            disabled={isUpdating}
          >
            {isUpdating ? 'Installing...' : 'Install OptiFine'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`optifine-status ${config.enabled ? 'enabled' : 'disabled'}`}>
      <div className="optifine-icon">
        {config.enabled ? '✅' : '⭕'}
      </div>
      
      <div className="optifine-info">
        <div className="optifine-name">
          OptiFine {config.version}
          <span className={`optifine-status-badge ${config.enabled ? 'enabled' : 'disabled'}`}>
            {config.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        
        <div className="optifine-description">
          Graphics optimization and performance enhancement mod
        </div>
        
        <div className="optifine-details">
          <span className="optifine-detail">Compatible with MC {gameVersion}</span>
          {config.filePath && (
            <span className="optifine-detail">Installed</span>
          )}
        </div>
      </div>

      <div className="optifine-actions">
        <button
          className={`toggle-optifine-btn ${config.enabled ? 'disable' : 'enable'}`}
          onClick={handleToggleOptiFine}
          disabled={isUpdating}
        >
          {isUpdating ? 'Updating...' : config.enabled ? 'Disable' : 'Enable'}
        </button>
        
        <button
          className="reinstall-optifine-btn"
          onClick={handleReinstallOptiFine}
          disabled={isUpdating}
          title="Reinstall OptiFine"
        >
          🔄
        </button>
      </div>

      {error && (
        <div className="optifine-error">
          <p>{error}</p>
          <button onClick={() => setError(null)} className="dismiss-error-btn">×</button>
        </div>
      )}
    </div>
  );
};

interface OptiFineConfigPanelProps {
  profileId: number;
  gameVersion: string;
  onClose: () => void;
}

export const OptiFineConfigPanel: React.FC<OptiFineConfigPanelProps> = ({
  profileId,
  gameVersion,
  onClose
}) => {
  const [config, setConfig] = useState<OptiFineConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // OptiFine configuration options
  const [enableShaders, setEnableShaders] = useState(true);
  const [enableDynamicLights, setEnableDynamicLights] = useState(true);
  const [enableConnectedTextures, setEnableConnectedTextures] = useState(true);
  const [enableCustomSky, setEnableCustomSky] = useState(true);
  const [enableBetterGrass, setEnableBetterGrass] = useState(true);
  const [enableBetterSnow, setEnableBetterSnow] = useState(true);

  useEffect(() => {
    loadOptiFineConfig();
  }, [profileId]);

  const loadOptiFineConfig = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // For now, use placeholder OptiFine config
      const optifineConfig = {
        id: 1,
        profileId: profileId.toString(),
        version: 'HD_U_I5',
        enabled: true,
        downloadUrl: 'https://optifine.net/adloadx?f=OptiFine_1.20.1_HD_U_I5.jar',
        filePath: '/path/to/optifine.jar',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      setConfig(optifineConfig);

      // Load OptiFine-specific settings if available
      // These would typically be stored in OptiFine's config files
      // For now, we'll use default values
    } catch (err) {
      console.error('Failed to load OptiFine config:', err);
      setError('Failed to load OptiFine configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      setIsSaving(true);
      setError(null);

      // Save OptiFine configuration
      // In a real implementation, this would write to OptiFine's config files
      const configData = {
        enableShaders,
        enableDynamicLights,
        enableConnectedTextures,
        enableCustomSky,
        enableBetterGrass,
        enableBetterSnow
      };

      console.log('Saving OptiFine settings:', configData);
      onClose();
    } catch (err) {
      console.error('Failed to save OptiFine config:', err);
      setError('Failed to save OptiFine configuration');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="optifine-config-overlay">
        <div className="optifine-config-panel">
          <div className="config-header">
            <h3>OptiFine Configuration</h3>
          </div>
          <div className="loading-section">
            <div className="loading-spinner"></div>
            <p>Loading OptiFine configuration...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="optifine-config-overlay">
        <div className="optifine-config-panel">
          <div className="config-header">
            <h3>OptiFine Configuration</h3>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          <div className="config-error">
            <p>OptiFine is not installed for this profile.</p>
            <button className="close-btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="optifine-config-overlay">
      <div className="optifine-config-panel">
        <div className="config-header">
          <h3>OptiFine Configuration</h3>
          <button className="close-btn" onClick={onClose} disabled={isSaving}>×</button>
        </div>

        <div className="config-info">
          <p>Configure OptiFine settings for enhanced graphics and performance.</p>
          <p>OptiFine {config.version} • Minecraft {gameVersion}</p>
        </div>

        {error && (
          <div className="config-error">
            <p>❌ {error}</p>
            <button onClick={() => setError(null)} className="dismiss-btn">Dismiss</button>
          </div>
        )}

        <div className="config-sections">
          <div className="config-section">
            <h4>Graphics Enhancements</h4>
            
            <div className="config-option">
              <label className="config-checkbox-label">
                <input
                  type="checkbox"
                  checked={enableShaders}
                  onChange={(e) => setEnableShaders(e.target.checked)}
                  disabled={isSaving}
                />
                <span className="config-checkmark"></span>
                Enable Shaders Support
              </label>
              <p className="config-option-description">
                Allows the use of shader packs for advanced lighting and visual effects
              </p>
            </div>

            <div className="config-option">
              <label className="config-checkbox-label">
                <input
                  type="checkbox"
                  checked={enableDynamicLights}
                  onChange={(e) => setEnableDynamicLights(e.target.checked)}
                  disabled={isSaving}
                />
                <span className="config-checkmark"></span>
                Dynamic Lights
              </label>
              <p className="config-option-description">
                Items like torches and glowstone emit light when held or dropped
              </p>
            </div>

            <div className="config-option">
              <label className="config-checkbox-label">
                <input
                  type="checkbox"
                  checked={enableConnectedTextures}
                  onChange={(e) => setEnableConnectedTextures(e.target.checked)}
                  disabled={isSaving}
                />
                <span className="config-checkmark"></span>
                Connected Textures
              </label>
              <p className="config-option-description">
                Seamless textures for glass, sandstone, and other blocks
              </p>
            </div>

            <div className="config-option">
              <label className="config-checkbox-label">
                <input
                  type="checkbox"
                  checked={enableCustomSky}
                  onChange={(e) => setEnableCustomSky(e.target.checked)}
                  disabled={isSaving}
                />
                <span className="config-checkmark"></span>
                Custom Sky
              </label>
              <p className="config-option-description">
                Support for custom sky textures and colors
              </p>
            </div>
          </div>

          <div className="config-section">
            <h4>Environmental Effects</h4>
            
            <div className="config-option">
              <label className="config-checkbox-label">
                <input
                  type="checkbox"
                  checked={enableBetterGrass}
                  onChange={(e) => setEnableBetterGrass(e.target.checked)}
                  disabled={isSaving}
                />
                <span className="config-checkmark"></span>
                Better Grass
              </label>
              <p className="config-option-description">
                Grass textures on the sides of grass blocks
              </p>
            </div>

            <div className="config-option">
              <label className="config-checkbox-label">
                <input
                  type="checkbox"
                  checked={enableBetterSnow}
                  onChange={(e) => setEnableBetterSnow(e.target.checked)}
                  disabled={isSaving}
                />
                <span className="config-checkmark"></span>
                Better Snow
              </label>
              <p className="config-option-description">
                Snow textures on the sides of snow-covered blocks
              </p>
            </div>
          </div>
        </div>

        <div className="config-footer">
          <div className="config-note">
            <p>Note: Some settings may require a game restart to take effect.</p>
          </div>
          
          <div className="config-actions">
            <button
              className="cancel-btn"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            
            <button
              className="save-btn"
              onClick={handleSaveConfig}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};