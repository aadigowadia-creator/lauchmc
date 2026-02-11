import React, { useState, useEffect } from 'react';
import './ForgeSettings.css';

interface ForgeOptiFineSettings {
  autoDownload: boolean;
  defaultEnabled: boolean;
  preferredVersion: 'latest' | 'recommended' | 'specific';
  specificVersion?: string;
  enableShaders: boolean;
  enableConnectedTextures: boolean;
  enableCustomSky: boolean;
  enableNaturalTextures: boolean;
  enableRandomEntities: boolean;
  enableBetterGrass: boolean;
  enableBetterSnow: boolean;
  enableCustomColors: boolean;
  enableCustomFonts: boolean;
  enableCustomGUI: boolean;
  enableCustomItems: boolean;
  enableCustomModels: boolean;
  enableDynamicLights: boolean;
}

interface ForgeModManagementSettings {
  autoUpdateMods: boolean;
  checkCompatibility: boolean;
  enableModRecommendations: boolean;
  autoBackupMods: boolean;
  maxBackupCount: number;
  showModDescriptions: boolean;
  sortModsBy: 'name' | 'date' | 'size' | 'status';
  defaultModsDirectory: string;
  enableModCategories: boolean;
  autoCleanDisabledMods: boolean;
  warnOnIncompatibleMods: boolean;
}

interface ForgeProfileSettings {
  defaultForgeVersion: 'latest' | 'recommended' | 'specific';
  specificForgeVersion?: string;
  autoInstallForge: boolean;
  enableForgeLogging: boolean;
  forgeLogLevel: 'debug' | 'info' | 'warn' | 'error';
  enableModLoadingProgress: boolean;
  skipForgeUpdateCheck: boolean;
  forgeInstallTimeout: number;
  enableForgeMetrics: boolean;
}

interface ForgeSettingsProps {
  onClose: () => void;
}

export const ForgeSettings: React.FC<ForgeSettingsProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'optifine' | 'modManagement' | 'profile'>('optifine');
  const [optifineSettings, setOptifineSettings] = useState<ForgeOptiFineSettings | null>(null);
  const [modManagementSettings, setModManagementSettings] = useState<ForgeModManagementSettings | null>(null);
  const [profileSettings, setProfileSettings] = useState<ForgeProfileSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [optifine, modManagement, profile] = await Promise.all([
        window.electronAPI.getOptiFineSettings(),
        window.electronAPI.getModManagementSettings(),
        window.electronAPI.getProfileSettings()
      ]);

      setOptifineSettings(optifine);
      setModManagementSettings(modManagement);
      setProfileSettings(profile);
    } catch (err) {
      console.error('Failed to load Forge settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!optifineSettings || !modManagementSettings || !profileSettings) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      await Promise.all([
        window.electronAPI.updateOptiFineSettings(optifineSettings),
        window.electronAPI.updateModManagementSettings(modManagementSettings),
        window.electronAPI.updateProfileSettings(profileSettings)
      ]);

      setSuccessMessage('Settings saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to save Forge settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const resetSettings = async () => {
    if (!confirm('Are you sure you want to reset all Forge settings to defaults?')) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      await window.electronAPI.resetAllForgeSettings();
      await loadSettings();

      setSuccessMessage('Settings reset to defaults!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to reset Forge settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to reset settings');
    } finally {
      setIsSaving(false);
    }
  };

  const updateOptiFineSettings = (updates: Partial<ForgeOptiFineSettings>) => {
    if (optifineSettings) {
      setOptifineSettings({ ...optifineSettings, ...updates });
    }
  };

  const updateModManagementSettings = (updates: Partial<ForgeModManagementSettings>) => {
    if (modManagementSettings) {
      setModManagementSettings({ ...modManagementSettings, ...updates });
    }
  };

  const updateProfileSettings = (updates: Partial<ForgeProfileSettings>) => {
    if (profileSettings) {
      setProfileSettings({ ...profileSettings, ...updates });
    }
  };

  if (isLoading) {
    return (
      <div className="forge-settings-overlay">
        <div className="forge-settings-panel">
          <div className="loading-message">Loading Forge settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="forge-settings-overlay">
      <div className="forge-settings-panel">
        <div className="forge-settings-header">
          <h3>Forge Mod Management Settings</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="success-message">
            {successMessage}
          </div>
        )}

        <div className="forge-settings-tabs">
          <button
            className={`tab-btn ${activeTab === 'optifine' ? 'active' : ''}`}
            onClick={() => setActiveTab('optifine')}
          >
            OptiFine
          </button>
          <button
            className={`tab-btn ${activeTab === 'modManagement' ? 'active' : ''}`}
            onClick={() => setActiveTab('modManagement')}
          >
            Mod Management
          </button>
          <button
            className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            Profile Settings
          </button>
        </div>

        <div className="forge-settings-content">
          {activeTab === 'optifine' && optifineSettings && (
            <OptiFineSettingsTab
              settings={optifineSettings}
              onUpdate={updateOptiFineSettings}
            />
          )}

          {activeTab === 'modManagement' && modManagementSettings && (
            <ModManagementSettingsTab
              settings={modManagementSettings}
              onUpdate={updateModManagementSettings}
            />
          )}

          {activeTab === 'profile' && profileSettings && (
            <ProfileSettingsTab
              settings={profileSettings}
              onUpdate={updateProfileSettings}
            />
          )}
        </div>

        <div className="forge-settings-actions">
          <button
            className="reset-btn"
            onClick={resetSettings}
            disabled={isSaving}
          >
            Reset to Defaults
          </button>
          <button
            className="save-btn"
            onClick={saveSettings}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

