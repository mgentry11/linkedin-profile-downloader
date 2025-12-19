// LinkedIn PDF Parser - Web App
// Configuration - Replace with your Google Cloud credentials
const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
const API_KEY = 'YOUR_API_KEY';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';

// Configure PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// State
let tokenClient;
let accessToken = null;
let pendingFiles = [];
let sessionCount = 0;

// DOM Elements
const authSection = document.getElementById('authSection');
const mainApp = document.getElementById('mainApp');
const signInBtn = document.getElementById('signInBtn');
const signOutBtn = document.getElementById('signOutBtn');
const userPhoto = document.getElementById('userPhoto');
const userName = document.getElementById('userName');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileQueue = document.getElementById('fileQueue');
const fileList = document.getElementById('fileList');
const processBtn = document.getElementById('processBtn');
const statusMessage = document.getElementById('statusMessage');
const resultsSection = document.getElementById('resultsSection');
const resultsBody = document.getElementById('resultsBody');
const sheetIdInput = document.getElementById('sheetId');
const totalCount = document.getElementById('totalCount');
const sessionCountEl = document.getElementById('sessionCount');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initGoogleAuth();
  setupEventListeners();
  loadSettings();
});

// Google Auth initialization
function initGoogleAuth() {
  // Load the Google API client
  gapi.load('client', async () => {
    await gapi.client.init({
      apiKey: API_KEY,
      discoveryDocs: [
        'https://sheets.googleapis.com/$discovery/rest?version=v4',
        'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
      ]
    });
  });

  // Initialize Google Identity Services
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: handleAuthCallback
  });

  // Check for existing session
  const savedToken = localStorage.getItem('gapi_token');
  const savedUser = localStorage.getItem('gapi_user');
  if (savedToken && savedUser) {
    accessToken = savedToken;
    gapi.client.setToken({ access_token: savedToken });
    showMainApp(JSON.parse(savedUser));
  }
}

function handleAuthCallback(response) {
  if (response.error) {
    showStatus('Authentication failed: ' + response.error, 'error');
    return;
  }

  accessToken = response.access_token;
  localStorage.setItem('gapi_token', accessToken);

  // Get user info
  fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  })
    .then(res => res.json())
    .then(user => {
      localStorage.setItem('gapi_user', JSON.stringify(user));
      showMainApp(user);
    });
}

function showMainApp(user) {
  authSection.classList.add('hidden');
  mainApp.classList.add('visible');
  userPhoto.src = user.picture || 'https://via.placeholder.com/40';
  userName.textContent = user.name || user.email;
}

function signOut() {
  accessToken = null;
  localStorage.removeItem('gapi_token');
  localStorage.removeItem('gapi_user');
  google.accounts.oauth2.revoke(accessToken);
  authSection.classList.remove('hidden');
  mainApp.classList.remove('visible');
}

// Event Listeners
function setupEventListeners() {
  signInBtn.addEventListener('click', () => tokenClient.requestAccessToken());
  signOutBtn.addEventListener('click', signOut);

  // Drag and drop
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
  processBtn.addEventListener('click', processFiles);

  // Save settings on change
  sheetIdInput.addEventListener('change', saveSettings);
}

// File handling
function handleFiles(files) {
  const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
  pendingFiles = [...pendingFiles, ...pdfFiles];
  updateFileList();
}

function updateFileList() {
  if (pendingFiles.length === 0) {
    fileQueue.style.display = 'none';
    processBtn.disabled = true;
    return;
  }

  fileQueue.style.display = 'block';
  processBtn.disabled = false;

  fileList.innerHTML = pendingFiles.map((f, i) => `
    <div class="file-item" data-index="${i}">
      <div class="name">
        <span>📄</span>
        <span>${f.name}</span>
      </div>
      <span class="status">⏳</span>
    </div>
  `).join('');
}

// Settings
function loadSettings() {
  const sheetId = localStorage.getItem('linkedin_sheet_id');
  const total = localStorage.getItem('linkedin_total_count') || 0;
  if (sheetId) sheetIdInput.value = sheetId;
  totalCount.textContent = total;
}

