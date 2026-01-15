# Changelog

All notable changes to the Minecraft Launcher will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-13

### Added
- Initial release of Minecraft Launcher
- Microsoft account authentication with OAuth
- Automatic token refresh and session management
- Version management system
  - Browse and filter Minecraft versions (releases, snapshots)
  - Download and install game versions
  - Progress tracking for downloads
  - File integrity verification
- Profile management
  - Create, edit, duplicate, and delete profiles
  - Configure memory allocation (min/max)
  - Custom JVM arguments
  - Per-profile installation directories
- Game launcher functionality
  - Launch Minecraft with profile configurations
  - Java runtime detection and validation
  - Game process monitoring
  - Crash detection and reporting
- Mod loader support
  - Forge, Fabric, and Quilt integration
  - Automatic mod loader installation
  - Modded profile creation and management
- User interface
  - Modern, responsive React-based UI
  - Tab-based navigation (Launcher, Profiles, Versions)
  - Real-time game status updates
  - Toast notifications for operations
- Error handling and logging
  - Comprehensive error messages
  - Structured logging with Winston
  - Error boundary components
- Cross-platform support
  - Windows (NSIS installer and portable)
  - macOS (DMG and ZIP)
  - Linux (AppImage, DEB, RPM)
- Auto-update functionality
  - Automatic update checking on startup
  - Background download with progress
  - User-prompted installation

### Security
- Encrypted token storage using electron-store
- Secure OAuth flow implementation
- File integrity verification for downloads

## [Unreleased]

### Planned Features
- Mod management interface
- Custom skin support
- Server list management
- Resource pack management
- Shader support
- Performance monitoring
- Backup and restore functionality
- Multi-language support
- Dark/light theme toggle

---

## Version History

### Version Numbering

- **Major version** (X.0.0): Breaking changes or major feature additions
- **Minor version** (0.X.0): New features, backwards compatible
- **Patch version** (0.0.X): Bug fixes and minor improvements

### Release Types

- **Stable**: Fully tested releases for general use
- **Beta**: Feature-complete but may have bugs
- **Alpha**: Early releases for testing new features
