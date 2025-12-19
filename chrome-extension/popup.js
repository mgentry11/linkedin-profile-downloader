// LinkedIn PDF Parser - Chrome Extension
// Parses LinkedIn PDFs and uploads to Google Sheets

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

let pendingFiles = [];
let authToken = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await checkAuth();
  setupEventListeners();
  updateStats();
});

// Event Listeners
function setupEventListeners() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const processBtn = document.getElementById('processBtn');
  const authBtn = document.getElementById('authBtn');
  const saveSettings = document.getElementById('saveSettings');

  // Drag and drop
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
  processBtn.addEventListener('click', processFiles);
  authBtn.addEventListener('click', authenticate);
  saveSettings.addEventListener('click', saveSettingsToStorage);
}

// Handle file selection
function handleFiles(files) {
  pendingFiles = Array.from(files).filter(f => f.type === 'application/pdf');
  updateFileList();
  document.getElementById('processBtn').disabled = pendingFiles.length === 0;
}

// Update file list display
function updateFileList() {
  const list = document.getElementById('fileList');
  list.innerHTML = pendingFiles.map((f, i) => `
    <div class="file-item" data-index="${i}">
      <span class="name">${f.name}</span>
      <span class="status-icon">⏳</span>
    </div>
  `).join('');
}

// Google Authentication
async function authenticate() {
  try {
    showStatus('Connecting to Google...', 'info');

    // Use Chrome identity API for OAuth
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        showStatus('Auth failed: ' + chrome.runtime.lastError.message, 'error');
        return;
      }

      authToken = token;
      chrome.storage.local.set({ authToken: token });
      updateAuthStatus(true);
      showStatus('Connected to Google!', 'success');
    });
  } catch (error) {
    showStatus('Authentication failed: ' + error.message, 'error');
  }
}

async function checkAuth() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        authToken = token;
        updateAuthStatus(true);
      }
      resolve();
    });
  });
}

function updateAuthStatus(connected) {
  const status = document.getElementById('authStatus');
  const btn = document.getElementById('authBtn');
  const settings = document.getElementById('sheetSettings');

  if (connected) {
    status.className = 'connected';
    status.innerHTML = '✓ Connected to Google';
    btn.textContent = 'Reconnect';
    settings.style.display = 'block';
  } else {
    status.className = 'not-connected';
    status.textContent = 'Not connected';
    btn.textContent = 'Connect Google Account';
    settings.style.display = 'none';
  }
}

// Settings
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['spreadsheetId', 'totalProcessed', 'lastUpload'], (data) => {
      if (data.spreadsheetId) {
        document.getElementById('spreadsheetId').value = data.spreadsheetId;
      }
      resolve();
    });
  });
}

function saveSettingsToStorage() {
  const spreadsheetId = document.getElementById('spreadsheetId').value.trim();
  chrome.storage.local.set({ spreadsheetId }, () => {
    showStatus('Settings saved!', 'success');
  });
}

