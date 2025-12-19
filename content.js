// Content script for LinkedIn Profile Downloader
// Runs on LinkedIn pages - supports bulk downloading from search/recruiter pages

let isDownloading = false;
let downloadCount = 0;
let totalProfiles = 0;
let config = {};

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'checkPage') {
    const pageInfo = getPageInfo();
    sendResponse(pageInfo);
  } else if (message.action === 'startDownload') {
    config = message.config;
    startDownload();
    sendResponse({ success: true });
  } else if (message.action === 'stopDownload') {
    isDownloading = false;
    sendResponse({ success: true });
  } else if (message.action === 'downloadProfile') {
    downloadSingleProfile(message.config);
    sendResponse({ success: true });
  } else if (message.action === 'extractProfileData') {
    const data = extractProfileData();
    sendResponse({ success: true, data: data });
  }
  return true;
});

function getPageInfo() {
  const url = window.location.href;
  const isProfilePage = url.includes('/in/') && !url.includes('/search/');
  const isSearchPage = url.includes('/search/results/people') || url.includes('/talent/search') || url.includes('/recruiter/');
  const isRecruiterPage = url.includes('/talent/') || url.includes('/recruiter/');

  let candidateName = '';
  let profileCount = 0;

  if (isProfilePage) {
    candidateName = getCandidateName();
  }

  if (isSearchPage || isRecruiterPage) {
    profileCount = countProfilesOnPage();
  }

  return {
    url: url,
    isProfilePage: isProfilePage,
    isSearchPage: isSearchPage,
    isRecruiterPage: isRecruiterPage,
    candidateName: candidateName,
    profileCount: profileCount
  };
}

function countProfilesOnPage() {
  // Count profile cards on search results page
  const selectors = [
    '.reusable-search__result-container',
    '.search-result__wrapper',
    '.entity-result',
    'li.reusable-search__result-container',
    '.hiring-people__list-item',
    '.profile-list__profile-item'
  ];

  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log(`Found ${elements.length} profiles with selector: ${selector}`);
      return elements.length;
    }
  }

  return 0;
}

async function startDownload() {
  if (isDownloading) {
    return;
  }

  isDownloading = true;
  downloadCount = 0;

  sendStatusUpdate('Checking page...', 'info');

  try {
    const url = window.location.href;
    const isOnProfilePage = url.includes('/in/') && !url.includes('/search/');

    if (isOnProfilePage) {
      // Single profile mode - just download this profile
      console.log('On single profile page, downloading...');
      sendStatusUpdate('Downloading current profile...', 'info');

      await downloadCurrentProfile();
      downloadCount++;

      chrome.runtime.sendMessage({
        action: 'downloadComplete',
        message: `Successfully processed ${downloadCount} profile!`
      });

    } else {
      // Bulk mode - we're on a search/list page
      console.log('On search/list page, starting bulk download...');
      sendStatusUpdate('Scanning for profiles...', 'info');

      // Auto-scroll first if enabled to load all content
      if (config.autoScroll) {
        sendStatusUpdate('Auto-scrolling to load all profiles...', 'info');
        await autoScrollToLoadAll();
        await sleep(2000);
      }

      // Find all profile cards/links on the page
      const profileElements = findProfileElements();

      console.log('Found profile elements:', profileElements.length);

      if (profileElements.length === 0) {
        sendStatusUpdate('No profiles found. Check browser console (F12) for debugging info.', 'error');
        console.error('NO PROFILES FOUND!');
        isDownloading = false;
        return;
      }

      totalProfiles = config.maxProfiles ? Math.min(profileElements.length, config.maxProfiles) : profileElements.length;

      sendStatusUpdate(`Found ${profileElements.length} profiles. Starting download...`, 'info');

      // Process each profile
      for (let i = 0; i < totalProfiles && isDownloading; i++) {
        console.log(`\n=== Processing profile ${i + 1}/${totalProfiles} ===`);

        const profileElement = profileElements[i];
        await processProfileFromList(profileElement, i);
        downloadCount++;

        // Update progress
        chrome.runtime.sendMessage({
          action: 'updateProgress',
          current: downloadCount,
          total: totalProfiles
        });

        // Random delay before next profile (5-14 seconds like Indeed)
        if (i < totalProfiles - 1 && isDownloading) {
          const randomDelay = Math.floor(Math.random() * (14000 - 5000 + 1)) + 5000;
          sendStatusUpdate(`Waiting ${(randomDelay / 1000).toFixed(1)}s before next profile...`, 'info');
          await sleep(randomDelay);
        }
      }

      if (isDownloading) {
        chrome.runtime.sendMessage({
          action: 'downloadComplete',
          message: `Successfully processed ${downloadCount} profiles!`
        });
      }
    }

  } catch (error) {
    console.error('Download error:', error);
    chrome.runtime.sendMessage({
      action: 'downloadError',
      message: `Error: ${error.message}`
    });
  }

  isDownloading = false;
}

