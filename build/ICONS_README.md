# Application Icons

This directory should contain the application icons for different platforms.

## Required Icon Files

### Windows
- `icon.ico` - Windows icon file (256x256 or multiple sizes)

### macOS
- `icon.icns` - macOS icon file (512x512@2x recommended)

### Linux
- `icon.png` - PNG icon file (512x512 recommended)

## Creating Icons

### From PNG Source

If you have a source PNG image (recommended 1024x1024), you can use the following tools:

#### Windows (.ico)
Use online tools like:
- https://convertio.co/png-ico/
- https://icoconvert.com/

Or use ImageMagick:
```bash
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

#### macOS (.icns)
Use the `iconutil` command (macOS only):
```bash
# Create iconset directory
mkdir icon.iconset

# Generate different sizes
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png

# Convert to icns
iconutil -c icns icon.iconset
```

Or use online tools:
- https://cloudconvert.com/png-to-icns

#### Linux (.png)
Simply use a high-resolution PNG (512x512 or 1024x1024):
```bash
cp source-icon.png icon.png
```

## Placeholder Icons

Until you create custom icons, you can use placeholder icons or the default Electron icon.

## Design Guidelines

- Use a simple, recognizable design
- Ensure the icon looks good at small sizes (16x16, 32x32)
- Use transparency for non-rectangular shapes
- Test the icon on different backgrounds (light and dark)
- Follow platform-specific design guidelines:
  - Windows: Flat design with subtle shadows
  - macOS: Rounded corners, subtle gradients
  - Linux: Varies by desktop environment

## Recommended Tools

- **Adobe Illustrator** - Professional vector graphics
- **Figma** - Free online design tool
- **GIMP** - Free image editor
- **Inkscape** - Free vector graphics editor
- **Icon Slate** (macOS) - Icon creation tool
