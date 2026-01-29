# ReviseLikeTeacher Backend

Node.js/Express backend API server.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file with environment variables (optional - defaults work for development):
```env
DB_PATH=./database.sqlite
JWT_SECRET=your_secret_key
AI_SERVICE_URL=http://localhost:8000
PORT=3000
NODE_ENV=development
```

**Note:** The database file (`database.sqlite`) will be created automatically in the `backend/` directory when you first run the server. No separate database installation required!

3. Run server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

Server runs on `http://localhost:3000`

## API Documentation

OpenAPI specification available at `openapi.yaml`

View interactive docs:
- Import `openapi.yaml` into Swagger UI
- Or use Postman to import the spec

## Routes

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/reset-password` - Request password reset

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile

### Onboarding
- `POST /api/onboarding` - Complete onboarding

### Questions
- `GET /api/questions` - Get questions (with filters)
- `GET /api/questions/:id` - Get question by ID
- `POST /api/questions` - Create question (admin)
- `PUT /api/questions/:id` - Update question (admin)

### Attempts
- `POST /api/attempts` - Submit answer attempt
- `POST /api/attempts/:id/feedback/rate` - Rate AI feedback

## Authentication

All protected routes require Bearer token in Authorization header:
```
Authorization: Bearer <token>
```

## Error Responses

All errors follow this format:
```json
{
  "error": "Error message"
}
```

Status codes:
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error

