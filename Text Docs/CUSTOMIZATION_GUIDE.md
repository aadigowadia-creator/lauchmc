# Launcher Customization Guide

Two easy batch scripts to customize your Minecraft launcher!

## Option 1: Interactive Menu (`customize-launcher.bat`)

Double-click `customize-launcher.bat` for an interactive menu:

```
========================================
  Minecraft Launcher Customizer
========================================

What would you like to customize?

1. Change launcher name
2. Change app ID
3. Change product name (window title)
4. Change author name
5. Change description
6. View current settings
7. Exit
```

Just select a number and follow the prompts!

## Option 2: Quick Commands (`quick-customize.bat`)

Use from command line for quick changes:

### Change Launcher Name
```batch
quick-customize.bat changename "My Custom Launcher"
```

### Change App ID
```batch
quick-customize.bat changeappid "com.myname.launcher"
```

### Change Product Name (Window Title)
```batch
quick-customize.bat changeproduct "My Minecraft Launcher"
```

### Change Author
```batch
quick-customize.bat changeauthor "Your Name"
```

### Change Description
```batch
quick-customize.bat changedesc "My custom Minecraft launcher"
```

### View Current Settings
```batch
quick-customize.bat view
```

## What Each Setting Does

| Setting | What It Changes | Example |
|---------|----------------|---------|
| **Name** | Package name (internal) | `minecraft-launcher` → `my-launcher` |
| **App ID** | Application identifier | `com.minecraft.launcher` → `com.myname.launcher` |
| **Product Name** | Window title & app name | `Minecraft Launcher` → `My Custom Launcher` |
| **Author** | Creator name in about | `Your Name` → `John Doe` |
| **Description** | App description | `A Minecraft launcher` → `My custom launcher` |

## After Customizing

**Important**: After making changes, rebuild the app:

```batch
npm run build
```

Or to build the installer:

```batch
npm run package:win
```

## Examples

### Example 1: Rebrand Completely
```batch
quick-customize.bat changename "epic-mc-launcher"
quick-customize.bat changeappid "com.epicgames.mclauncher"
quick-customize.bat changeproduct "Epic MC Launcher"
quick-customize.bat changeauthor "Epic Games"
quick-customize.bat changedesc "The most epic Minecraft launcher"
npm run build
```

### Example 2: Personal Launcher
```batch
quick-customize.bat changename "johns-minecraft"
quick-customize.bat changeproduct "John's Minecraft"
quick-customize.bat changeauthor "John Doe"
npm run build
```

### Example 3: Check What You Changed
```batch
quick-customize.bat view
```

Output:
```
========================================
  Current Launcher Settings
========================================

Name:           johns-minecraft
App ID:         com.minecraft.launcher
Product Name:   John's Minecraft
Author:         John Doe
Description:    A custom Minecraft launcher
```

## Tips

1. **Use quotes** for names with spaces: `"My Launcher"`
2. **App ID format**: Use reverse domain notation like `com.yourname.launcher`
3. **Product Name** is what users see in the window title
4. **Always rebuild** after making changes
5. **Test in dev mode** first: `npm run dev`

## Troubleshooting

### "Node is not recognized"
Make sure Node.js is installed and in your PATH.

### Changes don't appear
Run `npm run build` after making changes.

### Want to reset?
Just edit `package.json` manually or use the scripts to change back to original values.

## Original Values

If you want to restore defaults:

```batch
quick-customize.bat changename "minecraft-launcher"
quick-customize.bat changeappid "com.minecraft.launcher"
quick-customize.bat changeproduct "Minecraft Launcher"
quick-customize.bat changeauthor "Your Name"
quick-customize.bat changedesc "A custom Minecraft launcher built with Electron"
npm run build
```
