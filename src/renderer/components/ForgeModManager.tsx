import React, { useState, useEffect } from 'react';
import { OptiFineStatus } from './OptiFineStatus';
import './ForgeModManager.css';

interface ForgeModState {
  id?: number;
  profileId: string;
  modName: string;
  enabled: boolean;
  filePath: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ModInfo {
  name: string;
  description?: string;
  version?: string;
  mcVersion?: string;
  modLoader?: string;
  fileSize?: number;
}

interface ForgeModManagerProps {
  profileId: number;
  gameVersion: string;
  onConfirm: (modStates: Map<string, boolean>, launchGame: boolean) => void;
  onCancel: () => void;
}

export const ForgeModManager: React.FC<ForgeModManagerProps> = ({
  profileId,
  gameVersion,
  onConfirm,
  onCancel
}) => {
  const [modStates, setModStates] = useState<ForgeModState[]>([]);
  const [modInfos, setModInfos] = useState<Map<string, ModInfo>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEnabled, setFilterEnabled] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [selectAll, setSelectAll] = useState(false);

  useEffect(() => {
    loadModStates();
  }, [profileId]);

  const loadModStates = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load mod states from the Forge service
      const states = await window.electronAPI.getForgeModStates(profileId);
      setModStates(Array.isArray(states) ? states : []);

