# Bundled Java Runtime Design

## Overview

This design implements a bundled Java runtime system that packages Java 8 and Java 17 with the Minecraft launcher, eliminating the need for users to install Java separately. The system will automatically select the appropriate Java version based on the Minecraft version being launched.

## Architecture

### Component Structure

```
BundledJavaService
├── Runtime Detection & Selection
├── Runtime Verification
└── Runtime Extraction

JavaService (Modified)
├── System Java Detection (existing)
├── Bundled Java Integration (new)
└── Java Selection Priority (modified)
```

### Data Flow

1. **Launcher Startup**
   - Check if bundled runtimes exist
   - Extract bundled runtimes if first launch
   - Verify runtime integrity

2. **Game Launch**
   - Determine required Java version from Minecraft version
   - Check bundled runtimes first
   - Fall back to system Java if needed
   - Return Java path to game launcher

## Components and Interfaces

### BundledJavaService

**Purpose**: Manages bundled Java runtimes including extraction, verification, and updates.

**Key Methods**:
- `initializeBundledRuntimes()`: Extract and verify bundled runtimes on first launch
- `getBundledJavaPath(majorVersion: number)`: Get path to bundled Java runtime
- `verifyBundledRuntime(majorVersion: number)`: Verify runtime integrity
- `extractBundledRuntime(version: number)`: Extract compressed runtime

**Properties**:
- `runtimesDirectory`: Base directory for bundled runtimes
- `availableRuntimes`: Map of available bundled Java versions
- `runtimeMetadata`: Version and checksum information

### Modified JavaService

**Purpose**: Extended to prioritize bundled runtimes over system installations.

**Modified Methods**:
- `getBestJavaInstallation(minecraftVersion)`: Now checks bundled runtimes first
- `detectJavaInstallations()`: Includes bundled runtimes in detection

**New Methods**:
- `getBundledJavaInstallation(majorVersion)`: Get bundled Java installation info
- `isBundledRuntimeAvailable(majorVersion)`: Check if bundled runtime exists

## Data Models

### BundledRuntimeInfo
```typescript
interface BundledRuntimeInfo {
  version: number;           // Major version (8, 17)
  fullVersion: string;       // Full version string (e.g., "17.0.9")
  path: string;              // Path to java.exe
  architecture: string;      // x64
  extracted: boolean;        // Whether runtime has been extracted
  verified: boolean;         // Whether runtime passed verification
  checksum: string;          // SHA256 checksum for verification
}
```

### RuntimeManifest
```typescript
interface RuntimeManifest {
  version: string;           // Manifest version
  runtimes: {
    java8: RuntimeMetadata;
    java17: RuntimeMetadata;
  };
}

interface RuntimeMetadata {
  version: string;           // Full Java version
  checksum: string;          // SHA256 checksum
  extractedPath: string;     // Path where runtime is extracted
}
```

## Directory Structure

```
<userData>/
├── runtimes/
│   ├── java-8/
│   │   ├── bin/
│   │   │   └── java.exe (or java)
│   │   └── lib/
│   ├── java-17/
│   │   ├── bin/
│   │   │   └── java.exe (or java)
│   │   └── lib/
│   └── manifest.json
└── minecraft/
    └── ...
```

## Runtime Bundling Strategy

### Build-Time Bundling

1. **Download JRE Distributions**
   - Eclipse Temurin JRE 8 for Windows x64 (latest LTS)
   - Eclipse Temurin JRE 17 for Windows x64 (latest LTS)

2. **Compression**
   - Use 7-Zip for maximum compression
   - Store in `resources/runtimes/` directory
   - Include manifest.json with checksums

3. **Electron Packaging**
   - Include compressed runtimes in app.asar.unpacked
   - Runtimes extracted on first launch to userData directory

### Runtime Extraction Process

1. Check if runtimes directory exists
2. If not, extract from bundled compressed archives
3. Verify extracted runtimes using checksums
4. Mark runtimes as extracted in local manifest
5. Test each runtime with `java -version`

## Java Version Selection Logic

```
function selectJavaForMinecraft(minecraftVersion):
  requiredJavaVersion = determineRequiredJava(minecraftVersion)
  
  // Priority 1: Bundled runtime
  bundledJava = getBundledJava(requiredJavaVersion)
  if bundledJava and verifyRuntime(bundledJava):
    return bundledJava
  
  // Priority 2: System Java (compatible version)
  systemJava = findSystemJava(requiredJavaVersion)
  if systemJava and isCompatible(systemJava, requiredJavaVersion):
    return systemJava
  
  // Priority 3: Any bundled runtime (fallback)
  anyBundledJava = getAnyBundledJava()
  if anyBundledJava:
    return anyBundledJava
  
  throw Error("No compatible Java found")
```