// Process PDFs
async function processFiles() {
  if (!authToken) {
    showStatus('Please connect to Google first', 'error');
    return;
  }

  const spreadsheetId = document.getElementById('spreadsheetId').value.trim();
  if (!spreadsheetId) {
    showStatus('Please enter a Spreadsheet ID', 'error');
    return;
  }

  const processBtn = document.getElementById('processBtn');
  processBtn.disabled = true;
  showStatus('Processing PDFs...', 'info');

  // Get or create Drive folder for PDFs
  let folderId = await getOrCreateFolder('LinkedIn PDFs');

  // Initialize sheet with headers if needed
  await initializeSheet(spreadsheetId);

  let successCount = 0;

  for (let i = 0; i < pendingFiles.length; i++) {
    const file = pendingFiles[i];
    const fileItem = document.querySelector(`.file-item[data-index="${i}"]`);

    try {
      showStatus(`Processing ${i + 1}/${pendingFiles.length}: ${file.name}`, 'info');

      // Parse PDF
      const data = await parsePDF(file);

      if (data && data.first_name) {
        // Upload PDF to Google Drive
        const driveLink = await uploadToDrive(file, folderId);
        data.pdf_link = driveLink;

        // Upload to Google Sheets with Drive link
        await appendToSheet(spreadsheetId, data);
        fileItem.querySelector('.status-icon').textContent = '✓';
        successCount++;
      } else {
        fileItem.querySelector('.status-icon').textContent = '⚠️';
      }
    } catch (error) {
      console.error('Error processing', file.name, error);
      fileItem.querySelector('.status-icon').textContent = '✗';
    }
  }

  // Update stats
  chrome.storage.local.get(['totalProcessed'], (data) => {
    const total = (data.totalProcessed || 0) + successCount;
    chrome.storage.local.set({
      totalProcessed: total,
      lastUpload: new Date().toLocaleDateString()
    });
    updateStats();
  });

  showStatus(`Processed ${successCount}/${pendingFiles.length} files`, successCount > 0 ? 'success' : 'error');
  processBtn.disabled = false;
  pendingFiles = [];
}

// Get or create a folder in Google Drive
async function getOrCreateFolder(folderName) {
  // Check if folder exists
  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    {
      headers: { 'Authorization': `Bearer ${authToken}` }
    }
  );

  const searchData = await searchResponse.json();

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });

  const folder = await createResponse.json();
  return folder.id;
}

// Upload PDF to Google Drive
async function uploadToDrive(file, folderId) {
  const metadata = {
    name: file.name,
    parents: [folderId]
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: form
    }
  );

  const data = await response.json();

  // Make file viewable by anyone with link
  await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone'
    })
  });

  return data.webViewLink;
}

// Parse PDF using PDF.js
async function parsePDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }

  return extractLinkedInData(fullText, file.name);
}

// Extract structured data from LinkedIn PDF text
function extractLinkedInData(text, filename) {
  const data = {
    first_name: '',
    last_name: '',
    full_name: '',
    linkedin_link: '',
    headline: '',
    title: '',
    company: '',
    location: '',
    school: '',
    degree: '',
    skills: '',
    source_file: filename,
    parsed_at: new Date().toISOString()
  };

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // Check if LinkedIn PDF
  if (!lines.slice(0, 10).some(l => l.toLowerCase().includes('linkedin'))) {
    return null;
  }

  // Find name (skip Contact header)
  let nameLine = '';
  for (const line of lines.slice(0, 5)) {
    if (line.toLowerCase().startsWith('contact')) {
      const remaining = line.substring(7).trim();
      if (remaining) {
        nameLine = remaining;
        break;
      }
    } else if (line.startsWith('www.') || line.startsWith('http') || line.includes('(LinkedIn)')) {
      continue;
    } else if (line.length > 2) {
      nameLine = line;
      break;
    }
  }

  if (nameLine) {
    // Remove credentials
    const nameClean = nameLine.split(/\s+(?:MBA|CSC|LLQP|CPA|CFA|PhD|MD|JD|PMP|CFP|,)\s*/)[0].trim().replace(/,$/, '');
    data.full_name = nameClean;

    const parts = nameClean.split(' ');
    if (parts.length >= 2) {
      data.first_name = parts[0];
      data.last_name = parts.slice(1).join(' ');
    } else if (parts.length === 1) {
      data.first_name = parts[0];
    }
  }

  // LinkedIn URL
  const urlMatch = text.match(/linkedin\.com\/in\/([a-zA-Z0-9\-]+)/);
  if (urlMatch) {
    data.linkedin_link = `https://www.linkedin.com/in/${urlMatch[1]}`;
  }

  // Headline (Title at Company)
  for (const line of lines.slice(0, 15)) {
    if (line.includes(' at ') && (line.includes('|') || line.length > 20)) {
      data.headline = line.substring(0, 200);
      const parts = line.split(' at ');
      data.title = parts[0].trim();
      if (parts.length > 1) {
        data.company = parts[1].split('|')[0].trim();
      }
      break;
    }
  }

  // Location
  for (const line of lines.slice(0, 20)) {
    if (/^[A-Z][a-z]+,\s*[A-Z]/.test(line) && !line.includes('Summary')) {
      const locations = ['Australia', 'Canada', 'USA', 'United States', 'UK', 'India', 'Area'];
      if (locations.some(loc => line.includes(loc)) || (line.includes(', ') && line.length < 60)) {
        data.location = line;
        break;
      }
    }
  }

  // Education
  const eduIndex = lines.findIndex(l => l.toLowerCase() === 'education');
  if (eduIndex > 0) {
    const schools = [];
    const degrees = [];
    const stopWords = ['skills', 'licenses', 'certifications', 'languages'];

    for (let i = eduIndex + 1; i < Math.min(eduIndex + 20, lines.length); i++) {
      const line = lines[i];
      if (stopWords.includes(line.toLowerCase())) break;

      if (['University', 'College', 'Institute', 'School', 'Academy'].some(x => line.includes(x))) {
        schools.push(line);
      } else if (['Bachelor', 'Master', 'MBA', 'PhD', 'Degree', 'B.S.', 'B.A.', 'M.S.', 'Postgraduate', 'BBA', 'Diploma'].some(x => line.includes(x))) {
        degrees.push(line.split('·')[0].trim());
      }
    }

    data.school = schools.slice(0, 3).join(' | ');
    data.degree = degrees.slice(0, 3).join(' | ');
  }

  // Skills
  const skillsIndex = lines.findIndex(l => ['skills', 'top skills'].includes(l.toLowerCase()));
  if (skillsIndex > 0) {
    const skills = [];
    const stopWords = ['experience', 'education', 'certifications', 'languages', 'summary'];

    for (let i = skillsIndex + 1; i < Math.min(skillsIndex + 15, lines.length); i++) {
      const line = lines[i];
      if (stopWords.includes(line.toLowerCase())) break;
      if (line.length > 2 && line.length < 50) {
        skills.push(line);
      }
    }

    data.skills = skills.slice(0, 10).join(', ');
  }

  return data;
}

