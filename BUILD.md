# Build and Distribution Guide

This guide explains how to build and distribute the Minecraft Launcher application.

## Prerequisites

- Node.js 18+ and npm
- Git
- Platform-specific requirements:
  - **Windows**: Windows 7+ (for building Windows installers)
  - **macOS**: macOS 10.13+ (for building macOS apps)
  - **Linux**: Any modern Linux distribution

### Additional Requirements for Windows Builds with Bundled Java

- **Internet connection**: For downloading JRE distributions (first time only)
- **Disk space**: ~500 MB free space for JRE preparation
- **7-Zip** (optional but recommended): For better compression
  - Install at: `C:\Program Files\7-Zip\7z.exe`
  - Without 7-Zip, ZIP compression is used (slightly larger files)

## Installation

Install dependencies:

```bash
npm install
```

## Preparing Bundled Java Runtimes

The launcher includes bundled Java runtimes (Java 8 and Java 17) for Windows x64 to eliminate the need for users to install Java separately. Before building the Windows application, you need to download and prepare these runtimes.

### Quick Start

Run the automated preparation script:

```bash
npm run prepare:jre
```

This will:
1. Download Eclipse Temurin JRE 8 and JRE 17 for Windows x64 from Adoptium
2. Extract and compress the runtimes using 7-Zip (or ZIP as fallback)
3. Generate SHA256 checksums for verification
4. Create a manifest file with runtime metadata
5. Store compressed runtimes in `resources/runtimes/`

### When to Run This

You need to run `npm run prepare:jre` in these situations:

- **First time setup**: Before building the Windows application for the first time
- **Updating Java versions**: When you want to bundle newer JRE versions
- **After cleaning**: If you've deleted the `resources/runtimes/` directory

You do **NOT** need to run this:
- Every time you build the application (runtimes are cached)
- When building for macOS or Linux (Windows only feature)
- During development (unless testing bundled Java functionality)

### What Gets Bundled

After preparation, the following files will be in `resources/runtimes/`:
- `java-8-windows-x64.7z` (~40-50 MB compressed, ~100-150 MB extracted)
- `java-17-windows-x64.7z` (~50-60 MB compressed, ~150-200 MB extracted)
- `manifest.json` (runtime metadata and checksums)

These files are automatically included in the Windows build via the electron-builder configuration.

### Compression Process

The preparation script uses the following compression strategy:

1. **Download**: Fetches the latest Eclipse Temurin JRE distributions from Adoptium API
2. **Extract**: Extracts the downloaded ZIP files to a temporary directory
3. **Compress**: 
   - **Preferred**: Uses 7-Zip with maximum compression (`-mx=9`) for smallest file size
   - **Fallback**: Uses Node.js ZIP compression if 7-Zip is not available
4. **Checksum**: Generates SHA256 checksums for each compressed runtime
5. **Manifest**: Creates `manifest.json` with version info and checksums

### Build Configuration Changes

The electron-builder configuration in `package.json` has been updated to include bundled runtimes:

```json
{
  "build": {
    "asarUnpack": [
      "resources/runtimes/**/*"
    ],
    "extraResources": [
      {
        "from": "resources/runtimes",
        "to": "runtimes",
        "filter": ["**/*"]
      }
    ]
  }
}
```

This ensures that:
- Runtimes are excluded from the asar archive (they need to be accessible as files)
- Runtimes are copied to the app resources directory in the built application
- All files in `resources/runtimes/` are included in Windows builds

### Platform Support

Currently, bundled Java runtimes are only supported for **Windows x64**. Users on other platforms will need to have Java installed on their system.

For more detailed information, see [BUNDLED_JAVA_SETUP.md](BUNDLED_JAVA_SETUP.md) and `scripts/README.md`.

## Development

Run the application in development mode:

```bash
npm run dev
```

This will:
- Start the Vite development server for the renderer process
- Compile and run the main process with hot reload

## Building

### Prepare Bundled Runtimes (Windows Only)

Before building for Windows, ensure you have prepared the bundled Java runtimes:

```bash
npm run prepare:jre
```

This step is only required once, or when you want to update to newer JRE versions. The compressed runtimes are cached in `resources/runtimes/` and will be included in all subsequent Windows builds.

**Note**: This step downloads JRE distributions from Adoptium (Eclipse Temurin) and compresses them. The process takes a few minutes on first run but is cached for future builds.

### Build for Current Platform

Build the application for your current platform:

```bash
npm run package
```

This will create distributable packages in the `release` directory.

### Build for Specific Platforms

Build for Windows:
```bash
npm run package:win
```

Build for macOS:
```bash
npm run package:mac
```

Build for Linux:
```bash
npm run package:linux
```

Build for all platforms:
```bash
npm run package:all
```

## Distribution Formats

### Windows
- **NSIS Installer** (`.exe`) - Full installer with options
- **Portable** (`.exe`) - Standalone executable

### macOS
- **DMG** (`.dmg`) - Disk image for easy installation
- **ZIP** (`.zip`) - Compressed application bundle

### Linux
- **AppImage** (`.AppImage`) - Universal Linux package
- **DEB** (`.deb`) - Debian/Ubuntu package
- **RPM** (`.rpm`) - Red Hat/Fedora package

## Auto-Updates

The application includes auto-update functionality using `electron-updater`.

### Configuration

Update the `publish` section in `package.json`:

```json
"publish": {
  "provider": "github",
  "owner": "your-username",
  "repo": "minecraft-launcher"
}
```

