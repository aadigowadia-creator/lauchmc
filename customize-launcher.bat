@echo off
setlocal enabledelayedexpansion

:: ============================================
:: Minecraft Launcher Customization Script
:: ============================================

echo.
echo ========================================
echo   Minecraft Launcher Customizer
echo ========================================
echo.

:menu
echo What would you like to customize?
echo.
echo 1. Change launcher name
echo 2. Change app ID
echo 3. Change product name (window title)
echo 4. Change author name
echo 5. Change description
echo 6. View current settings
echo 7. Exit
echo.
set /p choice="Enter your choice (1-7): "

if "%choice%"=="1" goto changename
if "%choice%"=="2" goto changeappid
if "%choice%"=="3" goto changeproduct
if "%choice%"=="4" goto changeauthor
if "%choice%"=="5" goto changedesc
if "%choice%"=="6" goto viewsettings
if "%choice%"=="7" goto end
goto menu

:changename
echo.
set /p newname="Enter new launcher name: "
if "%newname%"=="" (
    echo Error: Name cannot be empty!
    goto menu
)
call :updatePackageJson "name" "%newname%"
echo.
echo ✓ Launcher name changed to: %newname%
echo.
pause
goto menu

:changeappid
echo.
echo Current format: com.minecraft.launcher
set /p newappid="Enter new app ID (e.g., com.yourname.launcher): "
if "%newappid%"=="" (
    echo Error: App ID cannot be empty!
    goto menu
)
call :updatePackageJson "appId" "%newappid%"
echo.
echo ✓ App ID changed to: %newappid%
echo.
pause
goto menu

:changeproduct
echo.
set /p newproduct="Enter new product name (window title): "
if "%newproduct%"=="" (
    echo Error: Product name cannot be empty!
    goto menu
)
call :updatePackageJson "productName" "%newproduct%"
call :updateHtmlTitle "%newproduct%"
echo.
echo ✓ Product name changed to: %newproduct%
echo ✓ Window title updated
echo.
pause
goto menu

:changeauthor
echo.
set /p newauthor="Enter new author name: "
if "%newauthor%"=="" (
    echo Error: Author name cannot be empty!
    goto menu
)
call :updatePackageJson "author" "%newauthor%"
echo.
echo ✓ Author changed to: %newauthor%
echo.
pause
goto menu

:changedesc
echo.
set /p newdesc="Enter new description: "
if "%newdesc%"=="" (
    echo Error: Description cannot be empty!
    goto menu
)
call :updatePackageJson "description" "%newdesc%"
echo.
echo ✓ Description changed to: %newdesc%
echo.
pause
goto menu

:viewsettings
echo.
echo ========================================
echo   Current Launcher Settings
echo ========================================
echo.
node -e "const pkg=require('./package.json');console.log('Name:',pkg.name);console.log('App ID:',pkg.build.appId);console.log('Product Name:',pkg.build.productName);console.log('Author:',pkg.author);console.log('Description:',pkg.description);"
echo.
pause
goto menu

:updatePackageJson
:: Update package.json using Node.js
node -e "const fs=require('fs');const pkg=require('./package.json');if('%~1'==='appId'||'%~1'==='productName'){pkg.build['%~1']='%~2'}else{pkg['%~1']='%~2'};fs.writeFileSync('package.json',JSON.stringify(pkg,null,2));"
exit /b

:updateHtmlTitle
:: Update HTML title
node -e "const fs=require('fs');let html=fs.readFileSync('src/renderer/index.html','utf8');html=html.replace(/<title>.*?<\/title>/,'<title>%~1</title>');fs.writeFileSync('src/renderer/index.html',html);"
exit /b

:end
echo.
echo ========================================
echo   Changes saved!
echo ========================================
echo.
echo IMPORTANT: Run 'npm run build' to apply changes
echo.
pause
