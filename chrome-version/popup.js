// Popup script for UI interactions
// Chrome Manifest V3 version

let statusInterval = null;

// DOM elements
const statusDiv = document.getElementById('status');
const downloadBtn = document.getElementById('downloadBtn');
const prepareBtn = document.getElementById('prepareBtn');
const loadBtn = document.getElementById('loadBtn');
const queueFileInput = document.getElementById('queueFileInput');
const resumeBtn = document.getElementById('resumeBtn');
const stopBtn = document.getElementById('stopBtn');
const mainButtons = document.getElementById('mainButtons');
const actionButtons = document.getElementById('actionButtons');
const clearBtn = document.getElementById('clearBtn');
const progressDiv = document.getElementById('progress');
const progressText = document.getElementById('progressText');
const progressBar = document.getElementById('progressBar');
const downloadLimitSelect = document.getElementById('downloadLimitSelect');
const usernameInput = document.getElementById('usernameInput');
const cooldownInput = document.getElementById('cooldownInput');
const cooldown100Input = document.getElementById('cooldown100Input');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const themeToggle = document.getElementById('themeToggle');
const settingsBtn = document.getElementById('settingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const closeSettings = document.getElementById('closeSettings');
const exportMetadataCheckbox = document.getElementById('exportMetadata');
const metadataFormatGroup = document.getElementById('metadataFormatGroup');
const exportMetadataSection = document.getElementById('exportMetadataSection');
const exportMetadataBtn = document.getElementById('exportMetadataBtn');
const redirectSettingSelect = document.getElementById('redirectSetting');

// Store current username for metadata export
let currentUsername = 'threads-user';

// Store extracted media data for resume functionality
let pendingMediaData = null;

// Profile page redirect functions
async function checkProfilePage() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkProfilePage' });
    if (response && response.isProfilePage) {
      showProfileRedirectNotification(response.mediaUrl);
      return true;
    }
  } catch (error) {
    console.error('Error checking profile page:', error);
  }
  return false;
}

// Get redirect setting from storage
function getRedirectSetting() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['redirectSetting'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('Error getting redirect setting:', chrome.runtime.lastError);
        resolve('notify');
        return;
      }
      resolve(result.redirectSetting || 'notify');
    });
  });
}

// Show notification with redirect option
async function showProfileRedirectNotification(mediaUrl) {
  const redirectSetting = await getRedirectSetting();
  
  if (redirectSetting === 'auto') {
    // Auto redirect
    statusDiv.className = 'status extracting';
    statusDiv.textContent = 'Redirecting to media page...';
    await chrome.runtime.sendMessage({ action: 'redirectToMedia' });
    // Close popup after redirect
    window.close();
    return;
  }
  
  if (redirectSetting === 'disabled') {
    // Just show warning
    statusDiv.className = 'status idle';
    statusDiv.textContent = '⚠️ Profile page detected. Media downloads work on /media pages.';
    return;
  }
  
  // Notify - show redirect button
  const notification = document.createElement('div');
  notification.className = 'redirect-notification';
  notification.innerHTML = `
    <p>You're on a profile page. Redirect to media page?</p>
    <div class="redirect-buttons">
      <button id="redirectBtn" class="redirect-btn redirect-btn-primary">Go to Media Page</button>
      <button id="dismissBtn" class="redirect-btn redirect-btn-secondary">Dismiss</button>
    </div>
  `;
  
  statusDiv.parentNode.insertBefore(notification, statusDiv.nextSibling);
  
  document.getElementById('redirectBtn').onclick = async () => {
    statusDiv.className = 'status extracting';
    statusDiv.textContent = 'Redirecting to media page...';
    notification.remove();
    await chrome.runtime.sendMessage({ action: 'redirectToMedia' });
    // Close popup after redirect
    window.close();
  };
  
  document.getElementById('dismissBtn').onclick = () => {
    notification.remove();
  };
}

// Format datetime for display in the resume dialog
function formatDatetimeDisplay(isoString) {
  if (!isoString) return 'Unknown';
  
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Unknown';
    
    // Format: "Jan 15, 2024 at 3:45 PM"
    const options = {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    };
    return date.toLocaleString('en-US', options);
  } catch (e) {
    return 'Unknown';
  }
}

