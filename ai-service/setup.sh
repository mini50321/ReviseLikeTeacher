#!/bin/bash

echo "Setting up ReviseLikeTeacher AI Service..."

echo "1. Creating virtual environment..."
python3 -m venv venv

echo "2. Activating virtual environment..."
source venv/bin/activate

echo "3. Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "4. Creating .env file..."
if [ ! -f .env ]; then
    cat > .env << EOF
PORT=8000
OPENAI_API_KEY=your_openai_api_key_here
EOF
    echo "Created .env file. Please update OPENAI_API_KEY with your actual API key."
else
    echo ".env file already exists"
fi

echo ""
echo "Setup complete!"
echo ""
echo "To start the service:"
echo "1. Activate virtual environment: source venv/bin/activate"
echo "2. Update .env file with your OpenAI API key"
echo "3. Run: python main.py"
echo ""

