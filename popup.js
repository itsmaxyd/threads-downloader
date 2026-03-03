// Popup script for UI interactions

let statusInterval = null;

// DOM elements
const statusDiv = document.getElementById('status');

// Error notification system
function showError(message, duration = 5000) {
  // Remove any existing error
  const existingError = document.getElementById('errorMessage');
  if (existingError) existingError.remove();

  // Build error element with safe DOM APIs (avoids innerHTML linter warning)
  const errorDiv = document.createElement('div');
  errorDiv.id = 'errorMessage';
  errorDiv.className = 'error-notification';

  const icon = document.createElement('span');
  icon.className = 'error-icon';
  icon.textContent = '⚠️';

  const text = document.createElement('span');
  text.className = 'error-text';
  text.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'error-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => errorDiv.remove());

  errorDiv.appendChild(icon);
  errorDiv.appendChild(text);
  errorDiv.appendChild(closeBtn);

  // Insert after status div
  statusDiv.parentNode.insertBefore(errorDiv, statusDiv.nextSibling);

  // Auto-remove after duration
  if (duration > 0) {
    setTimeout(() => {
      if (errorDiv.parentNode) errorDiv.remove();
    }, duration);
  }
}
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
const redirectSettingSelect = document.getElementById('redirectSetting');
const singleMediaUrlInput = document.getElementById('singleMediaUrlInput');
const downloadSingleBtn = document.getElementById('downloadSingleBtn');

// Store current username for metadata export
let currentUsername = 'threads-user';

// Store extracted media data for resume functionality
let pendingMediaData = null;

// Profile page redirect functions
async function checkProfilePage() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'checkProfilePage' });
    if (response && response.isProfilePage) {
      showProfileRedirectNotification(response.mediaUrl);
      return true;
    }
  } catch (error) {
    // Silently fail - not on a Threads page
  }
  return false;
}

// Get redirect setting from storage
async function getRedirectSetting() {
  try {
    const result = await browser.storage.local.get(['redirectSetting']);
    return result.redirectSetting || 'notify'; // Default to notify
  } catch (error) {
    return 'notify';
  }
}

