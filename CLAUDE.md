# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

Chrome extension (Manifest V3) that downloads LinkedIn profiles as PDFs and extracts profile data for candidate analysis. Part of a recruitment tools suite that integrates with the Candidate Analyzer web app.

## Architecture

### Component Communication Flow

```
popup.html/popup.js (UI)
    ↓ chrome.tabs.sendMessage
content.js (Profile extraction on LinkedIn)
    ↓ chrome.runtime.sendMessage
background.js (Service worker for storage/downloads)
    ↓ chrome.storage.local / chrome.downloads API
Local storage (profile data) / File system (CSV exports)
```

### Key Files

- **manifest.json**: Chrome extension config (Manifest V3)
- **content.js**: Profile detection, data extraction, floating download button
- **background.js**: Service worker for profile storage and downloads
- **popup.html/popup.js**: User interface for download controls and CSV export

### Critical Architecture Patterns

1. **Profile Detection**:
   - Detects LinkedIn profile pages via URL pattern `/in/`
   - Adds floating download button to profile pages
   - Uses MutationObserver for SPA navigation detection

2. **Data Extraction Strategy** (content.js):
   - `getCandidateName()`: Multiple fallback selectors for name
   - `extractProfileData()`: Extracts all profile sections
   - LinkedIn changes frequently - selectors need regular updates

3. **Download Approaches**:
   - **Native**: Tries to find LinkedIn's "Save to PDF" option
   - **Print**: Falls back to browser print dialog (user saves as PDF)
   - **Data Only**: Extracts text data without PDF

4. **Storage**:
   - `chrome.storage.local` for profile data
   - Profiles indexed by LinkedIn URL to prevent duplicates
   - Auto-cleanup of profiles older than 30 days

## Integration Points

### Candidate Analyzer Web App

Located at `bigoil.net/candidate-analyzer.html`:
- Receives CSV exports from this extension
- Provides job fit analysis
- Uses same data structure

### Expected Profile Data Structure

```javascript
{
  id: string,
  name: string,
  headline: string,
  location: string,
  about: string,
  currentTitle: string,
  currentCompany: string,
  experience: [{ title, company, duration }],
  education: [{ school, degree }],
  skills: string[],
  profileUrl: string,
  source: 'LinkedIn Extension',
  addedAt: ISO string,
  fitScores: { [jobId]: AnalysisResult }
}
```

### API Endpoints (Optional Backend)

If connected to the PNOE WebApp backend:

- `POST /api/parse-linkedin-pdf` - Parse uploaded PDF
- `POST /api/analyze-candidate-fit` - AI-powered fit analysis

## Development Commands

### Loading the Extension

```bash
# 1. Open Chrome extensions page
# chrome://extensions/

# 2. Enable Developer mode

# 3. Click "Load unpacked" and select:
cd /Users/markgentry/linkedin-profile-downloader

# 4. After changes, reload extension from chrome://extensions/
```

### Creating Icons

```bash
# Open in browser and save canvases as PNGs
open icons/create_icons.html

# Or use the shell script if ImageMagick is available
./icons/create_icons.sh
```

### Debugging

```bash
# Content script logs (on LinkedIn page)
# Open DevTools (F12) → Console

# Popup debugging
# Right-click extension icon → Inspect popup

# Background script debugging
# chrome://extensions/ → Click "service worker" link
```

## LinkedIn Selector Updates

When LinkedIn changes their page structure, update these functions in content.js:

### Name Selectors (getCandidateName)

```javascript
const nameSelectors = [
  'h1.text-heading-xlarge',
  '.pv-top-card--list li:first-child',
  '.text-heading-xlarge',
  '.profile-topcard-person-entity__name',
  // Add new selectors here
];
```

### Profile Sections (extractProfileData)

Key sections to check:
- `#about` - About section
- `#experience` - Work experience
- `#education` - Education
- `#skills` - Skills list

## Common Issues

### "Page info not available"

- Content script not injected
- Refresh LinkedIn page
- Check manifest.json matches_patterns

### Profile data incomplete

- LinkedIn changed their DOM structure
- Check browser console for extraction errors
- Update selectors in content.js

### Download button not appearing

- Check if URL contains `/in/`
- Check for JavaScript errors in console
- MutationObserver may not have fired

## Files Not to Modify

- `manifest.json` permissions (may break functionality)
- Icon paths (extension won't load without them)

## Related Projects

- **bigoil.net/candidate-analyzer.html** - Candidate analysis web app
- **bigoil.net/interview-analyzer.html** - Interview transcript analysis
- **indeed-resume-downloader-extension/** - Similar tool for Indeed

## Security Considerations

- No credentials stored
- All data in local storage only
- No external API calls without user action
- Respects LinkedIn's page access (can't see private profiles)
