#!/bin/bash

echo "Setting up ReviseLikeTeacher..."

echo "1. Creating database..."
createdb reviseliketeacher 2>/dev/null || echo "Database may already exist"

echo "2. Running database schema..."
psql -d reviseliketeacher -f database/schema.sql

echo "3. Seeding initial data..."
psql -d reviseliketeacher -f database/seed_data.sql

echo "4. Installing backend dependencies..."
cd api
npm install
cd ..

echo "5. Creating .env file..."
if [ ! -f api/.env ]; then
    cp api/.env.example api/.env
    echo "Please edit api/.env with your database credentials"
else
    echo ".env file already exists"
fi

echo "Setup complete!"
echo "Next steps:"
echo "1. Edit api/.env with your configuration"
echo "2. Run 'cd api && npm start' to start the server"

