# Bundled Java Runtimes

This directory contains compressed Java Runtime Environments (JRE) that are bundled with the Minecraft Launcher for Windows x64.

## Contents

After running `npm run prepare:jre`, this directory will contain:

- `java-8-windows-x64.7z` - Java 8 JRE compressed archive
- `java-17-windows-x64.7z` - Java 17 JRE compressed archive
- `java-21-windows-x64.7z` - Java 21 JRE compressed archive
- `manifest.json` - Runtime metadata including versions and checksums

## Purpose

These bundled runtimes eliminate the need for users to install Java separately. The launcher will:

1. Extract these runtimes on first launch to the user data directory
2. Verify runtime integrity using checksums from the manifest
3. Automatically select the appropriate Java version based on the Minecraft version being launched

## Preparation

To download and prepare the runtimes:

```bash
npm run prepare:jre
```

See `scripts/README.md` for detailed information about the preparation process.

## Build Integration

These files are automatically included in Windows builds via the electron-builder configuration in `package.json`:

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

## Runtime Extraction

On first launch, the `BundledJavaService` will:

1. Check if runtimes are already extracted in the user data directory
2. If not, extract the compressed archives from this directory
3. Verify extracted files using SHA256 checksums
4. Test each runtime by executing `java.exe -version`
5. Create a local manifest in the user data directory

## File Sizes

Approximate sizes:
- Java 8: ~40-50 MB compressed, ~100-150 MB extracted
- Java 17: ~50-60 MB compressed, ~150-200 MB extracted
- Java 21: ~50-60 MB compressed, ~150-200 MB extracted
- Total: ~150-170 MB compressed, ~400-500 MB extracted

## Updating Runtimes

To update to newer JRE versions:

1. Delete the compressed archives and manifest from this directory
2. Run `npm run prepare:jre` to download the latest versions
3. Rebuild the application

The preparation scripts automatically fetch the latest LTS versions from Eclipse Temurin.

## Platform Support

Currently, only Windows x64 runtimes are bundled. Users on other platforms (macOS, Linux) will need to have Java installed on their system.

## Verification

The manifest.json file contains SHA256 checksums for each runtime. The launcher uses these checksums to verify:

1. The compressed archives before extraction
2. The extracted files after extraction

This ensures runtime integrity and prevents corruption issues.

## Troubleshooting

### Missing Runtimes

If the compressed archives are missing during build:
1. Run `npm run prepare:jre` to download and prepare them
2. Ensure the files are not excluded by `.gitignore`
3. Check that the `resources/runtimes/` directory exists

### Build Size Too Large

The bundled runtimes add approximately 150-170 MB to the Windows installer. This is expected and necessary for the bundled Java feature.

### Extraction Fails

If runtime extraction fails on user machines:
- The launcher will fall back to system Java installations
- Users can reinstall the launcher to get fresh runtime archives
- Check the launcher logs for specific error messages
