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
const clearBtn = document.getElementById('clearBtn');
const progressDiv = document.getElementById('progress');
const progressText = document.getElementById('progressText');
const progressBar = document.getElementById('progressBar');
const downloadLimitSelect = document.getElementById('downloadLimitSelect');
const usernameInput = document.getElementById('usernameInput');
const cooldownInput = document.getElementById('cooldownInput');
const cooldown100Input = document.getElementById('cooldown100Input');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');

// Load saved settings
chrome.storage.local.get(['cooldownMs', 'cooldownAfter100'], (result) => {
  if (result.cooldownMs !== undefined) {
    cooldownInput.value = result.cooldownMs;
  }
  if (result.cooldownAfter100 !== undefined) {
    cooldown100Input.value = result.cooldownAfter100;
  }
});

// Save settings
saveSettingsBtn.addEventListener('click', () => {
  const cooldownMs = parseInt(cooldownInput.value, 10);
  const cooldownAfter100 = parseInt(cooldown100Input.value, 10);
  
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
    cooldownAfter100: cooldownAfter100
  }, () => {
    saveSettingsBtn.textContent = 'Saved!';
    setTimeout(() => {
      saveSettingsBtn.textContent = 'Save Settings';
    }, 2000);
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
    downloadBtn.textContent = 'Extracting...';
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
      statusDiv.className = 'status downloading';
      statusDiv.textContent = `Found ${response.count} media files. Downloading...`;
      progressDiv.style.display = 'block';
      progressText.textContent = `Queued: ${response.count} files`;
      progressBar.style.width = '0%';
      downloadBtn.style.display = 'none';
      stopBtn.style.display = 'block';
      
      // Start status polling
      startStatusPolling();
    } else {
      alert(`Error: ${response.error || 'Failed to extract media'}`);
      downloadBtn.disabled = false;
      downloadBtn.textContent = 'Download Media';
      downloadBtn.style.display = 'block';
      stopBtn.style.display = 'none';
      statusDiv.className = 'status idle';
      statusDiv.textContent = 'Ready';
      progressDiv.style.display = 'none';
    }
    
  } catch (error) {
    console.error('Error:', error);
    alert(`Error: ${error.message}`);
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download Media';
    downloadBtn.style.display = 'block';
    stopBtn.style.display = 'none';
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
      const text = response.urls.join('\n');
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
    downloadBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    resumeBtn.style.display = 'none';

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
      resumeBtn.style.display = 'none';
      stopBtn.style.display = 'block';
      downloadBtn.style.display = 'none';
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
    downloadBtn.textContent = 'Download Media';
    downloadBtn.style.display = 'block';
    resumeBtn.style.display = 'block';
    stopBtn.style.display = 'none';
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
    downloadBtn.textContent = 'Download Media';
    downloadBtn.style.display = 'block';
    stopBtn.style.display = 'none';
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
        
        // Hide resume button when downloading
        resumeBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        downloadBtn.style.display = 'none';
      } else {
        // Check if there's a saved state for resume
        if (response.hasSavedState) {
          resumeBtn.style.display = 'block';
          downloadBtn.style.display = 'block';
          stopBtn.style.display = 'none';
        } else {
          resumeBtn.style.display = 'none';
        }
        
        if (response.queueLength === 0 && !response.isDownloading) {
          statusDiv.className = 'status idle';
          statusDiv.textContent = 'All downloads complete!';
          progressDiv.style.display = 'none';
          downloadBtn.disabled = false;
          downloadBtn.textContent = 'Download Media';
          downloadBtn.style.display = 'block';
          stopBtn.style.display = 'none';
          resumeBtn.style.display = 'none';
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
    downloadBtn.textContent = 'Download Media';
    downloadBtn.style.display = 'block';
    resumeBtn.style.display = 'block';
    stopBtn.style.display = 'none';
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
    downloadBtn.textContent = 'Download Media';
    downloadBtn.style.display = 'block';
    stopBtn.style.display = 'none';
    stopStatusPolling();
    
    setTimeout(() => {
      statusDiv.textContent = 'Ready';
    }, 3000);
  }
});

// Initial status check
chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
  if (chrome.runtime.lastError) {
    console.error('Error getting initial status:', chrome.runtime.lastError);
    return;
  }
  
  if (response.isDownloading) {
    downloadBtn.disabled = true;
    downloadBtn.style.display = 'none';
    resumeBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    progressDiv.style.display = 'block';
    if (response.totalFiles > 0) {
      const progress = ((response.totalFiles - response.queueLength) / response.totalFiles) * 100;
      progressBar.style.width = `${Math.min(progress, 100)}%`;
      progressText.textContent = `Downloaded: ${response.totalFiles - response.queueLength}/${response.totalFiles} (${response.queueLength} remaining)`;
    }
    startStatusPolling();
  } else if (response.hasSavedState) {
    // Show resume button if there's a saved state
    resumeBtn.style.display = 'block';
    statusDiv.className = 'status idle';
    statusDiv.textContent = 'Previous download can be resumed';
  }
});