function findProfileElements() {
  const profiles = [];
  const uniqueUrls = new Set();

  console.log('=== Starting profile search ===');
  console.log('Page URL:', window.location.href);

  // Different selectors for different LinkedIn page types
  const containerSelectors = [
    // Regular search results
    '.reusable-search__result-container',
    'li.reusable-search__result-container',
    '.entity-result',
    '.search-result__wrapper',
    // Recruiter/Sales Navigator
    '.hiring-people__list-item',
    '.profile-list__profile-item',
    '.search-results__result-item',
    '.talent-search-result-card',
    // Connections page
    '.mn-connection-card',
    // People You May Know
    '.discover-person-card'
  ];

  for (const selector of containerSelectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log(`Found ${elements.length} elements with selector: ${selector}`);

      elements.forEach((el, index) => {
        // Find the profile link within this element
        const profileLink = findProfileLinkInElement(el);

        if (profileLink) {
          const href = profileLink.getAttribute('href');
          if (href && href.includes('/in/') && !uniqueUrls.has(href)) {
            uniqueUrls.add(href);
            profiles.push({
              element: el,
              link: profileLink,
              url: href
            });

            const name = getNameFromElement(el);
            console.log(`Profile ${profiles.length}: ${name} - ${href}`);
          }
        }
      });

      if (profiles.length > 0) break;
    }
  }

  // Fallback: find all profile links directly
  if (profiles.length === 0) {
    console.log('Trying fallback: finding all /in/ links...');
    const allLinks = document.querySelectorAll('a[href*="/in/"]');

    allLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href && !href.includes('/search/') && !uniqueUrls.has(href)) {
        // Check if this looks like a main profile link (not a small avatar)
        const rect = link.getBoundingClientRect();
        if (rect.width > 50 && rect.height > 20) {
          uniqueUrls.add(href);
          profiles.push({
            element: link.closest('li') || link.parentElement,
            link: link,
            url: href
          });
        }
      }
    });
  }

  console.log(`\n=== RESULT: Found ${profiles.length} unique profiles ===`);
  return profiles;
}

function findProfileLinkInElement(element) {
  // Look for the main profile link within a result card
  const linkSelectors = [
    'a[href*="/in/"].app-aware-link',
    'a[href*="/in/"][data-control-name]',
    '.entity-result__title-text a',
    '.entity-result__title a',
    '.actor-name-with-distance a',
    '.search-result__title a',
    'a.ember-view[href*="/in/"]',
    'a[href*="/in/"]'
  ];

  for (const selector of linkSelectors) {
    const link = element.querySelector(selector);
    if (link && link.getAttribute('href')?.includes('/in/')) {
      return link;
    }
  }

  return null;
}

function getNameFromElement(element) {
  const nameSelectors = [
    '.entity-result__title-text a span[aria-hidden="true"]',
    '.entity-result__title-text span[aria-hidden="true"]',
    '.actor-name',
    '.name',
    '.search-result__title',
    'span[dir="ltr"]'
  ];

  for (const selector of nameSelectors) {
    const nameEl = element.querySelector(selector);
    if (nameEl) {
      const name = nameEl.textContent.trim();
      if (name && name.length > 1 && name.length < 100) {
        return name;
      }
    }
  }

  return 'Unknown';
}

async function processProfileFromList(profileData, index) {
  try {
    const name = getNameFromElement(profileData.element);
    sendStatusUpdate(`Processing ${downloadCount + 1}/${totalProfiles}: ${name}`, 'info');

    // Scroll element into view
    profileData.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(500);

    // Highlight the element briefly
    const originalStyle = profileData.element.style.cssText;
    profileData.element.style.cssText += 'outline: 3px solid #0077B5; outline-offset: 2px;';

    // Option 1: Open profile in new tab, extract data, close tab
    // Option 2: Click profile, extract from slide-over panel
    // Option 3: Just extract visible data from the card

    if (config.openProfiles) {
      // Open profile page to get full data
      console.log('Opening profile page:', profileData.url);

      // Send message to background to open and process the profile
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'processProfileUrl',
          url: profileData.url.startsWith('http') ? profileData.url : `https://www.linkedin.com${profileData.url}`,
          name: name
        }, resolve);
      });

      await sleep(3000); // Wait for tab to process

    } else {
      // Extract data from the card itself (limited data)
      const cardData = extractDataFromCard(profileData.element, profileData.url, name);

      // Store the profile data
      chrome.runtime.sendMessage({
        action: 'storeProfileData',
        data: cardData
      });
    }

    // Restore original style
    profileData.element.style.cssText = originalStyle;

  } catch (error) {
    console.error(`Error processing profile ${index}:`, error);
  }
}

