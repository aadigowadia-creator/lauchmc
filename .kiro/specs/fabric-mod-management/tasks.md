# Implementation Plan

- [x] 1. Set up database schema and repositories for mod management





  - Create database migration for mod_states, custom_mods, and profile_preferences tables
  - Implement ModStateRepository with CRUD operations for mod states
  - Implement CustomModRepository for custom mod records
  - Implement ProfilePreferencesRepository for user preferences
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 2. Implement FabricModService core functionality





  - [x] 2.1 Create FabricModService class with essential mods configuration


    - Define ESSENTIAL_MODS array with all 10 preinstalled mods (Fabric API, Sodium, Lithium, GammaUtil, AppleSkin, Litematica, Krypton, Mod Menu, Uku's Armor HUD, Cloth Config)
    - Implement getModsDirectory method to resolve mods folder path
    - Implement getAllMods method to combine essential and custom mods
    - _Requirements: 1.1, 1.4_

  - [x] 2.2 Implement mod download and installation


    - Implement downloadMod method with progress tracking
    - Implement installEssentialMods method to download all preinstalled mods
    - Implement resolveModVersion method using Modrinth API
    - Add file integrity verification with SHA-256 hashing
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [x] 2.3 Implement mod state management


    - Implement getModStates method to retrieve mod enable/disable states
    - Implement setModState method to update individual mod states
    - Implement applyModStates method to rename files (.jar/.disabled) before launch
    - _Requirements: 2.5, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 2.4 Implement custom mod support



    - Implement parseModrinthUrl method to extract project and version IDs
    - Implement parseCurseForgeUrl method to extract project slug and file ID
    - Implement fetchModrinthProject method to get mod metadata
    - Implement fetchCurseForgeProject method to get mod metadata
    - Implement addCustomMod method to download and install custom mods
    - Implement removeCustomMod method to delete custom mods
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 3. Extend ProfileService for Fabric profile creation





  - Implement createFabricProfile method that creates profile and installs mods
  - Implement shouldShowModDialog method to check user preferences
  - Implement getProfilePreference and setProfilePreference methods
  - Add rollback logic if mod installation fails during profile creation
  - _Requirements: 1.1, 1.5, 6.3, 6.4_

- [x] 4. Update GameProcessManager for pre-launch mod dialog





  - Modify launchGame method to check for Fabric profiles
  - Add mod dialog trigger before game launch
  - Implement applyModStates call before starting game process
  - Handle "Don't ask again" preference
  - _Requirements: 2.1, 2.5, 6.1, 6.2, 6.3, 6.5_

- [x] 5. Create ModToggleDialog React component





  - [x] 5.1 Implement base ModToggleDialog component


    - Create component structure with essential and custom mod sections
    - Implement mod state loading from backend
    - Implement checkbox toggle functionality
    - Add "Don't ask again" checkbox
    - Add confirm and cancel buttons
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 6.1, 6.2_

  - [x] 5.2 Implement AddModDialog component


    - Create dialog for adding custom mods via URL
    - Implement URL input validation
    - Add download progress indicator
    - Handle Modrinth and CurseForge URL formats
    - Display error messages for invalid URLs or failed downloads
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 5.3 Add custom mod management UI


    - Display custom mods separately from essential mods
    - Add "Add Mod" button to open AddModDialog
    - Add remove button for each custom mod
    - Show mod source badges (Modrinth/CurseForge)
    - _Requirements: 2.2, 2.3, 2.4_

  - [ ]* 5.4 Style ModToggleDialog components
    - Create CSS for mod toggle dialog layout
    - Style essential vs custom mod sections
    - Add hover effects and visual feedback
    - Ensure responsive design
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 6. Update ProfileManager component for Fabric profiles





  - Add "Create Fabric Profile" button or option
  - Show mod installation progress during profile creation
  - Display mod count badge on Fabric profiles
  - Add "Manage Mods" button for existing Fabric profiles
  - _Requirements: 1.1, 1.5, 2.1_

- [x] 7. Implement IPC handlers for mod management





  - Add IPC handler for installEssentialMods
  - Add IPC handler for getModStates
  - Add IPC handler for setModState
  - Add IPC handler for addCustomMod
  - Add IPC handler for removeCustomMod
  - Add IPC handler for getAllMods
  - Add IPC handler for getProfilePreference and setProfilePreference
  - Update preload.ts with new API methods
  - _Requirements: 1.1, 2.1, 2.5, 3.1, 3.2, 3.3, 6.3, 6.4_

- [x] 8. Integrate mod dialog into launch flow





  - Update LauncherInterface component to show ModToggleDialog
  - Implement callback to handle mod state confirmation
  - Handle dialog cancellation (abort launch)
  - Pass mod states to backend before game launch
  - _Requirements: 2.1, 2.5, 4.4, 6.5_

- [x] 9. Add error handling and user feedback





  - Implement error dialogs for mod download failures
  - Add retry mechanism for failed downloads
  - Show user-friendly messages for network errors
  - Handle version compatibility issues gracefully
  - Display warnings for missing dependencies
  - _Requirements: 1.5, 4.5_

- [x] 10. Update database migrations




  - Add migration for mod_states table
  - Add migration for custom_mods table
  - Add migration for profile_preferences table
  - Ensure migrations run on launcher startup
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ]* 11. Write unit tests for FabricModService
  - Test essential mods installation with mocked downloads
  - Test mod state toggling (file renaming)
  - Test custom mod URL parsing (Modrinth and CurseForge)
  - Test mod version resolution
  - Test error handling for failed downloads
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.5, 4.1, 4.2, 4.3_

- [ ]* 12. Write integration tests for mod management flow
  - Test Fabric profile creation with mod installation
  - Test launch flow with mod dialog
  - Test mod state persistence across launches
  - Test custom mod addition and removal
  - Test "Don't ask again" preference
  - _Requirements: 1.1, 2.1, 2.5, 3.1, 3.2, 3.3, 6.1, 6.2, 6.3, 6.5_
