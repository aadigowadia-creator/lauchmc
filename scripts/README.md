# JRE Preparation Scripts

This directory contains scripts for downloading and preparing Java Runtime Environments (JRE) for bundling with the Minecraft Launcher.

## Overview

The launcher bundles Java 8 and Java 17 runtimes to eliminate the need for users to install Java separately. These scripts automate the process of downloading, compressing, and preparing the JRE distributions.

## Prerequisites

- Node.js installed
- Internet connection for downloading JRE distributions
- (Optional) 7-Zip installed at `C:\Program Files\7-Zip\7z.exe` for better compression
  - If 7-Zip is not available, the script will fall back to ZIP compression

## Scripts

### 1. download-jre.js

Downloads Eclipse Temurin JRE distributions for Windows x64.

**What it does:**
- Downloads JRE 8 (latest LTS) for Windows x64
- Downloads JRE 17 (latest LTS) for Windows x64
- Calculates SHA256 checksums for verification
- Saves downloads to `downloads/jre/`
- Creates `checksums.json` with download information

**Usage:**
```bash
npm run prepare:jre:download
# or
node scripts/download-jre.js
```

**Output:**
- `downloads/jre/jre-8-windows-x64.zip`
- `downloads/jre/jre-17-windows-x64.zip`
- `downloads/jre/checksums.json`

### 2. compress-jre.js

Extracts, compresses, and prepares JRE distributions for bundling.

**What it does:**
- Extracts downloaded JRE ZIP files
- Identifies the JRE directory structure
- Compresses JRE using 7-Zip (or ZIP if 7-Zip unavailable)
- Calculates SHA256 checksums for compressed files
- Creates `manifest.json` with runtime metadata
- Stores compressed runtimes in `resources/runtimes/`

**Usage:**
```bash
npm run prepare:jre:compress
# or
node scripts/compress-jre.js
```

**Output:**
- `resources/runtimes/java-8-windows-x64.7z`
- `resources/runtimes/java-17-windows-x64.7z`
- `resources/runtimes/manifest.json`

### 3. Combined Workflow

Run both scripts in sequence:

```bash
npm run prepare:jre
```

This will:
1. Download JRE distributions
2. Compress and prepare them for bundling
3. Create the manifest file

## Directory Structure

After running the scripts, you'll have:

```
downloads/
└── jre/
    ├── jre-8-windows-x64.zip
    ├── jre-17-windows-x64.zip
    └── checksums.json

resources/
└── runtimes/
    ├── java-8-windows-x64.7z
    ├── java-17-windows-x64.7z
    └── manifest.json
```

## Manifest Format

The `manifest.json` file contains metadata about the bundled runtimes:

```json
{
  "version": "1.0.0",
  "created": "2024-01-13T...",
  "runtimes": {
    "java8": {
      "version": "1.8.0_...",
      "checksum": "sha256...",
      "filename": "java-8-windows-x64.7z",
      "size": 12345678,
      "extractedPath": "java-8"
    },
    "java17": {
      "version": "17.0.9+...",
      "checksum": "sha256...",
      "filename": "java-17-windows-x64.7z",
      "size": 23456789,
      "extractedPath": "java-17"
    }
  }
}
```

## Build Integration

The compressed runtimes in `resources/runtimes/` are automatically included in the Electron build via the `extraResources` configuration in `package.json`.

During the build process:
1. Electron Builder copies `resources/runtimes/` to the app resources
2. On first launch, the launcher extracts the compressed runtimes to the user data directory
3. The launcher verifies runtime integrity using checksums from the manifest

## Troubleshooting

### Download Fails

- Check your internet connection
- The script uses the Adoptium API which may have rate limits
- Try running the download script again

### Compression Fails

- Ensure you have write permissions in the project directory
- Check available disk space (need ~500MB for extraction)
- If 7-Zip fails, the script will fall back to ZIP compression

### Missing Dependencies

If you get module errors, install dependencies:

```bash
npm install
```

## Notes

- Downloads are cached - if files already exist, they won't be re-downloaded
- Compressed files are cached - if they exist, they won't be re-compressed
- The scripts are idempotent - safe to run multiple times
- Total compressed size is approximately 100-110 MB
- Extracted size is approximately 250-350 MB

## Updating JRE Versions

To update to newer JRE versions:

1. Delete the `downloads/jre/` directory
2. Delete the `resources/runtimes/` directory
3. Run `npm run prepare:jre` to download and compress the latest versions

The scripts automatically fetch the latest LTS versions from Eclipse Temurin.
