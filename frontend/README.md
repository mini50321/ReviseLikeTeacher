# ReviseLikeTeacher Frontend

Next.js frontend application for ReviseLikeTeacher platform.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` file:
```bash
cp .env.local.example .env.local
```

3. Update `.env.local` with your API URL:
```
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

4. Run development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3001`

## Project Structure

```
src/
├── app/              # Next.js app router pages
│   ├── login/       # Login page
│   ├── signup/      # Signup page
│   ├── reset-pw/    # Password reset page
│   └── layout.js    # Root layout
├── components/       # Reusable components
│   ├── Header.js     # Navigation header
│   └── ProtectedRoute.js  # Auth protection
├── contexts/        # React contexts
│   └── AuthContext.js  # Authentication state
└── lib/             # Utilities
    └── api.js       # API client
```

## Features Implemented

- ✅ Login page
- ✅ Signup page
- ✅ Password reset page
- ✅ Authentication context
- ✅ Protected routes
- ✅ Header navigation
- ✅ Token management

## Next Steps

- Dashboard page
- Practice module
- Admin panel
- Onboarding flow

