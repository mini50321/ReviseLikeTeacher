# Quick Start Guide

## How to Run the Project

This project requires **two terminals** - one for the backend and one for the frontend.

### Step 1: Install Dependencies (First Time Only)

**Backend:**
```powershell
cd backend
npm install
```

**Frontend:**
```powershell
cd frontend
npm install
```

### Step 2: Start the Backend Server

Open **Terminal 1** (PowerShell or Command Prompt):

```powershell
cd "D:\my project\student, admin\1-24\backend"
npm start
```

You should see:
```
✅ Database loaded
✅ Server running on port 3000
```

**Keep this terminal open!** The backend must be running for the app to work.

### Step 3: Start the Frontend Server

Open **Terminal 2** (a new PowerShell or Command Prompt window):

```powershell
cd "D:\my project\student, admin\1-24\frontend"
npm run dev
```

You should see:
```
▲ Next.js 14.0.4
- Local:        http://localhost:3001
```

**Keep this terminal open too!**

### Step 4: Open the Application

Open your browser and go to:
```
http://localhost:3001
```

### Step 5: Add Sample Questions (First Time Only)

If you haven't added questions yet, in **Terminal 1** (backend terminal), press `Ctrl+C` to stop the server, then run:

```powershell
npm run seed-questions
```

Then start the server again:
```powershell
npm start
```

## Troubleshooting

### Port Already in Use

If you see `EADDRINUSE: address already in use :::3000`:

1. Find and stop the process using port 3000:
   ```powershell
   Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
   ```

2. Then start the backend again.

### Frontend Port 3001 Already in Use

If port 3001 is taken, Next.js will automatically use the next available port (3002, 3003, etc.). Check the terminal output for the actual URL.

### Database Issues

If you need to reset the database:
1. Stop the backend server
2. Delete `backend/database.sqlite`
3. Restart the backend (it will recreate the database)
4. Run `npm run seed-questions` to add sample questions

## What's Running Where

- **Backend API**: `http://localhost:3000`
- **Frontend App**: `http://localhost:3001`
- **Database**: `backend/database.sqlite` (SQLite file, no separate server needed)

## Development Mode

For auto-reload on code changes:

**Backend (Terminal 1):**
```powershell
cd backend
npm run dev
```
(Uses nodemon for auto-restart)

**Frontend (Terminal 2):**
```powershell
cd frontend
npm run dev
```
(Next.js has built-in hot reload)

## Stopping the Servers

Press `Ctrl+C` in each terminal to stop the servers.

