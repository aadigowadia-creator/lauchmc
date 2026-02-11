# Design Document

## Overview

The Fabric Mod Management system provides an opinionated, streamlined approach to modding Minecraft through the launcher. The system exclusively supports Fabric mod loader and comes with a curated set of 10 essential mods preinstalled. Users can selectively enable or disable these mods through a pre-launch dialog, with preferences persisted per profile.

This design integrates with the existing launcher architecture, extending the profile management, mod loader installation, and game launch workflows to support automatic mod installation, configuration, and selective enabling.

## Architecture

### High-Level Component Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    Renderer Process (UI)                     │
├─────────────────────────────────────────────────────────────┤
│  ProfileManager  │  ModToggleDialog  │  LauncherInterface   │
└─────────────────────────────────────────────────────────────┘
                            │
                    IPC Communication
                            │
┌─────────────────────────────────────────────────────────────┐
│                     Main Process (Backend)                   │
├─────────────────────────────────────────────────────────────┤
│  FabricModService  │  ProfileService  │  ModLoaderService    │
│  ModStateRepository │ GameProcessManager │                   │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                    File System & Database                    │
├─────────────────────────────────────────────────────────────┤
│  Mods Directory    │  SQLite Database  │  Profile Config     │
└─────────────────────────────────────────────────────────────┘
```

### Integration Points

1. **Profile Creation Flow**: When creating a Fabric profile, automatically trigger mod installation
2. **Launch Flow**: Intercept launch to show mod toggle dialog before game starts
3. **Mod State Persistence**: Store mod enable/disable state in database per profile
4. **File System Management**: Handle .jar/.disabled file extensions in mods directory

## Components and Interfaces

### 1. FabricModService

Core service responsible for managing Fabric mods, including downloading, installing, and toggling mod states.

```typescript
interface EssentialMod {
  id: string;
  name: string;
  description: string;
  downloadUrl: string;
  fileName: string;
  version: string;
  dependencies?: string[]; // IDs of other essential mods
  isEssential: boolean; // True for preinstalled mods
}

interface CustomMod {
  id: string;
  name: string;
  description?: string;
  fileName: string;
  source: 'modrinth' | 'curseforge';
  projectId: string;
  versionId?: string;
  downloadUrl: string;
}

interface ModDownloadProgress {
  modId: string;
  modName: string;
  downloaded: number;
  total: number;
  percentage: number;
}

interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  versions: string[];
}

interface CurseForgeProject {
  id: number;
  name: string;
  summary: string;
  latestFiles: Array<{
    id: number;
    displayName: string;
    downloadUrl: string;
  }>;
}

class FabricModService {
  // Essential mods configuration
  private readonly ESSENTIAL_MODS: EssentialMod[] = [
    {
      id: 'fabric-api',
      name: 'Fabric API',
      description: 'Essential hooks for Fabric mods',
      downloadUrl: 'https://cdn.modrinth.com/data/P7dR8mSH/versions/{version}/fabric-api-{version}.jar',
      fileName: 'fabric-api.jar',
      version: 'latest',
      dependencies: [],
      isEssential: true
    },
    {
      id: 'sodium',
      name: 'Sodium',
      description: 'Modern rendering engine and optimization',
      downloadUrl: 'https://cdn.modrinth.com/data/AANobbMI/versions/{version}/sodium-fabric-{version}.jar',
      fileName: 'sodium.jar',
      version: 'latest',
      dependencies: [],
      isEssential: true
    },
    // ... other mods
  ];

  /**
   * Download and install all essential mods for a profile
   */
  async installEssentialMods(
    profileId: number,
    gameVersion: string,
    onProgress?: (progress: ModDownloadProgress) => void
  ): Promise<void>;

  /**
   * Add custom mod from Modrinth or CurseForge URL
   */
  async addCustomMod(
    profileId: number,
    url: string,
    gameVersion: string,
    onProgress?: (progress: ModDownloadProgress) => void
  ): Promise<CustomMod>;

  /**
   * Parse Modrinth URL and extract project info
   */
  async parseModrinthUrl(url: string): Promise<{
    projectId: string;
    versionId?: string;
  }>;

  /**
   * Parse CurseForge URL and extract project info
   */
  async parseCurseForgeUrl(url: string): Promise<{
    projectId: string;
    fileId?: string;
  }>;

