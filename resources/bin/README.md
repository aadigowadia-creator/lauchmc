# Bundled Binaries

This directory contains bundled executables needed by the launcher.

## 7z.exe

- **Purpose**: Used to extract compressed Java runtime archives (.7z files)
- **Source**: 7-Zip standalone executable (7zr.exe) from https://www.7-zip.org/
- **Version**: 7-Zip standalone console version
- **License**: GNU LGPL
- **Size**: ~600 KB

### Why Bundle 7-Zip?

The launcher includes bundled Java runtimes compressed with 7-Zip for optimal file size. To extract these runtimes on first launch, we need 7-Zip. Bundling the standalone executable ensures:

1. Users don't need to install 7-Zip separately
2. Extraction works out of the box on all Windows systems
3. Consistent extraction behavior across all installations

### Platform Support

- **Windows**: Uses bundled 7z.exe
- **macOS/Linux**: Uses system `7z` command (must be installed)

### Updating 7z.exe

To update to a newer version:

1. Download the latest 7zr.exe from https://www.7-zip.org/download.html
2. Replace `resources/bin/7z.exe` with the new version
3. Rebuild the application

### License Information

7-Zip is licensed under the GNU LGPL license. The standalone console version (7zr.exe) can be freely distributed with applications.

For more information, see: https://www.7-zip.org/license.txt
