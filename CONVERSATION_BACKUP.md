# Conversation Backup - LinkedIn PDF Parser Project

**Date:** December 19, 2024

## Summary

Built a complete LinkedIn PDF parsing system with three components:

### 1. Bookmarklet (for LinkedIn)
- Works on LinkedIn public profile pages
- Clicks LinkedIn's native "Save to PDF" button
- User workflow: Recruiter → View public profile → Click bookmarklet → PDF downloads

**File:** `bookmarklet-code.txt`

### 2. Web App (main tool)
- Standalone web page that can be hosted anywhere
- Google OAuth sign-in
- Drag & drop LinkedIn PDFs
- Parses: name, title, company, location, education, skills
- Uploads PDFs to Google Drive ("LinkedIn PDFs" folder)
- Adds parsed data to Google Sheet with clickable links
- Shows results table in real-time

**Files:** `webapp/index.html`, `webapp/app.js`, `webapp/SETUP.md`

### 3. Chrome Extension (alternative)
- Same functionality as web app
- Can auto-detect downloaded PDFs
- Uses Chrome identity API for auth

**Files:** `chrome-extension/*`

### 4. Python Scripts (bonus)
- `parse_linkedin_pdf.py` - CLI tool for parsing PDFs
- `pdf_watcher.py` - Monitors Downloads folder, auto-parses new PDFs

## Setup Required

For the web app to work, you need:

1. **Google Cloud Project** with:
   - Google Sheets API enabled
   - Google Drive API enabled
   - OAuth 2.0 credentials (Web application type)
   - API Key

2. **Update `webapp/app.js`** with:
   ```javascript
   const CLIENT_ID = 'your-client-id.apps.googleusercontent.com';
   const API_KEY = 'your-api-key';
   ```

3. **Create a Google Sheet** and copy its ID

4. **Host the webapp** (GitHub Pages, your website, or local server)

## Google Sheet Output Format

| First Name | Last Name | Name (LinkedIn) | Headline | Title | Company | Location | School | Degree | Skills | PDF Link | Parsed At |
|------------|-----------|-----------------|----------|-------|---------|----------|--------|--------|--------|----------|-----------|

- "Name (LinkedIn)" is a clickable hyperlink to their profile
- "PDF Link" is a clickable link to view the PDF in Google Drive

## Full Workflow

1. On LinkedIn Recruiter, click "View public profile"
2. On public profile, click bookmarklet → Downloads PDF
3. Open web app, drag in the PDF
4. Click "Process & Upload"
5. Data + PDF link appear in Google Sheet

## Key Decisions Made

- **Bookmarklet vs Extension for LinkedIn:** Bookmarklet chosen because LinkedIn actively detects and blocks extensions
- **Web App vs Extension for processing:** Web app chosen for simplicity and portability
- **Google Drive storage:** PDFs uploaded to Drive so they're accessible anywhere via link
- **Hyperlinks in Sheets:** Both LinkedIn profile and PDF links are clickable formulas

## Files Structure

```
linkedin-profile-downloader/
├── bookmarklet-code.txt          # Bookmarklet for LinkedIn
├── INSTALL_BOOKMARKLET.html      # Easy bookmarklet setup page
├── webapp/
│   ├── index.html                # Main web app
│   ├── app.js                    # All the logic
│   └── SETUP.md                  # Setup instructions
├── chrome-extension/             # Alternative Chrome extension
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   ├── background.js
│   ├── pdf.min.js
│   ├── pdf.worker.min.js
│   └── SETUP.md
├── parse_linkedin_pdf.py         # CLI parser
├── pdf_watcher.py                # Auto-watch Downloads folder
└── README.md
```
