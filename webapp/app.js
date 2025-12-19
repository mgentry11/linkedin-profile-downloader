// LinkedIn PDF Parser - Web App
// Configuration - Replace with your Google Cloud credentials
const CLIENT_ID = '472230349314-bvjvplh0ugpjaslmsgb6oldk79g4rhqq.apps.googleusercontent.com';
const API_KEY = 'AIzaSyBN7TtouavWOiTbgdqK51fHrN914QMNOUY';
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
  console.log('Initializing Google Auth...');

  // Initialize Google Identity Services first
  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: handleAuthCallback
    });
    console.log('Token client initialized:', tokenClient);
  } catch (err) {
    console.error('Token client error:', err);
  }

  // Load the Google API client
  gapi.load('client', async () => {
    console.log('GAPI client loaded');
    try {
      await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: [
          'https://sheets.googleapis.com/$discovery/rest?version=v4',
          'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
        ]
      });
      console.log('GAPI client initialized');

      // Check for existing session AFTER gapi is ready
      const savedToken = localStorage.getItem('gapi_token');
      const savedUser = localStorage.getItem('gapi_user');
      if (savedToken && savedUser) {
        accessToken = savedToken;
        gapi.client.setToken({ access_token: savedToken });
        showMainApp(JSON.parse(savedUser));
      }
    } catch (err) {
      console.error('GAPI init error:', err);
    }
  });
}

function handleAuthCallback(response) {
  if (response.error) {
    showStatus('Authentication failed: ' + response.error, 'error');
    return;
  }

  accessToken = response.access_token;
  localStorage.setItem('gapi_token', accessToken);

  // Set the token on gapi client for API calls
  gapi.client.setToken({ access_token: accessToken });

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
  signInBtn.addEventListener('click', () => {
    console.log('Sign in clicked, tokenClient:', tokenClient);
    if (tokenClient) {
      tokenClient.requestAccessToken();
    } else {
      alert('Google auth not loaded yet. Please wait a moment and try again.');
    }
  });
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
    console.error('Drive folder error:', err);
    const errMsg = err?.result?.error?.message || err?.message || JSON.stringify(err);
    showStatus('Error creating Drive folder: ' + errMsg, 'error');
    processBtn.disabled = false;
    return;
  }

  // Initialize sheet headers if needed
  try {
    await initializeSheet(sheetId);
  } catch (err) {
    console.error('Sheet error:', err);
    const errMsg = err?.result?.error?.message || err?.message || JSON.stringify(err);
    showStatus('Error accessing sheet: ' + errMsg, 'error');
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

      if (data) {
        // Upload to Drive
        const driveLink = await uploadToDrive(file, folderId);
        data.pdf_link = driveLink;

        // Add to Sheet (even if parsing incomplete)
        await appendToSheet(sheetId, data);

        // Update UI
        fileItem.querySelector('.status').textContent = data.first_name ? '✅' : '⚠️';
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
  console.log('Starting PDF parse for:', file.name);

  try {
    const arrayBuffer = await file.arrayBuffer();
    console.log('Got array buffer, size:', arrayBuffer.byteLength);

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    console.log('PDF loaded, pages:', pdf.numPages);

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log('Processing page', i);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      // Better text extraction - preserve structure
      let lastY = null;
      for (const item of textContent.items) {
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
          fullText += '\n';
        }
        fullText += item.str + ' ';
        lastY = item.transform[5];
      }
      fullText += '\n';
    }

    console.log('=== RAW PDF TEXT (first 1000 chars) ===');
    console.log(fullText.substring(0, 1000));

    const result = extractLinkedInData(fullText, file.name);
    console.log('=== PARSED RESULT ===');
    console.log(JSON.stringify(result, null, 2));

    return result;
  } catch (err) {
    console.error('PDF PARSE ERROR:', err);
    return {
      first_name: 'PARSE_ERROR',
      last_name: err.message,
      full_name: '',
      linkedin_link: '',
      headline: '',
      title: '',
      company: '',
      location: '',
      school: '',
      degree: '',
      skills: '',
      experience: '',
      source_file: file.name,
      parsed_at: new Date().toISOString()
    };
  }
}

