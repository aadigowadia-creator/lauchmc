/**
 * Debug script to check what LWJGL libraries are available in the libraries directory
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

async function findFiles(dir, pattern) {
  const results = [];
  
  try {
    const files = await fs.readdir(dir);
    
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = await fs.stat(fullPath);
      
      if (stat.isDirectory()) {
        const subResults = await findFiles(fullPath, pattern);
        results.push(...subResults);
      } else if (file.toLowerCase().includes(pattern.toLowerCase())) {
        results.push(fullPath);
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }
  
  return results;
}

async function debugLWJGLLibraries() {
  try {
    const minecraftDir = path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft');
    const librariesDir = path.join(minecraftDir, 'libraries');
    
    console.log('LWJGL Library Debug Script');
    console.log('==========================');
    console.log(`Libraries directory: ${librariesDir}`);
    
    // Check if libraries directory exists
    try {
      await fs.access(librariesDir);
      console.log('✅ Libraries directory exists');
    } catch {
      console.log('❌ Libraries directory does not exist');
      return;
    }
    
    // Look for LWJGL-related files
    console.log('\n🔍 Searching for LWJGL-related files...');
    const lwjglFiles = await findFiles(librariesDir, 'lwjgl');
    
    if (lwjglFiles.length === 0) {
      console.log('❌ No LWJGL files found');
    } else {
      console.log(`✅ Found ${lwjglFiles.length} LWJGL-related files:`);
      lwjglFiles.forEach(file => {
        const relativePath = path.relative(librariesDir, file);
        console.log(`  - ${relativePath}`);
      });
    }
    
    // Look for JInput files
    console.log('\n🔍 Searching for JInput-related files...');
    const jinputFiles = await findFiles(librariesDir, 'jinput');
    
    if (jinputFiles.length === 0) {
      console.log('❌ No JInput files found');
    } else {
      console.log(`✅ Found ${jinputFiles.length} JInput-related files:`);
      jinputFiles.forEach(file => {
        const relativePath = path.relative(librariesDir, file);
        console.log(`  - ${relativePath}`);
      });
    }
    
    // Look for any files with "natives" in the name
    console.log('\n🔍 Searching for native library files...');
    const nativeFiles = await findFiles(librariesDir, 'natives');
    
    if (nativeFiles.length === 0) {
      console.log('❌ No native library files found');
    } else {
      console.log(`✅ Found ${nativeFiles.length} native library files:`);
      nativeFiles.forEach(file => {
        const relativePath = path.relative(librariesDir, file);
        console.log(`  - ${relativePath}`);
      });
    }
    
    // Check specific paths that might contain LWJGL 2.9.x
    console.log('\n🔍 Checking specific LWJGL 2.9.x paths...');
    const possiblePaths = [
      'org/lwjgl/lwjgl/lwjgl-platform',
      'org/lwjgl/lwjgl/lwjgl-platform/2.9.2-nightly-20140822',
      'org/lwjgl/lwjgl/lwjgl-platform/2.9.4-nightly-20150209',
      'net/java/jinput/jinput-platform',
      'net/java/jinput/jinput-platform/2.0.5'
    ];
    
    for (const possiblePath of possiblePaths) {
      const fullPath = path.join(librariesDir, possiblePath);
      try {
        const files = await fs.readdir(fullPath);
        console.log(`✅ Found directory: ${possiblePath}`);
        console.log(`   Files: ${files.join(', ')}`);
      } catch {
        console.log(`❌ Directory not found: ${possiblePath}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
  }
}

// Run the debug
debugLWJGLLibraries();