import React, { useState, useEffect } from 'react';
import './ForgeProfileCreator.css';

interface ForgeVersion {
  version: string;
  gameVersion: string;
  stable: boolean;
  recommended: boolean;
}

interface ForgeProfileCreatorProps {
  onClose: () => void;
  onSave: (profileData: any) => void;
}

interface ForgeInstallProgress {
  stage: string;
  percentage: number;
  message?: string;
}

export const ForgeProfileCreator: React.FC<ForgeProfileCreatorProps> = ({ onClose, onSave }) => {
  const [name, setName] = useState('');
  const [gameVersion, setGameVersion] = useState('1.20.1');
  const [forgeVersion, setForgeVersion] = useState('');
  const [installationDir, setInstallationDir] = useState('');
  const [memoryMin, setMemoryMin] = useState(3072); // 3GB default for Forge
  const [memoryMax, setMemoryMax] = useState(6144); // 6GB default for Forge
  const [jvmArgs, setJvmArgs] = useState('');
  const [enableOptiFine, setEnableOptiFine] = useState(true);
  
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  const [availableForgeVersions, setAvailableForgeVersions] = useState<ForgeVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isLoadingForgeVersions, setIsLoadingForgeVersions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<ForgeInstallProgress | null>(null);

  useEffect(() => {
    loadAvailableVersions();
  }, []);

  useEffect(() => {
    if (gameVersion) {
      loadForgeVersions(gameVersion);
    }
  }, [gameVersion]);

  const loadAvailableVersions = async () => {
    try {
      setIsLoadingVersions(true);
      const versions = await window.electronAPI.getReleaseVersions();
      setAvailableVersions(versions.map((v: any) => v.id));
    } catch (err) {
      console.error('Failed to load Minecraft versions:', err);
      setError('Failed to load Minecraft versions');
    } finally {
      setIsLoadingVersions(false);
    }
  };

  const loadForgeVersions = async (mcVersion: string) => {
    try {
      setIsLoadingForgeVersions(true);
      setError(null);
      
      // Get appropriate Forge versions for the selected Minecraft version
      const forgeVersions = getForgeVersionsForMinecraft(mcVersion);
      setAvailableForgeVersions(forgeVersions);
      
      // Auto-select recommended version if available
      const recommended = forgeVersions.find((v: ForgeVersion) => v.recommended);
      const stable = forgeVersions.find((v: ForgeVersion) => v.stable);
      const selected = recommended || stable || forgeVersions[0];
      
      if (selected) {
        setForgeVersion(selected.version);
      }
    } catch (err) {
      console.error('Failed to load Forge versions:', err);
      setError(`No Forge versions available for Minecraft ${mcVersion}`);
      setAvailableForgeVersions([]);
      setForgeVersion('');
    } finally {
      setIsLoadingForgeVersions(false);
    }
  };

  // Helper function to get appropriate Forge versions for different Minecraft versions
  const getForgeVersionsForMinecraft = (mcVersion: string): ForgeVersion[] => {
    const versionMappings: Record<string, ForgeVersion[]> = {
      '1.20.1': [
        { version: '47.2.0', gameVersion: mcVersion, stable: true, recommended: true },
        { version: '47.1.0', gameVersion: mcVersion, stable: true, recommended: false },
        { version: '47.0.35', gameVersion: mcVersion, stable: false, recommended: false }
      ],
      '1.19.4': [
        { version: '45.1.0', gameVersion: mcVersion, stable: true, recommended: true },
        { version: '45.0.66', gameVersion: mcVersion, stable: true, recommended: false }
      ],
      '1.18.2': [
        { version: '40.2.0', gameVersion: mcVersion, stable: true, recommended: true },
        { version: '40.1.80', gameVersion: mcVersion, stable: true, recommended: false }
      ],
      '1.16.5': [
        { version: '36.2.39', gameVersion: mcVersion, stable: true, recommended: true },
        { version: '36.2.35', gameVersion: mcVersion, stable: true, recommended: false }
      ],
      '1.12.2': [
        { version: '14.23.5.2859', gameVersion: mcVersion, stable: true, recommended: true },
        { version: '14.23.5.2855', gameVersion: mcVersion, stable: true, recommended: false },
        { version: '14.23.5.2847', gameVersion: mcVersion, stable: false, recommended: false }
      ],
      '1.8.9': [
        { version: '11.15.1.2318', gameVersion: mcVersion, stable: true, recommended: true },
        { version: '11.15.1.2308', gameVersion: mcVersion, stable: true, recommended: false }
      ]
    };

    return versionMappings[mcVersion] || [
      { version: '47.2.0', gameVersion: mcVersion, stable: true, recommended: true }
    ];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Profile name is required');
      return;
    }

    if (!gameVersion.trim()) {
      setError('Minecraft version is required');
      return;
    }

    if (!forgeVersion.trim()) {
      setError('Forge version is required');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setInstallProgress({ stage: 'Initializing', percentage: 0 });

      const profileData = {
        name: name.trim(),
        versionId: gameVersion.trim(),
        installationDir: installationDir.trim() || undefined,
        memoryMin,
        memoryMax,
        jvmArgs: jvmArgs.trim() || undefined,
        modLoader: {
          type: 'forge' as const,
          version: forgeVersion.trim()
        }
      };

      // Create the Forge profile with progress tracking
      console.log('Creating Forge profile with data:', profileData);
      
      // Listen for progress events
      const handleProgress = (progress: any) => {
        setInstallProgress(progress);
      };
      
      window.electronAPI.onModInstallProgress(handleProgress);
      
      try {
        // Call the actual API to create the Forge profile
        const result = await window.electronAPI.createForgeProfile(profileData, enableOptiFine);
        
        setInstallProgress({ stage: 'Complete', percentage: 100, message: 'Profile created successfully!' });
        
        // Wait a moment to show completion, then close
        setTimeout(() => {
          window.electronAPI.removeModInstallProgressListener();
          onSave(result);
          onClose();
        }, 1000);
        
      } catch (error) {
        console.error('Failed to create Forge profile:', error);
        setError(error instanceof Error ? error.message : 'Failed to create profile');
        setInstallProgress(null);
        window.electronAPI.removeModInstallProgressListener();
      }

    } catch (err) {
      console.error('Failed to create Forge profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to create Forge profile');
      setInstallProgress(null);
    } finally {
      setIsSaving(false);
    }
  };

  const getForgeCompatibilityIndicator = (version: ForgeVersion) => {
    if (version.recommended) {
      return <span className="compatibility-indicator recommended">✓ Recommended</span>;
    }
    if (version.stable) {
      return <span className="compatibility-indicator stable">✓ Stable</span>;
    }
    return <span className="compatibility-indicator experimental">⚠ Experimental</span>;
  };

  const memoryPresets = [
    { name: 'Low (3GB)', min: 2048, max: 3072 },
    { name: 'Medium (6GB)', min: 3072, max: 6144 },
    { name: 'High (8GB)', min: 4096, max: 8192 },
    { name: 'Ultra (12GB)', min: 6144, max: 12288 },
  ];

  return (
    <div className="profile-form-overlay">
      <div className="profile-form forge-profile-form">
        <div className="profile-form-header">
          <h3>Create Forge Profile</h3>
          <button className="close-btn" onClick={onClose} disabled={isSaving}>×</button>
        </div>

        <div className="forge-info">
          <p>🔥 This will create a Forge profile with mod loader support:</p>
          <ul>
            <li>Automatic Forge installation for selected Minecraft version</li>
            <li>OptiFine integration for enhanced graphics (optional)</li>
            <li>Optimized JVM arguments for modded gameplay</li>
            <li>Mod management interface for enabling/disabling mods</li>
          </ul>
          <p>You can add additional Forge mods to the mods folder after creation.</p>
        </div>

        {error && (
          <div className="form-error">
            <p>❌ {error}</p>
          </div>
        )}

        {installProgress && (
          <div className="forge-install-progress">
            <div className="progress-header">
              <h4>Creating Forge Profile</h4>
              <p>{installProgress.message || installProgress.stage}</p>
            </div>
            <div className="progress-details">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${installProgress.percentage}%` }}
                />
              </div>
              <p>{installProgress.percentage}% - {installProgress.stage}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Profile Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Forge Profile"
              required
              disabled={isSaving}
            />
          </div>

          <div className="form-group">
            <label>Minecraft Version *</label>
            <select
              value={gameVersion}
              onChange={(e) => setGameVersion(e.target.value)}
              required
              disabled={isSaving || isLoadingVersions}
            >
              {isLoadingVersions ? (
                <option>Loading versions...</option>
              ) : (
                availableVersions.map(version => (
                  <option key={version} value={version}>{version}</option>
                ))
              )}
            </select>
            <p className="form-hint">
              Select the Minecraft version you want to mod
            </p>
          </div>

          <div className="form-group">
            <label>Forge Version *</label>
            <select
              value={forgeVersion}
              onChange={(e) => setForgeVersion(e.target.value)}
              required
              disabled={isSaving || isLoadingForgeVersions || availableForgeVersions.length === 0}
            >
              {isLoadingForgeVersions ? (
                <option>Loading Forge versions...</option>
              ) : availableForgeVersions.length === 0 ? (
                <option>No Forge versions available</option>
              ) : (
                availableForgeVersions.map(version => (
                  <option key={version.version} value={version.version}>
                    {version.version}
                  </option>
                ))
              )}
            </select>
            {forgeVersion && availableForgeVersions.length > 0 && (
              <div className="forge-version-info">
                {getForgeCompatibilityIndicator(
                  availableForgeVersions.find(v => v.version === forgeVersion)!
                )}
              </div>
            )}
            <p className="form-hint">
              Recommended versions are tested and stable
            </p>
          </div>

          <div className="form-group">
            <label>Installation Directory</label>
            <input
              type="text"
              value={installationDir}
              onChange={(e) => setInstallationDir(e.target.value)}
              placeholder="Leave empty for default"
              disabled={isSaving}
            />
            <p className="form-hint">
              Custom directory for this profile's game files
            </p>
          </div>

          <div className="form-group">
            <label>Memory Allocation (MB)</label>
            <div className="memory-presets">
              {memoryPresets.map(preset => (
                <button
                  key={preset.name}
                  type="button"
                  className="preset-btn"
                  onClick={() => {
                    setMemoryMin(preset.min);
                    setMemoryMax(preset.max);
                  }}
                  disabled={isSaving}
                >
                  {preset.name}
                </button>
              ))}
            </div>
            <div className="memory-inputs">
              <div className="input-group">
                <label>Min</label>
                <input
                  type="number"
                  value={memoryMin}
                  onChange={(e) => setMemoryMin(Number(e.target.value))}
                  min="1024"
                  step="512"
                  disabled={isSaving}
                />
              </div>
              <div className="input-group">
                <label>Max</label>
                <input
                  type="number"
                  value={memoryMax}
                  onChange={(e) => setMemoryMax(Number(e.target.value))}
                  min="2048"
                  step="512"
                  disabled={isSaving}
                />
              </div>
            </div>
            <p className="form-hint">
              Forge mods require more memory than vanilla Minecraft
            </p>
          </div>

          <div className="form-group">
            <label>JVM Arguments</label>
            <textarea
              value={jvmArgs}
              onChange={(e) => setJvmArgs(e.target.value)}
              placeholder="Leave empty for optimized defaults"
              rows={2}
              disabled={isSaving}
            />
            <p className="form-hint">
              Advanced: Custom JVM arguments (defaults are optimized for Forge)
            </p>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={enableOptiFine}
                onChange={(e) => setEnableOptiFine(e.target.checked)}
                disabled={isSaving}
              />
              <span className="checkmark"></span>
              Install OptiFine (Recommended)
            </label>
            <p className="form-hint">
              OptiFine provides graphics optimizations and performance improvements
            </p>
          </div>

          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={isSaving || !forgeVersion}>
              {isSaving ? 'Creating Profile...' : 'Create Forge Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};