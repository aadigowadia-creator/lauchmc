const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Eclipse Temurin JRE download URLs for Windows x64
const JRE_DOWNLOADS = {
  java8: {
    url: 'https://api.adoptium.net/v3/binary/latest/8/ga/windows/x64/jre/hotspot/normal/eclipse',
    filename: 'jre-8-windows-x64.zip',
    version: '8'
  },
  java17: {
    url: 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jre/hotspot/normal/eclipse',
    filename: 'jre-17-windows-x64.zip',
    version: '17'
  },
  java21: {
    url: 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse',
    filename: 'jre-21-windows-x64.zip',
    version: '21'
  }
};

const DOWNLOAD_DIR = path.join(__dirname, '..', 'downloads', 'jre');

// Ensure download directory exists
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

// Download file with progress
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading from: ${url}`);
    console.log(`Saving to: ${destPath}`);
    
    const file = fs.createWriteStream(destPath);
    let downloadedBytes = 0;
    let totalBytes = 0;
    
    https.get(url, (response) => {
      // Handle redirects (301, 302, 307, 308)
      if (response.statusCode === 301 || response.statusCode === 302 || 
          response.statusCode === 307 || response.statusCode === 308) {
        file.close();
        fs.unlinkSync(destPath);
        console.log(`Following redirect to: ${response.headers.location}`);
        return downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`Failed to download: ${response.statusCode}`));
      }
      
      totalBytes = parseInt(response.headers['content-length'], 10);
      console.log(`Total size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
      
      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const progress = ((downloadedBytes / totalBytes) * 100).toFixed(2);
        process.stdout.write(`\rProgress: ${progress}% (${(downloadedBytes / 1024 / 1024).toFixed(2)} MB)`);
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log('\nDownload complete!');
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

// Main download function
async function downloadJRE(jreInfo) {
  const destPath = path.join(DOWNLOAD_DIR, jreInfo.filename);
  
  // Check if file already exists
  if (fs.existsSync(destPath)) {
    console.log(`\n${jreInfo.filename} already exists. Skipping download.`);
    console.log('Calculating checksum...');
    const checksum = await calculateChecksum(destPath);
    console.log(`SHA256: ${checksum}`);
    return { filename: jreInfo.filename, checksum, version: jreInfo.version };
  }
  
  try {
    await downloadFile(jreInfo.url, destPath);
    console.log('Calculating checksum...');
    const checksum = await calculateChecksum(destPath);
    console.log(`SHA256: ${checksum}`);
    return { filename: jreInfo.filename, checksum, version: jreInfo.version };
  } catch (error) {
    console.error(`Failed to download ${jreInfo.filename}:`, error.message);
    throw error;
  }
}

// Main execution
async function main() {
  console.log('=== Eclipse Temurin JRE Downloader ===\n');
  
  ensureDirectoryExists(DOWNLOAD_DIR);
  
  const results = {};
  
  // Download Java 8
  console.log('\n--- Downloading Java 8 JRE ---');
  try {
    results.java8 = await downloadJRE(JRE_DOWNLOADS.java8);
  } catch (error) {
    console.error('Failed to download Java 8:', error.message);
    process.exit(1);
  }
  
  // Download Java 17
  console.log('\n--- Downloading Java 17 JRE ---');
  try {
    results.java17 = await downloadJRE(JRE_DOWNLOADS.java17);
  } catch (error) {
    console.error('Failed to download Java 17:', error.message);
    process.exit(1);
  }
  
  // Download Java 21
  console.log('\n--- Downloading Java 21 JRE ---');
  try {
    results.java21 = await downloadJRE(JRE_DOWNLOADS.java21);
  } catch (error) {
    console.error('Failed to download Java 21:', error.message);
    process.exit(1);
  }
  
  // Save checksums to file
  const checksumFile = path.join(DOWNLOAD_DIR, 'checksums.json');
  fs.writeFileSync(checksumFile, JSON.stringify(results, null, 2));
  console.log(`\n✓ Checksums saved to: ${checksumFile}`);
  
  console.log('\n=== Download Complete ===');
  console.log('\nNext steps:');
  console.log('1. Run the compression script: node scripts/compress-jre.js');
  console.log('2. The compressed runtimes will be ready for bundling');
}

main().catch(console.error);
