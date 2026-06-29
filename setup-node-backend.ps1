# setup-node-backend.ps1
# Run this once from v:\BUP to install Node.js deps and swap the backends.
# Usage: powershell -ExecutionPolicy Bypass -File setup-node-backend.ps1

Set-Location $PSScriptRoot

Write-Host "==> Installing Node.js packages in backend-node..." -ForegroundColor Cyan
Set-Location backend-node
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Error "npm install failed. Aborting."
    exit 1
}
Set-Location ..

Write-Host ""
Write-Host "==> Renaming directories (backend -> backend-python, backend-node -> backend)..." -ForegroundColor Cyan
Rename-Item backend  backend-python  -ErrorAction Stop
Rename-Item backend-node  backend    -ErrorAction Stop

Write-Host ""
Write-Host "All done!" -ForegroundColor Green
Write-Host "  Old Python backend saved as: backend-python\"
Write-Host "  New Node.js backend is now:  backend\"
Write-Host ""
Write-Host "To start the Node.js backend:" -ForegroundColor Yellow
Write-Host "  cd backend"
Write-Host "  npm run dev"