      // Load mod information for each mod
      const infos = new Map<string, ModInfo>();
      const statesArray = Array.isArray(states) ? states : [];
      for (const state of statesArray) {
        try {
          // For now, create basic mod info since the API doesn't exist yet
          infos.set(state.modName, {
            name: state.modName,
            description: state.modName.toLowerCase().includes('optifine') 
              ? 'Graphics optimization and performance enhancement mod'
              : 'Forge mod for enhanced gameplay',
            version: 'Unknown',
            mcVersion: gameVersion,
            modLoader: 'forge'
          });
        } catch (err) {
          // If we can't get mod info, create a basic one
          infos.set(state.modName, {
            name: state.modName,
            description: 'Mod information not available'
          });
        }
      }
      setModInfos(infos);

    } catch (err) {
      console.error('Failed to load mod states:', err);
      setError(err instanceof Error ? err.message : 'Failed to load mod states');
    } finally {
      setIsLoading(false);
    }
  };

  const handleModToggle = (modName: string, enabled: boolean) => {
    setModStates(prevStates =>
      Array.isArray(prevStates) ? prevStates.map(state =>
        state.modName === modName ? { ...state, enabled } : state
      ) : []
    );
  };

  const handleSelectAll = () => {
    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);
    
    setModStates(prevStates =>
      Array.isArray(prevStates) ? prevStates.map(state => ({ ...state, enabled: newSelectAll })) : []
    );
  };

  const handleApplyAndLaunch = async () => {
    try {
      setIsApplying(true);
      setError(null);

      // Create a map of mod states to pass to the parent
      const stateMap = new Map<string, boolean>();
      if (Array.isArray(modStates)) {
        modStates.forEach(state => {
          stateMap.set(state.modName, state.enabled);
        });
      }

      onConfirm(stateMap, true); // true = launch game after applying
    } catch (err) {
      console.error('Failed to apply mod states:', err);
      setError(err instanceof Error ? err.message : 'Failed to apply mod states');
    } finally {
      setIsApplying(false);
    }
  };

  const handleApplyOnly = async () => {
    try {
      setIsApplying(true);
      setError(null);

      // Create a map of mod states to pass to the parent
      const stateMap = new Map<string, boolean>();
      if (Array.isArray(modStates)) {
        modStates.forEach(state => {
          stateMap.set(state.modName, state.enabled);
        });
      }

      onConfirm(stateMap, false); // false = don't launch game
    } catch (err) {
      console.error('Failed to apply mod states:', err);
      setError(err instanceof Error ? err.message : 'Failed to apply mod states');
    } finally {
      setIsApplying(false);
    }
  };

  const getFilteredMods = () => {
    if (!Array.isArray(modStates)) {
      return [];
    }
    
    let filtered = modStates;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(state =>
        state.modName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        modInfos.get(state.modName)?.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply enabled/disabled filter
    if (filterEnabled === 'enabled') {
      filtered = filtered.filter(state => state.enabled);
    } else if (filterEnabled === 'disabled') {
      filtered = filtered.filter(state => !state.enabled);
    }

    return filtered;
  };

  const getModStatistics = () => {
    if (!Array.isArray(modStates)) {
      return { total: 0, enabled: 0, disabled: 0 };
    }
    
    const total = modStates.length;
    const enabled = modStates.filter(state => state.enabled).length;
    const disabled = total - enabled;
    
    return { total, enabled, disabled };
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const filteredMods = getFilteredMods();
  const stats = getModStatistics();

  if (isLoading) {
    return (
      <div className="forge-mod-manager-overlay">
        <div className="forge-mod-manager">
          <div className="mod-manager-header">
            <h3>Loading Forge Mods...</h3>
          </div>
          <div className="loading-section">
            <div className="loading-spinner"></div>
            <p>Loading mod information...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="forge-mod-manager-overlay">
      <div className="forge-mod-manager">
        <div className="mod-manager-header">
          <div className="header-info">
            <h3>Forge Mod Manager</h3>
            <p>Minecraft {gameVersion} • {stats.total} mods ({stats.enabled} enabled, {stats.disabled} disabled)</p>
          </div>
          <button className="close-btn" onClick={onCancel} disabled={isApplying}>×</button>
        </div>

        {error && (
          <div className="mod-manager-error">
            <p>❌ {error}</p>
            <button onClick={() => setError(null)} className="dismiss-btn">
              Dismiss
            </button>
          </div>
        )}

        <div className="mod-manager-controls">
          <div className="search-controls">
            <input
              type="text"
              placeholder="Search mods..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mod-search-input"
              disabled={isApplying}
            />
            <select
              value={filterEnabled}
              onChange={(e) => setFilterEnabled(e.target.value as 'all' | 'enabled' | 'disabled')}
              className="mod-filter-select"
              disabled={isApplying}
            >
              <option value="all">All Mods</option>
              <option value="enabled">Enabled Only</option>
              <option value="disabled">Disabled Only</option>
            </select>
          </div>
          
          <div className="bulk-controls">
            <button
              className="bulk-action-btn"
              onClick={handleSelectAll}
              disabled={isApplying || !Array.isArray(modStates) || modStates.length === 0}
            >
              {selectAll ? 'Disable All' : 'Enable All'}
            </button>
          </div>
        </div>

        {/* OptiFine Status Section */}
        <div className="optifine-section">
          <OptiFineStatus
            profileId={profileId}
            gameVersion={gameVersion}
            onConfigChange={(config) => {
              // Update mod states to reflect OptiFine status
              setModStates(prevStates =>
                Array.isArray(prevStates) ? prevStates.map(state =>
                  state.modName.toLowerCase().includes('optifine')
                    ? { ...state, enabled: config.enabled }
                    : state
                ) : []
              );
            }}
          />
        </div>

        <div className="mod-list-container">
          {filteredMods.length === 0 ? (
            <div className="no-mods">
              {!Array.isArray(modStates) || modStates.length === 0 ? (
                <div className="no-mods-message">
                  <p>No Forge mods found</p>
                  <p>Add .jar mod files to your profile's mods directory to get started.</p>
                </div>
              ) : (
                <div className="no-mods-message">
                  <p>No mods match your search criteria</p>
                  <p>Try adjusting your search term or filter settings.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="mod-list">
              {filteredMods.map(state => {
                const modInfo = modInfos.get(state.modName);
                return (
                  <div
                    key={state.modName}
                    className={`mod-item ${state.enabled ? 'enabled' : 'disabled'}`}
                  >
                    <div className="mod-toggle">
                      <label className="mod-checkbox-label">
                        <input
                          type="checkbox"
                          checked={state.enabled}
                          onChange={(e) => handleModToggle(state.modName, e.target.checked)}
                          disabled={isApplying}
                        />
                        <span className="mod-checkmark"></span>
                      </label>
                    </div>
                    
                    <div className="mod-info">
                      <div className="mod-name">
                        {modInfo?.name || state.modName}
                        {state.modName.toLowerCase().includes('optifine') && (
                          <span className="optifine-badge">OptiFine</span>
                        )}
                      </div>
                      
                      <div className="mod-description">
                        {modInfo?.description || 'No description available'}
                      </div>
                      
                      <div className="mod-details">
                        {modInfo?.version && (
                          <span className="mod-detail">v{modInfo.version}</span>
                        )}
                        {modInfo?.mcVersion && (
                          <span className="mod-detail">MC {modInfo.mcVersion}</span>
                        )}
                        {modInfo?.fileSize && (
                          <span className="mod-detail">{formatFileSize(modInfo.fileSize)}</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="mod-status">
                      <span className={`status-indicator ${state.enabled ? 'enabled' : 'disabled'}`}>
                        {state.enabled ? '✓ Enabled' : '○ Disabled'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mod-manager-footer">
          <div className="footer-info">
            <p>Changes will be applied when you launch the game or click "Apply Changes"</p>
          </div>
          
          <div className="footer-actions">
            <button
              className="cancel-btn"
              onClick={onCancel}
              disabled={isApplying}
            >
              Cancel
            </button>
            
            <button
              className="apply-btn"
              onClick={handleApplyOnly}
              disabled={isApplying || !Array.isArray(modStates) || modStates.length === 0}
            >
              {isApplying ? 'Applying...' : 'Apply Changes'}
            </button>
            
            <button
              className="launch-btn"
              onClick={handleApplyAndLaunch}
              disabled={isApplying || !Array.isArray(modStates) || modStates.length === 0}
            >
              {isApplying ? 'Launching...' : 'Apply & Launch Game'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};