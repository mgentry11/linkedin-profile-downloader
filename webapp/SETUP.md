# LinkedIn PDF Parser - Web App Setup

## Quick Start

1. Host these files on any web server (or use GitHub Pages)
2. Set up Google Cloud credentials (see below)
3. Update `app.js` with your credentials
4. Open in browser and start parsing!

---

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project: "LinkedIn PDF Parser"
3. Enable these APIs:
   - **Google Sheets API**
   - **Google Drive API**

## Step 2: Create OAuth Credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**

### Configure OAuth Consent Screen (if prompted):
- User Type: **External**
- App name: "LinkedIn PDF Parser"
- User support email: Your email
- Scopes: Add `../auth/spreadsheets` and `../auth/drive.file`
- Test users: Add your email

### Create OAuth Client:
- Application type: **Web application**
- Name: "LinkedIn PDF Parser"
- Authorized JavaScript origins:
  - `http://localhost:8000` (for testing)
  - `https://yourdomain.com` (for production)
- Authorized redirect URIs: (leave empty for implicit flow)

3. Copy the **Client ID**

## Step 3: Create API Key

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → API Key**
3. Copy the API Key
4. (Optional) Restrict to Sheets/Drive APIs

## Step 4: Update app.js

Open `app.js` and replace:

```javascript
const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
const API_KEY = 'YOUR_API_KEY';
```

## Step 5: Host the App

### Option A: Local Testing
```bash
cd webapp
python3 -m http.server 8000
# Open http://localhost:8000
```

### Option B: GitHub Pages
1. Push to GitHub
2. Settings → Pages → Deploy from main branch
3. Add your GitHub Pages URL to OAuth authorized origins

### Option C: Your Own Website
Upload `index.html` and `app.js` to your web server

## Step 6: Create a Google Sheet

1. Go to [Google Sheets](https://sheets.google.com/)
2. Create new blank spreadsheet
3. Copy the ID from URL: `docs.google.com/spreadsheets/d/[COPY-THIS-ID]/edit`

---

## Usage

1. Open the web app
2. Click "Sign in with Google"
3. Paste your Google Sheet ID
4. Drag & drop LinkedIn PDFs
5. Click "Process & Upload"

### What gets saved:

**Google Sheet columns:**
- First Name, Last Name
- Name (clickable LinkedIn link)
- Headline, Title, Company
- Location, School, Degree, Skills
- PDF Link (clickable link to Drive)
- Parsed timestamp

**Google Drive:**
- PDFs stored in "LinkedIn PDFs" folder
- Anyone with link can view

---

## Workflow with Bookmarklet

1. On LinkedIn Recruiter → Click "View public profile"
2. On public profile → Click "Download PDF" bookmarklet
3. Open this web app → Drag in the PDF
4. Click "Process & Upload"
5. Data appears in your Google Sheet with PDF link!
