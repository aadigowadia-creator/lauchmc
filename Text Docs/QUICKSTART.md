# Quick Start Guide

Get up and running with the Minecraft Launcher in minutes.

## For Users

### Installation

1. **Download** the latest release for your platform:
   - Windows: Download `.exe` installer
   - macOS: Download `.dmg` file
   - Linux: Download `.AppImage`, `.deb`, or `.rpm`

2. **Install** the application:
   - **Windows**: Run the installer and follow prompts
   - **macOS**: Open DMG and drag to Applications folder
   - **Linux**: 
     - AppImage: `chmod +x *.AppImage && ./Minecraft-Launcher*.AppImage`
     - DEB: `sudo dpkg -i minecraft-launcher*.deb`
     - RPM: `sudo rpm -i minecraft-launcher*.rpm`

3. **Launch** the application from your applications menu

### First Time Setup

1. **Login** with your Microsoft account
   - Click "Sign in with Microsoft"
   - Complete authentication in browser
   - Return to launcher

2. **Download a Minecraft version**
   - Go to "Versions" tab
   - Select a version (e.g., 1.20.1)
   - Click "Download"
   - Wait for download to complete

3. **Create a profile**
   - Go to "Profiles" tab
   - Click "New Profile"
   - Enter profile name
   - Select downloaded version
   - Configure memory settings (optional)
   - Click "Create"

4. **Launch the game**
   - Go to "Launcher" tab
   - Select your profile
   - Click "Play"
   - Enjoy Minecraft!

## For Developers

### Quick Setup

```bash
# Clone repository
git clone <repository-url>
cd minecraft-launcher

# Install dependencies
npm install

# Start development server
npm run dev
```

### Development Workflow

1. **Make changes** to code in `src/` directory
2. **Test changes** - app hot reloads automatically
3. **Run tests**: `npm test`
4. **Lint code**: `npm run lint`
5. **Build**: `npm run build`
6. **Package**: `npm run package`

### Project Structure

```
src/
├── main/          # Backend (Electron main process)
├── renderer/      # Frontend (React UI)
└── __tests__/     # Tests
```

### Common Tasks

**Add a new feature:**
1. Create service in `src/main/services/`
2. Add IPC handlers in `src/main/main.ts`
3. Expose API in `src/main/preload.ts`
4. Use in React components

**Fix a bug:**
1. Write a test that reproduces the bug
2. Fix the code
3. Verify test passes
4. Submit PR

**Update dependencies:**
```bash
npm update
```

## Common Issues

### "Microsoft login failed"
- Check internet connection
- Try again in a few minutes
- Clear app data and retry

### "Version download failed"
- Check internet connection
- Verify disk space
- Try a different version

### "Game won't launch"
- Ensure Java is installed
- Check profile configuration
- View error logs in settings

### "App won't start"
- Reinstall the application
- Check system requirements
- Report issue on GitHub

## System Requirements

### Minimum
- **OS**: Windows 7+, macOS 10.13+, or modern Linux
- **RAM**: 4 GB
- **Storage**: 2 GB free space
- **Internet**: Required for downloads and authentication

### Recommended
- **OS**: Windows 10+, macOS 11+, or Ubuntu 20.04+
- **RAM**: 8 GB or more
- **Storage**: 10 GB free space
- **Internet**: Broadband connection

## Getting Help

- **Documentation**: Check README.md and other docs
- **Issues**: Report bugs on GitHub
- **Community**: Join Discord/forum
- **FAQ**: See common questions below

## FAQ

**Q: Is this official?**
A: No, this is an unofficial launcher. Minecraft is owned by Mojang/Microsoft.

**Q: Is it safe?**
A: Yes, it uses official Mojang APIs and Microsoft authentication.

**Q: Can I use mods?**
A: Yes! Install Forge, Fabric, or Quilt from the Profiles tab.

**Q: Does it support multiplayer?**
A: Yes, full multiplayer support with your Microsoft account.

**Q: Can I import my official launcher profiles?**
A: Not currently, but you can recreate them easily.

**Q: How do I update the launcher?**
A: The launcher checks for updates automatically and prompts you to install.

**Q: Where are my game files stored?**
A: In the installation directory specified in your profile settings.

**Q: Can I use multiple accounts?**
A: Currently one account at a time. Logout and login with different account.

## Next Steps

### For Users
- Explore different Minecraft versions
- Try mod loaders (Forge, Fabric)
- Customize JVM settings for better performance
- Create multiple profiles for different playstyles

### For Developers
- Read the full [README.md](README.md)
- Check [BUILD.md](BUILD.md) for building
- Review [DEPLOYMENT.md](DEPLOYMENT.md) for releasing
- Contribute to the project!

## Support the Project

- ⭐ Star the repository
- 🐛 Report bugs
- 💡 Suggest features
- 🔧 Contribute code
- 📖 Improve documentation
- 💬 Help other users

## Links

- **Repository**: [GitHub](https://github.com/your-username/minecraft-launcher)
- **Issues**: [Bug Reports](https://github.com/your-username/minecraft-launcher/issues)
- **Releases**: [Downloads](https://github.com/your-username/minecraft-launcher/releases)
- **Documentation**: See other .md files in repository

---

**Happy Gaming! 🎮**
