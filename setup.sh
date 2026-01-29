#!/bin/bash

echo "Setting up ReviseLikeTeacher..."

echo "1. Creating database..."
createdb reviseliketeacher 2>/dev/null || echo "Database may already exist"

echo "2. Running database schema..."
psql -d reviseliketeacher -f backend/database/schema.sql

echo "3. Seeding initial data..."
psql -d reviseliketeacher -f backend/database/seed_data.sql

echo "4. Installing backend dependencies..."
cd backend
npm install
cd ..

echo "5. Installing frontend dependencies..."
cd frontend
npm install
cd ..

echo "6. Creating .env file..."
if [ ! -f backend/.env ]; then
    cat > backend/.env << EOF
DB_HOST=localhost
DB_PORT=5432
DB_NAME=reviseliketeacher
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=your_secret_key_change_this_in_production
AI_SERVICE_URL=http://localhost:8000
PORT=3000
NODE_ENV=development
EOF
    echo "Please edit backend/.env with your database credentials"
else
    echo ".env file already exists"
fi

echo "Setup complete!"
echo "Next steps:"
echo "1. Edit backend/.env with your configuration"
echo "2. Run 'npm run start:backend' to start the backend server"
echo "3. Run 'npm run start:frontend' to start the frontend server"