// OptiFine Settings Tab Component
interface OptiFineSettingsTabProps {
  settings: ForgeOptiFineSettings;
  onUpdate: (updates: Partial<ForgeOptiFineSettings>) => void;
}

const OptiFineSettingsTab: React.FC<OptiFineSettingsTabProps> = ({ settings, onUpdate }) => {
  return (
    <div className="settings-tab-content">
      <div className="settings-section">
        <h4>General OptiFine Settings</h4>
        
        <div className="setting-item">
          <label className="setting-label">
            <input
              type="checkbox"
              checked={settings.autoDownload}
              onChange={(e) => onUpdate({ autoDownload: e.target.checked })}
            />
            Auto-download OptiFine
          </label>
          <p className="setting-description">
            Automatically download OptiFine when creating new Forge profiles
          </p>
        </div>

        <div className="setting-item">
          <label className="setting-label">
            <input
              type="checkbox"
              checked={settings.defaultEnabled}
              onChange={(e) => onUpdate({ defaultEnabled: e.target.checked })}
            />
            Enable OptiFine by default
          </label>
          <p className="setting-description">
            Enable OptiFine by default in new Forge profiles
          </p>
        </div>

        <div className="setting-item">
          <label className="setting-label">
            Preferred OptiFine Version:
            <select
              value={settings.preferredVersion}
              onChange={(e) => onUpdate({ preferredVersion: e.target.value as 'latest' | 'recommended' | 'specific' })}
            >
              <option value="latest">Latest</option>
              <option value="recommended">Recommended</option>
              <option value="specific">Specific Version</option>
            </select>
          </label>
          {settings.preferredVersion === 'specific' && (
            <input
              type="text"
              placeholder="e.g., HD_U_I5"
              value={settings.specificVersion || ''}
              onChange={(e) => onUpdate({ specificVersion: e.target.value })}
              className="specific-version-input"
            />
          )}
        </div>
      </div>

      <div className="settings-section">
        <h4>OptiFine Features</h4>
        
        <div className="feature-grid">
          <label className="feature-item">
            <input
              type="checkbox"
              checked={settings.enableShaders}
              onChange={(e) => onUpdate({ enableShaders: e.target.checked })}
            />
            Shaders
          </label>
          
          <label className="feature-item">
            <input
              type="checkbox"
              checked={settings.enableConnectedTextures}
              onChange={(e) => onUpdate({ enableConnectedTextures: e.target.checked })}
            />
            Connected Textures
          </label>
          
          <label className="feature-item">
            <input
              type="checkbox"
              checked={settings.enableCustomSky}
              onChange={(e) => onUpdate({ enableCustomSky: e.target.checked })}
            />
            Custom Sky
          </label>
          
          <label className="feature-item">
            <input
              type="checkbox"
              checked={settings.enableNaturalTextures}
              onChange={(e) => onUpdate({ enableNaturalTextures: e.target.checked })}
            />
            Natural Textures
          </label>
          
          <label className="feature-item">
            <input
              type="checkbox"
              checked={settings.enableRandomEntities}
              onChange={(e) => onUpdate({ enableRandomEntities: e.target.checked })}
            />
            Random Entities
          </label>
          
          <label className="feature-item">
            <input
              type="checkbox"
              checked={settings.enableBetterGrass}
              onChange={(e) => onUpdate({ enableBetterGrass: e.target.checked })}
            />
            Better Grass
          </label>
          
          <label className="feature-item">
            <input
              type="checkbox"
              checked={settings.enableBetterSnow}
              onChange={(e) => onUpdate({ enableBetterSnow: e.target.checked })}
            />
            Better Snow
          </label>
          
          <label className="feature-item">
            <input
              type="checkbox"
              checked={settings.enableCustomColors}
              onChange={(e) => onUpdate({ enableCustomColors: e.target.checked })}
            />
            Custom Colors
          </label>
          
          <label className="feature-item">
            <input
              type="checkbox"
              checked={settings.enableCustomFonts}
              onChange={(e) => onUpdate({ enableCustomFonts: e.target.checked })}
            />
            Custom Fonts
          </label>
          
          <label className="feature-item">
            <input
              type="checkbox"
              checked={settings.enableCustomGUI}
              onChange={(e) => onUpdate({ enableCustomGUI: e.target.checked })}
            />
            Custom GUI
          </label>
          
          <label className="feature-item">
            <input
              type="checkbox"
              checked={settings.enableCustomItems}
              onChange={(e) => onUpdate({ enableCustomItems: e.target.checked })}
            />
            Custom Items
          </label>
          
          <label className="feature-item">
            <input
              type="checkbox"
              checked={settings.enableCustomModels}
              onChange={(e) => onUpdate({ enableCustomModels: e.target.checked })}
            />
            Custom Models
          </label>
          
          <label className="feature-item">
            <input
              type="checkbox"
              checked={settings.enableDynamicLights}
              onChange={(e) => onUpdate({ enableDynamicLights: e.target.checked })}
            />
            Dynamic Lights
          </label>
        </div>
      </div>
    </div>
  );
};

