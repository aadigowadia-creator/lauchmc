# Java 21 Support Fix for Minecraft 1.21.5

## Problem
Minecraft 1.21.5 requires Java 21 (class file version 65.0), but the launcher was only configured to use Java 17 for Minecraft 1.17+, causing this error:

```
Error: LinkageError occurred while loading main class net.minecraft.client.main.Main
java.lang.UnsupportedClassVersionError: net/minecraft/client/main/Main has been compiled by a more recent version of the Java Runtime (class file version 65.0), this version of the Java Runtime only recognizes class file versions up to 61.0
```

## Solution
Added Java 21 support to the launcher with proper version mapping for Minecraft 1.21+.

## Changes Made

### 1. Updated Java Version Mapping (`src/main/services/java-service.ts`)
- Modified `getRequiredJavaVersion()` to return Java 21 for Minecraft 1.21+
- Updated fallback logic to try Java 21 first, then 17, then 8

### 2. Added Java 21 to Download Script (`scripts/download-jre.js`)
- Added Java 21 download URL from Eclipse Temurin
- Downloads `jre-21-windows-x64.zip`

### 3. Added Java 21 to Compression Script (`scripts/compress-jre.js`)
- Added Java 21 processing
- Updated manifest generation to include Java 21
- Updated size calculations

### 4. Updated Bundled Java Service (`src/main/services/bundled-java-service.ts`)
- Added Java 21 to RuntimeManifest interface
- Added Java 21 extraction check during initialization
- Added Java 21 to manifest creation
- Added Java 21 to runtime info loading

## Next Steps

To complete the fix, you need to download and bundle Java 21:

```bash
# 1. Download Java 21 runtime
npm run prepare:jre

# 2. This will:
#    - Download Java 8, 17, and 21 from Eclipse Temurin
#    - Compress them into .7z archives
#    - Generate checksums and manifest
#    - Place files in resources/runtimes/

# 3. Rebuild the application
npm run build
npm run package:win
```

## Expected Files After Running prepare:jre

```
resources/runtimes/
├── java-8-windows-x64.7z      (~40-50 MB)
├── java-17-windows-x64.7z     (~50-60 MB)
├── java-21-windows-x64.7z     (~50-60 MB)
└── manifest.json              (with checksums for all three)
```

## Version Mapping

The launcher now uses this Java version mapping:

- **Minecraft 1.21+**: Java 21
- **Minecraft 1.17-1.20**: Java 17
- **Minecraft 1.16 and older**: Java 8

## Testing

After rebuilding with Java 21 bundled:

1. Launch Minecraft 1.21.5
2. The launcher should automatically select Java 21
3. The game should start without the class version error

## Fallback Behavior

If Java 21 is not available:
1. Launcher tries bundled Java 21 first
2. Falls back to system Java installations
3. If no compatible Java found, tries bundled Java 17, then Java 8
4. Shows error if no Java available

## Build Size Impact

Adding Java 21 increases the installer size by approximately 50-60 MB compressed.

Total bundled Java size:
- Compressed (in installer): ~150-170 MB
- Extracted (on user's disk): ~400-500 MB
