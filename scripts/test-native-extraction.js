/**
 * Test script to verify native library extraction for Minecraft 1.8.9
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');

async function testNativeExtraction() {
  try {
    const minecraftDir = path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft');
    const librariesDir = path.join(minecraftDir, 'libraries');
    const nativesDir = path.join(minecraftDir, 'versions', '1.8.9', 'natives');
    
    console.log('Native Library Extraction Test');
    console.log('==============================');
    
    // Clear natives directory first
    try {
      await fs.rm(nativesDir, { recursive: true, force: true });
      console.log('✅ Cleared existing natives directory');
    } catch {
      console.log('ℹ️  No existing natives directory to clear');
    }
    
    // Create natives directory
    await fs.mkdir(nativesDir, { recursive: true });
    console.log('✅ Created natives directory');
    
    // Find LWJGL platform library
    const lwjglPlatformDir = path.join(librariesDir, 'org', 'lwjgl', 'lwjgl', 'lwjgl-platform');
    const versions = await fs.readdir(lwjglPlatformDir);
    console.log(`Found LWJGL platform versions: ${versions.join(', ')}`);
    
    // Use the first available version
    const version = versions[0];
    const lwjglPlatformJar = path.join(lwjglPlatformDir, version, `lwjgl-platform-${version}-natives-windows.jar`);
    
    console.log(`\n🔍 Testing extraction from: ${lwjglPlatformJar}`);
    
    // Check if file exists
    try {
      await fs.access(lwjglPlatformJar);
      console.log('✅ LWJGL platform jar found');
    } catch {
      console.log('❌ LWJGL platform jar not found');
      return;
    }
    
    // Extract the library
    const zip = new AdmZip(lwjglPlatformJar);
    const zipEntries = zip.getEntries();
    
    console.log(`\n📦 Jar contains ${zipEntries.length} entries:`);
    
    let extractedCount = 0;
    for (const entry of zipEntries) {
      console.log(`  - ${entry.entryName} (${entry.isDirectory ? 'directory' : 'file'})`);
      
      // Skip META-INF directory
      if (entry.entryName.startsWith('META-INF/')) continue;
      
      // Only extract files, not directories
      if (!entry.isDirectory) {
        const targetPath = path.join(nativesDir, entry.entryName);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, entry.getData());
        extractedCount++;
        
        if (entry.entryName.includes('lwjgl')) {
          console.log(`    ✅ Extracted: ${entry.entryName}`);
        }
      }
    }
    
    console.log(`\n✅ Extracted ${extractedCount} files from LWJGL platform jar`);
    
    // Also extract JInput
    const jinputPlatformJar = path.join(librariesDir, 'net', 'java', 'jinput', 'jinput-platform', '2.0.5', 'jinput-platform-2.0.5-natives-windows.jar');
    
    try {
      await fs.access(jinputPlatformJar);
      console.log('\n🔍 Extracting JInput platform jar...');
      
      const jinputZip = new AdmZip(jinputPlatformJar);
      const jinputEntries = jinputZip.getEntries();
      
      let jinputExtractedCount = 0;
      for (const entry of jinputEntries) {
        if (entry.entryName.startsWith('META-INF/')) continue;
        
        if (!entry.isDirectory) {
          const targetPath = path.join(nativesDir, entry.entryName);
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await fs.writeFile(targetPath, entry.getData());
          jinputExtractedCount++;
        }
      }
      
      console.log(`✅ Extracted ${jinputExtractedCount} files from JInput platform jar`);
    } catch {
      console.log('⚠️  JInput platform jar not found, skipping');
    }
    
    // Verify final extraction
    console.log('\n🔍 Verifying extracted files...');
    const extractedFiles = await fs.readdir(nativesDir);
    console.log(`Total extracted files: ${extractedFiles.length}`);
    console.log(`Files: ${extractedFiles.join(', ')}`);
    
    const hasLwjgl64 = extractedFiles.includes('lwjgl64.dll');
    const hasLwjgl = extractedFiles.includes('lwjgl.dll');
    const hasJinput = extractedFiles.some(f => f.includes('jinput') && f.endsWith('.dll'));
    
    console.log(`\n📋 Verification Results:`);
    console.log(`  - lwjgl64.dll: ${hasLwjgl64 ? '✅ FOUND' : '❌ MISSING'}`);
    console.log(`  - lwjgl.dll: ${hasLwjgl ? '✅ FOUND' : '❌ MISSING'}`);
    console.log(`  - jinput DLLs: ${hasJinput ? '✅ FOUND' : '❌ MISSING'}`);
    
    if (hasLwjgl64 || hasLwjgl) {
      console.log('\n🎉 SUCCESS: LWJGL native libraries extracted successfully!');
      console.log('The "Can\'t load library: lwjgl64.dll" error should now be fixed.');
    } else {
      console.log('\n❌ FAILURE: LWJGL native libraries still missing.');
      console.log('The extraction may have failed or the jar doesn\'t contain the expected files.');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testNativeExtraction();