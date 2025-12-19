# LinkedIn PDF to Google Sheets - Chrome Extension Setup

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name it "LinkedIn PDF Parser" → Create

## Step 2: Enable APIs

1. In the Cloud Console, go to "APIs & Services" → "Library"
2. Search for and enable:
   - **Google Sheets API**
   - **Google Drive API**

## Step 3: Create OAuth Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure OAuth consent screen:
   - User Type: External → Create
   - App name: "LinkedIn PDF Parser"
   - User support email: Your email
   - Developer contact: Your email
   - Save and Continue through all steps
4. Back to Credentials → Create OAuth client ID:
   - Application type: **Chrome Extension**
   - Name: "LinkedIn PDF Parser"
   - Extension ID: (get this after loading extension - see Step 5)

## Step 4: Get Extension ID

1. Open Chrome → go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `chrome-extension` folder
5. Copy the Extension ID shown (looks like: `abcdefghijklmnopqrstuvwxyz123456`)

## Step 5: Update Manifest with Client ID

1. Go back to Google Cloud Console → Credentials
2. Create OAuth client ID with your Extension ID
3. Copy the Client ID (ends in `.apps.googleusercontent.com`)
4. Edit `manifest.json` and replace `YOUR_CLIENT_ID.apps.googleusercontent.com` with your Client ID

## Step 6: Reload Extension

1. Go to `chrome://extensions/`
2. Click the refresh icon on the LinkedIn PDF Parser extension

## Step 7: Create a Google Sheet

1. Go to [Google Sheets](https://sheets.google.com/)
2. Create a new blank spreadsheet
3. Name it "LinkedIn Candidates"
4. Copy the Spreadsheet ID from the URL:
   - URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`
   - Copy the part between `/d/` and `/edit`

## Step 8: Use the Extension

1. Click the extension icon in Chrome toolbar
2. Click "Connect Google Account" and authorize
3. Paste your Spreadsheet ID in the settings
4. Click "Save Settings"

## Usage

### Manual Upload:
1. Click the extension icon
2. Drag & drop LinkedIn PDFs (or click to select)
3. Click "Process & Upload"
4. Data + PDF link appears in your Google Sheet

### Workflow with Bookmarklet:
1. On LinkedIn Recruiter → Click "View public profile"
2. On public profile → Use "Download PDF" bookmarklet
3. Open extension → Drag in downloaded PDF
4. Click "Process & Upload"

## What Gets Saved

In Google Sheet:
- First Name, Last Name
- Name (clickable LinkedIn link)
- Headline, Title, Company
- Location, School, Degree
- Skills
- PDF Link (clickable link to view the original PDF)
- Parsed timestamp

In Google Drive:
- PDFs stored in "LinkedIn PDFs" folder
- Anyone with the link can view

## Troubleshooting

**"Not connected" after clicking Connect:**
- Check that your Client ID is correctly set in manifest.json
- Verify the Extension ID matches in Google Cloud Console

**"Failed to append to sheet":**
- Make sure you have edit access to the spreadsheet
- Check the Spreadsheet ID is correct

**PDF not parsing correctly:**
- Make sure it's a LinkedIn profile PDF
- Try downloading the PDF again from LinkedIn