// Mod Management Settings Tab Component
interface ModManagementSettingsTabProps {
  settings: ForgeModManagementSettings;
  onUpdate: (updates: Partial<ForgeModManagementSettings>) => void;
}

const ModManagementSettingsTab: React.FC<ModManagementSettingsTabProps> = ({ settings, onUpdate }) => {
  return (
    <div className="settings-tab-content">
      <div className="settings-section">
        <h4>Mod Management</h4>
        
        <div className="setting-item">
          <label className="setting-label">
            <input
              type="checkbox"
              checked={settings.autoUpdateMods}
              onChange={(e) => onUpdate({ autoUpdateMods: e.target.checked })}
            />
            Auto-update mods
          </label>
          <p className="setting-description">
            Automatically check for and update mods when available
          </p>
        </div>

        <div className="setting-item">
          <label className="setting-label">
            <input
              type="checkbox"
              checked={settings.checkCompatibility}
              onChange={(e) => onUpdate({ checkCompatibility: e.target.checked })}
            />
            Check mod compatibility
          </label>
          <p className="setting-description">
            Verify mod compatibility before installation
          </p>
        </div>

        <div className="setting-item">
          <label className="setting-label">
            <input
              type="checkbox"
              checked={settings.enableModRecommendations}
              onChange={(e) => onUpdate({ enableModRecommendations: e.target.checked })}
            />
            Show mod recommendations
          </label>
          <p className="setting-description">
            Display recommended mods based on your current setup
          </p>
        </div>

        <div className="setting-item">
          <label className="setting-label">
            <input
              type="checkbox"
              checked={settings.autoBackupMods}
              onChange={(e) => onUpdate({ autoBackupMods: e.target.checked })}
            />
            Auto-backup mods
          </label>
          <p className="setting-description">
            Automatically backup mods before updates
          </p>
        </div>

        <div className="setting-item">
          <label className="setting-label">
            Max backup count:
            <input
              type="number"
              min="1"
              max="50"
              value={settings.maxBackupCount}
              onChange={(e) => onUpdate({ maxBackupCount: parseInt(e.target.value) || 5 })}
              className="number-input"
            />
          </label>
          <p className="setting-description">
            Maximum number of mod backups to keep (1-50)
          </p>
        </div>

        <div className="setting-item">
          <label className="setting-label">
            Sort mods by:
            <select
              value={settings.sortModsBy}
              onChange={(e) => onUpdate({ sortModsBy: e.target.value as 'name' | 'date' | 'size' | 'status' })}
            >
              <option value="name">Name</option>
              <option value="date">Date</option>
              <option value="size">Size</option>
              <option value="status">Status</option>
            </select>
          </label>
        </div>

        <div className="setting-item">
          <label className="setting-label">
            Default mods directory:
            <input
              type="text"
              value={settings.defaultModsDirectory}
              onChange={(e) => onUpdate({ defaultModsDirectory: e.target.value })}
              className="directory-input"
            />
          </label>
          <p className="setting-description">
            Default directory for storing mod files
          </p>
        </div>
      </div>

      <div className="settings-section">
        <h4>Interface Options</h4>
        
        <div className="setting-item">
          <label className="setting-label">
            <input
              type="checkbox"
              checked={settings.showModDescriptions}
              onChange={(e) => onUpdate({ showModDescriptions: e.target.checked })}
            />
            Show mod descriptions
          </label>
        </div>

        <div className="setting-item">
          <label className="setting-label">
            <input
              type="checkbox"
              checked={settings.enableModCategories}
              onChange={(e) => onUpdate({ enableModCategories: e.target.checked })}
            />
            Enable mod categories
          </label>
        </div>

        <div className="setting-item">
          <label className="setting-label">
            <input
              type="checkbox"
              checked={settings.autoCleanDisabledMods}
              onChange={(e) => onUpdate({ autoCleanDisabledMods: e.target.checked })}
            />
            Auto-clean disabled mods
          </label>
        </div>

        <div className="setting-item">
          <label className="setting-label">
            <input
              type="checkbox"
              checked={settings.warnOnIncompatibleMods}
              onChange={(e) => onUpdate({ warnOnIncompatibleMods: e.target.checked })}
            />
            Warn about incompatible mods
          </label>
        </div>
      </div>
    </div>
  );
};

