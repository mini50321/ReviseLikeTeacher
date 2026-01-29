Write-Host "Setting up ReviseLikeTeacher..." -ForegroundColor Green

Write-Host "1. Installing backend dependencies..." -ForegroundColor Yellow
Set-Location backend
npm install
Set-Location ..

Write-Host "2. Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location frontend
npm install
Set-Location ..

Write-Host "3. Creating .env file..." -ForegroundColor Yellow
if (-not (Test-Path "backend\.env")) {
    @"
DB_PATH=./database.sqlite
JWT_SECRET=your_secret_key_change_this_in_production
AI_SERVICE_URL=http://localhost:8000
PORT=3000
NODE_ENV=development
"@ | Out-File -FilePath "backend\.env" -Encoding utf8
    Write-Host "Created backend\.env file" -ForegroundColor Green
} else {
    Write-Host ".env file already exists" -ForegroundColor Yellow
}

Write-Host "Setup complete!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Database will be created automatically on first server start"
Write-Host "2. Run 'npm run start:backend' to start the backend server"
Write-Host "3. Run 'npm run start:frontend' to start the frontend server"
