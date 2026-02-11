import React, { useEffect, useState } from 'react';
import { ForgeProfileCreator } from './ForgeProfileCreator';

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
  createdAt: string;
  lastUsed?: string;
}

interface ProfileManagerProps {
  onProfileSelect?: (profile: UserProfile) => void;
}

interface ModDownloadProgress {
  modId: string;
  modName: string;
  downloaded: number;
  total: number;
  percentage: number;
}

export const ProfileManager: React.FC<ProfileManagerProps> = ({ onProfileSelect }) => {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState<UserProfile | null>(null);
  const [showFabricForm, setShowFabricForm] = useState(false);
  const [showForgeForm, setShowForgeForm] = useState(false);
  const [fabricInstallProgress, setFabricInstallProgress] = useState<ModDownloadProgress | null>(null);
  const [modCounts, setModCounts] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    loadProfiles();
  }, []);

  useEffect(() => {
    // Load mod counts for Fabric profiles
    loadModCounts();
  }, [profiles]);

  const loadProfiles = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const fetchedProfiles = await window.electronAPI.getProfiles();
      setProfiles(fetchedProfiles);
      
      // Select first profile by default
      if (fetchedProfiles.length > 0 && !selectedProfile) {
        setSelectedProfile(fetchedProfiles[0]);
        onProfileSelect?.(fetchedProfiles[0]);
      }
    } catch (err) {
      console.error('Failed to load profiles:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profiles');
    } finally {
      setIsLoading(false);
    }
  };

  const loadModCounts = async () => {
    const counts = new Map<number, number>();
    
    for (const profile of profiles) {
      if (profile.modLoader?.type === 'fabric') {
        try {
          const mods = await window.electronAPI.getAllMods(profile.id);
          counts.set(profile.id, mods.length);
        } catch (err) {
          console.error(`Failed to load mod count for profile ${profile.id}:`, err);
          counts.set(profile.id, 0);
        }
      }
    }
    
    setModCounts(counts);
  };

  const handleProfileSelect = (profile: UserProfile) => {
    setSelectedProfile(profile);
    onProfileSelect?.(profile);
  };

  const handleDeleteProfile = async (profileId: number) => {
    if (!confirm('Are you sure you want to delete this profile?')) {
      return;
    }

    try {
      await window.electronAPI.deleteProfile(profileId);
      await loadProfiles();
      
      if (selectedProfile?.id === profileId) {
        setSelectedProfile(null);
      }
    } catch (err) {
      console.error('Failed to delete profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete profile');
    }
  };

  const handleEditProfile = (profile: UserProfile) => {
    setEditingProfile(profile);
    setShowEditForm(true);
  };

  const handleDuplicateProfile = async (profile: UserProfile) => {
    try {
      const newProfile = {
        name: `${profile.name} (Copy)`,
        versionId: profile.versionId,
        installationDir: profile.installationDir,
        memoryMin: profile.memoryMin,
        memoryMax: profile.memoryMax,
        jvmArgs: profile.jvmArgs,
        modLoader: profile.modLoader,
      };
      
      await window.electronAPI.createProfile(newProfile);
      await loadProfiles();
    } catch (err) {
      console.error('Failed to duplicate profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to duplicate profile');
    }
  };

  const handleCreateFabricProfile = async (profileData: any) => {
    try {
      setFabricInstallProgress(null);
      
      const onProgress = (progress: ModDownloadProgress) => {
        setFabricInstallProgress(progress);
      };

      await window.electronAPI.createFabricProfile(profileData);
      setFabricInstallProgress(null);
      setShowFabricForm(false);
      await loadProfiles();
    } catch (err) {
      console.error('Failed to create Fabric profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to create Fabric profile');
      setFabricInstallProgress(null);
    }
  };

  const handleManageMods = (profile: UserProfile) => {
    // This will be implemented when the ModToggleDialog is integrated
    console.log('Manage mods for profile:', profile.name);
    // For now, just show an alert
    alert(`Mod management for ${profile.name} will be available when launching the game.`);
  };

  const handleCreateForgeProfile = async (profileData: any) => {
    try {
      setFabricInstallProgress(null);
      
      const onProgress = (progress: ModDownloadProgress) => {
        setFabricInstallProgress(progress);
      };

      // For now, simulate the Forge profile creation
      console.log('Creating Forge profile with data:', profileData);
      
      // Simulate progress updates
      const progressSteps = [
        { modId: 'forge', modName: 'Forge', downloaded: 0, total: 100, percentage: 10 },
        { modId: 'forge', modName: 'Forge', downloaded: 30, total: 100, percentage: 30 },
        { modId: 'optifine', modName: 'OptiFine', downloaded: 60, total: 100, percentage: 60 },
        { modId: 'optifine', modName: 'OptiFine', downloaded: 80, total: 100, percentage: 80 },
        { modId: 'complete', modName: 'Complete', downloaded: 100, total: 100, percentage: 100 }
      ];

      for (const step of progressSteps) {
        onProgress(step);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      setFabricInstallProgress(null);
      setShowForgeForm(false);
      await loadProfiles();
    } catch (err) {
      console.error('Failed to create Forge profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to create Forge profile');
      setFabricInstallProgress(null);
    }
  };

  return (
    <div className="profile-manager">
      <div className="profile-manager-header">
        <h3>Profiles</h3>
        <div className="profile-create-buttons">
          <button
            className="create-profile-btn"
            onClick={() => setShowCreateForm(true)}
          >
            + New Profile
          </button>
          <button
            className="create-fabric-profile-btn"
            onClick={() => setShowFabricForm(true)}
          >
            + Create Fabric Profile
          </button>
          <button
            className="create-forge-profile-btn"
            onClick={() => setShowForgeForm(true)}
          >
            + Create Forge Profile
          </button>
        </div>
      </div>

      {error && (
        <div className="profile-error">
          <p>❌ {error}</p>
          <button onClick={() => setError(null)} className="dismiss-btn">
            Dismiss
          </button>
        </div>
      )}

      {fabricInstallProgress && (
        <div className="fabric-install-progress">
          <div className="progress-header">
            <h4>Installing Essential Mods</h4>
            <p>Setting up your Fabric profile with essential mods...</p>
          </div>
          <div className="progress-details">
            <p>Downloading: {fabricInstallProgress.modName}</p>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${fabricInstallProgress.percentage}%` }}
              />
            </div>
            <p>{fabricInstallProgress.percentage}% ({fabricInstallProgress.downloaded} / {fabricInstallProgress.total} bytes)</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="profile-loading">
          <div className="loading-spinner"></div>
          <p>Loading profiles...</p>
        </div>
      ) : (
        <>
          <div className="profile-list">
            {profiles.length === 0 ? (
              <div className="no-profiles">
                <p>No profiles found. Create one to get started!</p>
              </div>
            ) : (
              profiles.map(profile => (
                <div
                  key={profile.id}
                  className={`profile-item ${selectedProfile?.id === profile.id ? 'selected' : ''}`}
                  onClick={() => handleProfileSelect(profile)}
                >
                  <div className="profile-info">
                    <div className="profile-name">
                      {profile.name}
                      {profile.modLoader && (
                        <span className={`mod-loader-badge ${profile.modLoader.type}`}>
                          {profile.modLoader.type}
                        </span>
                      )}
                      {profile.modLoader?.type === 'fabric' && modCounts.has(profile.id) && (
                        <span className="mod-count-badge">
                          {modCounts.get(profile.id)} mods
                        </span>
                      )}
                    </div>
                    <div className="profile-details">
                      <span>Version: {profile.versionId}</span>
                      <span>Memory: {profile.memoryMin}MB - {profile.memoryMax}MB</span>
                    </div>
                  </div>
                  <div className="profile-actions">
                    {profile.modLoader?.type === 'fabric' && (
                      <button
                        className="profile-action-btn manage-mods"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleManageMods(profile);
                        }}
                        title="Manage Mods"
                      >
                        🔧
                      </button>
                    )}
                    <button
                      className="profile-action-btn edit"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditProfile(profile);
                      }}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="profile-action-btn duplicate"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicateProfile(profile);
                      }}
                      title="Duplicate"
                    >
                      📋
                    </button>
                    <button
                      className="profile-action-btn delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProfile(profile.id);
                      }}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {selectedProfile && (
            <ProfileConfiguration
              profile={selectedProfile}
              onUpdate={loadProfiles}
            />
          )}
        </>
      )}

      {showCreateForm && (
        <ProfileForm
          onClose={() => setShowCreateForm(false)}
          onSave={loadProfiles}
        />
      )}

      {showEditForm && editingProfile && (
        <ProfileForm
          profile={editingProfile}
          onClose={() => {
            setShowEditForm(false);
            setEditingProfile(null);
          }}
          onSave={loadProfiles}
        />
      )}

      {showFabricForm && (
        <FabricProfileForm
          onClose={() => setShowFabricForm(false)}
          onSave={handleCreateFabricProfile}
        />
      )}

      {showForgeForm && (
        <ForgeProfileCreator
          onClose={() => setShowForgeForm(false)}
          onSave={handleCreateForgeProfile}
        />
      )}
    </div>
  );
};

interface ProfileConfigurationProps {
  profile: UserProfile;
  onUpdate: () => void;
}

const ProfileConfiguration: React.FC<ProfileConfigurationProps> = ({ profile, onUpdate }) => {
  const [memoryMin, setMemoryMin] = useState(profile.memoryMin);
  const [memoryMax, setMemoryMax] = useState(profile.memoryMax);
  const [jvmArgs, setJvmArgs] = useState(profile.jvmArgs);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await window.electronAPI.updateProfile(profile.id, {
        ...profile,
        memoryMin,
        memoryMax,
        jvmArgs,
      });
      await onUpdate();
    } catch (err) {
      console.error('Failed to update profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const presets = [
    { name: 'Low (2GB)', min: 1024, max: 2048 },
    { name: 'Medium (4GB)', min: 2048, max: 4096 },
    { name: 'High (8GB)', min: 4096, max: 8192 },
    { name: 'Ultra (16GB)', min: 8192, max: 16384 },
  ];

  return (
    <div className="profile-configuration">
      <h4>Configuration</h4>
      
      <div className="config-section">
        <label>Memory Allocation</label>
        <div className="memory-presets">
          {presets.map(preset => (
            <button
              key={preset.name}
              className="preset-btn"
              onClick={() => {
                setMemoryMin(preset.min);
                setMemoryMax(preset.max);
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
        <div className="memory-inputs">
          <div className="input-group">
            <label>Minimum (MB)</label>
            <input
              type="number"
              value={memoryMin}
              onChange={(e) => setMemoryMin(Number(e.target.value))}
              min="512"
              step="512"
            />
          </div>
          <div className="input-group">
            <label>Maximum (MB)</label>
            <input
              type="number"
              value={memoryMax}
              onChange={(e) => setMemoryMax(Number(e.target.value))}
              min="1024"
              step="512"
            />
          </div>
        </div>
      </div>

      <div className="config-section">
        <label>JVM Arguments</label>
        <textarea
          value={jvmArgs}
          onChange={(e) => setJvmArgs(e.target.value)}
          placeholder="-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions"
          rows={3}
        />
        <p className="config-hint">
          Advanced: Custom JVM arguments for performance tuning
        </p>
      </div>

      <button
        className="save-config-btn"
        onClick={handleSave}
        disabled={isSaving}
      >
        {isSaving ? 'Saving...' : 'Save Configuration'}
      </button>
    </div>
  );
};

interface ProfileFormProps {
  profile?: UserProfile;
  onClose: () => void;
  onSave: () => void;
}

const ProfileForm: React.FC<ProfileFormProps> = ({ profile, onClose, onSave }) => {
  const [name, setName] = useState(profile?.name || '');
  const [versionId, setVersionId] = useState(profile?.versionId || '');
  const [installationDir, setInstallationDir] = useState(profile?.installationDir || '');
  const [memoryMin, setMemoryMin] = useState(profile?.memoryMin || 2048);
  const [memoryMax, setMemoryMax] = useState(profile?.memoryMax || 4096);
  const [jvmArgs, setJvmArgs] = useState(profile?.jvmArgs || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Profile name is required');
      return;
    }

    if (!versionId.trim()) {
      setError('Version is required');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      const profileData = {
        name: name.trim(),
        versionId: versionId.trim(),
        installationDir: installationDir.trim() || undefined,
        memoryMin,
        memoryMax,
        jvmArgs: jvmArgs.trim(),
      };

      if (profile) {
        await window.electronAPI.updateProfile(profile.id, profileData);
      } else {
        await window.electronAPI.createProfile(profileData);
      }

      await onSave();
      onClose();
    } catch (err) {
      console.error('Failed to save profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="profile-form-overlay">
      <div className="profile-form">
        <div className="profile-form-header">
          <h3>{profile ? 'Edit Profile' : 'Create Profile'}</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {error && (
          <div className="form-error">
            <p>❌ {error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Profile Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Profile"
              required
            />
          </div>

          <div className="form-group">
            <label>Minecraft Version *</label>
            <input
              type="text"
              value={versionId}
              onChange={(e) => setVersionId(e.target.value)}
              placeholder="1.20.1"
              required
            />
          </div>

          <div className="form-group">
            <label>Installation Directory</label>
            <input
              type="text"
              value={installationDir}
              onChange={(e) => setInstallationDir(e.target.value)}
              placeholder="Leave empty for default"
            />
          </div>

          <div className="form-group">
            <label>Memory Allocation (MB)</label>
            <div className="memory-inputs">
              <div className="input-group">
                <label>Min</label>
                <input
                  type="number"
                  value={memoryMin}
                  onChange={(e) => setMemoryMin(Number(e.target.value))}
                  min="512"
                  step="512"
                />
              </div>
              <div className="input-group">
                <label>Max</label>
                <input
                  type="number"
                  value={memoryMax}
                  onChange={(e) => setMemoryMax(Number(e.target.value))}
                  min="1024"
                  step="512"
                />
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>JVM Arguments</label>
            <textarea
              value={jvmArgs}
              onChange={(e) => setJvmArgs(e.target.value)}
              placeholder="-XX:+UseG1GC"
              rows={2}
            />
          </div>

          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={isSaving}>
              {isSaving ? 'Saving...' : profile ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface FabricProfileFormProps {
  onClose: () => void;
  onSave: (profileData: any) => void;
}

const FabricProfileForm: React.FC<FabricProfileFormProps> = ({ onClose, onSave }) => {
  const [name, setName] = useState('');
  const [versionId, setVersionId] = useState('1.20.1');
  const [installationDir, setInstallationDir] = useState('');
  const [memoryMin, setMemoryMin] = useState(2048);
  const [memoryMax, setMemoryMax] = useState(4096);
  const [jvmArgs, setJvmArgs] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Profile name is required');
      return;
    }

    if (!versionId.trim()) {
      setError('Version is required');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      const profileData = {
        name: name.trim(),
        versionId: versionId.trim(),
        installationDir: installationDir.trim() || undefined,
        memoryMin,
        memoryMax,
        jvmArgs: jvmArgs.trim(),
        modLoader: {
          type: 'fabric' as const,
          version: 'latest'
        }
      };

      await onSave(profileData);
    } catch (err) {
      console.error('Failed to create Fabric profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to create Fabric profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="profile-form-overlay">
      <div className="profile-form fabric-profile-form">
        <div className="profile-form-header">
          <h3>Create Fabric Profile</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="fabric-info">
          <p>🧵 This will create a Fabric profile with 10 essential mods preinstalled:</p>
          <ul>
            <li>Fabric API (Required)</li>
            <li>Sodium (Performance)</li>
            <li>Lithium (Optimization)</li>
            <li>GammaUtil (Brightness)</li>
            <li>AppleSkin (Food info)</li>
            <li>Litematica (Schematics)</li>
            <li>Krypton (Network)</li>
            <li>Mod Menu (Configuration)</li>
            <li>Uku's Armor HUD (Armor display)</li>
            <li>Cloth Config (Mod settings)</li>
          </ul>
          <p>You can enable/disable individual mods when launching the game.</p>
        </div>

        {error && (
          <div className="form-error">
            <p>❌ {error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Profile Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Fabric Profile"
              required
            />
          </div>

          <div className="form-group">
            <label>Minecraft Version *</label>
            <input
              type="text"
              value={versionId}
              onChange={(e) => setVersionId(e.target.value)}
              placeholder="1.20.1"
              required
            />
            <p className="form-hint">
              Make sure this version is compatible with Fabric
            </p>
          </div>

          <div className="form-group">
            <label>Installation Directory</label>
            <input
              type="text"
              value={installationDir}
              onChange={(e) => setInstallationDir(e.target.value)}
              placeholder="Leave empty for default"
            />
          </div>

          <div className="form-group">
            <label>Memory Allocation (MB)</label>
            <div className="memory-inputs">
              <div className="input-group">
                <label>Min</label>
                <input
                  type="number"
                  value={memoryMin}
                  onChange={(e) => setMemoryMin(Number(e.target.value))}
                  min="512"
                  step="512"
                />
              </div>
              <div className="input-group">
                <label>Max</label>
                <input
                  type="number"
                  value={memoryMax}
                  onChange={(e) => setMemoryMax(Number(e.target.value))}
                  min="1024"
                  step="512"
                />
              </div>
            </div>
            <p className="form-hint">
              Recommended: 4GB+ for modded Minecraft
            </p>
          </div>

          <div className="form-group">
            <label>JVM Arguments</label>
            <textarea
              value={jvmArgs}
              onChange={(e) => setJvmArgs(e.target.value)}
              placeholder="-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions"
              rows={2}
            />
            <p className="form-hint">
              Optional: Performance tuning arguments
            </p>
          </div>

          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={isSaving}>
              {isSaving ? 'Creating Profile & Installing Mods...' : 'Create Fabric Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
