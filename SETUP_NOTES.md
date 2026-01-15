# Setup Notes

## Important: Install electron-updater

After completing the implementation, you need to install the `electron-updater` package:

```bash
npm install electron-updater
```

This package is required for the auto-update functionality implemented in task 10.2.

## What Was Implemented

### Task 10.1: Connect all services through IPC ✅

All services are now fully connected through IPC:

- **Authentication Service** - Login, logout, session management
- **Profile Management** - CRUD operations for profiles
- **Version Management** - Download, install, and manage Minecraft versions
- **Game Launcher** - Launch and monitor game processes
- **Mod Loader Service** - Install and manage Forge, Fabric, Quilt
- **Error Logging** - Centralized error reporting

**Files Modified:**
- `src/main/main.ts` - Removed unused import
- `src/__tests__/ipc-integration.test.ts` - Added integration tests

### Task 10.2: Add application packaging and distribution ✅

Complete packaging and distribution setup:

**Configuration:**
- Enhanced `package.json` with comprehensive build configuration
- Added platform-specific build targets (Windows, macOS, Linux)
- Configured NSIS installer for Windows
- Set up DMG creation for macOS
- Configured AppImage, DEB, and RPM for Linux
- Added auto-update configuration

**Auto-Updater:**
- Created `src/main/services/auto-updater-service.ts`
- Integrated auto-updater into main process
- Added IPC handlers for update operations
- Exposed update API in preload script
- Automatic update checking on startup
- User-prompted download and installation

**Build Resources:**
- Created `build/entitlements.mac.plist` for macOS signing
- Added `build/ICONS_README.md` with icon creation guide
- Created `.github/workflows/build.yml` for CI/CD

**Documentation:**
- `BUILD.md` - Comprehensive build and distribution guide
- `DEPLOYMENT.md` - Detailed deployment procedures
- `INSTALLATION.md` - Installation and setup instructions
- `QUICKSTART.md` - Quick start guide for users and developers
- `CHANGELOG.md` - Version history and planned features
- Updated `README.md` with complete project information

**Files Created:**
- `src/main/services/auto-updater-service.ts`
- `build/entitlements.mac.plist`
- `build/ICONS_README.md`
- `build/.gitkeep`
- `.github/workflows/build.yml`
- `BUILD.md`
- `DEPLOYMENT.md`
- `INSTALLATION.md`
- `QUICKSTART.md`
- `CHANGELOG.md`

**Files Modified:**
- `package.json` - Enhanced build configuration and scripts
- `src/main/main.ts` - Integrated auto-updater
- `src/main/preload.ts` - Added update API
- `src/main/services/index.ts` - Exported auto-updater service
- `.gitignore` - Updated to handle build resources
- `README.md` - Comprehensive project documentation

## Next Steps

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Create Application Icons:**
   - Follow instructions in `build/ICONS_README.md`
   - Place icons in `build/` directory:
     - `icon.ico` (Windows)
     - `icon.icns` (macOS)
     - `icon.png` (Linux)

3. **Test the Build:**
   ```bash
   npm run build
   npm run package
   ```

4. **Configure Auto-Updates:**
   - Update the `publish` section in `package.json` with your repository details
   - Set up GitHub releases or another update server

5. **Set Up CI/CD:**
   - Configure GitHub secrets for code signing (if needed)
   - Push code to trigger automated builds

## Build Scripts Available

- `npm run dev` - Development mode
- `npm run build` - Build for production
- `npm run package` - Package for current platform
- `npm run package:win` - Package for Windows
- `npm run package:mac` - Package for macOS
- `npm run package:linux` - Package for Linux
- `npm run package:all` - Package for all platforms
- `npm run release` - Build and publish updates

## Distribution Formats

### Windows
- NSIS Installer (`.exe`)
- Portable executable (`.exe`)

### macOS
- DMG disk image (`.dmg`)
- ZIP archive (`.zip`)

### Linux
- AppImage (`.AppImage`)
- Debian package (`.deb`)
- RPM package (`.rpm`)

## Auto-Update Flow

1. App checks for updates 3 seconds after launch
2. If update available, user is prompted to download
3. Update downloads in background with progress
4. User is prompted to restart and install
5. App restarts and applies update automatically

## Code Signing

For production releases, you should sign your applications:

**Windows:**
- Obtain a code signing certificate
- Set `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables

**macOS:**
- Join Apple Developer Program
- Create signing certificates
- Set `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, and `APPLE_ID_PASSWORD`

See `DEPLOYMENT.md` for detailed instructions.

## Testing

Before deploying:

1. Run tests: `npm test`
2. Run linter: `npm run lint`
3. Build application: `npm run build`
4. Package application: `npm run package`
5. Test packaged app on clean system
6. Verify all features work
7. Test auto-update (if configured)

## Documentation

All documentation is now complete:

- **README.md** - Project overview and quick start
- **QUICKSTART.md** - User and developer quick start
- **INSTALLATION.md** - Detailed installation guide
- **BUILD.md** - Building and packaging guide
- **DEPLOYMENT.md** - Deployment and distribution guide
- **CHANGELOG.md** - Version history
- **build/ICONS_README.md** - Icon creation guide

## Troubleshooting

### electron-updater not found

Install the package:
```bash
npm install electron-updater
```

### Build fails

Clear cache and rebuild:
```bash
rm -rf node_modules dist release
npm install
npm run build
```

### Icons not showing

Ensure icon files exist in `build/` directory with correct names.

### Auto-update not working

- Check `publish` configuration in `package.json`
- Ensure app is running in production mode
- Verify update server is accessible

## Support

For issues or questions:
- Check documentation files
- Review error messages
- Search GitHub issues
- Create new issue with details

---

**Implementation Complete! 🎉**

The Minecraft Launcher is now fully integrated with comprehensive packaging and distribution setup. Follow the next steps above to complete the setup and start building distributable packages.
