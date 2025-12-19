// Popup script for LinkedIn Profile Downloader

document.addEventListener('DOMContentLoaded', async function() {
  const profileInfo = document.getElementById('profileInfo');
  const notOnProfile = document.getElementById('notOnProfile');
  const mainControls = document.getElementById('mainControls');
  const candidateNameEl = document.getElementById('candidateName');
  const downloadBtn = document.getElementById('downloadBtn');
  const extractBtn = document.getElementById('extractBtn');
  const exportBtn = document.getElementById('exportBtn');
  const statusDiv = document.getElementById('status');
  const extractDataCheckbox = document.getElementById('extractData');
  const autoSaveCheckbox = document.getElementById('autoSave');
  const totalProfilesEl = document.getElementById('totalProfiles');
  const todayProfilesEl = document.getElementById('todayProfiles');

  // Load saved settings
  chrome.storage.local.get(['extractData', 'autoSave', 'profiles'], function(result) {
    if (result.extractData !== undefined) {
      extractDataCheckbox.checked = result.extractData;
    }
    if (result.autoSave !== undefined) {
      autoSaveCheckbox.checked = result.autoSave;
    }

    // Update stats
    updateStats(result.profiles || []);
  });

  // Check if we're on a LinkedIn profile page
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url.includes('linkedin.com')) {
    showNotOnProfile('Please navigate to LinkedIn');
    return;
  }

  // Get page info from content script
  try {
    chrome.tabs.sendMessage(tab.id, { action: 'checkPage' }, function(response) {
      if (chrome.runtime.lastError) {
        showNotOnProfile('Please refresh the LinkedIn page');
        return;
      }

      if (response && (response.isProfilePage || response.isRecruiterPage)) {
        showProfileControls(response.candidateName);
      } else {
        showNotOnProfile('Navigate to a profile page');
      }
    });
  } catch (e) {
    showNotOnProfile('Please refresh the LinkedIn page');
  }

  function showNotOnProfile(message) {
    profileInfo.style.display = 'none';
    mainControls.style.display = 'none';
    notOnProfile.style.display = 'block';
    notOnProfile.querySelector('p').textContent = message;
  }

  function showProfileControls(name) {
    profileInfo.style.display = 'block';
    mainControls.style.display = 'block';
    notOnProfile.style.display = 'none';
    candidateNameEl.textContent = name || 'Unknown Profile';
  }

  // Download button click
  downloadBtn.addEventListener('click', async function() {
    const config = {
      extractData: extractDataCheckbox.checked,
      autoSave: autoSaveCheckbox.checked
    };

    // Save settings
    chrome.storage.local.set({
      extractData: config.extractData,
      autoSave: config.autoSave
    });

    downloadBtn.disabled = true;
    downloadBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
      Processing...
    `;

    chrome.tabs.sendMessage(tab.id, {
      action: 'downloadProfile',
      config: config
    }, function(response) {
      if (chrome.runtime.lastError) {
        showStatus('Error: Please refresh the page', 'error');
        resetDownloadBtn();
        return;
      }

      showStatus('Print dialog opened - save as PDF', 'success');
      resetDownloadBtn();
    });
  });

  // Extract data only button
  extractBtn.addEventListener('click', async function() {
    extractBtn.disabled = true;

    chrome.tabs.sendMessage(tab.id, {
      action: 'extractProfileData'
    }, function(response) {
      if (chrome.runtime.lastError || !response) {
        showStatus('Error extracting data', 'error');
        extractBtn.disabled = false;
        return;
      }

      if (response.success && response.data) {
        // Store the profile data
        chrome.storage.local.get(['profiles'], function(result) {
          const profiles = result.profiles || [];

          // Check for duplicates
          const existingIndex = profiles.findIndex(p => p.profileUrl === response.data.profileUrl);
          if (existingIndex >= 0) {
            profiles[existingIndex] = { ...response.data, updatedAt: new Date().toISOString() };
          } else {
            profiles.push({ ...response.data, addedAt: new Date().toISOString() });
          }

          chrome.storage.local.set({ profiles: profiles }, function() {
            updateStats(profiles);
            showStatus(`Extracted: ${response.data.name}`, 'success');
          });
        });
      }

      extractBtn.disabled = false;
    });
  });

  // Export to CSV button
  exportBtn.addEventListener('click', function() {
    chrome.storage.local.get(['profiles'], function(result) {
      const profiles = result.profiles || [];

      if (profiles.length === 0) {
        showStatus('No profiles to export', 'error');
        return;
      }

      const csv = generateCSV(profiles);
      downloadCSV(csv, `linkedin_profiles_${formatDate(new Date())}.csv`);
      showStatus(`Exported ${profiles.length} profiles`, 'success');
    });
  });

  function resetDownloadBtn() {
    downloadBtn.disabled = false;
    downloadBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      Download Profile PDF
    `;
  }

  function showStatus(text, type) {
    statusDiv.textContent = text;
    statusDiv.className = `status ${type}`;

    // Auto-hide after 5 seconds
    setTimeout(() => {
      statusDiv.className = 'status';
    }, 5000);
  }

  function updateStats(profiles) {
    const today = new Date().toDateString();
    const todayCount = profiles.filter(p => {
      const addedDate = new Date(p.addedAt || p.extractedAt).toDateString();
      return addedDate === today;
    }).length;

    totalProfilesEl.textContent = profiles.length;
    todayProfilesEl.textContent = todayCount;
  }

  function generateCSV(profiles) {
    const headers = [
      'Name',
      'Headline',
      'Location',
      'Current Title',
      'Current Company',
      'About',
      'Experience',
      'Education',
      'Skills',
      'Profile URL',
      'Added Date'
    ];

    const rows = profiles.map(p => [
      escapeCsvField(p.name || ''),
      escapeCsvField(p.headline || ''),
      escapeCsvField(p.location || ''),
      escapeCsvField(p.currentTitle || ''),
      escapeCsvField(p.currentCompany || ''),
      escapeCsvField(p.about || ''),
      escapeCsvField(formatExperience(p.experience || [])),
      escapeCsvField(formatEducation(p.education || [])),
      escapeCsvField((p.skills || []).join(', ')),
      escapeCsvField(p.profileUrl || ''),
      escapeCsvField(formatDate(new Date(p.addedAt || p.extractedAt)))
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  function escapeCsvField(field) {
    if (field === null || field === undefined) return '""';
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return '"' + str + '"';
  }

  function formatExperience(experience) {
    return experience.map(e => `${e.title} at ${e.company} (${e.duration})`).join(' | ');
  }

  function formatEducation(education) {
    return education.map(e => `${e.school}: ${e.degree}`).join(' | ');
  }

  function formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
      url: url,
      filename: `linkedin_profiles/${filename}`,
      saveAs: true
    });
  }

  // Listen for status updates from content script
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === 'updateStatus') {
      showStatus(message.text, message.type);
    } else if (message.action === 'profileStored') {
      chrome.storage.local.get(['profiles'], function(result) {
        updateStats(result.profiles || []);
      });
    }
  });
});