function saveSettings() {
  localStorage.setItem('linkedin_sheet_id', sheetIdInput.value);
}

// Process files
async function processFiles() {
  const sheetId = sheetIdInput.value.trim();
  if (!sheetId) {
    showStatus('Please enter a Google Sheet ID', 'error');
    return;
  }

  if (!accessToken) {
    showStatus('Please sign in to Google first', 'error');
    return;
  }

  processBtn.disabled = true;
  showStatus('Processing PDFs...', 'info');

  // Get or create Drive folder
  let folderId;
  try {
    folderId = await getOrCreateFolder('LinkedIn PDFs');
  } catch (err) {
    showStatus('Error creating Drive folder: ' + err.message, 'error');
    processBtn.disabled = false;
    return;
  }

  // Initialize sheet headers if needed
  try {
    await initializeSheet(sheetId);
  } catch (err) {
    showStatus('Error accessing sheet: ' + err.message, 'error');
    processBtn.disabled = false;
    return;
  }

  let successCount = 0;

  for (let i = 0; i < pendingFiles.length; i++) {
    const file = pendingFiles[i];
    const fileItem = document.querySelector(`.file-item[data-index="${i}"]`);
    showStatus(`Processing ${i + 1}/${pendingFiles.length}: ${file.name}`, 'info');

    try {
      // Parse PDF
      const data = await parsePDF(file);

      if (data && data.first_name) {
        // Upload to Drive
        const driveLink = await uploadToDrive(file, folderId);
        data.pdf_link = driveLink;

        // Add to Sheet
        await appendToSheet(sheetId, data);

        // Update UI
        fileItem.querySelector('.status').textContent = '✅';
        addToResultsTable(data);
        successCount++;
        sessionCount++;
      } else {
        fileItem.querySelector('.status').textContent = '⚠️';
      }
    } catch (err) {
      console.error('Error processing', file.name, err);
      fileItem.querySelector('.status').textContent = '❌';
    }
  }

  // Update stats
  const total = parseInt(localStorage.getItem('linkedin_total_count') || 0) + successCount;
  localStorage.setItem('linkedin_total_count', total);
  totalCount.textContent = total;
  sessionCountEl.textContent = sessionCount;

  showStatus(`Processed ${successCount}/${pendingFiles.length} files successfully!`, successCount > 0 ? 'success' : 'error');
  processBtn.disabled = false;
  pendingFiles = [];

  if (successCount > 0) {
    resultsSection.style.display = 'block';
  }
}

// Parse PDF
async function parsePDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map(item => item.str).join(' ') + '\n';
  }

  return extractLinkedInData(fullText, file.name);
}

// Extract data from LinkedIn PDF text
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

  // Name
  for (const line of lines.slice(0, 5)) {
    if (line.toLowerCase().startsWith('contact')) {
      const remaining = line.substring(7).trim();
      if (remaining) {
        extractName(data, remaining);
        break;
      }
    } else if (!line.startsWith('www.') && !line.startsWith('http') && !line.includes('(LinkedIn)') && line.length > 2) {
      extractName(data, line);
      break;
    }
  }

  // LinkedIn URL
  const urlMatch = text.match(/linkedin\.com\/in\/([a-zA-Z0-9\-]+)/);
  if (urlMatch) {
    data.linkedin_link = `https://www.linkedin.com/in/${urlMatch[1]}`;
  }

  // Headline
  for (const line of lines.slice(0, 15)) {
    if (line.includes(' at ') && (line.includes('|') || line.length > 20)) {
      data.headline = line.substring(0, 200);
      const parts = line.split(' at ');
      data.title = parts[0].trim();
      if (parts[1]) data.company = parts[1].split('|')[0].trim();
      break;
    }
  }

  // Location
  for (const line of lines.slice(0, 20)) {
    if (/^[A-Z][a-z]+,\s*[A-Z]/.test(line) && !line.includes('Summary')) {
      if (['Australia', 'Canada', 'USA', 'United States', 'UK', 'India', 'Area'].some(loc => line.includes(loc)) ||
          (line.includes(', ') && line.length < 60)) {
        data.location = line;
        break;
      }
    }
  }

  // Education
  const eduIdx = lines.findIndex(l => l.toLowerCase() === 'education');
  if (eduIdx > 0) {
    const schools = [], degrees = [];
    for (let i = eduIdx + 1; i < Math.min(eduIdx + 20, lines.length); i++) {
      const line = lines[i];
      if (['skills', 'licenses', 'certifications', 'languages'].includes(line.toLowerCase())) break;
      if (['University', 'College', 'Institute', 'School', 'Academy'].some(x => line.includes(x))) schools.push(line);
      else if (['Bachelor', 'Master', 'MBA', 'PhD', 'Degree', 'B.S.', 'B.A.', 'M.S.', 'Postgraduate', 'Diploma'].some(x => line.includes(x))) {
        degrees.push(line.split('·')[0].trim());
      }
    }
    data.school = schools.slice(0, 3).join(' | ');
    data.degree = degrees.slice(0, 3).join(' | ');
  }

  // Skills
  const skillsIdx = lines.findIndex(l => ['skills', 'top skills'].includes(l.toLowerCase()));
  if (skillsIdx > 0) {
    const skills = [];
    for (let i = skillsIdx + 1; i < Math.min(skillsIdx + 15, lines.length); i++) {
      const line = lines[i];
      if (['experience', 'education', 'certifications', 'languages', 'summary'].includes(line.toLowerCase())) break;
      if (line.length > 2 && line.length < 50) skills.push(line);
    }
    data.skills = skills.slice(0, 10).join(', ');
  }

  return data;
}

