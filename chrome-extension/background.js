// Background service worker for LinkedIn PDF Parser
// Watches for downloaded PDFs and notifies the popup

// Listen for completed downloads
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === 'complete') {
    chrome.downloads.search({ id: delta.id }, (downloads) => {
      if (downloads.length > 0) {
        const download = downloads[0];
        const filename = download.filename.toLowerCase();

        // Check if it's a LinkedIn PDF (Profile*.pdf pattern)
        if (filename.endsWith('.pdf') &&
            (filename.includes('profile') || filename.includes('linkedin'))) {

          // Store the download info for the popup to process
          chrome.storage.local.get(['pendingDownloads'], (data) => {
            const pending = data.pendingDownloads || [];
            pending.push({
              id: download.id,
              filename: download.filename,
              url: download.url,
              downloadedAt: new Date().toISOString()
            });

            chrome.storage.local.set({ pendingDownloads: pending });

            // Show notification
            chrome.action.setBadgeText({ text: String(pending.length) });
            chrome.action.setBadgeBackgroundColor({ color: '#0077B5' });
          });
        }
      }
    });
  }
});

// Clear badge when popup opens
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup') {
    chrome.action.setBadgeText({ text: '' });
  }
});