// Show resume dialog when existing downloads are found
function showResumeDialog(fileCount, latestDatetime, username, mediaData) {
  // Remove any existing dialog
  const existingDialog = document.getElementById('resumeDialogOverlay');
  if (existingDialog) {
    existingDialog.remove();
  }
  
  // Create modal dialog
  const dialog = document.createElement('div');
  dialog.id = 'resumeDialogOverlay';
  dialog.className = 'resume-dialog-overlay';
  
  const latestText = latestDatetime 
    ? `<p class="resume-datetime">Latest download: ${formatDatetimeDisplay(latestDatetime)}</p>`
    : '';
  
  dialog.innerHTML = `
    <div class="resume-dialog">
      <h3>Previous Downloads Found</h3>
      <p class="resume-count">Found ${fileCount} existing file(s) for @${username}.</p>
      ${latestText}
      <p class="resume-info">How would you like to proceed?</p>
      <div class="resume-dialog-buttons">
        <button id="resumeFromLatest" class="resume-btn resume-btn-primary">
          <span class="resume-btn-icon">▶</span>
          Resume from Latest
        </button>
        <button id="downloadAll" class="resume-btn resume-btn-secondary">
          <span class="resume-btn-icon">⬇</span>
          Download All
        </button>
        <button id="cancelDownload" class="resume-btn resume-btn-cancel">
          <span class="resume-btn-icon">✕</span>
          Cancel
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(dialog);
  
  // Add button handlers
  document.getElementById('resumeFromLatest').onclick = async () => {
    dialog.remove();
    await startDownloadWithResume(mediaData, latestDatetime);
  };
  
  document.getElementById('downloadAll').onclick = async () => {
    dialog.remove();
    await startDownloadWithResume(mediaData, null);
  };
  
  document.getElementById('cancelDownload').onclick = () => {
    dialog.remove();
    downloadBtn.disabled = false;
    statusDiv.className = 'status idle';
    statusDiv.textContent = 'Ready';
  };
}

// Start download with optional resume datetime
async function startDownloadWithResume(mediaData, resumeFromDatetime) {
  try {
    statusDiv.className = 'status downloading';
    if (resumeFromDatetime) {
      statusDiv.textContent = 'Downloading new media only...';
    } else {
      statusDiv.textContent = 'Downloading all media...';
    }
    progressDiv.style.display = 'block';
    progressText.textContent = 'Starting download...';
    progressBar.style.width = '0%';
    showDownloadingState();
    
    const response = await chrome.runtime.sendMessage({
      action: 'downloadMediaWithResume',
      mediaItems: mediaData.mediaItems,
      username: mediaData.username,
      metadata: mediaData.metadata,
      resumeFromDatetime: resumeFromDatetime
    });
    
    if (response.success) {
      if (response.queued === 0 && response.message) {
        // No new media to download
        statusDiv.className = 'status idle';
        statusDiv.textContent = response.message;
        progressDiv.style.display = 'none';
        downloadBtn.disabled = false;
        showDefaultState();
      } else {
        statusDiv.textContent = `Downloading ${response.queued} files...`;
        startStatusPolling();
      }
    } else {
      alert(`Error: ${response.error || 'Failed to start download'}`);
      downloadBtn.disabled = false;
      showDefaultState();
      statusDiv.className = 'status idle';
      statusDiv.textContent = 'Ready';
      progressDiv.style.display = 'none';
    }
  } catch (error) {
    console.error('Error starting download:', error);
    alert(`Error: ${error.message}`);
    downloadBtn.disabled = false;
    showDefaultState();
    statusDiv.className = 'status idle';
    statusDiv.textContent = 'Ready';
    progressDiv.style.display = 'none';
  }
}

// Theme Management
function initTheme() {
  chrome.storage.local.get(['theme'], (result) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to load theme:', chrome.runtime.lastError);
      return;
    }
    const theme = result.theme || 'light';
    document.documentElement.setAttribute('data-theme', theme);
  });
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  chrome.storage.local.set({ theme: newTheme }, () => {
    if (chrome.runtime.lastError) {
      console.error('Failed to save theme:', chrome.runtime.lastError);
    }
  });
}

// Settings Panel Management
function openSettingsPanel() {
  settingsOverlay.classList.add('active');
}

function closeSettingsPanel() {
  settingsOverlay.classList.remove('active');
}

// Button State Management
function showDefaultState() {
  mainButtons.style.display = 'grid';
  actionButtons.style.display = 'none';
}

function showDownloadingState() {
  mainButtons.style.display = 'none';
  actionButtons.style.display = 'grid';
  stopBtn.style.display = 'flex';
  resumeBtn.style.display = 'none';
}

function showStoppedState() {
  mainButtons.style.display = 'none';
  actionButtons.style.display = 'grid';
  stopBtn.style.display = 'none';
  resumeBtn.style.display = 'flex';
}

// Initialize theme on load
initTheme();

// Theme toggle event listener
themeToggle?.addEventListener('click', toggleTheme);

// Settings panel event listeners
settingsBtn?.addEventListener('click', openSettingsPanel);
closeSettings?.addEventListener('click', closeSettingsPanel);

// Close settings panel when clicking outside
settingsOverlay?.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) {
    closeSettingsPanel();
  }
});

// Load saved settings
chrome.storage.local.get(['cooldownMs', 'cooldownAfter100', 'redirectSetting'], (result) => {
  if (result.cooldownMs !== undefined) {
    cooldownInput.value = result.cooldownMs;
  }
  if (result.cooldownAfter100 !== undefined) {
    cooldown100Input.value = result.cooldownAfter100;
  }
  if (result.redirectSetting !== undefined && redirectSettingSelect) {
    redirectSettingSelect.value = result.redirectSetting;
  }
});

// Load metadata settings
function loadMetadataSettings() {
  chrome.storage.local.get(['exportMetadata', 'metadataFormat'], (result) => {
    if (exportMetadataCheckbox) {
      exportMetadataCheckbox.checked = result.exportMetadata || false;
      updateMetadataFormatVisibility();
    }
    if (result.metadataFormat) {
      const radio = document.querySelector(`input[name="metadataFormat"][value="${result.metadataFormat}"]`);
      if (radio) radio.checked = true;
    }
  });
}

// Update visibility of metadata format options
function updateMetadataFormatVisibility() {
  if (metadataFormatGroup && exportMetadataCheckbox) {
    metadataFormatGroup.style.display = exportMetadataCheckbox.checked ? 'block' : 'none';
  }
}

// Event listener for metadata checkbox
if (exportMetadataCheckbox) {
  exportMetadataCheckbox.addEventListener('change', updateMetadataFormatVisibility);
}

// Load metadata settings on init
loadMetadataSettings();

// Save settings
saveSettingsBtn.addEventListener('click', () => {
  const cooldownMs = parseInt(cooldownInput.value, 10);
  const cooldownAfter100 = parseInt(cooldown100Input.value, 10);
  const exportMetadata = exportMetadataCheckbox ? exportMetadataCheckbox.checked : false;
  const metadataFormat = document.querySelector('input[name="metadataFormat"]:checked')?.value || 'json';
  const redirectSetting = redirectSettingSelect ? redirectSettingSelect.value : 'notify';
  
  // Validate inputs
  if (isNaN(cooldownMs) || isNaN(cooldownAfter100)) {
    alert('Invalid settings. Please enter valid numbers.');
    return;
  }
  
  if (cooldownMs < 500 || cooldownMs > 60000) {
    alert('Invalid settings. Cooldown must be between 500ms and 60000ms.');
    return;
  }
  
  if (cooldownAfter100 < 60000 || cooldownAfter100 > 3600000) {
    alert('Invalid settings. 100-download cooldown must be between 60000ms (1 minute) and 3600000ms (1 hour).');
    return;
  }
  
  chrome.storage.local.set({
    cooldownMs: cooldownMs,
    cooldownAfter100: cooldownAfter100,
    exportMetadata: exportMetadata,
    metadataFormat: metadataFormat,
    redirectSetting: redirectSetting
  }, () => {
    saveSettingsBtn.textContent = 'Saved!';
    setTimeout(() => {
      saveSettingsBtn.textContent = 'Save Settings';
      closeSettingsPanel();
    }, 1000);
  });
});

// Download button
downloadBtn.addEventListener('click', async () => {
  try {
    // Get current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      alert('No active tab found');
      return;
    }
    
    const tab = tabs[0];
    const url = tab.url;
    const usernameOverride = usernameInput.value && usernameInput.value.trim() !== '' ? usernameInput.value.trim() : null;
    
    // Check if we're on a threads page
    if (!url.includes('threads.net') && !url.includes('threads.com')) {
      alert('Please navigate to a Threads page first (threads.net or threads.com)');
      return;
    }
    
    // Check if it's a media page
    if (!url.includes('/media')) {
      const proceed = confirm('This doesn\'t appear to be a media page. Continue anyway?');
      if (!proceed) return;
    }
    
    downloadBtn.disabled = true;
    statusDiv.className = 'status extracting';
    statusDiv.textContent = 'Extracting media from page...';
    
    // Get download limit from select
    const limitValue = downloadLimitSelect.value;
    const limit = limitValue === 'all' ? null : parseInt(limitValue, 10);
    
    // Send message to content script with limit
    const response = await chrome.tabs.sendMessage(tab.id, { 
      action: 'extractMedia',
      limit: limit,
      prepareOnly: false,
      usernameOverride: usernameOverride
    });
    
    if (response.success) {
      // Store username for metadata export
      currentUsername = response.username || 'threads-user';
      
      // Check for existing downloads before starting
      statusDiv.textContent = 'Checking for existing downloads...';
      
      chrome.runtime.sendMessage({
        action: 'checkExistingDownloads',
        username: currentUsername
      }, (existingCheck) => {
        if (chrome.runtime.lastError) {
          console.error('Error checking existing downloads:', chrome.runtime.lastError);
          // Proceed with normal download if check fails
          statusDiv.className = 'status downloading';
          statusDiv.textContent = `Found ${response.count} media files. Downloading...`;
          progressDiv.style.display = 'block';
          progressText.textContent = `Queued: ${response.count} files`;
          progressBar.style.width = '0%';
          showDownloadingState();
          startStatusPolling();
          return;
        }
        
        if (existingCheck && existingCheck.exists) {
          // Found existing downloads - show resume dialog
          statusDiv.className = 'status idle';
          statusDiv.textContent = 'Ready';
          
          // Store media data for resume functionality
          pendingMediaData = {
            mediaItems: response.mediaItems || (response.urls ? response.urls.map(url => ({ url, type: 'image', datetime: null })) : []),
            username: currentUsername,
            metadata: response.metadata || []
          };
          
          showResumeDialog(existingCheck.count, existingCheck.latestDatetime, currentUsername, pendingMediaData);
        } else {
          // No existing downloads - start normal download
          statusDiv.className = 'status downloading';
          statusDiv.textContent = `Found ${response.count} media files. Downloading...`;
          progressDiv.style.display = 'block';
          progressText.textContent = `Queued: ${response.count} files`;
          progressBar.style.width = '0%';
          showDownloadingState();
          
          // Start status polling
          startStatusPolling();
        }
      });
    } else {
      alert(`Error: ${response.error || 'Failed to extract media'}`);
      downloadBtn.disabled = false;
      showDefaultState();
      statusDiv.className = 'status idle';
      statusDiv.textContent = 'Ready';
      progressDiv.style.display = 'none';
    }
    
  } catch (error) {
    console.error('Error:', error);
    alert(`Error: ${error.message}`);
    downloadBtn.disabled = false;
    showDefaultState();
    statusDiv.className = 'status idle';
    statusDiv.textContent = 'Ready';
    progressDiv.style.display = 'none';
  }
});

// Prepare queue (save links to file)
prepareBtn.addEventListener('click', async () => {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      alert('No active tab found');
      return;
    }
    const tab = tabs[0];
    const url = tab.url;
    const usernameOverride = usernameInput.value && usernameInput.value.trim() !== '' ? usernameInput.value.trim() : null;
    const limitValue = downloadLimitSelect.value;
    const limit = limitValue === 'all' ? null : parseInt(limitValue, 10);

    if (!url.includes('threads.net') && !url.includes('threads.com')) {
      alert('Please navigate to a Threads page first (threads.net or threads.com)');
      return;
    }

    statusDiv.className = 'status extracting';
    statusDiv.textContent = 'Preparing queue...';
    downloadBtn.disabled = true;
    prepareBtn.disabled = true;

    const response = await chrome.tabs.sendMessage(tab.id, { 
      action: 'extractMedia',
      limit: limit,
      prepareOnly: true,
      usernameOverride: usernameOverride
    });

    if (response.success && response.urls && response.urls.length > 0) {
      const username = response.username || 'threads-user';
      // Handle both array of strings and array of objects
      const urlStrings = response.urls.map(item => typeof item === 'string' ? item : item.url);
      const text = urlStrings.join('\n');
      // Use blob URL for compatibility
      const blob = new Blob([text], { type: 'text/plain' });
      const blobUrl = URL.createObjectURL(blob);
      await chrome.downloads.download({
        url: blobUrl,
        filename: `threads-queues/${username}-queue.txt`,
        saveAs: false
      });
      URL.revokeObjectURL(blobUrl);
      statusDiv.className = 'status idle';
      statusDiv.textContent = `Queue saved (${response.urls.length} links)`;
    } else {
      alert(`No media found to save. ${response.error ? 'Error: ' + response.error : ''}`);
      statusDiv.className = 'status idle';
      statusDiv.textContent = 'Ready';
    }
  } catch (error) {
    console.error('Error preparing queue:', error);
    alert(`Error: ${error.message}`);
    statusDiv.className = 'status idle';
    statusDiv.textContent = 'Ready';
  } finally {
    downloadBtn.disabled = false;
    prepareBtn.disabled = false;
  }
});

// Load queue from file
loadBtn.addEventListener('click', () => {
  queueFileInput.value = '';
  queueFileInput.click();
});

queueFileInput.addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('http'));
    if (lines.length === 0) {
      alert('No valid URLs found in the file.');
      return;
    }
    const usernameOverride = usernameInput.value && usernameInput.value.trim() !== '' ? usernameInput.value.trim() : 'threads-user';
    statusDiv.className = 'status downloading';
    statusDiv.textContent = `Loading queue file (${lines.length} links)...`;
    progressDiv.style.display = 'block';
    progressBar.style.width = '0%';
    showDownloadingState();

    await chrome.runtime.sendMessage({
      action: 'downloadMediaFromList',
      urls: lines,
      username: usernameOverride
    });

    startStatusPolling();
  } catch (error) {
    console.error('Error loading queue file:', error);
    alert(`Error: ${error.message}`);
  }
});

// Resume button
resumeBtn.addEventListener('click', async () => {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'resumeDownload' });
    if (response.success) {
      statusDiv.className = 'status downloading';
      statusDiv.textContent = 'Resuming download...';
      progressDiv.style.display = 'block';
      showDownloadingState();
      startStatusPolling();
    } else {
      alert(`Error: ${response.error || 'Failed to resume download'}`);
    }
  } catch (error) {
    console.error('Error resuming download:', error);
    alert(`Error: ${error.message}`);
  }
});

// Stop button
stopBtn.addEventListener('click', async () => {
  try {
    await chrome.runtime.sendMessage({ action: 'stopDownload' });
    statusDiv.className = 'status idle';
    statusDiv.textContent = 'Download stopped (can be resumed)';
    progressDiv.style.display = 'none';
    downloadBtn.disabled = false;
    showStoppedState();
    stopStatusPolling();
    
    setTimeout(() => {
      statusDiv.textContent = 'Ready';
    }, 2000);
  } catch (error) {
    console.error('Error stopping download:', error);
  }
});

// Clear queue button
clearBtn.addEventListener('click', async () => {
  try {
    await chrome.runtime.sendMessage({ action: 'clearQueue' });
    statusDiv.className = 'status idle';
    statusDiv.textContent = 'Queue cleared';
    progressDiv.style.display = 'none';
    downloadBtn.disabled = false;
    showDefaultState();
    stopStatusPolling();
    
    setTimeout(() => {
      statusDiv.textContent = 'Ready';
    }, 2000);
  } catch (error) {
    console.error('Error clearing queue:', error);
  }
});

// Status polling
function startStatusPolling() {
  if (statusInterval) return;
  
  statusInterval = setInterval(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
      
      if (response.isDownloading) {
        if (response.cooldownUntil > Date.now()) {
          const remaining = Math.ceil((response.cooldownUntil - Date.now()) / 1000);
          statusDiv.className = 'status cooldown';
          statusDiv.textContent = `Cooldown: ${remaining}s remaining`;
        } else {
          statusDiv.className = 'status downloading';
          statusDiv.textContent = 'Downloading...';
        }
        
        // Update progress bar
        if (response.totalFiles > 0) {
          const downloaded = response.downloadCount || 0;
          const progress = (downloaded / response.totalFiles) * 100;
          progressBar.style.width = `${Math.min(progress, 100)}%`;
          progressText.textContent = `Downloaded: ${downloaded}/${response.totalFiles} (${response.queueLength} remaining)`;
        } else if (response.queueLength > 0) {
          progressText.textContent = `Queue: ${response.queueLength} remaining`;
        } else {
          progressText.textContent = 'Processing...';
        }
        
        showDownloadingState();
      } else {
        // Check if there's a saved state for resume
        if (response.hasSavedState) {
          showStoppedState();
        } else {
          showDefaultState();
        }
        
        if (response.queueLength === 0 && !response.isDownloading) {
          statusDiv.className = 'status idle';
          statusDiv.textContent = 'All downloads complete!';
          progressDiv.style.display = 'none';
          downloadBtn.disabled = false;
          showDefaultState();
          stopStatusPolling();
          
          setTimeout(() => {
            statusDiv.textContent = 'Ready';
          }, 3000);
        }
      }
    } catch (error) {
      console.error('Error getting status:', error);
    }
  }, 1000);
}

function stopStatusPolling() {
  if (statusInterval) {
    clearInterval(statusInterval);
    statusInterval = null;
  }
}

// Listen for download progress updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'downloadProgress') {
    const downloaded = message.downloaded || message.current;
    const total = message.totalFiles || message.total;
    if (total > 0) {
      const progress = (downloaded / total) * 100;
      progressBar.style.width = `${Math.min(progress, 100)}%`;
      progressText.textContent = `Downloaded: ${downloaded}/${total} (${message.remaining} in queue)`;
    } else {
      progressText.textContent = `Downloaded: ${message.current}/${message.total} (${message.remaining} in queue)`;
    }
  } else if (message.action === 'downloadStopped') {
    statusDiv.className = 'status idle';
    statusDiv.textContent = 'Download stopped (can be resumed)';
    progressDiv.style.display = 'none';
    downloadBtn.disabled = false;
    showStoppedState();
    stopStatusPolling();
    
    setTimeout(() => {
      statusDiv.textContent = 'Ready';
    }, 2000);
  } else if (message.action === 'cooldownStarted') {
    const duration = Math.ceil(message.duration / 1000);
    statusDiv.className = 'status cooldown';
    statusDiv.textContent = `100 downloads reached! Cooldown: ${duration}s`;
  } else if (message.action === 'downloadComplete') {
    statusDiv.className = 'status idle';
    statusDiv.textContent = 'All downloads complete!';
    progressBar.style.width = '100%';
    progressDiv.style.display = 'none';
    downloadBtn.disabled = false;
    showDefaultState();
    stopStatusPolling();
    
    // Show export metadata button if enabled
    checkAndShowExportButton();
    
    setTimeout(() => {
      statusDiv.textContent = 'Ready';
    }, 3000);
  }
});

// Initial status check
chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
  if (chrome.runtime.lastError) {
    console.error('Error getting initial status:', chrome.runtime.lastError);
    // Also check profile page on error
    checkProfilePage();
    return;
  }
  
  if (response.isDownloading) {
    downloadBtn.disabled = true;
    showDownloadingState();
    progressDiv.style.display = 'block';
    if (response.totalFiles > 0) {
      const progress = ((response.totalFiles - response.queueLength) / response.totalFiles) * 100;
      progressBar.style.width = `${Math.min(progress, 100)}%`;
      progressText.textContent = `Downloaded: ${response.totalFiles - response.queueLength}/${response.totalFiles} (${response.queueLength} remaining)`;
    }
    startStatusPolling();
  } else if (response.hasSavedState) {
    // Show resume button if there's a saved state
    showStoppedState();
    statusDiv.className = 'status idle';
    statusDiv.textContent = 'Previous download can be resumed';
  } else {
    // Check if we're on a profile page (not media page)
    checkProfilePage();
  }
});

// Check if export button should be shown and display it
function checkAndShowExportButton() {
  chrome.storage.local.get(['exportMetadata'], (result) => {
    if (result.exportMetadata && exportMetadataSection) {
      // Check if there's metadata available
      chrome.runtime.sendMessage({ action: 'getMetadata' }, (response) => {
        if (response && response.success && response.metadata && response.metadata.length > 0) {
          exportMetadataSection.style.display = 'block';
        }
      });
    }
  });
}

// Export metadata button handler
if (exportMetadataBtn) {
  exportMetadataBtn.addEventListener('click', async () => {
    try {
      const format = document.querySelector('input[name="metadataFormat"]:checked')?.value || 'json';
      const response = await chrome.runtime.sendMessage({ 
        action: 'exportMetadata', 
        format: format,
        username: currentUsername
      });
      
      if (response && response.success) {
        statusDiv.className = 'status idle';
        statusDiv.textContent = `Metadata exported successfully!`;
        setTimeout(() => {
          statusDiv.textContent = 'Ready';
        }, 2000);
      } else {
        alert(`Error: ${response?.error || 'Failed to export metadata'}`);
      }
    } catch (error) {
      console.error('Error exporting metadata:', error);
      alert(`Error: ${error.message}`);
    }
  });
}
