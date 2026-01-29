Write-Host "Setting up ReviseLikeTeacher..." -ForegroundColor Green

Write-Host "1. Creating database..." -ForegroundColor Yellow
$dbExists = psql -lqt | Select-String -Pattern "reviseliketeacher"
if (-not $dbExists) {
    createdb reviseliketeacher
    Write-Host "Database created" -ForegroundColor Green
} else {
    Write-Host "Database already exists" -ForegroundColor Yellow
}

Write-Host "2. Running database schema..." -ForegroundColor Yellow
psql -d reviseliketeacher -f backend/database/schema.sql

Write-Host "3. Seeding initial data..." -ForegroundColor Yellow
psql -d reviseliketeacher -f backend/database/seed_data.sql

Write-Host "4. Installing backend dependencies..." -ForegroundColor Yellow
Set-Location backend
npm install
Set-Location ..

Write-Host "5. Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location frontend
npm install
Set-Location ..

Write-Host "6. Creating .env file..." -ForegroundColor Yellow
if (-not (Test-Path "backend\.env")) {
    @"
DB_HOST=localhost
DB_PORT=5432
DB_NAME=reviseliketeacher
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=your_secret_key_change_this_in_production
AI_SERVICE_URL=http://localhost:8000
PORT=3000
NODE_ENV=development
"@ | Out-File -FilePath "backend\.env" -Encoding utf8
    Write-Host "Please edit backend\.env with your database credentials" -ForegroundColor Cyan
} else {
    Write-Host ".env file already exists" -ForegroundColor Yellow
}

Write-Host "Setup complete!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Edit backend\.env with your configuration"
Write-Host "2. Run 'npm run start:backend' to start the backend server"
Write-Host "3. Run 'npm run start:frontend' to start the frontend server"

