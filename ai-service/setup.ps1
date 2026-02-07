Write-Host "Setting up ReviseLikeTeacher AI Service..." -ForegroundColor Green

Write-Host "1. Creating virtual environment..." -ForegroundColor Yellow
python -m venv venv

Write-Host "2. Activating virtual environment..." -ForegroundColor Yellow
& .\venv\Scripts\Activate.ps1

Write-Host "3. Installing dependencies..." -ForegroundColor Yellow
pip install --upgrade pip
pip install -r requirements.txt

Write-Host "4. Creating .env file..." -ForegroundColor Yellow
if (-not (Test-Path .env)) {
    @"
PORT=8000
OPENAI_API_KEY=your_openai_api_key_here
"@ | Out-File -FilePath .env -Encoding utf8
    Write-Host "Created .env file. Please update OPENAI_API_KEY with your actual API key." -ForegroundColor Yellow
} else {
    Write-Host ".env file already exists" -ForegroundColor Green
}

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To start the service:" -ForegroundColor Cyan
Write-Host "1. Activate virtual environment: .\venv\Scripts\Activate.ps1"
Write-Host "2. Update .env file with your OpenAI API key"
Write-Host "3. Run: python main.py"
Write-Host ""