  /**
   * Fetch mod info from Modrinth
   */
  async fetchModrinthProject(
    projectId: string,
    gameVersion: string
  ): Promise<ModrinthProject>;

  /**
   * Fetch mod info from CurseForge
   */
  async fetchCurseForgeProject(
    projectId: string,
    gameVersion: string
  ): Promise<CurseForgeProject>;

  /**
   * Download and install custom mod
   */
  async installCustomMod(
    profileId: number,
    customMod: CustomMod,
    onProgress?: (progress: ModDownloadProgress) => void
  ): Promise<void>;

  /**
   * Remove custom mod from profile
   */
  async removeCustomMod(
    profileId: number,
    modId: string
  ): Promise<void>;

  /**
   * Get all mods for a profile (essential + custom)
   */
  async getAllMods(profileId: number): Promise<Array<EssentialMod | CustomMod>>;

  /**
   * Get mod state for a profile
   */
  async getModStates(profileId: number): Promise<Map<string, boolean>>;

  /**
   * Update mod state (enable/disable)
   */
  async setModState(
    profileId: number,
    modId: string,
    enabled: boolean
  ): Promise<void>;

  /**
   * Apply mod states before game launch
   */
  async applyModStates(profileId: number): Promise<void>;

  /**
   * Verify mod integrity
   */
  async verifyModIntegrity(
    profileId: number,
    modId: string
  ): Promise<boolean>;

  /**
   * Get mods directory for profile
   */
  getModsDirectory(installationDir: string): string;

  /**
   * Resolve mod version for game version
   */
  private async resolveModVersion(
    mod: EssentialMod,
    gameVersion: string
  ): Promise<string>;

  /**
   * Download single mod
   */
  private async downloadMod(
    mod: EssentialMod | CustomMod,
    targetPath: string,
    onProgress?: (downloaded: number, total: number) => void
  ): Promise<void>;
}
```

### 2. ModStateRepository

Database repository for persisting mod enable/disable states per profile.

```typescript
interface ModState {
  id?: number;
  profileId: number;
  modId: string;
  enabled: boolean;
  updatedAt: Date;
}

interface CustomModRecord {
  id?: number;
  profileId: number;
  modId: string;
  name: string;
  description?: string;
  fileName: string;
  source: 'modrinth' | 'curseforge';
  projectId: string;
  versionId?: string;
  downloadUrl: string;
  createdAt: Date;
}

class ModStateRepository extends BaseRepository {
  /**
   * Get all mod states for a profile
   */
  async findByProfileId(profileId: number): Promise<ModState[]>;

  /**
   * Get specific mod state
   */
  async findByProfileAndMod(
    profileId: number,
    modId: string
  ): Promise<ModState | null>;

  /**
   * Create or update mod state
   */
  async upsert(modState: Omit<ModState, 'id' | 'updatedAt'>): Promise<ModState>;

  /**
   * Delete all mod states for a profile
   */
  async deleteByProfileId(profileId: number): Promise<boolean>;

  /**
   * Initialize default mod states (all enabled)
   */
  async initializeDefaults(
    profileId: number,
    modIds: string[]
  ): Promise<void>;
}

class CustomModRepository extends BaseRepository {
  /**
   * Get all custom mods for a profile
   */
  async findByProfileId(profileId: number): Promise<CustomModRecord[]>;

  /**
   * Get specific custom mod
   */
  async findByProfileAndMod(
    profileId: number,
    modId: string
  ): Promise<CustomModRecord | null>;

  /**
   * Create custom mod record
   */
  async create(customMod: Omit<CustomModRecord, 'id' | 'createdAt'>): Promise<CustomModRecord>;

  /**
   * Delete custom mod
   */
  async delete(profileId: number, modId: string): Promise<boolean>;

  /**
   * Delete all custom mods for a profile
   */
  async deleteByProfileId(profileId: number): Promise<boolean>;
}
```

### 3. ModToggleDialog Component

React component for the pre-launch mod selection dialog.

```typescript
interface ModToggleDialogProps {
  profileId: number;
  onConfirm: (modStates: Map<string, boolean>) => void;
  onCancel: () => void;
}

