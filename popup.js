// Popup script for UI interactions

let statusInterval = null;

// DOM elements
const statusDiv = document.getElementById('status');
const downloadBtn = document.getElementById('downloadBtn');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const progressDiv = document.getElementById('progress');
const progressText = document.getElementById('progressText');
const progressBar = document.getElementById('progressBar');
const downloadLimitSelect = document.getElementById('downloadLimitSelect');
const cooldownInput = document.getElementById('cooldownInput');
const cooldown100Input = document.getElementById('cooldown100Input');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');

// Load saved settings
browser.storage.local.get(['cooldownMs', 'cooldownAfter100']).then((result) => {
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
  
  browser.storage.local.set({
    cooldownMs: cooldownMs,
    cooldownAfter100: cooldownAfter100
  }).then(() => {
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
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      alert('No active tab found');
      return;
    }
    
    const tab = tabs[0];
    const url = tab.url;
    
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
    const response = await browser.tabs.sendMessage(tab.id, { 
      action: 'extractMedia',
      limit: limit
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

// Stop button
stopBtn.addEventListener('click', async () => {
  try {
    await browser.runtime.sendMessage({ action: 'stopDownload' });
    statusDiv.className = 'status idle';
    statusDiv.textContent = 'Download stopped';
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
    console.error('Error stopping download:', error);
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
      } else {
        if (response.queueLength === 0 && !response.isDownloading) {
          statusDiv.className = 'status idle';
          statusDiv.textContent = 'All downloads complete!';
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
    statusDiv.textContent = 'Download stopped';
    progressDiv.style.display = 'none';
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download Media';
    downloadBtn.style.display = 'block';
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
browser.runtime.sendMessage({ action: 'getStatus' }).then((response) => {
  if (response.isDownloading) {
    downloadBtn.disabled = true;
    downloadBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    progressDiv.style.display = 'block';
    if (response.totalFiles > 0) {
      const progress = ((response.totalFiles - response.queueLength) / response.totalFiles) * 100;
      progressBar.style.width = `${Math.min(progress, 100)}%`;
      progressText.textContent = `Downloaded: ${response.totalFiles - response.queueLength}/${response.totalFiles} (${response.queueLength} remaining)`;
    }
    startStatusPolling();
  }
}).catch(() => {});

