// Background service worker for LinkedIn Profile Downloader

// Listen for messages from content script
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'storeProfileData') {
    storeProfile(message.data);
    sendResponse({ success: true });
  } else if (message.action === 'downloadFile') {
    downloadFile(message.url, message.filename);
    sendResponse({ success: true });
  }
  return true;
});

async function storeProfile(profileData) {
  try {
    const result = await chrome.storage.local.get(['profiles']);
    const profiles = result.profiles || [];

    // Check for duplicates by URL
    const existingIndex = profiles.findIndex(p => p.profileUrl === profileData.profileUrl);

    if (existingIndex >= 0) {
      // Update existing profile
      profiles[existingIndex] = {
        ...profileData,
        updatedAt: new Date().toISOString(),
        addedAt: profiles[existingIndex].addedAt
      };
      console.log('Updated existing profile:', profileData.name);
    } else {
      // Add new profile
      profiles.push({
        ...profileData,
        addedAt: new Date().toISOString()
      });
      console.log('Added new profile:', profileData.name);
    }

    await chrome.storage.local.set({ profiles: profiles });

    // Notify popup about the update
    chrome.runtime.sendMessage({
      action: 'profileStored',
      count: profiles.length
    }).catch(() => {
      // Popup might not be open, that's okay
    });

  } catch (error) {
    console.error('Error storing profile:', error);
  }
}

function downloadFile(url, filename) {
  try {
    chrome.downloads.download({
      url: url,
      filename: `linkedin_profiles/${filename}`,
      saveAs: false,
      conflictAction: 'uniquify'
    }, function(downloadId) {
      if (chrome.runtime.lastError) {
        console.error('Download error:', chrome.runtime.lastError);
      } else {
        console.log('Download started:', downloadId, filename);
      }
    });
  } catch (error) {
    console.error('Failed to initiate download:', error);
  }
}

// Monitor download completion
chrome.downloads.onChanged.addListener(function(delta) {
  if (delta.state && delta.state.current === 'complete') {
    console.log('Download completed:', delta.id);
  } else if (delta.state && delta.state.current === 'interrupted') {
    console.error('Download interrupted:', delta.id);
  }
});

// Clean up old profiles (older than 30 days) - optional maintenance
chrome.runtime.onStartup.addListener(async function() {
  const result = await chrome.storage.local.get(['profiles']);
  const profiles = result.profiles || [];

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentProfiles = profiles.filter(p => {
    const addedDate = new Date(p.addedAt || p.extractedAt);
    return addedDate > thirtyDaysAgo;
  });

  if (recentProfiles.length < profiles.length) {
    await chrome.storage.local.set({ profiles: recentProfiles });
    console.log(`Cleaned up ${profiles.length - recentProfiles.length} old profiles`);
  }
});

console.log('LinkedIn Profile Downloader: Background service worker loaded');