function extractName(data, nameLine) {
  const nameClean = nameLine.split(/\s+(?:MBA|CSC|LLQP|CPA|CFA|PhD|MD|JD|PMP|CFP|,)\s*/)[0].trim().replace(/,$/, '');
  data.full_name = nameClean;
  const parts = nameClean.split(' ');
  data.first_name = parts[0] || '';
  data.last_name = parts.slice(1).join(' ') || '';
}

// Google Drive - Create folder
async function getOrCreateFolder(folderName) {
  // Search for existing folder
  const searchRes = await gapi.client.drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)'
  });

  if (searchRes.result.files && searchRes.result.files.length > 0) {
    return searchRes.result.files[0].id;
  }

  // Create folder
  const createRes = await gapi.client.drive.files.create({
    resource: { name: folderName, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id'
  });

  return createRes.result.id;
}

// Google Drive - Upload file
async function uploadToDrive(file, folderId) {
  const metadata = {
    name: file.name,
    parents: [folderId]
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    body: form
  });

  const data = await res.json();

  // Make viewable
  await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });

  return data.webViewLink;
}

// Google Sheets - Initialize with headers
async function initializeSheet(sheetId) {
  const check = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'A1:A1'
  });

  if (!check.result.values || check.result.values.length === 0) {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: 'A1:L1',
      valueInputOption: 'RAW',
      resource: {
        values: [[
          'First Name', 'Last Name', 'Name (LinkedIn)', 'Headline',
          'Title', 'Company', 'Location', 'School', 'Degree', 'Skills', 'PDF Link', 'Parsed At'
        ]]
      }
    });
  }
}

// Google Sheets - Append row
async function appendToSheet(sheetId, data) {
  const linkedinFormula = data.linkedin_link
    ? `=HYPERLINK("${data.linkedin_link}", "${data.full_name}")`
    : data.full_name;

  const pdfFormula = data.pdf_link
    ? `=HYPERLINK("${data.pdf_link}", "View PDF")`
    : '';

  await gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'A:L',
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [[
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
        pdfFormula,
        data.parsed_at
      ]]
    }
  });
}

// UI Helpers
function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = 'status-message ' + type;
}

function addToResultsTable(data) {
  const row = document.createElement('tr');
  row.innerHTML = `
    <td><a href="${data.linkedin_link}" target="_blank">${data.full_name}</a></td>
    <td>${data.title}</td>
    <td>${data.company}</td>
    <td>${data.location}</td>
    <td><a href="${data.pdf_link}" target="_blank">View</a></td>
  `;
  resultsBody.insertBefore(row, resultsBody.firstChild);
}
