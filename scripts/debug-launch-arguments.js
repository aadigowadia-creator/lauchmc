/**
 * Debug script to check launch arguments for JSON issues
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

async function debugLaunchArguments() {
  try {
    console.log('Launch Arguments Debug Script');
    console.log('=============================');
    
    // Mock configuration similar to what would be used for MC 1.8.9
    const mockConfig = {
      authData: {
        userProfile: {
          name: 'TestUser',
          id: '12345678-1234-1234-1234-123456789012'
        },
        accessToken: 'test-access-token-12345'
      },
      versionMetadata: {
        id: '1.8.9',
        type: 'release',
        assets: 'legacy'
      },
      gameDirectory: 'C:\\Users\\aadig_crz48yb\\AppData\\Roaming\\.minecraft',
      assetsDirectory: 'C:\\Users\\aadig_crz48yb\\AppData\\Roaming\\.minecraft\\assets',
      librariesDirectory: 'C:\\Users\\aadig_crz48yb\\AppData\\Roaming\\.minecraft\\libraries',
      nativesDirectory: 'C:\\Users\\aadig_crz48yb\\AppData\\Roaming\\.minecraft\\versions\\1.8.9\\natives'
    };
    
    console.log('Mock Configuration:');
    console.log('- Username:', mockConfig.authData.userProfile.name);
    console.log('- UUID:', mockConfig.authData.userProfile.id);
    console.log('- Access Token:', mockConfig.authData.accessToken.substring(0, 20) + '...');
    console.log('- Game Directory:', mockConfig.gameDirectory);
    console.log('- Version:', mockConfig.versionMetadata.id);
    
    // Test argument escaping functions
    function escapeArgument(value) {
      if (!value) return '';
      return value
        .replace(/[\r\n\t]/g, '') // Remove line breaks and tabs
        .replace(/[{}]/g, '') // Remove curly braces that could be interpreted as JSON
        .trim();
    }
    
    function escapePathArgument(path) {
      if (!path) return '';
      let escapedPath = path.replace(/\//g, '\\');
      escapedPath = escapedPath.replace(/[\r\n\t]/g, '').trim();
      return escapedPath;
    }
    
    // Test typical MC 1.8.9 arguments
    const testArguments = [
      '--username', escapeArgument(mockConfig.authData.userProfile.name),
      '--version', escapeArgument(mockConfig.versionMetadata.id),
      '--gameDir', escapePathArgument(mockConfig.gameDirectory),
      '--assetsDir', escapePathArgument(mockConfig.assetsDirectory),
      '--assetIndex', escapeArgument(mockConfig.versionMetadata.assets),
      '--uuid', escapeArgument(mockConfig.authData.userProfile.id),
      '--accessToken', escapeArgument(mockConfig.authData.accessToken),
      '--userType', 'mojang',
      '--versionType', escapeArgument(mockConfig.versionMetadata.type)
    ];
    
    console.log('\n🔍 Generated Arguments:');
    for (let i = 0; i < testArguments.length; i += 2) {
      const flag = testArguments[i];
      const value = testArguments[i + 1];
      console.log(`  ${flag} = "${value}"`);
      
      // Check for potential JSON issues
      if (value && (value.includes('{') || value.includes('}'))) {
        console.log(`    ⚠️  WARNING: Contains JSON characters`);
      }
      if (value && /[\r\n\t]/.test(value)) {
        console.log(`    ⚠️  WARNING: Contains control characters`);
      }
      if (value && value.includes(' ') && !value.startsWith('"')) {
        console.log(`    ℹ️  INFO: Contains spaces (may need quoting)`);
      }
    }
    
    // Test legacy argument string (typical for MC 1.8.9)
    const legacyArgumentString = '--username ${auth_player_name} --version ${version_name} --gameDir ${game_directory} --assetsDir ${assets_root} --assetIndex ${assets_index_name} --uuid ${auth_uuid} --accessToken ${auth_access_token} --userType ${user_type} --versionType ${version_type}';
    
    console.log('\n🔍 Testing Legacy Argument Resolution:');
    console.log('Original:', legacyArgumentString);
    
    let resolved = legacyArgumentString;
    resolved = resolved.replace(/\$\{auth_player_name\}/g, escapeArgument(mockConfig.authData.userProfile.name));
    resolved = resolved.replace(/\$\{version_name\}/g, escapeArgument(mockConfig.versionMetadata.id));
    resolved = resolved.replace(/\$\{game_directory\}/g, escapePathArgument(mockConfig.gameDirectory));
    resolved = resolved.replace(/\$\{assets_root\}/g, escapePathArgument(mockConfig.assetsDirectory));
    resolved = resolved.replace(/\$\{assets_index_name\}/g, escapeArgument(mockConfig.versionMetadata.assets));
    resolved = resolved.replace(/\$\{auth_uuid\}/g, escapeArgument(mockConfig.authData.userProfile.id));
    resolved = resolved.replace(/\$\{auth_access_token\}/g, escapeArgument(mockConfig.authData.accessToken));
    resolved = resolved.replace(/\$\{user_type\}/g, 'mojang');
    resolved = resolved.replace(/\$\{version_type\}/g, escapeArgument(mockConfig.versionMetadata.type));
    
    console.log('Resolved:', resolved);
    
    const resolvedArgs = resolved.split(' ').filter(arg => arg.trim());
    console.log('Split into', resolvedArgs.length, 'arguments');
    
    // Check for issues in resolved arguments
    let hasIssues = false;
    resolvedArgs.forEach((arg, index) => {
      if (arg.includes('{') || arg.includes('}')) {
        console.log(`  ❌ Argument ${index}: "${arg}" contains JSON characters`);
        hasIssues = true;
      }
      if (/[\r\n\t]/.test(arg)) {
        console.log(`  ❌ Argument ${index}: "${arg}" contains control characters`);
        hasIssues = true;
      }
    });
    
    if (!hasIssues) {
      console.log('✅ No obvious JSON-related issues found in arguments');
    }
    
    console.log('\n📝 Recommendations:');
    console.log('1. Ensure all placeholder values are properly escaped');
    console.log('2. Remove any JSON characters from argument values');
    console.log('3. Check that paths with spaces are handled correctly');
    console.log('4. Verify authentication data doesn\'t contain malformed JSON');
    
  } catch (error) {
    console.error('❌ Debug script failed:', error.message);
  }
}

// Run the debug
debugLaunchArguments();