Supported providers:
- GitHub Releases
- Amazon S3
- Generic HTTP server

### Publishing Updates

1. Update version in `package.json`
2. Commit and tag the release:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
3. Build and publish:
   ```bash
   npm run release
   ```

This will build the app and upload to your configured provider.

### Update Flow

1. App checks for updates on startup (after 3 seconds)
2. If update available, user is prompted to download
3. Update downloads in background with progress indicator
4. User is prompted to restart and install
5. App restarts and applies update

## Code Signing

### Windows

For production releases, sign your Windows executables:

1. Obtain a code signing certificate
2. Set environment variables:
   ```bash
   set CSC_LINK=path/to/certificate.pfx
   set CSC_KEY_PASSWORD=your-password
   ```
3. Build with signing:
   ```bash
   npm run package:win
   ```

### macOS

For macOS distribution:

1. Join Apple Developer Program
2. Create certificates in Xcode
3. Set environment variables:
   ```bash
   export CSC_LINK=path/to/certificate.p12
   export CSC_KEY_PASSWORD=your-password
   export APPLE_ID=your-apple-id
   export APPLE_ID_PASSWORD=app-specific-password
   ```
4. Build with signing and notarization:
   ```bash
   npm run package:mac
   ```

## Application Icons

Place your application icons in the `build` directory:

- `icon.ico` - Windows (256x256 or multiple sizes)
- `icon.icns` - macOS (512x512@2x)
- `icon.png` - Linux (512x512)

See `build/ICONS_README.md` for detailed instructions on creating icons.

## Build Configuration

The build configuration is in `package.json` under the `build` key.

### Key Configuration Options

```json
{
  "build": {
    "appId": "com.minecraft.launcher",
    "productName": "Minecraft Launcher",
    "directories": {
      "output": "release",
      "buildResources": "build"
    },
    "files": [
      "dist/**/*",
      "node_modules/**/*"
    ]
  }
}
```

### Customization

- **App ID**: Unique identifier for your app
- **Product Name**: Display name of the application
- **Output Directory**: Where built packages are saved
- **Files**: What files to include in the package

## Testing Builds

Before distributing:

1. Test the built application:
   ```bash
   npm run package
   # Then run the built app from release/ directory
   ```

2. Test on clean systems without development tools
3. Test auto-update functionality
4. Verify all features work in production build

## Continuous Integration

### GitHub Actions Example

Create `.github/workflows/build.yml`:

```yaml
name: Build

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest, windows-latest]
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - run: npm install
      
      # Prepare bundled Java runtimes for Windows builds
      - name: Prepare Java Runtimes (Windows only)
        if: matrix.os == 'windows-latest'
        run: npm run prepare:jre
      
      - run: npm run package
      
      - uses: actions/upload-artifact@v3
        with:
          name: ${{ matrix.os }}-build
          path: release/
```

**Note**: Consider caching the `resources/runtimes/` directory to avoid re-downloading JRE distributions on every build:

```yaml
- name: Cache Java Runtimes
  if: matrix.os == 'windows-latest'
  uses: actions/cache@v3
  with:
    path: resources/runtimes
    key: jre-runtimes-${{ hashFiles('scripts/download-jre.js') }}
```

## Troubleshooting

### Build Fails

- Ensure all dependencies are installed: `npm install`
- Clear build cache: `rm -rf dist release`
- Check Node.js version: `node --version` (should be 18+)

### Icons Not Showing

- Verify icon files exist in `build/` directory
- Check icon file formats and sizes
- Rebuild after adding icons

### Auto-Update Not Working

- Ensure `publish` configuration is correct
- Check that app is running in production mode
- Verify update server is accessible
- Check console logs for errors

### Code Signing Issues

- Verify certificates are valid and not expired
- Check environment variables are set correctly
- Ensure you have necessary permissions/memberships

### Runtimes Not Included in Build

**Problem**: Built application doesn't include Java runtimes

**Solutions**:
- Verify files exist in `resources/runtimes/`
- Run `npm run prepare:jre` before building
- Check electron-builder configuration in `package.json`
- Ensure you're building for Windows (runtimes are Windows-only)
- Check build logs for errors

### JRE Download Fails

**Problem**: Script fails to download JRE distributions

**Solutions**:
- Check your internet connection
- Try running the script again (downloads are cached)
- Check if Adoptium API is accessible: https://api.adoptium.net
- Verify you have ~500 MB of free disk space

### Compression Fails

**Problem**: Script fails during compression

**Solutions**:
- Check available disk space (~500 MB needed)
- Verify write permissions in the project directory
- If using 7-Zip, ensure it's installed at `C:\Program Files\7-Zip\7z.exe`
- Script will automatically fall back to ZIP if 7-Zip fails

## Distribution Checklist

Before releasing:

- [ ] Update version in `package.json`
- [ ] Update CHANGELOG.md
- [ ] Test all features in development
- [ ] Prepare bundled Java runtimes (Windows): `npm run prepare:jre`
- [ ] Build for all target platforms
- [ ] Test built applications on clean systems
- [ ] Verify bundled Java works on Windows (first launch extraction)
- [ ] Verify auto-update works
- [ ] Create release notes
- [ ] Tag release in git
- [ ] Upload to distribution platform
- [ ] Announce release

## Resources

- [Electron Builder Documentation](https://www.electron.build/)
- [electron-updater Documentation](https://www.electron.build/auto-update)
- [Code Signing Guide](https://www.electron.build/code-signing)
- [Publishing Guide](https://www.electron.build/configuration/publish)