## Runtime Verification

### Integrity Checks

1. **File Existence**: Verify java executable exists
2. **Checksum Verification**: Compare SHA256 against manifest
3. **Execution Test**: Run `java -version` and parse output
4. **Permission Check**: Ensure executable permissions (Unix)

### Verification Timing

- **Startup**: Quick check (file existence only)
- **First Use**: Full verification before first game launch
- **Periodic**: Full verification every 7 days
- **On Demand**: When user reports issues

## Runtime Updates

### Update Check Process

1. **Background Check**: On launcher startup (non-blocking)
2. **Fetch Manifest**: Download latest runtime manifest from update server
3. **Compare Versions**: Check if newer runtime versions available
4. **Download**: Download updated runtime in background
5. **Verify**: Verify downloaded runtime checksum
6. **Replace**: Replace old runtime with new (when not in use)
7. **Cleanup**: Remove old runtime files

### Update Server

- Host runtime manifest JSON file
- Provide download URLs for runtime updates
- Include checksums for verification
- Support platform-specific updates

### Fallback Strategy

- If update fails, keep existing runtime
- Log error for diagnostics
- Retry update on next launch
- Never delete working runtime before verifying replacement

## Error Handling

### Missing Runtime

**Scenario**: Bundled runtime not found or corrupted

**Handling**:
1. Log error with details
2. Attempt to use system Java
3. If no system Java, show error dialog with instructions
4. Provide option to download Java manually
5. Provide option to reinstall launcher

### Extraction Failure

**Scenario**: Cannot extract bundled runtime

**Handling**:
1. Check disk space
2. Check write permissions
3. Retry extraction once
4. Fall back to system Java
5. Show error with specific issue (space, permissions, etc.)

### Verification Failure

**Scenario**: Runtime fails integrity check

**Handling**:
1. Log verification failure details
2. Attempt re-extraction from bundle
3. If re-extraction fails, use system Java
4. Notify user of potential corruption
5. Suggest reinstalling launcher

### Update Failure

**Scenario**: Bundled runtime becomes corrupted after installation

**Handling**:
1. Detect corruption during verification
2. Attempt re-extraction from bundled archive
3. If re-extraction fails, fall back to system Java
4. Show error message suggesting launcher reinstall
5. Log detailed error information

## Testing Strategy

### Unit Tests

- Runtime extraction logic
- Checksum verification
- Version parsing
- Path resolution
- Platform detection

### Integration Tests

- Full extraction process
- Runtime verification
- Java selection priority
- Fallback mechanisms
- Update process

### Manual Testing

- First launch experience
- Game launch with bundled Java
- Fallback to system Java
- Runtime update process
- Cross-platform compatibility

## Performance Considerations

### Startup Performance

- Defer full verification to background
- Cache verification results
- Only extract on first launch

### Disk Space

- JRE 8: ~40-50 MB compressed, ~100-150 MB extracted
- JRE 17: ~50-60 MB compressed, ~150-200 MB extracted
- Total: ~100-110 MB compressed, ~250-350 MB extracted

### Download Size Impact

- Adds ~100-110 MB to Windows installer size
- Acceptable for modern internet speeds

## Security Considerations

### Checksum Verification

- Use SHA256 for all runtime files
- Verify before extraction
- Verify after extraction
- Store checksums in bundled manifest

### Permissions

- Extract to user data directory (no admin required)
- Set appropriate file permissions
- Verify executable permissions on Unix systems

## Implementation Phases

### Phase 1: Core Bundled Runtime Support
- Create BundledJavaService
- Implement runtime extraction
- Implement runtime verification
- Modify JavaService to use bundled runtimes

### Phase 2: Runtime Selection
- Implement Java version selection logic
- Add bundled runtime priority
- Implement fallback mechanisms
- Add error handling

### Phase 3: Build Integration
- Download Windows x64 JRE distributions
- Create compression scripts
- Update electron-builder configuration for Windows
- Test Windows builds

## Dependencies

- **electron-builder**: For packaging bundled runtimes
- **7-Zip or tar**: For runtime compression
- **crypto**: For checksum verification
- **fs-extra**: For file operations

## Migration Strategy

### Existing Users

- Detect if bundled runtimes already extracted
- If not, extract on next launch
- Continue using system Java if preferred
- Gradually migrate to bundled runtimes

### New Users

- Extract bundled runtimes on first launch
- Use bundled runtimes by default
- Seamless experience (no Java installation needed)