// Extract data from LinkedIn PDF text - SIMPLE VERSION (no complex regex)
function extractLinkedInData(text, filename) {
  console.log('Starting extractLinkedInData (simple)...');

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
    experience: '',
    source_file: filename,
    parsed_at: new Date().toISOString()
  };

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  console.log('Lines count:', lines.length);

  // LinkedIn URL
  const urlMatch = text.match(/linkedin\.com\/in\/([a-zA-Z0-9\-]+)/);
  if (urlMatch) {
    data.linkedin_link = `https://www.linkedin.com/in/${urlMatch[1]}`;
  }
  console.log('Step 1 done - URL');

  // Find key section indices
  let certIdx = lines.findIndex(l => l === 'Certifications');
  let langIdx = lines.findIndex(l => l === 'Languages');
  let expIdx = lines.findIndex(l => l === 'Experience');
  let eduIdx = lines.findIndex(l => l === 'Education');
  let skillsIdx = lines.findIndex(l => l === 'Top Skills' || l === 'Skills');
  let summaryIdx = lines.findIndex(l => l === 'Summary');

  console.log('Indices:', { certIdx, langIdx, expIdx, eduIdx, skillsIdx, summaryIdx });

  // Find name - look for a line with 2-3 capitalized words after certifications/languages
  let nameSearchStart = Math.max(certIdx, langIdx) + 1;
  if (nameSearchStart < 1) nameSearchStart = 0;

  for (let i = nameSearchStart; i < Math.min(nameSearchStart + 15, lines.length); i++) {
    const line = lines[i];
    // Skip common section headers and short lines
    if (line.length < 4 || line.length > 50) continue;
    if (['Summary', 'Experience', 'Education', 'Skills', 'Contact'].includes(line)) continue;
    if (line.includes('(') || line.includes('@') || line.includes('www.')) continue;

    // Check if line looks like a name (2-3 words, starts with capitals)
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4) {
      const allCapitalized = words.every(w => w[0] && w[0] === w[0].toUpperCase());
      const noNumbers = !line.match(/\d/);
      if (allCapitalized && noNumbers) {
        data.full_name = line;
        data.first_name = words[0];
        data.last_name = words.slice(1).join(' ');
        console.log('Found name:', data.full_name, 'at line', i);

        // Next line is likely the headline/title
        if (i + 1 < lines.length) {
          data.headline = lines[i + 1];
          // Parse title and company from headline
          if (data.headline.includes(' at ')) {
            const parts = data.headline.split(' at ');
            data.title = parts[0].trim();
            data.company = parts[1].split('|')[0].trim();
          } else if (data.headline.includes(' - ')) {
            const parts = data.headline.split(' - ');
            data.title = parts[0].trim();
            data.company = parts[1].split('|')[0].trim();
          } else if (data.headline.includes(' | ')) {
            const parts = data.headline.split(' | ');
            data.title = parts[0].trim();
            if (parts[1]) data.company = parts[1].trim();
          }
        }

        // Line after headline might be location - check next few lines
        for (let j = i + 2; j < Math.min(i + 5, lines.length); j++) {
          const locLine = lines[j];
          if (locLine === 'Summary' || locLine === 'Experience') break;
          // Location pattern: City, Province/State, Country or City, Province
          if (locLine.includes(',') && !locLine.includes('(') && locLine.length < 60) {
            if (locLine.match(/Canada|USA|Australia|UK|India|Ontario|British Columbia|Alberta|Quebec|California|New York|Texas/i)) {
              data.location = locLine;
              break;
            }
          }
        }
        break;
      }
    }
  }
  console.log('Step 2 done - Name/Title/Location');

  // Extract from Experience section - always prefer this for company
  if (expIdx > -1) {
    // Company is usually right after "Experience"
    if (expIdx + 1 < lines.length) {
      const expCompany = lines[expIdx + 1];
      // Use experience company if headline company looks like a description
      if (!data.company || data.company.includes('Aspiring') || data.company.includes('Student') ||
          data.company.includes('Professional') || data.company.length > 50) {
        data.company = expCompany;
      }
    }
    if (expIdx + 2 < lines.length && !data.title) {
      data.title = lines[expIdx + 2];
    }
  }
  console.log('Step 3 done - Experience');

  // Build experience list
  if (expIdx > -1) {
    const jobs = [];
    const endIdx = eduIdx > expIdx ? eduIdx : lines.length;

    for (let i = expIdx + 1; i < endIdx && jobs.length < 10; i++) {
      const line = lines[i];
      // Look for date patterns like "February 2024 - Present" or "2020 - 2023"
      const dateMatch = line.match(/(\w+\s+)?(\d{4})\s*[-–]\s*(Present|\w+\s+\d{4}|\d{4})/);
      if (dateMatch) {
        // LinkedIn structure: Company (i-2), Title (i-1), Date (i)
        // Based on console: lines[i-2]="Google", lines[i-1]="Sales Team Manager..."
        let company = lines[i - 2] || '';
        let title = lines[i - 1] || '';


        // Skip if company looks wrong
        if (company && !['Experience', 'Page', ''].includes(company)) {
          // Parse start year for sorting
          const startYear = parseInt(dateMatch[2]);
          const isPresent = line.includes('Present');
          jobs.push({
            text: `${title} @ ${company} (${line})`,
            startYear: startYear,
            isPresent: isPresent,
            company: company,
            title: title
          });
        }
      }
    }

    // Sort by: Present jobs first, then by start year (newest first)
    jobs.sort((a, b) => {
      if (a.isPresent && !b.isPresent) return -1;
      if (!a.isPresent && b.isPresent) return 1;
      return b.startYear - a.startYear; // Higher year = more recent = first
    });

    if (jobs.length > 0) {
      data.experience = jobs.map(j => j.text).join(' | ');
      // ALWAYS use company/title from most recent job
      data.company = jobs[0].company;
      data.title = jobs[0].title;
      data.headline = `${data.title} at ${data.company}`;
    }
  }
  console.log('Step 4 done - Experience list');

  // Education
  if (eduIdx > -1) {
    const schools = [];
    const degrees = [];
    for (let i = eduIdx + 1; i < Math.min(eduIdx + 20, lines.length); i++) {
      const line = lines[i];
      if (['Skills', 'Certifications', 'Languages', 'Licenses'].includes(line)) break;
      if (line.includes('University') || line.includes('College') || line.includes('Institute') || line.includes('Academy')) {
        schools.push(line);
      }
      // Look for degrees
      if (line.match(/Bachelor|Master|MBA|PhD|Diploma|B\.?S\.?|B\.?A\.?|M\.?S\.?|Postgraduate|Graduate|Certificate|Associate/i)) {
        degrees.push(line);
      }
    }
    data.school = schools.slice(0, 3).join(' | ');
    data.degree = degrees.slice(0, 3).join(' | ');
  }
  console.log('Step 5 done - Education');

  // Skills - get lines after "Top Skills"
  if (skillsIdx > -1) {
    const skills = [];
    for (let i = skillsIdx + 1; i < Math.min(skillsIdx + 8, lines.length); i++) {
      const line = lines[i];
      if (['Languages', 'Certifications', 'Experience', 'Education'].includes(line)) break;
      if (line.length > 2 && line.length < 40 && !line.includes('(')) {
        skills.push(line);
      }
    }
    data.skills = skills.join(', ');
  }
  console.log('Step 6 done - Skills');

  console.log('Final parsed data:', data);
  return data;
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
      range: 'A1:M1',
      valueInputOption: 'RAW',
      resource: {
        values: [[
          'First Name', 'Last Name', 'Name (LinkedIn)', 'Headline',
          'Title', 'Company', 'Location', 'School', 'Degree', 'Skills', 'Experience', 'PDF Link', 'Parsed At'
        ]]
      }
    });
  }
}

// Google Sheets - Append row
async function appendToSheet(sheetId, data) {
  const linkedinFormula = data.linkedin_link
    ? `=HYPERLINK("${data.linkedin_link}", "${data.full_name.replace(/"/g, '""')}")`
    : data.full_name;

  const pdfFormula = data.pdf_link
    ? `=HYPERLINK("${data.pdf_link}", "View PDF")`
    : '';

  await gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'A:M',
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
        data.experience,
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
