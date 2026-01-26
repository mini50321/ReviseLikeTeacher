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
psql -d reviseliketeacher -f database/schema.sql

Write-Host "3. Seeding initial data..." -ForegroundColor Yellow
psql -d reviseliketeacher -f database/seed_data.sql

Write-Host "4. Installing backend dependencies..." -ForegroundColor Yellow
Set-Location api
npm install
Set-Location ..

Write-Host "5. Creating .env file..." -ForegroundColor Yellow
if (-not (Test-Path "api\.env")) {
    Copy-Item "api\.env.example" "api\.env"
    Write-Host "Please edit api\.env with your database credentials" -ForegroundColor Cyan
} else {
    Write-Host ".env file already exists" -ForegroundColor Yellow
}

Write-Host "Setup complete!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Edit api\.env with your configuration"
Write-Host "2. Run 'cd api && npm start' to start the server"