// Show notification with redirect option
async function showProfileRedirectNotification(mediaUrl) {
  const redirectSetting = await getRedirectSetting();

  if (redirectSetting === 'auto') {
    // Auto redirect
    statusDiv.className = 'status extracting';
    statusDiv.textContent = 'Redirecting to media page...';
    await browser.runtime.sendMessage({ action: 'redirectToMedia' });
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

  const p = document.createElement('p');
  p.textContent = "You're on a profile page. Redirect to media page?";
  notification.appendChild(p);

  const btnContainer = document.createElement('div');
  btnContainer.className = 'redirect-buttons';

  const redirectBtn = document.createElement('button');
  redirectBtn.id = 'redirectBtn';
  redirectBtn.className = 'redirect-btn redirect-btn-primary';
  redirectBtn.textContent = 'Go to Media Page';
  redirectBtn.onclick = async () => {
    statusDiv.className = 'status extracting';
    statusDiv.textContent = 'Redirecting to media page...';
    notification.remove();
    await browser.runtime.sendMessage({ action: 'redirectToMedia' });
    // Close popup after redirect
    window.close();
  };

  const dismissBtn = document.createElement('button');
  dismissBtn.id = 'dismissBtn';
  dismissBtn.className = 'redirect-btn redirect-btn-secondary';
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.onclick = () => {
    notification.remove();
  };

  btnContainer.appendChild(redirectBtn);
  btnContainer.appendChild(dismissBtn);
  notification.appendChild(btnContainer);

  statusDiv.parentNode.insertBefore(notification, statusDiv.nextSibling);
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
  if (existingDialog) existingDialog.remove();

  // Build modal with safe DOM APIs (avoids innerHTML linter warning)
  const overlay = document.createElement('div');
  overlay.id = 'resumeDialogOverlay';
  overlay.className = 'resume-dialog-overlay';

  const box = document.createElement('div');
  box.className = 'resume-dialog';

  const heading = document.createElement('h3');
  heading.textContent = 'Previous Downloads Found';

  const countPara = document.createElement('p');
  countPara.className = 'resume-count';
  countPara.textContent = `Found ${fileCount} existing file(s) for @${username}.`;

  box.appendChild(heading);
  box.appendChild(countPara);

  if (latestDatetime) {
    const datePara = document.createElement('p');
    datePara.className = 'resume-datetime';
    datePara.textContent = `Latest download: ${formatDatetimeDisplay(latestDatetime)}`;
    box.appendChild(datePara);
  }

  const infoPara = document.createElement('p');
  infoPara.className = 'resume-info';
  infoPara.textContent = 'How would you like to proceed?';
  box.appendChild(infoPara);

  // Helper to build a resume dialog button
  function makeResumeBtn(id, className, iconText, labelText) {
    const btn = document.createElement('button');
    btn.id = id;
    btn.className = `resume-btn ${className}`;
    const icon = document.createElement('span');
    icon.className = 'resume-btn-icon';
    icon.textContent = iconText;
    btn.appendChild(icon);
    btn.appendChild(document.createTextNode(` ${labelText}`));
    return btn;
  }

  const btnWrap = document.createElement('div');
  btnWrap.className = 'resume-dialog-buttons';

  const resumeFromLatestBtn = makeResumeBtn('resumeFromLatest', 'resume-btn-primary', '▶', 'Resume from Latest');
  const downloadAllBtn = makeResumeBtn('downloadAll', 'resume-btn-secondary', '⬇', 'Download All');
  const cancelBtn = makeResumeBtn('cancelDownload', 'resume-btn-cancel', '✕', 'Cancel');

  btnWrap.appendChild(resumeFromLatestBtn);
  btnWrap.appendChild(downloadAllBtn);
  btnWrap.appendChild(cancelBtn);
  box.appendChild(btnWrap);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Button handlers
  resumeFromLatestBtn.addEventListener('click', async () => {
    overlay.remove();
    await startDownloadWithResume(mediaData, latestDatetime);
  });

  downloadAllBtn.addEventListener('click', async () => {
    overlay.remove();
    await startDownloadWithResume(mediaData, null);
  });

  cancelBtn.addEventListener('click', () => {
    overlay.remove();
    downloadBtn.disabled = false;
    statusDiv.className = 'status idle';
    statusDiv.textContent = 'Ready';
  });
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

    const response = await browser.runtime.sendMessage({
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
      showError(response.error || 'Failed to start download');
      downloadBtn.disabled = false;
      showDefaultState();
      statusDiv.className = 'status idle';
      statusDiv.textContent = 'Ready';
      progressDiv.style.display = 'none';
    }
  } catch (error) {
    showError(error.message);
    downloadBtn.disabled = false;
    showDefaultState();
    statusDiv.className = 'status idle';
    statusDiv.textContent = 'Ready';
    progressDiv.style.display = 'none';
  }
}

// Theme Management
function initTheme() {
  browser.storage.local.get(['theme']).then((result) => {
    const theme = result.theme || 'light';
    document.documentElement.setAttribute('data-theme', theme);
  }).catch(() => { });
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  browser.storage.local.set({ theme: newTheme }).catch(() => { });
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
browser.storage.local.get(['cooldownMs', 'cooldownAfter100', 'redirectSetting']).then((result) => {
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
async function loadMetadataSettings() {
  const settings = await browser.storage.local.get(['exportMetadata', 'metadataFormat']);
  if (exportMetadataCheckbox) {
    exportMetadataCheckbox.checked = settings.exportMetadata || false;
    updateMetadataFormatVisibility();
  }
  if (settings.metadataFormat) {
    const radio = document.querySelector(`input[name="metadataFormat"][value="${settings.metadataFormat}"]`);
    if (radio) radio.checked = true;
  }
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
loadMetadataSettings().catch(() => { });

// Save settings
saveSettingsBtn.addEventListener('click', () => {
  const cooldownMs = parseInt(cooldownInput.value, 10);
  const cooldownAfter100 = parseInt(cooldown100Input.value, 10);
  const exportMetadata = exportMetadataCheckbox ? exportMetadataCheckbox.checked : false;
  const metadataFormat = document.querySelector('input[name="metadataFormat"]:checked')?.value || 'json';
  const redirectSetting = redirectSettingSelect ? redirectSettingSelect.value : 'notify';

  // Validate inputs
  if (isNaN(cooldownMs) || isNaN(cooldownAfter100)) {
    showError('Invalid settings. Please enter valid numbers.');
    return;
  }

  if (cooldownMs < 500 || cooldownMs > 60000) {
    showError('Cooldown must be between 500ms and 60000ms.');
    return;
  }

  if (cooldownAfter100 < 60000 || cooldownAfter100 > 3600000) {
    showError('100-download cooldown must be between 1 minute and 1 hour.');
    return;
  }

  browser.storage.local.set({
    cooldownMs: cooldownMs,
    cooldownAfter100: cooldownAfter100,
    exportMetadata: exportMetadata,
    metadataFormat: metadataFormat,
    redirectSetting: redirectSetting
  }).then(() => {
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
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      showError('No active tab found');
      return;
    }

    const tab = tabs[0];
    const url = tab.url;
    const usernameOverride = usernameInput.value && usernameInput.value.trim() !== '' ? usernameInput.value.trim() : null;

    // Check if we're on a threads page
    if (!url.includes('threads.net') && !url.includes('threads.com')) {
      showError('Please navigate to a Threads page first (threads.net or threads.com)');
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
    const response = await browser.tabs.sendMessage(tab.id, {
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

      const existingCheck = await browser.runtime.sendMessage({
        action: 'checkExistingDownloads',
        username: currentUsername
      });

      if (existingCheck.exists) {
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
    } else {
      showError(response.error || 'Failed to extract media');
      downloadBtn.disabled = false;
      showDefaultState();
      statusDiv.className = 'status idle';
      statusDiv.textContent = 'Ready';
      progressDiv.style.display = 'none';
    }

  } catch (error) {
    showError(error.message);
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
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      showError('No active tab found');
      return;
    }
    const tab = tabs[0];
    const url = tab.url;
    const usernameOverride = usernameInput.value && usernameInput.value.trim() !== '' ? usernameInput.value.trim() : null;
    const limitValue = downloadLimitSelect.value;
    const limit = limitValue === 'all' ? null : parseInt(limitValue, 10);

    if (!url.includes('threads.net') && !url.includes('threads.com')) {
      showError('Please navigate to a Threads page first (threads.net or threads.com)');
      return;
    }

    statusDiv.className = 'status extracting';
    statusDiv.textContent = 'Preparing queue...';
    downloadBtn.disabled = true;
    prepareBtn.disabled = true;

    const response = await browser.tabs.sendMessage(tab.id, {
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
      // Use blob URL like the spec for compatibility
      const blob = new Blob([text], { type: 'text/plain' });
      const blobUrl = URL.createObjectURL(blob);
      await browser.downloads.download({
        url: blobUrl,
        filename: `threads-queues/${username}-queue.txt`,
        saveAs: false
      });
      URL.revokeObjectURL(blobUrl);
      statusDiv.className = 'status idle';
      statusDiv.textContent = `Queue saved (${response.urls.length} links)`;
    } else {
      showError(`No media found to save. ${response.error ? response.error : ''}`);
      statusDiv.className = 'status idle';
      statusDiv.textContent = 'Ready';
    }
  } catch (error) {
    showError(error.message);
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
      showError('No valid URLs found in the file.');
      return;
    }
    const usernameOverride = usernameInput.value && usernameInput.value.trim() !== '' ? usernameInput.value.trim() : 'threads-user';
    statusDiv.className = 'status downloading';
    statusDiv.textContent = `Loading queue file (${lines.length} links)...`;
    progressDiv.style.display = 'block';
    progressBar.style.width = '0%';
    showDownloadingState();

    await browser.runtime.sendMessage({
      action: 'downloadMediaFromList',
      urls: lines,
      username: usernameOverride
    });

    startStatusPolling();
  } catch (error) {
    showError(error.message);
  }
});

// Resume button
resumeBtn.addEventListener('click', async () => {
  try {
    const response = await browser.runtime.sendMessage({ action: 'resumeDownload' });
    if (response.success) {
      statusDiv.className = 'status downloading';
      statusDiv.textContent = 'Resuming download...';
      progressDiv.style.display = 'block';
      showDownloadingState();
      startStatusPolling();
    } else {
      showError(response.error || 'Failed to resume download');
    }
  } catch (error) {
    showError(error.message);
  }
});

// Stop button
stopBtn.addEventListener('click', async () => {
  try {
    await browser.runtime.sendMessage({ action: 'stopDownload' });
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
    // Silently fail
  }
});

// Clear queue button
clearBtn.addEventListener('click', async () => {
  try {
    await browser.runtime.sendMessage({ action: 'clearQueue' });
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
    // Silently fail
  }
});

// Status polling
function startStatusPolling() {
  if (statusInterval) return;

  statusInterval = setInterval(async () => {
    try {
      const response = await browser.runtime.sendMessage({ action: 'getStatus' });

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

          // Metadata is auto-exported, no need to show export button

          setTimeout(() => {
            statusDiv.textContent = 'Ready';
          }, 3000);
        }
      }
    } catch (error) {
      // Silently fail during polling
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
browser.runtime.onMessage.addListener((message) => {
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

    // Metadata is auto-exported, no need to show export button

    setTimeout(() => {
      statusDiv.textContent = 'Ready';
    }, 3000);
  }
});

// Initial status check
browser.runtime.sendMessage({ action: 'getStatus' }).then((response) => {
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
}).catch(() => {
  // Also check profile page on error
  checkProfilePage();
});

// Note: Export metadata button removed - metadata is now auto-exported on download completion

// Single media download button
if (downloadSingleBtn) {
  downloadSingleBtn.addEventListener('click', async () => {
    try {
      const url = singleMediaUrlInput.value.trim();
      const username = usernameInput.value.trim() || 'threads-user';
      
      if (!url) {
        showError('Please enter a media URL');
        return;
      }
      
      // Validate URL format
      if (!url.startsWith('http')) {
        showError('Please enter a valid URL starting with http:// or https://');
        return;
      }
      
      downloadSingleBtn.disabled = true;
      statusDiv.className = 'status downloading';
      statusDiv.textContent = 'Downloading single media...';
      
      // Try to extract media from the page first (if it's a Threads post URL)
      if (url.includes('threads.net') || url.includes('threads.com')) {
        try {
          // Check if it's a post URL
          if (url.includes('/post/')) {
            // We could navigate to the page and extract, but for now use direct download
            // For simplicity, we'll use direct download
            const response = await browser.runtime.sendMessage({
              action: 'downloadSingleMedia',
              url: url,
              username: username
            });
            
            if (response.success) {
              statusDiv.className = 'status idle';
              statusDiv.textContent = 'Download started!';
              setTimeout(() => {
                statusDiv.textContent = 'Ready';
              }, 2000);
            } else {
              showError(response.error || 'Failed to download media');
            }
          } else {
            // Not a post URL, try direct download
            const response = await browser.runtime.sendMessage({
              action: 'downloadSingleMedia',
              url: url,
              username: username
            });
            
            if (response.success) {
              statusDiv.className = 'status idle';
              statusDiv.textContent = 'Download started!';
              setTimeout(() => {
                statusDiv.textContent = 'Ready';
              }, 2000);
            } else {
              showError(response.error || 'Failed to download media');
            }
          }
        } catch (error) {
          showError(error.message);
        }
      } else {
        // Direct media URL download
        const response = await browser.runtime.sendMessage({
          action: 'downloadSingleMedia',
          url: url,
          username: username
        });
        
        if (response.success) {
          statusDiv.className = 'status idle';
          statusDiv.textContent = 'Download started!';
          setTimeout(() => {
            statusDiv.textContent = 'Ready';
          }, 2000);
        } else {
          showError(response.error || 'Failed to download media');
        }
      }
    } catch (error) {
      showError(error.message);
    } finally {
      downloadSingleBtn.disabled = false;
    }
  });
}
