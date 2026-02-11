/**
 * Script to fix LWJGL native library issues for Minecraft 1.8.9
 * This script clears the natives directory and forces re-extraction
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

async function fixLWJGLNatives() {
  try {
    // Get Minecraft directory
    const minecraftDir = path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft');
    const versionId = '1.8.9';
    const nativesDir = path.join(minecraftDir, 'versions', versionId, 'natives');
    
    console.log('LWJGL Native Library Fix Script');
    console.log('================================');
    console.log(`Minecraft directory: ${minecraftDir}`);
    console.log(`Natives directory: ${nativesDir}`);
    
    // Check if natives directory exists
    try {
      const files = await fs.readdir(nativesDir);
      console.log(`\nCurrent natives directory contents (${files.length} files):`);
      files.forEach(file => console.log(`  - ${file}`));
      
      // Check for specific LWJGL files
      const hasLwjgl64 = files.includes('lwjgl64.dll');
      const hasLwjgl = files.includes('lwjgl.dll');
      const hasJinput = files.some(f => f.includes('jinput') && f.endsWith('.dll'));
      
      console.log(`\nLWJGL file check:`);
      console.log(`  - lwjgl64.dll: ${hasLwjgl64 ? 'FOUND' : 'MISSING'}`);
      console.log(`  - lwjgl.dll: ${hasLwjgl ? 'FOUND' : 'MISSING'}`);
      console.log(`  - jinput DLLs: ${hasJinput ? 'FOUND' : 'MISSING'}`);
      
      if (!hasLwjgl64 && !hasLwjgl) {
        console.log('\n❌ LWJGL native libraries are missing!');
        console.log('This explains the "Can\'t load library: lwjgl64.dll" error.');
      } else {
        console.log('\n✅ LWJGL native libraries appear to be present.');
      }
      
    } catch (error) {
      console.log('\n❌ Natives directory does not exist or cannot be read.');
      console.log('This explains the LWJGL loading error.');
    }
    
    // Offer to clear the natives directory
    console.log('\n🔧 Clearing natives directory to force re-extraction...');
    
    try {
      await fs.rm(nativesDir, { recursive: true, force: true });
      console.log('✅ Natives directory cleared successfully.');
      console.log('\n📝 Next steps:');
      console.log('1. Launch Minecraft 1.8.9 again');
      console.log('2. The launcher will automatically re-extract native libraries');
      console.log('3. Check the console output for extraction details');
    } catch (error) {
      console.error('❌ Failed to clear natives directory:', error.message);
      console.log('\n📝 Manual steps:');
      console.log(`1. Manually delete the folder: ${nativesDir}`);
      console.log('2. Launch Minecraft 1.8.9 again');
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
  }
}

// Run the fix
fixLWJGLNatives();