# Vega Invoice Review App

Invoice management app for bills@vega.io — built with Next.js + Vercel.

## Setup (one time)

### 1. Google OAuth
1. Go to https://console.cloud.google.com
2. Create project → APIs & Services → Credentials → Create OAuth 2.0 Client ID
3. Type: Web Application
4. Authorized redirect URI: `https://your-app.vercel.app/api/auth/callback/google`
5. Copy Client ID and Client Secret

### 2. Deploy to Vercel
1. Go to https://vercel.com → New Project
2. Drag the entire `invoice-app` folder
3. Add environment variables (see .env.example):
   - NEXTAUTH_SECRET (any random string)
   - NEXTAUTH_URL (your Vercel URL)
   - GOOGLE_CLIENT_ID
   - GOOGLE_CLIENT_SECRET
   - ANTHROPIC_API_KEY
   - CRON_SECRET (any random string)
4. Deploy

### 3. PWA on iPhone
1. Open the app in Safari on iPhone
2. Tap Share → "Add to Home Screen"
3. App will ask for notification permission — allow it

### 4. PWA on Mac
1. Open in Chrome or Safari
2. Address bar → Install icon (or File → Save Page As App)

## How it works
- **Cron**: Vercel runs `/api/cron/check-invoices` every 2 minutes
- **Gmail**: Searches for emails to bills@vega.io with PDF attachments
- **Claude**: Extracts invoice data from PDFs
- **Drive**: Uploads PDFs to supplier folders
- **Sheets**: Logs each invoice to the current month's tab
- **Push**: Sends notification when new invoice arrives
