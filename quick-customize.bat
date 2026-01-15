@echo off
:: ============================================
:: Quick Launcher Customization
:: ============================================
:: 
:: Usage: 
::   quick-customize.bat changename "My Custom Launcher"
::   quick-customize.bat changeappid "com.myname.launcher"
::   quick-customize.bat changeproduct "My Minecraft Launcher"
::   quick-customize.bat changeauthor "Your Name"
::   quick-customize.bat changedesc "My custom Minecraft launcher"
::   quick-customize.bat view
::
:: ============================================

if "%1"=="" goto help
if "%1"=="help" goto help
if "%1"=="changename" goto changename
if "%1"=="changeappid" goto changeappid
if "%1"=="changeproduct" goto changeproduct
if "%1"=="changeauthor" goto changeauthor
if "%1"=="changedesc" goto changedesc
if "%1"=="view" goto view
goto help

:changename
if "%~2"=="" (
    echo Error: Please provide a name
    echo Example: quick-customize.bat changename "My Launcher"
    exit /b 1
)
node -e "const fs=require('fs');const pkg=require('./package.json');pkg.name='%~2';fs.writeFileSync('package.json',JSON.stringify(pkg,null,2));"
echo ✓ Launcher name changed to: %~2
exit /b 0

:changeappid
if "%~2"=="" (
    echo Error: Please provide an app ID
    echo Example: quick-customize.bat changeappid "com.myname.launcher"
    exit /b 1
)
node -e "const fs=require('fs');const pkg=require('./package.json');pkg.build.appId='%~2';fs.writeFileSync('package.json',JSON.stringify(pkg,null,2));"
echo ✓ App ID changed to: %~2
exit /b 0

:changeproduct
if "%~2"=="" (
    echo Error: Please provide a product name
    echo Example: quick-customize.bat changeproduct "My Minecraft Launcher"
    exit /b 1
)
node -e "const fs=require('fs');const pkg=require('./package.json');pkg.build.productName='%~2';fs.writeFileSync('package.json',JSON.stringify(pkg,null,2));"
node -e "const fs=require('fs');let html=fs.readFileSync('src/renderer/index.html','utf8');html=html.replace(/<title>.*?<\/title>/,'<title>%~2</title>');fs.writeFileSync('src/renderer/index.html',html);"
echo ✓ Product name changed to: %~2
echo ✓ Window title updated in HTML
exit /b 0

:changeauthor
if "%~2"=="" (
    echo Error: Please provide an author name
    echo Example: quick-customize.bat changeauthor "Your Name"
    exit /b 1
)
node -e "const fs=require('fs');const pkg=require('./package.json');pkg.author='%~2';fs.writeFileSync('package.json',JSON.stringify(pkg,null,2));"
echo ✓ Author changed to: %~2
exit /b 0

:changedesc
if "%~2"=="" (
    echo Error: Please provide a description
    echo Example: quick-customize.bat changedesc "My custom launcher"
    exit /b 1
)
node -e "const fs=require('fs');const pkg=require('./package.json');pkg.description='%~2';fs.writeFileSync('package.json',JSON.stringify(pkg,null,2));"
echo ✓ Description changed to: %~2
exit /b 0

:view
echo.
echo ========================================
echo   Current Launcher Settings
echo ========================================
echo.
node -e "const pkg=require('./package.json');console.log('Name:          ',pkg.name);console.log('App ID:        ',pkg.build.appId);console.log('Product Name:  ',pkg.build.productName);console.log('Author:        ',pkg.author);console.log('Description:   ',pkg.description);"
echo.
exit /b 0

:help
echo.
echo ========================================
echo   Quick Launcher Customization
echo ========================================
echo.
echo Usage:
echo   quick-customize.bat COMMAND "VALUE"
echo.
echo Commands:
echo   changename "name"       - Change launcher name
echo   changeappid "id"        - Change app ID (e.g., com.myname.launcher)
echo   changeproduct "name"    - Change product name (window title)
echo   changeauthor "name"     - Change author name
echo   changedesc "text"       - Change description
echo   view                    - View current settings
echo   help                    - Show this help
echo.
echo Examples:
echo   quick-customize.bat changename "My Custom Launcher"
echo   quick-customize.bat changeproduct "My Minecraft Launcher"
echo   quick-customize.bat view
echo.
echo After making changes, run: npm run build
echo.
exit /b 0
