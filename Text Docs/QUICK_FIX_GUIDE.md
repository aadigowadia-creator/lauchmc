# Quick Fix Guide: Minecraft 1.21.5 Java 21 Error

## The Error You're Seeing

```
Error: LinkageError occurred while loading main class net.minecraft.client.main.Main
java.lang.UnsupportedClassVersionError: net/minecraft/client/main/Main has been compiled by a more recent version of the Java Runtime (class file version 65.0), this version of the Java Runtime only recognizes class file versions up to 61.0
```

**Translation**: Minecraft 1.21.5 needs Java 21, but your launcher is using Java 17.

## The Fix (3 Steps)

### Step 1: Download Java 21 Runtime

Run this command in your project directory:

```bash
npm run prepare:jre
```

This will:
- Download Java 8, 17, and 21 from Eclipse Temurin
- Compress them into .7z archives
- Generate checksums
- Place everything in `resources/runtimes/`

**Time**: 5-10 minutes (depending on internet speed)

### Step 2: Verify Files Were Created

Check that these files exist in `resources/runtimes/`:
- ✅ `java-8-windows-x64.7z`
- ✅ `java-17-windows-x64.7z`
- ✅ `java-21-windows-x64.7z` ← **NEW!**
- ✅ `manifest.json`

### Step 3: Rebuild the Application

```bash
npm run build
npm run package:win
```

## What Was Changed in the Code

I've already updated these files for you:

1. **`src/main/services/java-service.ts`**
   - Now returns Java 21 for Minecraft 1.21+
   - Updated fallback logic

2. **`src/main/services/bundled-java-service.ts`**
   - Added Java 21 extraction support
   - Updated manifest handling

3. **`scripts/download-jre.js`**
   - Added Java 21 download URL

4. **`scripts/compress-jre.js`**
   - Added Java 21 compression

5. **Documentation**
   - Updated all docs to mention Java 21

## Testing After Rebuild

1. Install the rebuilt launcher
2. Create/select a Minecraft 1.21.5 profile
3. Launch the game
4. It should now work! ✅

## If You Don't Want to Bundle Java 21

If you prefer users to install Java 21 themselves:

1. Skip the `npm run prepare:jre` step
2. The launcher will automatically use system Java 21 if available
3. Users will need to install Java 21 from: https://adoptium.net/

## Troubleshooting

### "npm run prepare:jre" fails

**Check**:
- Internet connection
- Disk space (need ~500 MB free)
- Node.js version (need 18+)

**Try**:
```bash
npm install
npm run prepare:jre
```

### Java 21 archive not created

**Check**:
- Look in `downloads/jre/` for `jre-21-windows-x64.zip`
- Check console output for errors
- Try running download and compress separately:
  ```bash
  npm run prepare:jre:download
  npm run prepare:jre:compress
  ```

### Game still crashes with same error

**Check**:
- Did you rebuild after running `prepare:jre`?
- Is `java-21-windows-x64.7z` in the built app's resources?
- Check launcher logs for Java version being used

## Version Mapping Reference

| Minecraft Version | Required Java |
|-------------------|---------------|
| 1.21+             | Java 21       |
| 1.17 - 1.20       | Java 17       |
| 1.16 and older    | Java 8        |

## Need More Details?

See `JAVA_21_FIX.md` for complete technical details.