function extractDataFromCard(element, url, name) {
  const data = {
    name: name,
    headline: '',
    location: '',
    about: '',
    currentCompany: '',
    currentTitle: '',
    experience: [],
    education: [],
    skills: [],
    profileUrl: url.startsWith('http') ? url : `https://www.linkedin.com${url}`,
    source: 'LinkedIn Extension (Card)',
    extractedAt: new Date().toISOString()
  };

  // Try to extract headline
  const headlineSelectors = [
    '.entity-result__primary-subtitle',
    '.subline-level-1',
    '.search-result__subtitle',
    '.entity-result__summary'
  ];

  for (const selector of headlineSelectors) {
    const el = element.querySelector(selector);
    if (el) {
      data.headline = el.textContent.trim();
      break;
    }
  }

  // Try to extract location
  const locationSelectors = [
    '.entity-result__secondary-subtitle',
    '.subline-level-2',
    '.search-result__location'
  ];

  for (const selector of locationSelectors) {
    const el = element.querySelector(selector);
    if (el) {
      data.location = el.textContent.trim();
      break;
    }
  }

  // Parse headline for title/company
  if (data.headline) {
    const parts = data.headline.split(' at ');
    if (parts.length >= 2) {
      data.currentTitle = parts[0].trim();
      data.currentCompany = parts[1].trim();
    } else {
      data.currentTitle = data.headline;
    }
  }

  return data;
}

async function downloadCurrentProfile() {
  const candidateName = getCandidateName();
  const profileUrl = window.location.href;

  sendStatusUpdate(`Extracting data for ${candidateName}...`, 'info');

  // Extract full profile data
  const profileData = extractProfileData();

  // Send data to background script for storage
  chrome.runtime.sendMessage({
    action: 'storeProfileData',
    data: {
      ...profileData,
      name: candidateName,
      url: profileUrl,
      extractedAt: new Date().toISOString(),
      source: 'LinkedIn Extension (Full)'
    }
  });

  sendStatusUpdate(`Extracted: ${candidateName}`, 'success');
}

async function downloadSingleProfile(cfg) {
  config = cfg || {};
  await downloadCurrentProfile();
}

function getCandidateName() {
  // Try multiple selectors for different LinkedIn page types
  const nameSelectors = [
    // Regular profile page
    'h1.text-heading-xlarge',
    '.pv-top-card--list li:first-child',
    '.text-heading-xlarge',
    // Recruiter/Sales Navigator
    '.profile-topcard-person-entity__name',
    '.artdeco-entity-lockup__title',
    // Fallback selectors
    'h1[class*="name"]',
    '.pv-text-details__left-panel h1',
    '[data-anonymize="person-name"]'
  ];

  for (const selector of nameSelectors) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        const name = element.textContent.trim();
        if (name && name.length > 1 && name.length < 100) {
          return sanitizeFilename(name);
        }
      }
    } catch (e) {
      // Continue to next selector
    }
  }

  // Try to extract from page title
  const title = document.title;
  if (title && title.includes('|')) {
    const name = title.split('|')[0].trim();
    if (name && !name.toLowerCase().includes('linkedin')) {
      return sanitizeFilename(name);
    }
  }

  return 'LinkedIn_Profile';
}