interface ModToggleState {
  modId: string;
  name: string;
  description: string;
  enabled: boolean;
  required: boolean; // Fabric API is required
  isEssential: boolean; // True for preinstalled mods
  source?: 'modrinth' | 'curseforge'; // For custom mods
}

const ModToggleDialog: React.FC<ModToggleDialogProps> = ({
  profileId,
  onConfirm,
  onCancel
}) => {
  const [modStates, setModStates] = useState<ModToggleState[]>([]);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModDialog, setShowAddModDialog] = useState(false);

  // Load current mod states
  useEffect(() => {
    loadModStates();
  }, [profileId]);

  const handleToggle = (modId: string) => {
    // Toggle mod state
  };

  const handleRemoveCustomMod = async (modId: string) => {
    if (confirm('Remove this mod from your profile?')) {
      await window.electronAPI.removeCustomMod(profileId, modId);
      await loadModStates();
    }
  };

  const handleConfirm = async () => {
    // Save states and proceed with launch
    if (dontAskAgain) {
      await window.electronAPI.setProfilePreference(
        profileId,
        'skipModDialog',
        true
      );
    }
    onConfirm(new Map(modStates.map(m => [m.modId, m.enabled])));
  };

  return (
    <div className="mod-toggle-dialog-overlay">
      <div className="mod-toggle-dialog">
        <h2>Select Mods to Enable</h2>
        
        <div className="mod-sections">
          <div className="essential-mods-section">
            <h3>Essential Mods (Preinstalled)</h3>
            <div className="mod-list">
              {modStates.filter(m => m.isEssential).map(mod => (
                <div key={mod.modId} className="mod-item">
                  <input
                    type="checkbox"
                    checked={mod.enabled}
                    disabled={mod.required}
                    onChange={() => handleToggle(mod.modId)}
                  />
                  <div className="mod-info">
                    <strong>{mod.name}</strong>
                    {mod.required && <span className="required-badge">Required</span>}
                    <p>{mod.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="custom-mods-section">
            <div className="section-header">
              <h3>Custom Mods</h3>
              <button 
                className="add-mod-btn"
                onClick={() => setShowAddModDialog(true)}
              >
                + Add Mod
              </button>
            </div>
            <div className="mod-list">
              {modStates.filter(m => !m.isEssential).length === 0 ? (
                <p className="no-custom-mods">
                  No custom mods added. Click "Add Mod" to install from Modrinth or CurseForge.
                </p>
              ) : (
                modStates.filter(m => !m.isEssential).map(mod => (
                  <div key={mod.modId} className="mod-item custom">
                    <input
                      type="checkbox"
                      checked={mod.enabled}
                      onChange={() => handleToggle(mod.modId)}
                    />
                    <div className="mod-info">
                      <strong>{mod.name}</strong>
                      <span className="source-badge">{mod.source}</span>
                      <p>{mod.description || 'Custom mod'}</p>
                    </div>
                    <button
                      className="remove-mod-btn"
                      onClick={() => handleRemoveCustomMod(mod.modId)}
                      title="Remove mod"
                    >
                      🗑️
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="dialog-options">
          <label>
            <input
              type="checkbox"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
            />
            Don't ask again (use current settings)
          </label>
        </div>
        <div className="dialog-actions">
          <button onClick={onCancel}>Cancel</button>
          <button onClick={handleConfirm} className="primary">
            Launch with Selected Mods
          </button>
        </div>
      </div>

      {showAddModDialog && (
        <AddModDialog
          profileId={profileId}
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

interface AddModDialogProps {
  profileId: number;
  onClose: () => void;
  onModAdded: () => void;
}

const AddModDialog: React.FC<AddModDialogProps> = ({
  profileId,
  onClose,
  onModAdded
}) => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url.trim()) {
      setError('Please enter a Modrinth or CurseForge URL');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setProgress(0);

      await window.electronAPI.addCustomMod(
        profileId,
        url.trim(),
        (progress) => setProgress(progress.percentage)
      );

      onModAdded();
    } catch (err) {
      console.error('Failed to add mod:', err);
      setError(err instanceof Error ? err.message : 'Failed to add mod');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="add-mod-dialog-overlay">
      <div className="add-mod-dialog">
        <div className="dialog-header">
          <h3>Add Custom Mod</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {error && (
          <div className="dialog-error">
            <p>❌ {error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Modrinth or CurseForge URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://modrinth.com/mod/... or https://www.curseforge.com/minecraft/mc-mods/..."
              disabled={isLoading}
            />
            <p className="form-hint">
              Paste a link to a mod page on Modrinth or CurseForge
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
              <p>Downloading mod... {progress}%</p>
            </div>
          )}

          <div className="dialog-actions">
            <button 
              type="button" 
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="primary"
              disabled={isLoading}
            >
              {isLoading ? 'Adding...' : 'Add Mod'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
```

### 4. Enhanced ProfileService Integration

Extend existing ProfileService to handle Fabric profile creation with mod installation.

```typescript
// Add to ProfileService class
class ProfileService {
  private fabricModService: FabricModService;

  /**
   * Create Fabric profile with essential mods
   */
  async createFabricProfile(
    profileData: CreateProfileData,
    onModProgress?: (progress: ModDownloadProgress) => void
  ): Promise<UserProfile> {
    // Validate Fabric mod loader is specified
    if (!profileData.modLoader || profileData.modLoader.type !== 'fabric') {
      throw new Error('Profile must use Fabric mod loader');
    }

    // Create profile
    const profile = await this.createProfile(profileData);

    try {
      // Install essential mods
      await this.fabricModService.installEssentialMods(
        profile.id!,
        profileData.versionId,
        onModProgress
      );

      return profile;
    } catch (error) {
      // Rollback profile creation on mod installation failure
      await this.deleteProfile(profile.id!, true);
      throw error;
    }
  }

  /**
   * Check if profile should show mod dialog
   */
  async shouldShowModDialog(profileId: number): Promise<boolean> {
    const profile = await this.getProfileById(profileId);
    if (!profile || profile.modLoader?.type !== 'fabric') {
      return false;
    }

    // Check user preference
    const skipDialog = await this.getProfilePreference(
      profileId,
      'skipModDialog'
    );
    return !skipDialog;
  }
}
```

### 5. Enhanced GameProcessManager Integration

Modify game launch flow to show mod dialog for Fabric profiles.

```typescript
// Add to GameProcessManager class
class GameProcessManager {
  /**
   * Launch game with mod dialog check
   */
  async launchGame(
    profileId: number,
    onModDialogRequired?: () => Promise<Map<string, boolean>>
  ): Promise<ChildProcess> {
    const profile = await this.profileService.getProfileById(profileId);
    
    // Check if mod dialog should be shown
    if (profile.modLoader?.type === 'fabric') {
      const shouldShow = await this.profileService.shouldShowModDialog(profileId);
      
      if (shouldShow && onModDialogRequired) {
        // Request mod states from UI
        const modStates = await onModDialogRequired();
        
        // Apply mod states
        await this.fabricModService.applyModStates(profileId);
      } else {
        // Apply saved mod states
        await this.fabricModService.applyModStates(profileId);
      }
    }

    // Continue with normal launch
    return this.startGameProcess(profile);
  }
}
```

## Data Models

### Database Schema

```sql
-- Mod states table
CREATE TABLE IF NOT EXISTS mod_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  mod_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(profile_id, mod_id)
);

CREATE INDEX idx_mod_states_profile ON mod_states(profile_id);

-- Custom mods table
CREATE TABLE IF NOT EXISTS custom_mods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  mod_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  file_name TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('modrinth', 'curseforge')),
  project_id TEXT NOT NULL,
  version_id TEXT,
  download_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(profile_id, mod_id)
);

CREATE INDEX idx_custom_mods_profile ON custom_mods(profile_id);

-- Profile preferences table (for skipModDialog flag)
CREATE TABLE IF NOT EXISTS profile_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  preference_key TEXT NOT NULL,
  preference_value TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(profile_id, preference_key)
);

CREATE INDEX idx_profile_preferences_profile ON profile_preferences(profile_id);
```

### Essential Mods Configuration

The system will support these 10 essential mods:

1. **Fabric API** (Required) - Core API for Fabric mods
2. **Sodium** - Rendering optimization
3. **Lithium** - General-purpose optimization
4. **GammaUtil** - Brightness control utility
5. **AppleSkin** - Food/hunger information
6. **Litematica** - Schematic mod for building
7. **Krypton** - Network stack optimization
8. **Mod Menu** - In-game mod configuration
9. **Uku's Armor HUD** - Armor durability display
10. **Cloth Config** - Configuration library for mods

Mod metadata will be stored in a configuration file that maps mod IDs to Modrinth/CurseForge project IDs for version resolution.

## Error Handling

### Mod Download Failures

```typescript
class ModDownloadError extends Error {
  constructor(
    public modId: string,
    public modName: string,
    message: string
  ) {
    super(message);
    this.name = 'ModDownloadError';
  }
}

// Error handling strategy
try {
  await fabricModService.installEssentialMods(profileId, gameVersion);
} catch (error) {
  if (error instanceof ModDownloadError) {
    // Show user-friendly error with retry option
    showErrorDialog({
      title: 'Mod Download Failed',
      message: `Failed to download ${error.modName}: ${error.message}`,
      actions: [
        { label: 'Retry', action: () => retryModDownload(error.modId) },
        { label: 'Skip Mod', action: () => continueWithoutMod(error.modId) },
        { label: 'Cancel', action: () => cancelProfileCreation() }
      ]
    });
  }
}
```

### File System Errors

```typescript
// Handle permission errors when toggling mods
try {
  await fabricModService.setModState(profileId, modId, enabled);
} catch (error) {
  if (error.code === 'EACCES') {
    showErrorDialog({
      title: 'Permission Denied',
      message: 'Unable to modify mod files. Please check folder permissions.',
      actions: [
        { label: 'Open Mods Folder', action: () => openModsFolder(profileId) },
        { label: 'OK', action: () => {} }
      ]
    });
  }
}
```

### Version Compatibility

```typescript
// Handle cases where mod version is not available for game version
async resolveModVersion(mod: EssentialMod, gameVersion: string): Promise<string> {
  try {
    const versions = await this.fetchModVersions(mod.id, gameVersion);
    if (versions.length === 0) {
      throw new ModCompatibilityError(
        mod.id,
        mod.name,
        `No compatible version found for Minecraft ${gameVersion}`
      );
    }
    return versions[0].version;
  } catch (error) {
    // Fallback to latest version with warning
    logger.warn(`Using latest version of ${mod.name} - may not be compatible`);
    return 'latest';
  }
}
```

## Testing Strategy

### Unit Tests

1. **FabricModService Tests**
   - Test mod download with mocked HTTP requests
   - Test mod state toggling (file renaming)
   - Test mod version resolution
   - Test error handling for failed downloads

2. **ModStateRepository Tests**
   - Test CRUD operations for mod states
   - Test default initialization
   - Test cascade deletion with profiles

3. **ProfileService Integration Tests**
   - Test Fabric profile creation with mod installation
   - Test mod dialog preference persistence
   - Test rollback on mod installation failure

### Integration Tests

1. **End-to-End Profile Creation**
   - Create Fabric profile
   - Verify all mods downloaded
   - Verify mod states initialized
   - Verify mods directory structure

2. **Launch Flow with Mod Dialog**
   - Launch Fabric profile
   - Verify mod dialog appears
   - Toggle mods and confirm
   - Verify file system changes
   - Verify game launches successfully

3. **Mod State Persistence**
   - Set mod states
   - Close and reopen launcher
   - Verify states persisted
   - Launch without dialog
   - Verify correct mods enabled

### Manual Testing Checklist

- [ ] Create new Fabric profile and verify all 10 mods download
- [ ] Launch profile and verify mod dialog appears
- [ ] Toggle each mod and verify file extensions change
- [ ] Enable "Don't ask again" and verify dialog skips on next launch
- [ ] Re-enable dialog from profile settings
- [ ] Delete profile and verify mod states cleaned up
- [ ] Test with slow network connection
- [ ] Test with no network connection (should fail gracefully)
- [ ] Test with incompatible game version
- [ ] Verify Fabric API cannot be disabled (required mod)

## Implementation Notes

### Mod Version Resolution

Use Modrinth API for mod version resolution:

```typescript
async fetchModVersions(modId: string, gameVersion: string): Promise<ModVersion[]> {
  const response = await axios.get(
    `https://api.modrinth.com/v2/project/${modId}/version`,
    {
      params: {
        game_versions: `["${gameVersion}"]`,
        loaders: '["fabric"]'
      }
    }
  );
  return response.data;
}
```

### URL Parsing for Custom Mods

Support multiple URL formats for Modrinth and CurseForge:

```typescript
// Modrinth URL patterns
// https://modrinth.com/mod/sodium
// https://modrinth.com/mod/sodium/version/mc1.20.1-0.5.3
// https://modrinth.com/project/AANobbMI

async parseModrinthUrl(url: string): Promise<{ projectId: string; versionId?: string }> {
  const patterns = [
    /modrinth\.com\/mod\/([^\/]+)(?:\/version\/([^\/]+))?/,
    /modrinth\.com\/project\/([^\/]+)(?:\/version\/([^\/]+))?/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return {
        projectId: match[1],
        versionId: match[2]
      };
    }
  }

  throw new Error('Invalid Modrinth URL format');
}

// CurseForge URL patterns
// https://www.curseforge.com/minecraft/mc-mods/sodium
// https://www.curseforge.com/minecraft/mc-mods/sodium/files/4567890

async parseCurseForgeUrl(url: string): Promise<{ projectSlug: string; fileId?: string }> {
  const pattern = /curseforge\.com\/minecraft\/mc-mods\/([^\/]+)(?:\/files\/(\d+))?/;
  const match = url.match(pattern);

  if (!match) {
    throw new Error('Invalid CurseForge URL format');
  }

  return {
    projectSlug: match[1],
    fileId: match[2]
  };
}

// Fetch project info from CurseForge API
async fetchCurseForgeProject(
  projectSlug: string,
  gameVersion: string
): Promise<CurseForgeProject> {
  // First, search for project by slug
  const searchResponse = await axios.get(
    'https://api.curseforge.com/v1/mods/search',
    {
      headers: {
        'x-api-key': process.env.CURSEFORGE_API_KEY
      },
      params: {
        gameId: 432, // Minecraft
        slug: projectSlug,
        classId: 6 // Mods
      }
    }
  );

  const project = searchResponse.data.data[0];
  if (!project) {
    throw new Error(`Mod not found: ${projectSlug}`);
  }

  // Get compatible files for game version
  const filesResponse = await axios.get(
    `https://api.curseforge.com/v1/mods/${project.id}/files`,
    {
      headers: {
        'x-api-key': process.env.CURSEFORGE_API_KEY
      },
      params: {
        gameVersion,
        modLoaderType: 4 // Fabric
      }
    }
  );

  return {
    id: project.id,
    name: project.name,
    summary: project.summary,
    latestFiles: filesResponse.data.data
  };
}
```

### File System Structure

```
<installationDir>/
  mods/
    fabric-api-0.92.0+1.20.1.jar          # Enabled
    sodium-fabric-mc1.20.1-0.5.3.jar      # Enabled
    lithium-fabric-mc1.20.1-0.11.2.jar    # Enabled
    gammautil-1.7.9.jar.disabled          # Disabled
    appleskin-fabric-mc1.20.1-2.5.1.jar   # Enabled
    litematica-fabric-1.20.1-0.15.3.jar.disabled  # Disabled
    krypton-0.2.3.jar                     # Enabled
    modmenu-7.2.2.jar                     # Enabled
    uku-armor-hud-1.0.0.jar               # Enabled
    cloth-config-11.1.118-fabric.jar      # Enabled
```

### Performance Considerations

1. **Parallel Downloads**: Download mods concurrently (max 3 at a time)
2. **Caching**: Cache mod version lookups for 1 hour
3. **Lazy Loading**: Only load mod states when needed
4. **Debouncing**: Debounce file system operations when toggling multiple mods

### Security Considerations

1. **Verify Downloads**: Check SHA-256 hashes of downloaded mods
2. **HTTPS Only**: Only download from HTTPS sources
3. **Sanitize Paths**: Validate all file paths to prevent directory traversal
4. **Rate Limiting**: Implement rate limiting for API requests

## Future Enhancements

1. **Mod Profiles**: Save different mod configurations as presets
2. **Automatic Updates**: Check for and install mod updates
3. **Dependency Resolution**: Automatically handle mod dependencies beyond essential mods
4. **Conflict Detection**: Warn about incompatible mod combinations
5. **Bulk Import**: Import mod lists from files or other launchers
6. **Mod Search**: Browse and search Modrinth/CurseForge directly in launcher
