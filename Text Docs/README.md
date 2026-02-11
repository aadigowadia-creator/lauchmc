# Minecraft Launcher

A cross-platform Minecraft launcher built with Electron, React, and TypeScript.

## Features

- 🎮 Launch different Minecraft versions
- 👤 Microsoft account authentication with OAuth
- 📁 Profile management with custom configurations
- 🔧 Mod loader support (Forge, Fabric, Quilt)
- ⚙️ Customizable JVM settings and memory allocation
- 📦 Version management with download progress tracking
- 🔄 Auto-update functionality
- 🎯 Game process monitoring and crash detection
- 🌐 Cross-platform support (Windows, macOS, Linux)
- ☕ Bundled Java runtimes (Windows x64) - no separate Java installation needed

## Quick Start

### For Users

Download the latest release for your platform:
- **Windows**: Download the `.exe` installer or portable version
  - **No Java installation required!** Java 8 and Java 17 are bundled with the Windows version
- **macOS**: Download the `.dmg` file
  - Requires Java 8 or Java 17 installed on your system
- **Linux**: Download the `.AppImage`, `.deb`, or `.rpm` file
  - Requires Java 8 or Java 17 installed on your system

### For Developers

See [Development Setup](#development-setup) below.

## Development Setup

### Prerequisites

- Node.js 18+ and npm
- Git
- Java 8 or Java 17 (for development on macOS/Linux, or if not using bundled runtimes on Windows)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd minecraft-launcher

# Install dependencies
npm install

# Start development server
npm run dev
```

### Available Scripts

#### Development
- `npm run dev` - Start development server with hot reload
- `npm run dev:main` - Run main process only
- `npm run dev:renderer` - Run renderer process only

#### Building
- `npm run build` - Build the application for production
- `npm run build:main` - Build main process
- `npm run build:renderer` - Build renderer process

#### Packaging
- `npm run package` - Package for current platform
- `npm run package:win` - Package for Windows
- `npm run package:mac` - Package for macOS
- `npm run package:linux` - Package for Linux
- `npm run package:all` - Package for all platforms

#### Testing & Quality
- `npm run test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run format` - Format code with Prettier

#### Distribution
- `npm run dist` - Build and package
- `npm run release` - Build, package, and publish updates

### Troubleshooting

#### Windows PowerShell Execution Policy Issues

If you encounter PowerShell execution policy errors when running npm commands on Windows, you can fix this by creating aliases that use the `.cmd` versions instead of the `.ps1` scripts:

```powershell
# Run these commands in your PowerShell session
Set-Alias -Name npm -Value "C:\Program Files\Bot.js\node-v22.18.0-win-x64 unzip\node-v22.18.0-win-x64\npm.cmd"
Set-Alias -Name npx -Value "C:\Program Files\Bot.js\node-v22.18.0-win-x64 unzip\node-v22.18.0-win-x64\npx.cmd"
```

**Note**: Adjust the path to match your Node.js installation location. You can find it by running:
```powershell
Get-Command node
```

This fix allows npm commands to work without changing PowerShell execution policies.

### Project Structure

```
minecraft-launcher/
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.ts        # Application entry point
│   │   ├── preload.ts     # Preload script for IPC
│   │   ├── database/      # SQLite database setup
│   │   ├── models/        # Data models
│   │   ├── repositories/  # Data access layer
│   │   ├── services/      # Business logic
│   │   └── errors/        # Error handling
│   ├── renderer/          # React frontend
│   │   ├── App.tsx        # Main React component
│   │   ├── main.tsx       # React entry point
│   │   ├── components/    # UI components
│   │   ├── hooks/         # Custom React hooks
│   │   └── types/         # TypeScript definitions
│   └── __tests__/         # Test files
├── build/                 # Build resources (icons, etc.)
├── release/               # Built packages (generated)
├── dist/                  # Compiled code (generated)
├── BUILD.md               # Build and distribution guide
├── CHANGELOG.md           # Version history
└── package.json           # Project configuration
```

### Technology Stack

- **Frontend**: React 18 + TypeScript
- **Desktop**: Electron 27
- **Build Tool**: Vite 4
- **Bundler**: Electron Builder
- **Testing**: Jest
- **Linting**: ESLint + Prettier
- **State Management**: Zustand
- **Database**: SQLite3
- **HTTP Client**: Axios
- **Logging**: Winston
- **Auto-Updates**: electron-updater

## Building for Distribution

See [BUILD.md](BUILD.md) for comprehensive build and distribution instructions.

### Quick Build

```bash
# Build for current platform
npm run package

# Output will be in release/ directory
```

## Bundled Java Runtimes (Windows Only)

The Windows version includes bundled Java runtimes, eliminating the need for users to install Java separately:

### Automatic Version Selection

The launcher automatically selects the appropriate Java version based on the Minecraft version:
- **Java 17**: Used for Minecraft 1.17 and newer versions
- **Java 8**: Used for older Minecraft versions (pre-1.17)

### How It Works

1. **First Launch**: On first launch, the launcher extracts the bundled Java runtimes to your user data directory
2. **Verification**: Runtimes are verified using SHA256 checksums to ensure integrity
3. **Automatic Selection**: When launching a game, the launcher automatically selects the correct Java version
4. **Fallback**: If bundled runtimes are unavailable or corrupted, the launcher falls back to system-installed Java

### Platform Support

- **Windows x64**: ✅ Bundled Java included (Java 8 and Java 17)
- **macOS**: ❌ Requires system Java installation
- **Linux**: ❌ Requires system Java installation

For more details on bundled Java, see [BUNDLED_JAVA_SETUP.md](BUNDLED_JAVA_SETUP.md).

## Auto-Updates

The application includes automatic update functionality:
- Checks for updates on startup
- Downloads updates in background
- Prompts user to install when ready
- Seamless update experience

Configure updates in `package.json` under the `publish` section.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Write tests for new features
- Update documentation as needed
- Follow the existing code style
- Run linting before committing

## Architecture

The application follows a clean architecture pattern:

- **Main Process**: Handles system operations, file I/O, and business logic
- **Renderer Process**: React-based UI with IPC communication
- **IPC Bridge**: Secure communication between processes
- **Services**: Modular business logic (auth, profiles, versions, etc.)
- **Repositories**: Data access abstraction
- **Models**: TypeScript interfaces for data structures

## Security

- OAuth authentication with Microsoft
- Encrypted token storage
- Secure IPC communication
- File integrity verification
- No sensitive data in logs

## License

MIT

## Acknowledgments

- Minecraft is a trademark of Mojang Studios
- This is an unofficial launcher, not affiliated with Mojang or Microsoft
- Built with Electron and React
- Uses Mojang's official APIs for version management

## Support

For issues, questions, or contributions:
- Open an issue on GitHub
- Check existing issues for solutions
- Read the documentation in BUILD.md

## Roadmap

See [CHANGELOG.md](CHANGELOG.md) for planned features and version history.