const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

const DOWNLOAD_DIR = path.join(__dirname, '..', 'downloads', 'jre');
const EXTRACT_DIR = path.join(__dirname, '..', 'downloads', 'extracted');
const RESOURCES_DIR = path.join(__dirname, '..', 'resources', 'runtimes');

// Ensure directories exist
function ensureDirectoryExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
}

// Calculate SHA256 checksum
function calculateChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// Extract ZIP file
function extractZip(zipPath, extractTo) {
  console.log(`Extracting ${path.basename(zipPath)}...`);
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(extractTo, true);
  console.log('Extraction complete!');
}

// Find JRE directory in extracted files
function findJREDirectory(extractDir) {
  const items = fs.readdirSync(extractDir);
  
  // Look for directory containing 'jdk' or 'jre' in name
  for (const item of items) {
    const itemPath = path.join(extractDir, item);
    if (fs.statSync(itemPath).isDirectory()) {
      // Check if it has bin/java.exe
      const javaExe = path.join(itemPath, 'bin', 'java.exe');
      if (fs.existsSync(javaExe)) {
        return itemPath;
      }
    }
  }
  
  throw new Error('Could not find JRE directory in extracted files');
}

// Compress directory using 7-Zip (if available) or built-in ZIP
function compressDirectory(sourceDir, outputFile) {
  console.log(`Compressing ${path.basename(sourceDir)}...`);
  
  try {
    // Try to use 7-Zip for better compression
    const sevenZipPath = 'C:\\Program Files\\7-Zip\\7z.exe';
    if (fs.existsSync(sevenZipPath)) {
      console.log('Using 7-Zip for compression...');
      execSync(`"${sevenZipPath}" a -t7z -mx=9 "${outputFile}" "${sourceDir}\\*"`, {
        stdio: 'inherit'
      });
    } else {
      console.log('7-Zip not found, using ZIP compression...');
      const zip = new AdmZip();
      zip.addLocalFolder(sourceDir);
      zip.writeZip(outputFile);
    }
    console.log('Compression complete!');
  } catch (error) {
    console.error('Compression failed:', error.message);
    throw error;
  }
}

// Get Java version from extracted JRE
function getJavaVersion(jreDir) {
  try {
    const javaExe = path.join(jreDir, 'bin', 'java.exe');
    const output = execSync(`"${javaExe}" -version 2>&1`, { encoding: 'utf8' });
    
    // Parse version from output
    const versionMatch = output.match(/version "([^"]+)"/);
    if (versionMatch) {
      return versionMatch[1];
    }
    return 'unknown';
  } catch (error) {
    console.error('Failed to get Java version:', error.message);
    return 'unknown';
  }
}

// Process a single JRE
async function processJRE(zipFilename, version) {
  console.log(`\n--- Processing Java ${version} ---`);
  
  const zipPath = path.join(DOWNLOAD_DIR, zipFilename);
  const extractPath = path.join(EXTRACT_DIR, `java-${version}`);
  const outputFilename = `java-${version}-windows-x64.7z`;
  const outputPath = path.join(RESOURCES_DIR, outputFilename);
  
  // Check if already compressed
  if (fs.existsSync(outputPath)) {
    console.log(`${outputFilename} already exists. Calculating checksum...`);
    const checksum = await calculateChecksum(outputPath);
    const stats = fs.statSync(outputPath);
    const fullVersion = 'unknown'; // We'll need to extract to get this
    return { version, fullVersion, checksum, size: stats.size, filename: outputFilename };
  }
  
  // Clean extract directory
  if (fs.existsSync(extractPath)) {
    fs.rmSync(extractPath, { recursive: true, force: true });
  }
  ensureDirectoryExists(extractPath);
  
  // Extract ZIP
  extractZip(zipPath, extractPath);
  
  // Find JRE directory
  const jreDir = findJREDirectory(extractPath);
  console.log(`Found JRE at: ${jreDir}`);
  
  // Get Java version
  const fullVersion = getJavaVersion(jreDir);
  console.log(`Java version: ${fullVersion}`);
  
  // Compress JRE
  compressDirectory(jreDir, outputPath);
  
  // Calculate checksum
  console.log('Calculating checksum...');
  const checksum = await calculateChecksum(outputPath);
  console.log(`SHA256: ${checksum}`);
  
  const stats = fs.statSync(outputPath);
  console.log(`Compressed size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  
  // Clean up extracted files
  fs.rmSync(extractPath, { recursive: true, force: true });
  
  return { version, fullVersion, checksum, size: stats.size, filename: outputFilename };
}

// Create bundled manifest
function createManifest(runtimes) {
  const manifest = {
    version: '1.0.0',
    created: new Date().toISOString(),
    runtimes: {
      java8: {
        version: runtimes.java8.fullVersion,
        checksum: runtimes.java8.checksum,
        filename: runtimes.java8.filename,
        size: runtimes.java8.size,
        extractedPath: 'java-8'
      },
      java17: {
        version: runtimes.java17.fullVersion,
        checksum: runtimes.java17.checksum,
        filename: runtimes.java17.filename,
        size: runtimes.java17.size,
        extractedPath: 'java-17'
      },
      java21: {
        version: runtimes.java21.fullVersion,
        checksum: runtimes.java21.checksum,
        filename: runtimes.java21.filename,
        size: runtimes.java21.size,
        extractedPath: 'java-21'
      }
    }
  };
  
  const manifestPath = path.join(RESOURCES_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n✓ Manifest created at: ${manifestPath}`);
  
  return manifest;
}

// Main execution
async function main() {
  console.log('=== JRE Compression Script ===\n');
  
  // Check if downloads exist
  const checksumFile = path.join(DOWNLOAD_DIR, 'checksums.json');
  if (!fs.existsSync(checksumFile)) {
    console.error('Error: Downloads not found. Please run download-jre.js first.');
    process.exit(1);
  }
  
  const checksums = JSON.parse(fs.readFileSync(checksumFile, 'utf8'));
  
  ensureDirectoryExists(RESOURCES_DIR);
  ensureDirectoryExists(EXTRACT_DIR);
  
  const results = {};
  
  // Process Java 8
  try {
    results.java8 = await processJRE(checksums.java8.filename, '8');
  } catch (error) {
    console.error('Failed to process Java 8:', error.message);
    process.exit(1);
  }
  
  // Process Java 17
  try {
    results.java17 = await processJRE(checksums.java17.filename, '17');
  } catch (error) {
    console.error('Failed to process Java 17:', error.message);
    process.exit(1);
  }
  
  // Process Java 21
  try {
    results.java21 = await processJRE(checksums.java21.filename, '21');
  } catch (error) {
    console.error('Failed to process Java 21:', error.message);
    process.exit(1);
  }
  
  // Create manifest
  const manifest = createManifest(results);
  
  console.log('\n=== Compression Complete ===');
  console.log('\nCompressed runtimes:');
  console.log(`- Java 8: ${(results.java8.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`- Java 17: ${(results.java17.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`- Java 21: ${(results.java21.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`- Total: ${((results.java8.size + results.java17.size + results.java21.size) / 1024 / 1024).toFixed(2)} MB`);
  console.log('\nNext steps:');
  console.log('1. Update electron-builder configuration');
  console.log('2. Test the build to ensure runtimes are included');
}

main().catch(console.error);
