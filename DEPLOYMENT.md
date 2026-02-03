# Deployment Guide for Render.com

This guide will help you deploy the ReviseLikeTeacher application to Render.com.

## Prerequisites

1. A GitHub account
2. A Render.com account (sign up at https://render.com)
3. Your project pushed to a GitHub repository

## Step 1: Push Your Code to GitHub

1. Initialize git (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. Create a new repository on GitHub

3. Push your code:
   ```bash
   git remote add origin <your-github-repo-url>
   git branch -M main
   git push -u origin main
   ```

## Step 2: Deploy Backend Service

1. Go to https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure the backend service:
   - **Name**: `reviseliketeacher-backend`
   - **Environment**: `Node`
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start`
   - **Root Directory**: Leave empty (or set to `backend` if deploying from subdirectory)

5. Add Environment Variables:
   - `NODE_ENV` = `production`
   - `PORT` = `10000` (Render assigns this automatically, but set it for safety)
   - `JWT_SECRET` = Generate a strong random string (you can use: `openssl rand -base64 32`)

6. Click "Create Web Service"

7. Wait for deployment to complete and note the backend URL (e.g., `https://reviseliketeacher-backend.onrender.com`)

## Step 3: Deploy Frontend Service

1. In Render dashboard, click "New +" → "Web Service"
2. Connect the same GitHub repository
3. Configure the frontend service:
   - **Name**: `reviseliketeacher-frontend`
   - **Environment**: `Node`
   - **Build Command**: `cd frontend && npm install && npm run build`
   - **Start Command**: `cd frontend && node server.js`
   - **Root Directory**: Leave empty (or set to `frontend` if deploying from subdirectory)

4. Add Environment Variables:
   - `NODE_ENV` = `production`
   - `NEXT_PUBLIC_API_URL` = `https://reviseliketeacher-backend.onrender.com/api` (replace with your actual backend URL)
   - Note: `PORT` is automatically set by Render, no need to set it manually

5. Click "Create Web Service"

6. Wait for deployment to complete

## Step 4: Update Backend CORS Settings

After deploying, update the backend environment variable:
- `FRONTEND_URL` = `https://reviseliketeacher-frontend.onrender.com` (your frontend URL)

## Step 5: Create Admin User

After deployment, you'll need to create an admin user. You can:

1. Use Render's Shell feature to run:
   ```bash
   cd backend
   node scripts/create-admin.js admin@example.com yourpassword
   ```

2. Or manually update the database using Render's database feature (if you migrate to PostgreSQL later)

## Important Notes

### Database
- The current setup uses SQLite with sql.js, which stores data in memory/filesystem
- For production, consider migrating to PostgreSQL (Render offers free PostgreSQL databases)
- The database file will persist on Render's filesystem, but backups are recommended

### File Uploads
- PDF uploads are stored in `backend/uploads/` directory
- This directory persists on Render, but consider using cloud storage (AWS S3, Cloudinary) for production

### Environment Variables Summary

**Backend:**
- `NODE_ENV` = `production`
- `PORT` = `10000` (auto-assigned by Render)
- `JWT_SECRET` = (generate a strong random string)
- `FRONTEND_URL` = (your frontend URL)

**Frontend:**
- `NODE_ENV` = `production`
- `NEXT_PUBLIC_API_URL` = (your backend URL + `/api`)
- `PORT` = `10000` (auto-assigned by Render)

## Troubleshooting

1. **Build fails**: Check build logs in Render dashboard
2. **CORS errors**: Ensure `FRONTEND_URL` is set correctly in backend
3. **Database issues**: Check that database.sqlite file is being created
4. **Port issues**: Render automatically assigns PORT, ensure your code uses `process.env.PORT`

## Alternative: Using render.yaml

You can also use the `render.yaml` file in the root directory for automatic deployment configuration.

1. Push `render.yaml` to your repository
2. In Render dashboard, select "New +" → "Blueprint"
3. Connect your repository
4. Render will automatically detect and configure services from the YAML file

## Post-Deployment

1. Test the application at your frontend URL
2. Create an admin account using the script
3. Upload some sample questions
4. Test the full workflow

Your application should now be live and accessible to your client!

