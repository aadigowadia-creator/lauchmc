# Bundled Java Runtime Setup Guide

This guide explains how to prepare the bundled Java runtimes for the Minecraft Launcher.

## Quick Start

To download and prepare Java runtimes for bundling:

```bash
npm install
npm run prepare:jre
```

That's it! The runtimes are now ready to be included in your Windows builds.

## What This Does

The `prepare:jre` script will:

1. **Download** Eclipse Temurin JRE distributions:
   - Java 8 (latest LTS) for Windows x64
   - Java 17 (latest LTS) for Windows x64
   - Java 21 (latest LTS) for Windows x64

2. **Compress** the runtimes:
   - Uses 7-Zip if available (better compression)
   - Falls back to ZIP compression if 7-Zip not found

3. **Generate** checksums and metadata:
   - SHA256 checksums for verification
   - Runtime version information
   - Manifest file for the launcher

4. **Store** in `resources/runtimes/`:
   - `java-8-windows-x64.7z` (~40-50 MB)
   - `java-17-windows-x64.7z` (~50-60 MB)
   - `java-21-windows-x64.7z` (~50-60 MB)
   - `manifest.json` (metadata)

## When to Run This

You need to run `npm run prepare:jre` in these situations:

- **First time setup**: Before building the application for the first time
- **Updating Java versions**: When you want to bundle newer JRE versions
- **After cleaning**: If you've deleted the `resources/runtimes/` directory

You do **NOT** need to run this:
- Every time you build the application (runtimes are cached)
- When building for macOS or Linux (Windows only feature)
- During development (unless testing bundled Java functionality)

## Build Integration

The prepared runtimes are automatically included in Windows builds. The electron-builder configuration in `package.json` handles this:

```json
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
```

## How It Works at Runtime

When a user installs and runs the launcher:

1. **First Launch**: The launcher detects that runtimes haven't been extracted yet
2. **Extraction**: Compressed runtimes are extracted to the user data directory
3. **Verification**: SHA256 checksums verify runtime integrity
4. **Testing**: Each runtime is tested with `java.exe -version`
5. **Ready**: Runtimes are now available for launching Minecraft

## File Locations

### During Development/Build

```
resources/
└── runtimes/
    ├── java-8-windows-x64.7z
    ├── java-17-windows-x64.7z
    ├── java-21-windows-x64.7z
    └── manifest.json
```

### In Built Application

```
<app-resources>/
└── runtimes/
    ├── java-8-windows-x64.7z
    ├── java-17-windows-x64.7z
    ├── java-21-windows-x64.7z
    └── manifest.json
```

### On User's Machine (after extraction)

```
<userData>/
└── runtimes/
    ├── java-8/
    │   ├── bin/
    │   │   └── java.exe
    │   └── lib/
    ├── java-17/
    │   ├── bin/
    │   │   └── java.exe
    │   └── lib/
    ├── java-21/
    │   ├── bin/
    │   │   └── java.exe
    │   └── lib/
    └── manifest.json
```

## Requirements

### System Requirements

- **Node.js**: 18 or higher
- **Internet**: For downloading JRE distributions
- **Disk Space**: ~500 MB free space during preparation
- **7-Zip** (optional): For better compression
  - Install at: `C:\Program Files\7-Zip\7z.exe`
  - Without 7-Zip, ZIP compression is used (slightly larger files)

### Dependencies

The scripts use these npm packages:
- `adm-zip`: For ZIP compression (fallback)
- Built-in Node.js modules: `https`, `fs`, `crypto`, `child_process`

## Troubleshooting

### Download Fails

**Problem**: Script fails to download JRE distributions

**Solutions**:
- Check your internet connection
- Try running the script again (downloads are cached)
- Check if Adoptium API is accessible: https://api.adoptium.net

### Compression Fails

**Problem**: Script fails during compression

**Solutions**:
- Check available disk space (~500 MB needed)
- Verify write permissions in the project directory
- If using 7-Zip, ensure it's installed at `C:\Program Files\7-Zip\7z.exe`
- Script will automatically fall back to ZIP if 7-Zip fails

### Module Not Found

**Problem**: `Error: Cannot find module 'adm-zip'`

**Solution**:
```bash
npm install
```

### Runtimes Not Included in Build

**Problem**: Built application doesn't include Java runtimes

**Solutions**:
- Verify files exist in `resources/runtimes/`
- Check electron-builder configuration in `package.json`
- Ensure you're building for Windows (runtimes are Windows-only)
- Check build logs for errors

## Advanced Usage

### Separate Steps

Run download and compression separately:

```bash
# Download only
npm run prepare:jre:download

# Compress only (requires downloads to exist)
npm run prepare:jre:compress
```

### Updating to Newer Versions

To get the latest JRE versions:

```bash
# Delete existing runtimes
rm -rf downloads/jre
rm -rf resources/runtimes/*.7z
rm -rf resources/runtimes/manifest.json

# Download and prepare latest versions
npm run prepare:jre
```

### Manual Download

If you prefer to download JRE distributions manually:

1. Download from [Adoptium](https://adoptium.net/):
   - Eclipse Temurin JRE 8 for Windows x64
   - Eclipse Temurin JRE 17 for Windows x64
   - Eclipse Temurin JRE 21 for Windows x64

2. Place ZIP files in `downloads/jre/`:
   - `jre-8-windows-x64.zip`
   - `jre-17-windows-x64.zip`
   - `jre-21-windows-x64.zip`

3. Run compression only:
   ```bash
   npm run prepare:jre:compress
   ```

## Platform Support

### Windows x64 ✅

Fully supported. Bundled runtimes are included in Windows builds.

### macOS ❌

Not currently supported. Users need Java installed on their system.

### Linux ❌

Not currently supported. Users need Java installed on their system.

## Size Impact

Adding bundled Java runtimes increases the Windows installer size:

- **Compressed** (in installer): ~150-170 MB
- **Extracted** (on user's disk): ~400-500 MB

This is acceptable for modern systems and provides a much better user experience by eliminating Java installation requirements.

## CI/CD Integration

If using CI/CD for builds, add this step before building:

```yaml
- name: Prepare Java Runtimes
  run: npm run prepare:jre
  
- name: Build Application
  run: npm run package:win
```

Note: You may want to cache the `resources/runtimes/` directory to avoid re-downloading on every build.

## Additional Resources

- **Scripts Documentation**: See `scripts/README.md` for detailed script information
- **Build Guide**: See `BUILD.md` for complete build instructions
- **Design Document**: See `.kiro/specs/bundled-java/design.md` for architecture details
- **Eclipse Temurin**: https://adoptium.net/ for JRE information

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the scripts documentation in `scripts/README.md`
3. Check the bundled Java design document in `.kiro/specs/bundled-java/`
