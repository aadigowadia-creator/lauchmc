# Installation Guide

This guide covers the installation and setup of the Minecraft Launcher development environment.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18.0.0 or higher
- **npm** 9.0.0 or higher (comes with Node.js)
- **Git** for version control

### Verify Prerequisites

```bash
node --version  # Should be v18.0.0 or higher
npm --version   # Should be 9.0.0 or higher
git --version   # Any recent version
```

## Installation Steps

### 1. Clone the Repository

```bash
git clone <repository-url>
cd minecraft-launcher
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required dependencies including:
- Electron and Electron Builder
- React and React DOM
- TypeScript and build tools
- Testing frameworks
- Auto-updater (electron-updater)
- And all other dependencies listed in package.json

### 3. Verify Installation

Run the development server to verify everything is set up correctly:

```bash
npm run dev
```

The application should launch in development mode.

## Post-Installation Setup

### Database Initialization

The SQLite database will be automatically initialized on first run. The database file will be created in:
- **Windows**: `%APPDATA%/minecraft-launcher/launcher.db`
- **macOS**: `~/Library/Application Support/minecraft-launcher/launcher.db`
- **Linux**: `~/.config/minecraft-launcher/launcher.db`

### Configuration

The application uses `electron-store` for configuration. Settings are stored in:
- **Windows**: `%APPDATA%/minecraft-launcher/config.json`
- **macOS**: `~/Library/Application Support/minecraft-launcher/config.json`
- **Linux**: `~/.config/minecraft-launcher/config.json`

## Platform-Specific Setup

### Windows

No additional setup required. The application should work out of the box.

#### PowerShell Execution Policy (if needed)

If you encounter execution policy errors:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Or use the `.cmd` aliases as described in README.md.

### macOS

#### Xcode Command Line Tools

Install Xcode Command Line Tools (required for native modules):

```bash
xcode-select --install
```

#### Code Signing (for distribution)

For building distributable apps, you'll need:
1. Apple Developer account
2. Code signing certificates
3. App-specific password for notarization

### Linux

#### Build Dependencies

Install required build tools:

**Ubuntu/Debian:**
```bash
sudo apt-get install build-essential
```

**Fedora/RHEL:**
```bash
sudo dnf install gcc-c++ make
```

**Arch:**
```bash
sudo pacman -S base-devel
```

## Troubleshooting

### Native Module Build Errors

If you encounter errors building native modules (sqlite3):

```bash
# Clear node modules and rebuild
rm -rf node_modules package-lock.json
npm install
```

### Electron Download Issues

If Electron fails to download:

```bash
# Set a mirror (China users)
npm config set electron_mirror https://npmmirror.com/mirrors/electron/

# Or use a proxy
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080
```

### SQLite3 Build Issues

If sqlite3 fails to build:

```bash
# Rebuild native modules for Electron
npm run rebuild
# Or manually
./node_modules/.bin/electron-rebuild
```

### Permission Errors

**Linux/macOS:**
```bash
# Don't use sudo with npm install
# If you have permission issues, fix npm permissions:
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
# Add to ~/.profile or ~/.bashrc:
export PATH=~/.npm-global/bin:$PATH
```

## Development Environment

### Recommended IDE

**Visual Studio Code** with extensions:
- ESLint
- Prettier
- TypeScript and JavaScript Language Features
- React Developer Tools

### VS Code Settings

Create `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

## Updating Dependencies

To update dependencies to their latest versions:

```bash
# Check for outdated packages
npm outdated

# Update all dependencies
npm update

# Update specific package
npm update <package-name>

# Update to latest (including major versions)
npm install <package-name>@latest
```

## Clean Installation

If you need to start fresh:

```bash
# Remove all generated files
rm -rf node_modules dist release package-lock.json

# Reinstall
npm install
```

## Next Steps

After installation:

1. Read [README.md](README.md) for project overview
2. Check [BUILD.md](BUILD.md) for build instructions
3. Review [CHANGELOG.md](CHANGELOG.md) for version history
4. Start development with `npm run dev`

## Getting Help

If you encounter issues:

1. Check this installation guide
2. Review error messages carefully
3. Search existing GitHub issues
4. Create a new issue with:
   - Your operating system and version
   - Node.js and npm versions
   - Complete error message
   - Steps to reproduce
