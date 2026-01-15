# Complete Fix Instructions for Minecraft 1.21.5 Java 21 Error

## ✅ What's Already Done

Java 21 support has been successfully added to the launcher:

1. ✅ Java 21 downloaded (46.69 MB)
2. ✅ Java 21 compressed (47.01 MB)
3. ✅ Java 21 added to manifest with checksum
4. ✅ Code updated to use Java 21 for Minecraft 1.21+
5. ✅ All files ready in `resources/runtimes/`:
   - `java-8-windows-x64.7z` (38.90 MB)
   - `java-17-windows-x64.7z` (42.01 MB)
   - `java-21-windows-x64.7z` (47.01 MB) ← **NEW!**
   - `manifest.json` (with all checksums)

## 🔧 Remaining Issue: PowerShell Execution Policy

You're getting this error when running npm commands:
```
npm.ps1 cannot be loaded. The file is not digitally signed.
```

### Solution: Use .cmd Instead of .ps1

Run these commands **in your current PowerShell session**:

```powershell
Set-Alias -Name npm -Value "C:\Program Files\Bot.js\node-v22.18.0-win-x64 unzip\node-v22.18.0-win-x64\npm.cmd"
Set-Alias -Name npx -Value "C:\Program Files\Bot.js\node-v22.18.0-win-x64 unzip\node-v22.18.0-win-x64\npx.cmd"
```

**Note**: These aliases only work in the current session. You'll need to run them again if you close PowerShell.

### Alternative: Use CMD Instead

If the aliases don't work, use Command Prompt (CMD) instead of PowerShell:

1. Open Command Prompt (not PowerShell)
2. Navigate to your project: `cd C:\Users\aadig_crz48yb\Downloads\launchmc`
3. Run commands normally: `npm run dev`

## 🚀 Testing the Fix

### Option 1: Run in Development Mode

```bash
npm run dev
```

This will start the launcher in development mode. Test launching Minecraft 1.21.5 to verify Java 21 works.

### Option 2: Build and Test

```bash
npm run build
npm run package:win
```

**Note**: The build may fail due to sqlite3 native module compilation issues (requires Visual Studio Build Tools with Windows SDK). This is a separate issue from the Java 21 fix.

## 🎯 What Will Happen When You Launch Minecraft 1.21.5

1. Launcher detects Minecraft 1.21.5 requires Java 21
2. Checks if bundled Java 21 is extracted
3. If not extracted, extracts `java-21-windows-x64.7z` to user data directory
4. Verifies Java 21 with checksum
5. Launches Minecraft 1.21.5 with Java 21
6. **Game should start successfully!** ✅

## 📋 Version Mapping (Now Fixed)

| Minecraft Version | Java Version Used |
|-------------------|-------------------|
| 1.21+             | Java 21 ✅        |
| 1.17 - 1.20       | Java 17           |
| 1.16 and older    | Java 8            |

## 🐛 If Build Still Fails (sqlite3 Issue)

The sqlite3 build error is **separate** from the Java 21 fix. It requires:

1. Visual Studio Build Tools with Windows SDK
2. Or use development mode instead: `npm run dev`

The Java 21 fix will work in development mode without needing to build.

## ✅ Summary

**Java 21 Fix**: ✅ COMPLETE
- All code changes done
- Java 21 runtime bundled
- Ready to use

**PowerShell Issue**: Use CMD or set aliases as shown above

**Build Issue**: Use `npm run dev` to test without building, or install Visual Studio Build Tools

## 🎮 Quick Test

To quickly verify the fix works:

1. Open Command Prompt (CMD)
2. Run: `npm run dev`
3. Create a Minecraft 1.21.5 profile
4. Launch the game
5. It should work! 🎉