function extractProfileData() {
  const data = {
    name: '',
    headline: '',
    location: '',
    about: '',
    currentCompany: '',
    currentTitle: '',
    experience: [],
    education: [],
    skills: [],
    profileUrl: window.location.href
  };

  try {
    // Name
    data.name = getCandidateName();

    // Headline
    const headlineEl = document.querySelector(
      '.text-body-medium.break-words, ' +
      '.pv-top-card--list-bullet, ' +
      '[data-anonymize="headline"]'
    );
    if (headlineEl) {
      data.headline = headlineEl.textContent.trim();
    }

    // Location
    const locationEl = document.querySelector(
      '.text-body-small.inline.t-black--light.break-words, ' +
      '.pv-top-card--list.pv-top-card--list-bullet span, ' +
      '[data-anonymize="location"]'
    );
    if (locationEl) {
      data.location = locationEl.textContent.trim();
    }

    // About section
    const aboutEl = document.querySelector(
      '#about ~ .display-flex .inline-show-more-text, ' +
      '.pv-about__summary-text, ' +
      '[data-anonymize="about-summary"]'
    );
    if (aboutEl) {
      data.about = aboutEl.textContent.trim().substring(0, 2000);
    }

    // Experience
    const experienceSection = document.querySelector('#experience');
    if (experienceSection) {
      const experienceItems = experienceSection.parentElement.querySelectorAll('li.artdeco-list__item');
      experienceItems.forEach((item, index) => {
        if (index < 10) {
          const titleEl = item.querySelector('.t-bold span[aria-hidden="true"]');
          const companyEl = item.querySelector('.t-normal span[aria-hidden="true"]');
          const durationEl = item.querySelector('.t-black--light span[aria-hidden="true"]');

          const exp = {
            title: titleEl ? titleEl.textContent.trim() : '',
            company: companyEl ? companyEl.textContent.trim() : '',
            duration: durationEl ? durationEl.textContent.trim() : ''
          };

          if (exp.title || exp.company) {
            data.experience.push(exp);

            if (index === 0) {
              data.currentTitle = exp.title;
              data.currentCompany = exp.company;
            }
          }
        }
      });
    }

    // Education
    const educationSection = document.querySelector('#education');
    if (educationSection) {
      const educationItems = educationSection.parentElement.querySelectorAll('li.artdeco-list__item');
      educationItems.forEach((item, index) => {
        if (index < 5) {
          const schoolEl = item.querySelector('.t-bold span[aria-hidden="true"]');
          const degreeEl = item.querySelector('.t-normal span[aria-hidden="true"]');

          const edu = {
            school: schoolEl ? schoolEl.textContent.trim() : '',
            degree: degreeEl ? degreeEl.textContent.trim() : ''
          };

          if (edu.school) {
            data.education.push(edu);
          }
        }
      });
    }

    // Skills
    const skillsSection = document.querySelector('#skills');
    if (skillsSection) {
      const skillItems = skillsSection.parentElement.querySelectorAll('.t-bold span[aria-hidden="true"]');
      skillItems.forEach((item, index) => {
        if (index < 20) {
          const skill = item.textContent.trim();
          if (skill && !data.skills.includes(skill)) {
            data.skills.push(skill);
          }
        }
      });
    }

  } catch (error) {
    console.error('Error extracting profile data:', error);
  }

  return data;
}

function isVisible(element) {
  return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

function sendStatusUpdate(text, type) {
  chrome.runtime.sendMessage({
    action: 'updateStatus',
    text: text,
    type: type
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Auto-scroll functionality to load lazy-loaded content
async function autoScrollToLoadAll() {
  console.log('Starting auto-scroll to load all content...');

  let lastHeight = 0;
  let currentHeight = document.documentElement.scrollHeight;
  let scrollAttempts = 0;
  const maxScrollAttempts = 20;

  while (currentHeight > lastHeight && scrollAttempts < maxScrollAttempts) {
    lastHeight = currentHeight;

    window.scrollTo(0, document.documentElement.scrollHeight);
    console.log(`Scroll attempt ${scrollAttempts + 1}: height = ${currentHeight}`);

    await sleep(1500);

    currentHeight = document.documentElement.scrollHeight;
    scrollAttempts++;

    if (currentHeight === lastHeight) {
      await sleep(1000);
      currentHeight = document.documentElement.scrollHeight;
    }
  }

  console.log(`Auto-scroll complete after ${scrollAttempts} attempts. Final height: ${currentHeight}`);

  window.scrollTo(0, 0);
  await sleep(500);
}

// Add a floating download button to profile pages
function addDownloadButton() {
  if (document.getElementById('linkedin-profile-downloader-btn')) {
    return;
  }

  if (!window.location.href.includes('/in/')) {
    return;
  }

  const button = document.createElement('button');
  button.id = 'linkedin-profile-downloader-btn';
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
    <span>Download Profile</span>
  `;

  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    background: linear-gradient(135deg, #0077B5 0%, #00A0DC 100%);
    color: white;
    border: none;
    border-radius: 24px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 119, 181, 0.4);
    transition: all 0.2s ease;
  `;

  button.addEventListener('mouseenter', () => {
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 6px 16px rgba(0, 119, 181, 0.5)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 4px 12px rgba(0, 119, 181, 0.4)';
  });

  button.addEventListener('click', () => {
    downloadSingleProfile({});
  });

  document.body.appendChild(button);
}

// Initialize when page loads
function initialize() {
  console.log('LinkedIn Profile Downloader: Content script loaded');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addDownloadButton);
  } else {
    setTimeout(addDownloadButton, 1000);
  }

  // Re-add button on navigation (LinkedIn is a SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      setTimeout(addDownloadButton, 1500);
    }
  }).observe(document, { subtree: true, childList: true });
}

initialize();