// Append data to Google Sheet
async function appendToSheet(spreadsheetId, data) {
  // Create a clickable hyperlink formula for the PDF
  const pdfLinkFormula = data.pdf_link
    ? `=HYPERLINK("${data.pdf_link}", "View PDF")`
    : '';

  // Create a clickable hyperlink for LinkedIn profile
  const linkedinFormula = data.linkedin_link
    ? `=HYPERLINK("${data.linkedin_link}", "${data.full_name}")`
    : data.full_name;

  const values = [[
    data.first_name,
    data.last_name,
    linkedinFormula,
    data.headline,
    data.title,
    data.company,
    data.location,
    data.school,
    data.degree,
    data.skills,
    pdfLinkFormula,
    data.parsed_at
  ]];

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:L:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values })
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to append to sheet');
  }

  return response.json();
}

// Initialize sheet with headers if empty
async function initializeSheet(spreadsheetId) {
  const headers = [[
    'First Name',
    'Last Name',
    'Name (LinkedIn Link)',
    'Headline',
    'Title',
    'Company',
    'Location',
    'School',
    'Degree',
    'Skills',
    'PDF Link',
    'Parsed At'
  ]];

  // Check if sheet has data
  const checkResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:A1`,
    {
      headers: { 'Authorization': `Bearer ${authToken}` }
    }
  );

  const checkData = await checkResponse.json();

  // If no data, add headers
  if (!checkData.values || checkData.values.length === 0) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:L1?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: headers })
      }
    );
  }
}

// Update stats display
function updateStats() {
  chrome.storage.local.get(['totalProcessed', 'lastUpload'], (data) => {
    document.getElementById('totalProcessed').textContent = data.totalProcessed || 0;
    document.getElementById('lastUpload').textContent = data.lastUpload || 'Never';
  });
}

// Show status message
function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'status ' + type;
}
