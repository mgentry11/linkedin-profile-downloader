# LinkedIn Profile Downloader

A Chrome extension that helps recruiters and HR professionals download LinkedIn profiles as PDFs and extract profile data for candidate analysis.

## Features

- **One-Click Download**: Floating download button on LinkedIn profile pages
- **Profile Data Extraction**: Automatically extracts name, headline, location, experience, education, and skills
- **CSV Export**: Export all saved profiles to CSV format
- **Local Storage**: Profiles are stored locally in your browser
- **Integration Ready**: Works with the Candidate Analyzer web app

## Installation

### Load as Unpacked Extension (Development)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `linkedin-profile-downloader` folder
5. The extension icon will appear in your toolbar

### Generate Icons

Before loading the extension, create the icons:

1. Open `icons/create_icons.html` in a browser
2. Right-click each canvas and save as PNG
3. Save as `icon16.png`, `icon48.png`, and `icon128.png` in the `icons` folder

## Usage

### Downloading a Profile

1. Navigate to any LinkedIn profile page
2. Click the blue "Download Profile" button (bottom-right corner)
3. The print dialog will open - select "Save as PDF"
4. Profile data is automatically extracted and saved

### Using the Extension Popup

1. Click the extension icon in your toolbar
2. View current profile information
3. Use "Download Profile PDF" for PDF export
4. Use "Extract Data Only" to save profile data without PDF
5. Use "Export to CSV" to export all saved profiles

### Integrating with Candidate Analyzer

1. Export profiles to CSV from the extension
2. Open the Candidate Analyzer at `bigoil.net/candidate-analyzer.html`
3. Upload the CSV to import candidates
4. Add job descriptions and run fit analysis

## File Structure

```
linkedin-profile-downloader/
├── manifest.json      # Extension configuration
├── content.js         # Profile page interaction
├── popup.html         # Extension popup UI
├── popup.js           # Popup functionality
├── background.js      # Service worker for downloads
├── icons/
│   ├── icon16.png     # 16x16 icon
│   ├── icon48.png     # 48x48 icon
│   └── icon128.png    # 128x128 icon
└── README.md          # This file
```

## Technical Details

### Permissions

- `activeTab`: Access current tab for profile extraction
- `downloads`: Save files to user's Downloads folder
- `storage`: Store profile data locally

### Host Permissions

- `https://www.linkedin.com/*`
- `https://linkedin.com/*`

### Data Extracted

- Name
- Headline/Title
- Location
- About/Summary
- Current Company
- Experience (title, company, duration)
- Education (school, degree)
- Skills list
- Profile URL

## Integration with Other Tools

This extension is part of a recruitment tools suite:

1. **LinkedIn Profile Downloader** (this extension)
   - Download and extract LinkedIn profiles

2. **Candidate Analyzer** (`bigoil.net/candidate-analyzer.html`)
   - Upload candidate data from CSVs
   - Add job descriptions
   - Run fit analysis with AI scoring

3. **Interview Analyzer** (`bigoil.net/interview-analyzer.html`)
   - Analyze interview transcripts
   - Generate comprehensive candidate reports

## Troubleshooting

### Extension Not Loading

1. Ensure all files are in the correct location
2. Check that icons exist in the `icons` folder
3. Refresh the extension in `chrome://extensions/`

### Profile Not Detected

1. Make sure you're on a LinkedIn profile page (`/in/username`)
2. Wait for the page to fully load
3. Refresh the page and try again

### Data Extraction Issues

LinkedIn frequently changes their page structure. If extraction fails:
1. The extension will still allow PDF download
2. Report issues with the page structure for updates

## Privacy & Security

- All data is stored locally in your browser
- No data is sent to external servers (except optional API calls)
- Profile data is only accessible to you
- Extension cannot access profiles you don't have permission to view

## Development

### Modifying Selectors

LinkedIn's page structure changes frequently. Update selectors in `content.js`:

- `getCandidateName()`: Name extraction selectors
- `extractProfileData()`: All profile data extraction
- `addDownloadButton()`: Floating button injection

### Adding API Integration

To connect to a backend for PDF parsing:

1. Update the API URL in `content.js`
2. Implement the `/api/parse-linkedin-pdf` endpoint
3. Return structured profile data

## License

For internal use only. Not for distribution.

## Support

For issues or feature requests, contact the development team.
