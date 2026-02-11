# LWJGL Native Library Fix for Minecraft 1.8.9

## Problem Description

The launcher was experiencing crashes when launching Minecraft 1.8.9 with the error:
```
Exception in thread "main" java.lang.UnsatisfiedLinkError: no lwjgl64 in java.library.path
```

This error occurs because the LWJGL (Lightweight Java Game Library) native libraries were not being properly extracted or the `java.library.path` was not configured correctly for older Minecraft versions.

## Root Cause Analysis

1. **Legacy LWJGL Format**: Minecraft 1.8.9 uses LWJGL 2.9.x which has a different library structure than modern versions
2. **Native Library Detection**: The launcher wasn't properly identifying LWJGL platform libraries for extraction
3. **Missing Library Path Arguments**: Older LWJGL versions require additional JVM arguments beyond the standard `java.library.path`

## Solution Implemented

### 1. Enhanced Native Library Detection

Updated `GameProcessManager.ensureNativesExtracted()` to handle multiple LWJGL formats:

- **Modern format**: Libraries with `:natives-` classifier in name
- **Legacy format**: Libraries with `natives` field and `classifiers` in downloads
- **Very old format**: Libraries containing `lwjgl-platform` or `jinput-platform`

### 2. Improved Library Path Resolution

Added `getLegacyLWJGLPath()` method to handle the specific path format used by LWJGL 2.9.x:
- Handles `org.lwjgl.lwjgl:lwjgl-platform` libraries
- Handles `net.java.jinput:jinput-platform` libraries
- Provides fallback path resolution for missing libraries

### 3. Legacy Version Detection

Added `isLegacyMinecraftVersion()` method in `LaunchCommandBuilder` to detect Minecraft versions 1.12.2 and earlier that use LWJGL 2.9.x.

### 4. Additional JVM Arguments for Legacy Versions

For Minecraft 1.12.2 and earlier, the launcher now adds:
```
-Dorg.lwjgl.librarypath=/path/to/natives
-Dnet.java.games.input.librarypath=/path/to/natives
```

These arguments ensure LWJGL 2.9.x can find the native libraries even if the standard `java.library.path` fails.

### 5. Enhanced Error Detection and Recovery

- Added specific crash analysis for LWJGL `UnsatisfiedLinkError`
- Provides helpful error messages and solutions
- Added `forceNativesReextraction()` method to clear and re-extract natives

## Files Modified

1. **`src/main/services/game-process-manager.ts`**:
   - Enhanced `ensureNativesExtracted()` method
   - Added `getLegacyLWJGLPath()` method
   - Improved error detection in `generateCrashReport()`
   - Added `forceNativesReextraction()` method

2. **`src/main/services/launch-command-builder.ts`**:
   - Added legacy version detection
   - Added additional JVM arguments for LWJGL 2.9.x
   - Added `isLegacyMinecraftVersion()` helper method

3. **`src/__tests__/lwjgl-fix.test.ts`**:
   - Added comprehensive tests for the LWJGL fixes
   - Tests legacy version detection
   - Tests native library identification
   - Tests error detection and crash analysis

## Testing

The fix has been tested with:
- Minecraft 1.8.9 (legacy LWJGL 2.9.x)
- Minecraft 1.19.2 (modern LWJGL 3.x)
- Various error scenarios and crash conditions

## Usage

The fix is automatic and requires no user intervention. When launching Minecraft 1.8.9 or other legacy versions:

1. The launcher detects it's a legacy version
2. Adds appropriate LWJGL-specific JVM arguments
3. Properly extracts native libraries using the correct path format
4. Provides helpful error messages if issues occur

## Recovery Options

If LWJGL issues persist, users can:
1. Delete the `natives` folder in the version directory
2. Restart the launcher to re-extract natives
3. Use the `forceNativesReextraction()` method programmatically

## Compatibility

This fix maintains backward compatibility with:
- All Minecraft versions (1.6.1 through latest)
- All mod loaders (Forge, Fabric, Quilt)
- All Java versions (8, 17, 21)

The fix only adds the legacy LWJGL arguments for versions that actually need them, ensuring no impact on modern versions.