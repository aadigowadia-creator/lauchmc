# Deployment Guide

This guide covers deploying and distributing the Minecraft Launcher application.

## Table of Contents

- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Version Management](#version-management)
- [Building for Production](#building-for-production)
- [Code Signing](#code-signing)
- [Distribution Channels](#distribution-channels)
- [Auto-Update Setup](#auto-update-setup)
- [Continuous Deployment](#continuous-deployment)

## Pre-Deployment Checklist

Before deploying a new version:

- [ ] All tests pass (`npm test`)
- [ ] No linting errors (`npm run lint`)
- [ ] Code is formatted (`npm run format`)
- [ ] Version number updated in `package.json`
- [ ] CHANGELOG.md updated with changes
- [ ] README.md updated if needed
- [ ] All features tested manually
- [ ] Build succeeds on all target platforms
- [ ] Icons are present in `build/` directory
- [ ] Release notes prepared

## Version Management

### Semantic Versioning

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.1.0): New features, backwards compatible
- **PATCH** (0.0.1): Bug fixes

### Updating Version

```bash
# Patch version (1.0.0 -> 1.0.1)
npm version patch

# Minor version (1.0.0 -> 1.1.0)
npm version minor

# Major version (1.0.0 -> 2.0.0)
npm version major
```

This will:
1. Update version in `package.json`
2. Create a git commit
3. Create a git tag

### Manual Version Update

Edit `package.json`:

```json
{
  "version": "1.0.1"
}
```

Then commit and tag:

```bash
git add package.json
git commit -m "Bump version to 1.0.1"
git tag v1.0.1
```

## Building for Production

### Prerequisites

1. Install dependencies:
   ```bash
   npm install
   ```

2. Ensure icons are in place:
   - `build/icon.ico` (Windows)
   - `build/icon.icns` (macOS)
   - `build/icon.png` (Linux)

### Build Commands

#### Build for Current Platform

```bash
npm run package
```

Output: `release/` directory

#### Build for Specific Platforms

```bash
# Windows
npm run package:win

# macOS
npm run package:mac

# Linux
npm run package:linux
```

#### Build for All Platforms

```bash
npm run package:all
```

**Note**: Building for macOS requires macOS. Building for Windows works on any platform.

### Build Output

The `release/` directory will contain:

**Windows:**
- `Minecraft Launcher Setup X.X.X.exe` - NSIS installer
- `Minecraft Launcher X.X.X.exe` - Portable version

**macOS:**
- `Minecraft Launcher-X.X.X.dmg` - Disk image
- `Minecraft Launcher-X.X.X-mac.zip` - ZIP archive

**Linux:**
- `Minecraft Launcher-X.X.X.AppImage` - Universal package
- `minecraft-launcher_X.X.X_amd64.deb` - Debian package
- `minecraft-launcher-X.X.X.x86_64.rpm` - RPM package

## Code Signing

### Why Code Sign?

- Prevents security warnings
- Verifies application authenticity
- Required for auto-updates
- Builds user trust

### Windows Code Signing

#### Requirements

1. Code signing certificate (`.pfx` or `.p12`)
2. Certificate password

#### Setup

Set environment variables:

```bash
# Windows Command Prompt
set CSC_LINK=C:\path\to\certificate.pfx
set CSC_KEY_PASSWORD=your-password

# Windows PowerShell
$env:CSC_LINK="C:\path\to\certificate.pfx"
$env:CSC_KEY_PASSWORD="your-password"

# Linux/macOS
export CSC_LINK=/path/to/certificate.pfx
export CSC_KEY_PASSWORD=your-password
```

#### Build with Signing

```bash
npm run package:win
```

#### Obtaining a Certificate

Purchase from:
- DigiCert
- Sectigo (formerly Comodo)
- GlobalSign

Or use a free certificate from:
- Let's Encrypt (limited support)

### macOS Code Signing

#### Requirements

1. Apple Developer account ($99/year)
2. Developer ID Application certificate
3. App-specific password

#### Setup

1. Create certificates in Xcode or Apple Developer portal

2. Set environment variables:

```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=certificate-password
export APPLE_ID=your-apple-id@example.com
export APPLE_ID_PASSWORD=app-specific-password
export APPLE_TEAM_ID=your-team-id
```

3. Create app-specific password:
   - Go to appleid.apple.com
   - Sign in
   - Generate app-specific password

#### Build with Signing and Notarization

```bash
npm run package:mac
```

Electron Builder will automatically:
1. Sign the application
2. Create DMG
3. Notarize with Apple
4. Staple notarization ticket

#### Troubleshooting macOS Signing

If notarization fails:

```bash
# Check notarization status
xcrun altool --notarization-history 0 -u "your-apple-id" -p "app-password"

# Check specific notarization
xcrun altool --notarization-info <request-uuid> -u "your-apple-id" -p "app-password"
```

### Linux

Linux doesn't require code signing, but you can sign packages:

```bash
# Sign DEB package
dpkg-sig --sign builder minecraft-launcher_X.X.X_amd64.deb

# Sign RPM package
rpm --addsign minecraft-launcher-X.X.X.x86_64.rpm
```

## Distribution Channels

### GitHub Releases

#### Manual Upload

1. Create release on GitHub
2. Upload built packages
3. Write release notes
4. Publish release

#### Automated (Recommended)

Use GitHub Actions (see `.github/workflows/build.yml`):

1. Push tag:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```

2. GitHub Actions will:
   - Build for all platforms
   - Run tests
   - Create release
   - Upload artifacts

### Other Distribution Options

#### Microsoft Store (Windows)

1. Create Microsoft Partner Center account
2. Package as MSIX
3. Submit for review

#### Mac App Store

1. Create App Store Connect account
2. Configure app in App Store Connect
3. Build with Mac App Store provisioning
4. Submit via Xcode or Transporter

#### Snap Store (Linux)

1. Create snapcraft.yaml
2. Build snap package
3. Publish to Snap Store

#### Flatpak (Linux)

1. Create flatpak manifest
2. Build flatpak
3. Publish to Flathub

## Auto-Update Setup

### GitHub Releases (Recommended)

1. Configure in `package.json`:

```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "your-username",
      "repo": "minecraft-launcher"
    }
  }
}
```

2. Set GitHub token:

```bash
export GH_TOKEN=your-github-token
```

3. Build and publish:

```bash
npm run release
```

### Amazon S3

1. Configure in `package.json`:

```json
{
  "build": {
    "publish": {
      "provider": "s3",
      "bucket": "your-bucket-name",
      "region": "us-east-1"
    }
  }
}
```

2. Set AWS credentials:

```bash
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
```

### Generic HTTP Server

1. Configure in `package.json`:

```json
{
  "build": {
    "publish": {
      "provider": "generic",
      "url": "https://your-server.com/releases"
    }
  }
}
```

2. Upload files to server:
   - `latest.yml` (Windows/Linux)
   - `latest-mac.yml` (macOS)
   - Application packages

### Update Server Structure

```
releases/
├── latest.yml
├── latest-mac.yml
├── Minecraft-Launcher-Setup-1.0.0.exe
├── Minecraft-Launcher-1.0.0.dmg
└── Minecraft-Launcher-1.0.0.AppImage
```

### Testing Auto-Updates

1. Build version 1.0.0 and install
2. Build version 1.0.1 and publish
3. Run version 1.0.0
4. Check for updates
5. Verify update downloads and installs

## Continuous Deployment

### GitHub Actions Setup

The included workflow (`.github/workflows/build.yml`) provides:

- Automated builds on push
- Multi-platform builds
- Automated releases on tags
- Artifact uploads

### Customizing Workflow

Edit `.github/workflows/build.yml`:

```yaml
# Trigger on specific branches
on:
  push:
    branches:
      - main
      - release/*

# Add deployment steps
- name: Deploy to S3
  run: aws s3 sync release/ s3://your-bucket/
```

### Secrets Configuration

Add secrets in GitHub repository settings:

- `GH_TOKEN` - GitHub personal access token
- `CSC_LINK` - Base64 encoded certificate
- `CSC_KEY_PASSWORD` - Certificate password
- `APPLE_ID` - Apple ID for notarization
- `APPLE_ID_PASSWORD` - App-specific password

### Encoding Certificates for CI

```bash
# Encode certificate
base64 -i certificate.pfx -o certificate.txt

# Add to GitHub secrets as CSC_LINK
```

In workflow:

```yaml
- name: Decode certificate
  run: echo "${{ secrets.CSC_LINK }}" | base64 -d > certificate.pfx
```

## Post-Deployment

### Verification

After deployment:

1. Download from distribution channel
2. Install on clean system
3. Verify all features work
4. Test auto-update (if applicable)
5. Check for security warnings

### Monitoring

Monitor:
- Download statistics
- Crash reports
- User feedback
- Update adoption rate

### Rollback Plan

If issues are found:

1. Remove problematic release
2. Revert to previous version
3. Fix issues
4. Deploy patched version

### Communication

Announce release:
- GitHub release notes
- Project website
- Social media
- Email newsletter
- Discord/community channels

## Troubleshooting

### Build Fails

- Check Node.js version
- Clear cache: `rm -rf node_modules dist release`
- Reinstall: `npm install`
- Check error logs

### Code Signing Fails

- Verify certificate is valid
- Check environment variables
- Ensure certificate password is correct
- Check certificate expiration date

### Auto-Update Not Working

- Verify publish configuration
- Check update server is accessible
- Ensure version numbers are correct
- Check app is running in production mode

### Notarization Fails (macOS)

- Check Apple ID credentials
- Verify app-specific password
- Check notarization logs
- Ensure hardened runtime is enabled

## Best Practices

1. **Test thoroughly** before deploying
2. **Use semantic versioning** consistently
3. **Write clear release notes**
4. **Sign all releases** for security
5. **Automate deployment** with CI/CD
6. **Monitor releases** for issues
7. **Have a rollback plan**
8. **Communicate changes** to users
9. **Keep dependencies updated**
10. **Archive old releases**

## Resources

- [Electron Builder Documentation](https://www.electron.build/)
- [electron-updater Guide](https://www.electron.build/auto-update)
- [Code Signing Guide](https://www.electron.build/code-signing)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Apple Notarization Guide](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
