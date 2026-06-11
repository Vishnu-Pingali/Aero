# AERO TRACK — React Migration Setup Script
# Run this from C:\Users\vishn\Aero\frontend in PowerShell

# 1. Install all dependencies
npm install

# 2. Delete old files
Remove-Item "code.html" -Force -ErrorAction SilentlyContinue
Remove-Item "src\App.css" -Force -ErrorAction SilentlyContinue
Write-Host "Old files removed."

# 3. Start dev server
npm run dev
