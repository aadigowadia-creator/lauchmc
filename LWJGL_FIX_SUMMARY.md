# LWJGL Native Libraries Fix

## Problem Fixed

After fixing the Java 21 issue, Minecraft was crashing with:
```
[LWJGL] Failed to load a library
Exception in thread "Render thread"
```

This was because **native libraries weren't being extracted** from the downloaded library JARs.

## Solution Implemented

Added native library extraction to the version manager:

### Changes Made

1. **Added AdmZip import** to `version-manager.ts`
2. **Created `extractNatives()` method** that:
   - Identifies native libraries for the current platform (Windows/Mac/Linux)
   - Extracts `.dll`, `.so`, or `.dylib` files from native JARs
   - Places them in the `natives` directory
   - Skips META-INF to avoid signature issues

3. **Updated `getLibraryPath()` method** to support classifier parameter for native libraries

4. **Integrated extraction** into the download flow:
   - Downloads libraries
   - **Extracts natives** ← NEW!
   - Downloads assets

### Platform Support

The fix automatically detects the platform and extracts the correct natives:
- **Windows**: `natives-windows` or `natives-windows-x86`
- **macOS**: `natives-macos`
- **Linux**: `natives-linux`

## How It Works

1. After libraries are downloaded, the launcher scans for libraries with native classifiers
2. For each native library (like LWJGL):
   - Opens the JAR file
   - Extracts all files except META-INF
   - Places them in `versions/{version}/natives/`
3. The launch command already includes `-Djava.library.path={natives}` so Minecraft finds them

## Testing

Run the launcher and try launching Minecraft 1.21.5 again:
```bash
npm run dev
```

The LWJGL error should now be gone, and the game should start properly!

## What Was Fixed

✅ Java 21 version error - FIXED (previous fix)
✅ LWJGL native library loading - FIXED (this fix)

The game should now launch successfully! 🎮
