import React, { useState, useEffect } from 'react';
import './ModToggleDialog.css';

interface ModToggleDialogProps {
  profileId: number;
  gameVersion: string;
  onConfirm: (modStates: Map<string, boolean>, dontAskAgain: boolean) => void;
  onCancel: () => void;
}

interface ModToggleState {
  modId: string;
  name: string;
  description: string;
  enabled: boolean;
  required: boolean;
  isEssential: boolean;
  source?: 'modrinth' | 'curseforge';
  dependencies?: string[];
}

interface DependencyWarning {
  modId: string;
  modName: string;
  dependentMods: string[];
}

export const ModToggleDialog: React.FC<ModToggleDialogProps> = ({
  profileId,
  gameVersion,
  onConfirm,
  onCancel
}) => {
  const [modStates, setModStates] = useState<ModToggleState[]>([]);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModDialog, setShowAddModDialog] = useState(false);
  const [dependencyWarnings, setDependencyWarnings] = useState<DependencyWarning[]>([]);

  useEffect(() => {
    loadModStates();
  }, [profileId]);

  const loadModStates = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get all mods for the profile
      const allMods = await window.electronAPI.getAllMods(profileId);
      
      // Get current mod states (comes as object from IPC, convert to Map)
      const statesObj = await window.electronAPI.getModStates(profileId);
      const states = new Map(Object.entries(statesObj));

      // Transform to ModToggleState format
      const modToggleStates: ModToggleState[] = allMods.map((mod: any) => ({
        modId: mod.id,
        name: mod.name,
        description: mod.description || '',
        enabled: states.get(mod.id) ?? true,
        required: mod.id === 'fabric-api', // Fabric API is required
        isEssential: mod.isEssential || false,
        source: mod.source,
        dependencies: mod.dependencies || []
      }));

      setModStates(modToggleStates);
      
      // Check for dependency warnings
      checkDependencyWarnings(modToggleStates);
    } catch (err) {
      console.error('Failed to load mod states:', err);
      setError(err instanceof Error ? err.message : 'Failed to load mods');
    } finally {
      setIsLoading(false);
    }
  };

  const checkDependencyWarnings = (mods: ModToggleState[]) => {
    const warnings: DependencyWarning[] = [];
    
    // Check each disabled mod for enabled dependents
    mods.forEach(mod => {
      if (!mod.enabled && mod.isEssential) {
        // Find mods that depend on this one
        const dependents = mods.filter(m => 
          m.enabled && m.dependencies?.includes(mod.modId)
        );
        
        if (dependents.length > 0) {
          warnings.push({
            modId: mod.modId,
            modName: mod.name,
            dependentMods: dependents.map(d => d.name)
          });
        }
      }
    });
    
    setDependencyWarnings(warnings);
  };

  const handleToggle = (modId: string) => {
    const updatedStates = modStates.map(mod =>
      mod.modId === modId && !mod.required
        ? { ...mod, enabled: !mod.enabled }
        : mod
    );
    
    setModStates(updatedStates);
    
    // Check for new dependency warnings
    checkDependencyWarnings(updatedStates);
  };

  const handleRemoveCustomMod = async (modId: string, modName: string) => {
    if (!confirm(`Remove "${modName}" from your profile?`)) {
      return;
    }

    try {
      await window.electronAPI.removeCustomMod(profileId, modId);
      await loadModStates();
    } catch (err) {
      console.error('Failed to remove mod:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove mod');
    }
  };

  const handleConfirm = async () => {
    try {
      // Save mod states
      const statesMap = new Map(modStates.map(m => [m.modId, m.enabled]));
      
      // Save each mod state
      for (const mod of modStates) {
        await window.electronAPI.setModState(profileId, mod.modId, mod.enabled);
      }

      // Save "don't ask again" preference if checked
      if (dontAskAgain) {
        await window.electronAPI.setProfilePreference(
          profileId,
          'skipModDialog',
          true
        );
      }

      onConfirm(statesMap, dontAskAgain);
    } catch (err) {
      console.error('Failed to save mod states:', err);
      setError(err instanceof Error ? err.message : 'Failed to save mod settings');
    }
  };

  const essentialMods = modStates.filter(m => m.isEssential);
  const customMods = modStates.filter(m => !m.isEssential);

  if (isLoading) {
    return (
      <div className="mod-toggle-dialog-overlay">
        <div className="mod-toggle-dialog">
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading mods...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mod-toggle-dialog-overlay">
      <div className="mod-toggle-dialog">
        <div className="dialog-header">
          <h2>Select Mods to Enable</h2>
          <p className="dialog-subtitle">Choose which mods to load for this game session</p>
        </div>

        {error && (
          <div className="dialog-error">
            <span className="error-icon">⚠️</span>
            <p>{error}</p>
          </div>
        )}

        {dependencyWarnings.length > 0 && (
          <div className="dialog-warning">
            <span className="warning-icon">⚠️</span>
            <div className="warning-content">
              <strong>Dependency Warning</strong>
              {dependencyWarnings.map(warning => (
                <p key={warning.modId}>
                  <strong>{warning.modName}</strong> is disabled but required by: {warning.dependentMods.join(', ')}
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="mod-sections">
          {/* Essential Mods Section */}
          <div className="essential-mods-section">
            <h3>Essential Mods (Preinstalled)</h3>
            <div className="mod-list">
              {essentialMods.map(mod => (
                <div key={mod.modId} className="mod-item">
                  <input
                    type="checkbox"
                    id={`mod-${mod.modId}`}
                    checked={mod.enabled}
                    disabled={mod.required}
                    onChange={() => handleToggle(mod.modId)}
                    className="mod-checkbox"
                  />
                  <label htmlFor={`mod-${mod.modId}`} className="mod-info">
                    <div className="mod-name">
                      <strong>{mod.name}</strong>
                      {mod.required && <span className="required-badge">Required</span>}
                    </div>
                    <p className="mod-description">{mod.description}</p>
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Mods Section */}
          <div className="custom-mods-section">
            <div className="section-header">
              <h3>
                Custom Mods 
                {customMods.length > 0 && (
                  <span className="mod-count">({customMods.length})</span>
                )}
              </h3>
              <button 
                className="add-mod-btn"
                onClick={() => setShowAddModDialog(true)}
                type="button"
                title="Add a custom mod from Modrinth or CurseForge"
              >
                + Add Mod
              </button>
            </div>
            <div className="mod-list">
              {customMods.length === 0 ? (
                <div className="no-custom-mods">
                  <div className="empty-state-icon">📦</div>
                  <p>No custom mods added yet</p>
                  <p className="empty-state-hint">
                    Click "Add Mod" to install mods from Modrinth or CurseForge
                  </p>
                </div>
              ) : (
                customMods.map(mod => (
                  <div key={mod.modId} className="mod-item custom">
                    <input
                      type="checkbox"
                      id={`mod-${mod.modId}`}
                      checked={mod.enabled}
                      onChange={() => handleToggle(mod.modId)}
                      className="mod-checkbox"
                    />
                    <label htmlFor={`mod-${mod.modId}`} className="mod-info">
                      <div className="mod-name">
                        <strong>{mod.name}</strong>
                        {mod.source && (
                          <span className={`source-badge ${mod.source}`}>
                            {mod.source === 'modrinth' ? 'Modrinth' : 'CurseForge'}
                          </span>
                        )}
                      </div>
                      <p className="mod-description">
                        {mod.description || 'Custom mod - no description available'}
                      </p>
                    </label>
                    <div className="mod-actions">
                      <button
                        className="remove-mod-btn"
                        onClick={() => handleRemoveCustomMod(mod.modId, mod.name)}
                        title={`Remove ${mod.name}`}
                        type="button"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="dialog-options">
          <label className="dont-ask-checkbox">
            <input
              type="checkbox"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
            />
            <span>Don't ask again (use current settings)</span>
          </label>
        </div>

        <div className="dialog-actions">
          <button onClick={onCancel} className="btn-cancel" type="button">
            Cancel
          </button>
          <button onClick={handleConfirm} className="btn-primary" type="button">
            Launch with Selected Mods
          </button>
        </div>
      </div>

      {showAddModDialog && (
        <AddModDialog
          profileId={profileId}
          gameVersion={gameVersion}
          onClose={() => setShowAddModDialog(false)}
          onModAdded={() => {
            setShowAddModDialog(false);
            loadModStates();
          }}
        />
      )}
    </div>
  );
};

// AddModDialog component - Enhanced implementation for subtask 5.2
interface AddModDialogProps {
  profileId: number;
  gameVersion: string;
  onClose: () => void;
  onModAdded: () => void;
}

const AddModDialog: React.FC<AddModDialogProps> = ({
  profileId,
  gameVersion,
  onClose,
  onModAdded
}) => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [validationError, setValidationError] = useState<string | null>(null);

  // URL validation function
  const validateUrl = (inputUrl: string): string | null => {
    if (!inputUrl.trim()) {
      return 'Please enter a URL';
    }

    const trimmedUrl = inputUrl.trim();
    
    // Check for Modrinth URLs
    const modrinthPatterns = [
      /^https?:\/\/(www\.)?modrinth\.com\/mod\/[^\/\s]+/,
      /^https?:\/\/(www\.)?modrinth\.com\/project\/[^\/\s]+/
    ];
    
    // Check for CurseForge URLs
    const curseforgePatterns = [
      /^https?:\/\/(www\.)?curseforge\.com\/minecraft\/mc-mods\/[^\/\s]+/
    ];

    const isModrinth = modrinthPatterns.some(pattern => pattern.test(trimmedUrl));
    const isCurseForge = curseforgePatterns.some(pattern => pattern.test(trimmedUrl));

    if (!isModrinth && !isCurseForge) {
      return 'Please enter a valid Modrinth or CurseForge mod URL';
    }

    return null;
  };

  // Handle URL input change with real-time validation
  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    setError(null);
    
    if (newUrl.trim()) {
      const validation = validateUrl(newUrl);
      setValidationError(validation);
    } else {
      setValidationError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = validateUrl(url);
    if (validation) {
      setValidationError(validation);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setValidationError(null);
      setProgress(0);

      await window.electronAPI.addCustomMod(
        profileId,
        url.trim()
      );

      onModAdded();
    } catch (err) {
      console.error('Failed to add mod:', err);
      let errorMessage = 'Failed to add mod';
      
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      
      // Provide more specific error messages
      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        errorMessage = 'Mod not found. Please check the URL and try again.';
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      } else if (errorMessage.includes('version') || errorMessage.includes('compatibility')) {
        errorMessage = `No compatible version found for Minecraft ${gameVersion}. This mod may not support your game version.`;
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Get URL placeholder based on detected pattern
  const getUrlPlaceholder = () => {
    return 'https://modrinth.com/mod/sodium or https://www.curseforge.com/minecraft/mc-mods/jei';
  };

  // Get URL format help text
  const getUrlHelpText = () => {
    if (url.trim()) {
      if (url.includes('modrinth.com')) {
        return 'Modrinth URL detected - supports direct mod and project links';
      } else if (url.includes('curseforge.com')) {
        return 'CurseForge URL detected - supports mod page links';
      }
    }
    return 'Paste a link to a mod page on Modrinth or CurseForge';
  };

  return (
    <div className="add-mod-dialog-overlay">
      <div className="add-mod-dialog">
        <div className="dialog-header">
          <h3>Add Custom Mod</h3>
          <button className="close-btn" onClick={onClose} type="button" disabled={isLoading}>
            ×
          </button>
        </div>

        {error && (
          <div className="dialog-error">
            <span className="error-icon">❌</span>
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="mod-url">Mod URL</label>
            <input
              id="mod-url"
              type="text"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder={getUrlPlaceholder()}
              disabled={isLoading}
              className={`url-input ${validationError ? 'error' : ''}`}
            />
            {validationError && (
              <p className="validation-error">{validationError}</p>
            )}
            <p className="form-hint">
              {getUrlHelpText()}
            </p>
          </div>

          {isLoading && (
            <div className="download-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p>
                {progress === 0 
                  ? 'Validating mod...' 
                  : `Downloading mod... ${progress}%`
                }
              </p>
            </div>
          )}

          <div className="dialog-actions">
            <button 
              type="button" 
              onClick={onClose}
              disabled={isLoading}
              className="btn-cancel"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary"
              disabled={isLoading || !!validationError}
            >
              {isLoading ? 'Adding...' : 'Add Mod'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
