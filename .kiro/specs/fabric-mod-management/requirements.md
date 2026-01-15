# Requirements Document

## Introduction

A Fabric mod management system for the Minecraft launcher that provides a streamlined, opinionated mod setup. The system focuses exclusively on Fabric mod loader support and comes with a curated set of essential performance and utility mods preinstalled. When creating or launching a Fabric profile, users can selectively enable or disable individual mods through a simple pre-launch dialog.

## Glossary

- **Fabric_Mod_Manager**: The component of the Minecraft_Launcher that handles Fabric mod installation, configuration, and selective enabling
- **Essential_Mod**: A preinstalled mod from the curated list (Fabric API, Sodium, Lithium, GammaUtil, AppleSkin, Litematica, Krypton, Mod Menu, Uku's Armor HUD, Cloth Config)
- **Mod_Toggle_Dialog**: The pre-launch interface that allows users to enable or disable individual mods
- **Fabric_Profile**: A game profile configured to use the Fabric mod loader
- **Mods_Directory**: The folder within a Minecraft installation where mod JAR files are stored
- **Mod_State**: The enabled or disabled status of a specific mod for a profile

## Requirements

### Requirement 1

**User Story:** As a Minecraft player, I want to create a Fabric profile with essential mods preinstalled, so that I can quickly start playing with performance and utility enhancements.

#### Acceptance Criteria

1. WHEN the user creates a new Fabric_Profile, THE Fabric_Mod_Manager SHALL automatically download and install all Essential_Mods
2. THE Fabric_Mod_Manager SHALL download mods from trusted sources with version compatibility for the selected Minecraft version
3. THE Fabric_Mod_Manager SHALL verify downloaded mod files for integrity and compatibility
4. THE Fabric_Mod_Manager SHALL place all Essential_Mod files in the appropriate Mods_Directory for the profile
5. IF any Essential_Mod download fails, THEN THE Fabric_Mod_Manager SHALL display an error message and allow retry

### Requirement 2

**User Story:** As a Minecraft player, I want to see a mod selection dialog before launching my Fabric profile, so that I can choose which mods to enable for this play session.

#### Acceptance Criteria

1. WHEN the user clicks launch on a Fabric_Profile, THE Fabric_Mod_Manager SHALL display the Mod_Toggle_Dialog before starting the game
2. THE Mod_Toggle_Dialog SHALL list all Essential_Mods with their current Mod_State
3. THE Mod_Toggle_Dialog SHALL provide a toggle control next to each Essential_Mod for enabling or disabling
4. THE Mod_Toggle_Dialog SHALL display mod names clearly and include brief descriptions
5. WHEN the user confirms their selections, THE Fabric_Mod_Manager SHALL apply the Mod_State changes and proceed with game launch

### Requirement 3

**User Story:** As a Minecraft player, I want my mod enable/disable choices to be remembered, so that I don't have to reconfigure them every time I launch.

#### Acceptance Criteria

1. THE Fabric_Mod_Manager SHALL persist Mod_State preferences for each Fabric_Profile
2. WHEN the Mod_Toggle_Dialog opens, THE Fabric_Mod_Manager SHALL display the previously saved Mod_State for each Essential_Mod
3. THE Fabric_Mod_Manager SHALL update stored Mod_State only when the user confirms changes in the Mod_Toggle_Dialog
4. THE Fabric_Mod_Manager SHALL maintain separate Mod_State configurations for different Fabric_Profiles
5. THE Fabric_Mod_Manager SHALL set all Essential_Mods to enabled by default for newly created profiles

### Requirement 4

**User Story:** As a Minecraft player, I want disabled mods to be properly handled, so that they don't load when I launch the game.

#### Acceptance Criteria

1. WHEN a mod is disabled, THE Fabric_Mod_Manager SHALL rename the mod file with a disabled extension
2. THE Fabric_Mod_Manager SHALL use the file extension ".disabled" to mark disabled mods
3. WHEN a mod is enabled, THE Fabric_Mod_Manager SHALL restore the original ".jar" file extension
4. THE Fabric_Mod_Manager SHALL complete all file operations before launching the game process
5. IF file operations fail, THEN THE Fabric_Mod_Manager SHALL display an error message and prevent game launch

### Requirement 5

**User Story:** As a Minecraft player, I want the launcher to only support Fabric for modding, so that I have a simple and focused modding experience.

#### Acceptance Criteria

1. THE Fabric_Mod_Manager SHALL support only Fabric mod loader installation
2. THE Fabric_Mod_Manager SHALL not provide options for Forge, Quilt, or other mod loaders
3. WHEN creating a modded profile, THE Fabric_Mod_Manager SHALL automatically select Fabric as the mod loader
4. THE Fabric_Mod_Manager SHALL download and install the appropriate Fabric loader version for the selected Minecraft version
5. THE Fabric_Mod_Manager SHALL validate that Fabric is compatible with the selected Minecraft version

### Requirement 6

**User Story:** As a Minecraft player, I want to skip the mod selection dialog if I'm in a hurry, so that I can launch quickly with my saved preferences.

#### Acceptance Criteria

1. THE Mod_Toggle_Dialog SHALL include a "Launch with current settings" button
2. THE Mod_Toggle_Dialog SHALL include a "Don't ask again" checkbox option
3. WHERE the user has selected "Don't ask again", THE Fabric_Mod_Manager SHALL skip the Mod_Toggle_Dialog on subsequent launches
4. THE Fabric_Mod_Manager SHALL provide a way to re-enable the Mod_Toggle_Dialog from profile settings
5. WHEN "Don't ask again" is enabled, THE Fabric_Mod_Manager SHALL apply the last saved Mod_State configuration automatically