// Profile Settings Tab Component
interface ProfileSettingsTabProps {
  settings: ForgeProfileSettings;
  onUpdate: (updates: Partial<ForgeProfileSettings>) => void;
}

const ProfileSettingsTab: React.FC<ProfileSettingsTabProps> = ({ settings, onUpdate }) => {
  return (
    <div className="settings-tab-content">
      <div className="settings-section">
        <h4>Forge Installation</h4>
        
        <div className="setting-item">
          <label className="setting-label">
            Default Forge version:
            <select
              value={settings.defaultForgeVersion}
              onChange={(e) => onUpdate({ defaultForgeVersion: e.target.value as 'latest' | 'recommended' | 'specific' })}
            >
              <option value="latest">Latest</option>
              <option value="recommended">Recommended</option>
              <option value="specific">Specific Version</option>
            </select>
          </label>
          {settings.defaultForgeVersion === 'specific' && (
            <input
              type="text"
              placeholder="e.g., 47.2.0"
              value={settings.specificForgeVersion || ''}
              onChange={(e) => onUpdate({ specificForgeVersion: e.target.value })}
              className="specific-version-input"
            />
          )}
        </div>

        <div className="setting-item">
          <label className="setting-label">
            <input
              type="checkbox"
              checked={settings.autoInstallForge}
              onChange={(e) => onUpdate({ autoInstallForge: e.target.checked })}
            />
            Auto-install Forge
          </label>
          <p className="setting-description">
            Automatically install Forge when creating new profiles
          </p>
        </div>

        <div className="setting-item">
          <label className="setting-label">
            <input
              type="checkbox"
              checked={settings.skipForgeUpdateCheck}
              onChange={(e) => onUpdate({ skipForgeUpdateCheck: e.target.checked })}
            />
            Skip Forge update checks
          </label>
        </div>

        <div className="setting-item">
          <label className="setting-label">
            Forge install timeout (seconds):
            <input
              type="number"
              min="30"
              max="600"
              value={Math.floor(settings.forgeInstallTimeout / 1000)}
              onChange={(e) => onUpdate({ forgeInstallTimeout: (parseInt(e.target.value) || 300) * 1000 })}
              className="number-input"
            />
          </label>
          <p className="setting-description">
            Timeout for Forge installation process (30-600 seconds)
          </p>
        </div>
      </div>

      <div className="settings-section">
        <h4>Logging and Debugging</h4>
        
        <div className="setting-item">
          <label className="setting-label">
            <input
              type="checkbox"
              checked={settings.enableForgeLogging}
              onChange={(e) => onUpdate({ enableForgeLogging: e.target.checked })}
            />
            Enable Forge logging
          </label>
        </div>

        <div className="setting-item">
          <label className="setting-label">
            Forge log level:
            <select
              value={settings.forgeLogLevel}
              onChange={(e) => onUpdate({ forgeLogLevel: e.target.value as 'debug' | 'info' | 'warn' | 'error' })}
              disabled={!settings.enableForgeLogging}
            >
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
            </select>
          </label>
        </div>

        <div className="setting-item">
          <label className="setting-label">
            <input
              type="checkbox"
              checked={settings.enableModLoadingProgress}
              onChange={(e) => onUpdate({ enableModLoadingProgress: e.target.checked })}
            />
            Show mod loading progress
          </label>
        </div>

        <div className="setting-item">
          <label className="setting-label">
            <input
              type="checkbox"
              checked={settings.enableForgeMetrics}
              onChange={(e) => onUpdate({ enableForgeMetrics: e.target.checked })}
            />
            Enable Forge metrics
          </label>
          <p className="setting-description">
            Collect performance metrics for Forge mod loading
          </p>
        </div>
      </div>
    </div>
  );
};