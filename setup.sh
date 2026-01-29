#!/bin/bash

echo "Setting up ReviseLikeTeacher..."

echo "1. Installing backend dependencies..."
cd backend
npm install
cd ..

echo "2. Installing frontend dependencies..."
cd frontend
npm install
cd ..

echo "3. Creating .env file..."
if [ ! -f backend/.env ]; then
    cat > backend/.env << EOF
DB_PATH=./database.sqlite
JWT_SECRET=your_secret_key_change_this_in_production
AI_SERVICE_URL=http://localhost:8000
PORT=3000
NODE_ENV=development
EOF
    echo "Created backend/.env file"
else
    echo ".env file already exists"
fi

echo "Setup complete!"
echo "Next steps:"
echo "1. Database will be created automatically on first server start"
echo "2. Run 'npm run start:backend' to start the backend server"
echo "3. Run 'npm run start:frontend' to start the frontend server"
