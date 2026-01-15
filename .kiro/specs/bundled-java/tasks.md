# Bundled Java Runtime Implementation Plan

## Task List

- [x] 1. Create BundledJavaService core infrastructure





  - Create `src/main/services/bundled-java-service.ts` file
  - Define BundledRuntimeInfo and RuntimeManifest interfaces
  - Implement singleton pattern for service
  - Add methods for getting runtimes directory path
  - _Requirements: 1.1, 1.2_

- [x] 2. Implement runtime extraction logic





  - [x] 2.1 Create extraction method for compressed Java archives


    - Implement `extractBundledRuntime(version: number)` method
    - Handle 7-Zip compressed archives
    - Extract to userData/runtimes directory
    - Set proper file permissions for java.exe
    - _Requirements: 1.1, 4.4_

  - [x] 2.2 Implement first-launch detection and extraction


    - Check if runtimes directory exists
    - Check if Java 8 and Java 17 are already extracted
    - Trigger extraction on first launch
    - Create manifest.json after successful extraction
    - _Requirements: 1.1, 4.4_


  - [x] 2.3 Add extraction progress tracking

    - Emit events for extraction progress
    - Handle extraction errors gracefully
    - Log extraction status
    - _Requirements: 1.1_

- [x] 3. Implement runtime verification




  - [x] 3.1 Create checksum verification


    - Implement SHA256 checksum calculation
    - Compare against bundled manifest checksums
    - Verify both before and after extraction
    - _Requirements: 3.1, 3.2_

  - [x] 3.2 Create runtime execution test


    - Execute `java.exe -version` command
    - Parse version output
    - Verify Java version matches expected
    - Handle execution failures
    - _Requirements: 3.3_

  - [x] 3.3 Implement verification on startup


    - Quick file existence check on startup
    - Full verification on first use
    - Cache verification results
    - _Requirements: 3.1_

- [x] 4. Modify JavaService to use bundled runtimes





  - [x] 4.1 Add bundled runtime detection


    - Create `getBundledJavaInstallation(majorVersion)` method
    - Check if bundled runtime exists and is verified
    - Return JavaInstallation object for bundled runtime
    - _Requirements: 2.1, 2.2_

  - [x] 4.2 Update Java selection priority


    - Modify `getBestJavaInstallation()` to check bundled runtimes first
    - Implement fallback to system Java
    - Prefer bundled over system installations
    - _Requirements: 2.2, 2.3, 2.4_

  - [x] 4.3 Add bundled runtime to detection results


    - Include bundled runtimes in `detectJavaInstallations()` results
    - Mark bundled runtimes with special flag
    - _Requirements: 2.2_

- [x] 5. Implement automatic Java version selection





  - [x] 5.1 Create version requirement logic


    - Determine required Java version from Minecraft version
    - Use Java 17 for Minecraft 1.17+
    - Use Java 8 for older versions
    - _Requirements: 2.1_

  - [x] 5.2 Integrate with game launch flow


    - Update game-process-manager to use bundled Java
    - Pass correct Java version to launch command builder
    - Handle cases where bundled runtime not available
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 6. Add error handling and fallback mechanisms





  - [x] 6.1 Handle missing bundled runtime


    - Detect when bundled runtime is missing
    - Fall back to system Java automatically
    - Log warning message
    - _Requirements: 3.2, 3.4_

  - [x] 6.2 Handle corrupted bundled runtime


    - Detect corruption during verification
    - Attempt re-extraction from bundle
    - Fall back to system Java if re-extraction fails
    - Show error message to user
    - _Requirements: 3.2, 3.4_

  - [x] 6.3 Handle extraction failures


    - Check disk space before extraction
    - Check write permissions
    - Provide helpful error messages
    - _Requirements: 3.2_

- [x] 7. Download and prepare Java runtimes for bundling






  - [x] 7.1 Download Eclipse Temurin JRE distributions

    - Download JRE 8 for Windows x64
    - Download JRE 17 for Windows x64
    - Verify downloads with checksums
    - _Requirements: 1.4, 1.5, 4.1_


  - [x] 7.2 Create compression scripts

    - Create script to compress JRE with 7-Zip
    - Generate SHA256 checksums
    - Create bundled manifest.json
    - Store in `resources/runtimes/` directory
    - _Requirements: 4.2, 4.3_


  - [x] 7.3 Update electron-builder configuration

    - Configure app.asar.unpacked to include runtimes
    - Add resources/runtimes to extraResources
    - Test that runtimes are included in build
    - _Requirements: 1.1, 4.3_

- [x] 8. Add IPC handlers for runtime management





  - [x] 8.1 Create runtime status IPC handlers


    - Add `java:getBundledRuntimes` handler
    - Add `java:verifyBundledRuntimes` handler
    - Add `java:getRuntimeStatus` handler
    - _Requirements: 3.1_


  - [x] 8.2 Update preload API

    - Expose bundled runtime methods to renderer
    - Add TypeScript types for API
    - _Requirements: 3.1_

- [x] 9. Initialize bundled runtimes on app startup




  - [x] 9.1 Add initialization to main process


    - Call `initializeBundledRuntimes()` on app ready
    - Handle initialization errors
    - Don't block app startup
    - _Requirements: 1.1, 1.2_

  - [x] 9.2 Show extraction progress to user


    - Display progress during first launch
    - Show completion message
    - Handle user cancellation gracefully
    - _Requirements: 1.1_

- [x] 10. Update documentation





  - [x] 10.1 Update README with bundled Java information


    - Document that Java is included
    - Explain automatic version selection
    - Note Windows x64 only support
    - _Requirements: 1.1_

  - [x] 10.2 Update build documentation



    - Document how to download and prepare JRE distributions
    - Document compression process
    - Document build configuration changes
    - _Requirements: 4.1, 4.2_
