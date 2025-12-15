// Background script for managing downloads with rate limiting

let downloadQueue = [];
let isDownloading = false;
let shouldStop = false;
let downloadCount = 0;
let lastDownloadTime = 0;
let cooldownUntil = 0;
let totalFiles = 0;
let savedState = null; // For resume functionality
let activeDownloadId = null; // Track current download
let lastCooldownMilestone = 0; // Track last milestone where cooldown was applied (100, 200, etc.)
let settings = {
  cooldownMs: 2000, // Default 2 seconds between downloads
  cooldownAfter100: 120000 // 2 minutes = 120000ms
};

// Load settings from storage
browser.storage.local.get(['cooldownMs', 'cooldownAfter100']).then((result) => {
  if (result.cooldownMs !== undefined) {
    settings.cooldownMs = result.cooldownMs;
  }
  if (result.cooldownAfter100 !== undefined) {
    settings.cooldownAfter100 = result.cooldownAfter100;
  }
});

// Check for saved download state on startup (for resume)
browser.storage.local.get(['downloadState']).then((result) => {
  if (result.downloadState && result.downloadState.queue && result.downloadState.queue.length > 0) {
    savedState = result.downloadState;
    console.log('Found saved download state - ready to resume');
  }
}).catch(() => {});

// Listen for settings updates
browser.storage.onChanged.addListener((changes) => {
  if (changes.cooldownMs) {
    settings.cooldownMs = changes.cooldownMs.newValue;
  }
  if (changes.cooldownAfter100) {
    settings.cooldownAfter100 = changes.cooldownAfter100.newValue;
  }
});

// Validate URL to prevent malicious downloads
function isValidMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const urlObj = new URL(url);
    // Only allow https URLs
    if (urlObj.protocol !== 'https:') return false;
    
    // Only allow specific CDN domains for security
    const allowedDomains = [
      'scontent', 'fbcdn', 'instagram', 'cdn', 
      'threads.net', 'threads.com'
    ];
    
    const hostname = urlObj.hostname.toLowerCase();
    const isAllowed = allowedDomains.some(domain => hostname.includes(domain));
    
    if (!isAllowed) return false;
    
    // Check for valid media file extensions
    const hasValidExtension = url.match(/\.(jpg|jpeg|png|webp|gif|mp4|webm|mov)$/i);
    const hasMediaPath = url.includes('/image/') || url.includes('/video/') || url.includes('/media/');
    
    return hasValidExtension || hasMediaPath;
  } catch (e) {
    return false;
  }
}

// Sanitize filename to prevent path traversal
function sanitizeFilename(name) {
  // Remove path traversal attempts and dangerous characters
  return name
    .replace(/[\/\\\?\*\|<>:"]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/^\.+/, '')
    .substring(0, 100); // Limit length
}

// Check for existing downloaded files
async function checkExistingFiles(username, totalFiles) {
  const existingFiles = new Set();
  
  try {
    // Get default download directory
    const downloads = await browser.downloads.search({
      query: [username],
      orderBy: ['-startTime']
    });
    
    // Pattern: username_XXX_of_YYY.ext
    const pattern = new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_(\\d+)_of_${totalFiles}\\.`);
    
    downloads.forEach(download => {
      if (download.filename) {
        const match = download.filename.match(pattern);
        if (match && download.state === 'complete') {
          const fileIndex = parseInt(match[1], 10);
          if (fileIndex > 0 && fileIndex <= totalFiles) {
            existingFiles.add(fileIndex);
          }
        }
      }
    });
    
    console.log(`Found ${existingFiles.size} existing files for ${username}`);
  } catch (error) {
    console.error('Error checking existing files:', error);
  }
  
  return existingFiles;
}

// Listen for media URLs from content script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadMedia') {
    console.log('Background: Received downloadMedia message with', message.urls ? message.urls.length : 0, 'URLs');

    // Reset state for a fresh run
    downloadQueue = [];
    downloadCount = 0;
    totalFiles = 0;
    cooldownUntil = 0;
    lastCooldownMilestone = 0;

    const mediaUrls = message.urls || [];
    let username = message.username || 'threads-user';

    console.log('Background: Processing URLs for username:', username);

    // Sanitize username to prevent path traversal
    username = sanitizeFilename(username);

    // Validate and filter URLs
    const validUrls = mediaUrls.filter(url => isValidMediaUrl(url));

    console.log(`Background: Filtered to ${validUrls.length} valid URLs (${mediaUrls.length - validUrls.length} invalid)`);

    if (validUrls.length === 0) {
      console.log('Background: No valid URLs, sending error response');
      sendResponse({ success: false, error: 'No valid media URLs found' });
      return true;
    }

    console.log(`Background: Starting download for ${validUrls.length} URLs`);
    
    // Handle async file checking
    (async () => {
      try {
        // Check for existing files and filter out already downloaded ones
        const sanitizedUsername = sanitizeFilename(username);
        const existingFiles = await checkExistingFiles(sanitizedUsername, validUrls.length);
        
        // Add to download queue, skipping already downloaded files
        totalFiles = validUrls.length;
        let skippedCount = 0;
        validUrls.forEach((url, index) => {
          const fileIndex = index + 1;
          // Check if file already exists
          if (!existingFiles.has(fileIndex)) {
            downloadQueue.push({
              url: url,
              username: username,
              index: fileIndex,
              total: validUrls.length
            });
          } else {
            skippedCount++;
            downloadCount++; // Count skipped files as "downloaded"
          }
        });
        
        if (skippedCount > 0) {
          console.log(`Skipped ${skippedCount} already downloaded files, starting from file ${downloadQueue.length > 0 ? downloadQueue[0].index : 'none'}`);
        }
        
        // Save state for resume functionality
        savedState = {
          queue: downloadQueue.map(item => ({ url: item.url, username: item.username, index: item.index, total: item.total })),
          totalFiles: totalFiles,
          downloadCount: downloadCount,
          username: username
        };
        browser.storage.local.set({ downloadState: savedState }).catch(() => {});
        
        // Reset stop flag and cooldown milestone when starting new download
        shouldStop = false;
        lastCooldownMilestone = Math.floor(downloadCount / 100) * 100; // Set to current milestone

        console.log('Background: About to start processDownloadQueue, isDownloading:', isDownloading);

        // Start processing if not already downloading
        if (!isDownloading) {
          console.log('Background: Calling processDownloadQueue');
          processDownloadQueue();
        } else {
          console.log('Background: Already downloading, not starting new queue');
        }

        console.log('Background: Sending success response with queued:', downloadQueue.length);
        sendResponse({ success: true, queued: downloadQueue.length, skipped: skippedCount });
      } catch (error) {
        console.error('Error checking existing files:', error);
        // Fallback: add all files to queue if check fails
        totalFiles = validUrls.length;
        validUrls.forEach((url, index) => {
          downloadQueue.push({
            url: url,
            username: username,
            index: index + 1,
            total: validUrls.length
          });
        });
        sendResponse({ success: true, queued: downloadQueue.length, skipped: 0 });
      }
    })();
    
    return true; // Keep channel open for async response
  } else if (message.action === 'clearQueue') {
    downloadQueue = [];
    shouldStop = true;
    isDownloading = false;
    downloadCount = 0;
    totalFiles = 0;
    lastCooldownMilestone = 0;
    savedState = null;
    browser.storage.local.remove(['downloadState']).catch(() => {});
    sendResponse({ success: true });
  } else if (message.action === 'stopDownload') {
    shouldStop = true;
    // Keep queue for resume, but stop processing
    sendResponse({ success: true });
  } else if (message.action === 'resumeDownload') {
    // Load saved state and resume
    browser.storage.local.get(['downloadState']).then((result) => {
      if (result.downloadState) {
        savedState = result.downloadState;
        downloadQueue = savedState.queue.map(item => ({
          url: item.url,
          username: item.username,
          index: item.index,
          total: item.total
        }));
        totalFiles = savedState.totalFiles;
        downloadCount = savedState.downloadCount || 0;
        lastCooldownMilestone = Math.floor(downloadCount / 100) * 100; // Restore milestone
        shouldStop = false;
        if (!isDownloading) {
          processDownloadQueue();
        }
        sendResponse({ success: true, resumed: true });
      } else {
        sendResponse({ success: false, error: 'No saved state found' });
      }
    }).catch(() => {
      sendResponse({ success: false, error: 'Failed to load saved state' });
    });
    return true; // Keep channel open for async
  } else if (message.action === 'downloadMediaFromList') {
    console.log('Background: Received downloadMediaFromList message with', message.urls ? message.urls.length : 0, 'URLs');

    // Reset state for a fresh run
    downloadQueue = [];
    downloadCount = 0;
    totalFiles = 0;
    cooldownUntil = 0;
    lastCooldownMilestone = 0;

    const mediaUrls = message.urls || [];
    let username = message.username || 'threads-user';

    console.log('Background: Processing URLs for username:', username);

    // Sanitize username to prevent path traversal
    username = sanitizeFilename(username);

    // Validate and filter URLs
    const validUrls = mediaUrls.filter(url => isValidMediaUrl(url));

    console.log(`Background: Filtered to ${validUrls.length} valid URLs (${mediaUrls.length - validUrls.length} invalid)`);

    if (validUrls.length === 0) {
      console.log('Background: No valid URLs, sending error response');
      sendResponse({ success: false, error: 'No valid media URLs found' });
      return true;
    }

    console.log(`Background: Starting download for ${validUrls.length} URLs`);

    // Add to download queue
    totalFiles = validUrls.length;
    validUrls.forEach((url, index) => {
      downloadQueue.push({
        url: url,
        username: username,
        index: index + 1,
        total: validUrls.length
      });
    });

    // Save state for resume functionality
    savedState = {
      queue: downloadQueue.map(item => ({ url: item.url, username: item.username, index: item.index, total: item.total })),
      totalFiles: totalFiles,
      downloadCount: downloadCount,
      username: username
    };
    browser.storage.local.set({ downloadState: savedState }).catch(() => {});

    // Reset stop flag and cooldown milestone when starting new download
    shouldStop = false;
    lastCooldownMilestone = 0;

    console.log('Background: About to start processDownloadQueue, isDownloading:', isDownloading);

    // Start processing if not already downloading
    if (!isDownloading) {
      console.log('Background: Calling processDownloadQueue');
      processDownloadQueue();
    } else {
      console.log('Background: Already downloading, not starting new queue');
    }

    console.log('Background: Sending success response with queued:', downloadQueue.length);
    sendResponse({ success: true, queued: downloadQueue.length });
    return true;
  } else if (message.action === 'getStatus') {
    // Check if there's a saved state for resume
    browser.storage.local.get(['downloadState']).then((result) => {
      const hasSavedState = result.downloadState && result.downloadState.queue && result.downloadState.queue.length > 0;
      sendResponse({
        isDownloading: isDownloading,
        queueLength: downloadQueue.length,
        downloadCount: downloadCount,
        totalFiles: totalFiles,
        cooldownUntil: cooldownUntil,
        hasSavedState: hasSavedState
      });
    }).catch(() => {
      sendResponse({
        isDownloading: isDownloading,
        queueLength: downloadQueue.length,
        downloadCount: downloadCount,
        totalFiles: totalFiles,
        cooldownUntil: cooldownUntil,
        hasSavedState: false
      });
    });
    return true; // Keep channel open for async
  }
  
  return true; // Keep message channel open for async response
});

async function processDownloadQueue() {
  console.log('Background: processDownloadQueue called, queue length:', downloadQueue.length, 'isDownloading:', isDownloading);

  // Check if we should stop
  if (shouldStop) {
    console.log('Background: Stopping download as requested');
    isDownloading = false;
    // Don't clear state when stopped - allow resume
    // Keep downloadCount, totalFiles, and lastCooldownMilestone for resume
    browser.runtime.sendMessage({ action: 'downloadStopped' }).catch(() => {});
    return;
  }
  
  if (downloadQueue.length === 0) {
    isDownloading = false;
    downloadCount = 0;
    totalFiles = 0;
    lastCooldownMilestone = 0;
    savedState = null; // Clear saved state when complete
    browser.storage.local.remove(['downloadState']).catch(() => {});
    browser.runtime.sendMessage({ action: 'downloadComplete' }).catch(() => {});
    return;
  }
  
  isDownloading = true;
  
  const now = Date.now();
  
  // Check if we need cooldown after 100 downloads (only if queue is not empty and we haven't already applied cooldown for this milestone)
  const currentMilestone = Math.floor(downloadCount / 100) * 100;
  if (downloadCount > 0 && downloadCount % 100 === 0 && downloadQueue.length > 0 && currentMilestone > lastCooldownMilestone) {
    console.log(`Reached ${downloadCount} downloads, starting ${settings.cooldownAfter100}ms cooldown`);
    lastCooldownMilestone = currentMilestone;
    cooldownUntil = now + settings.cooldownAfter100;
    browser.runtime.sendMessage({ 
      action: 'cooldownStarted', 
      duration: settings.cooldownAfter100 
    }).catch(() => {});
    setTimeout(() => processDownloadQueue(), settings.cooldownAfter100);
    return;
  }
  
  // Check if we're in cooldown period (only if queue is not empty)
  if (now < cooldownUntil && downloadQueue.length > 0) {
    const waitTime = cooldownUntil - now;
    console.log(`In cooldown, waiting ${waitTime}ms`);
    setTimeout(() => processDownloadQueue(), waitTime);
    return;
  }
  
  const item = downloadQueue.shift();
  
  try {
    // Wait for cooldown period before downloading
    const timeSinceLastDownload = now - lastDownloadTime;
    if (timeSinceLastDownload < settings.cooldownMs) {
      await new Promise(resolve => setTimeout(resolve, settings.cooldownMs - timeSinceLastDownload));
    }
    
    // Determine file extension from URL
    const urlObj = new URL(item.url);
    let extension = 'jpg';
    const pathname = urlObj.pathname.toLowerCase();
    
    if (pathname.includes('.mp4') || pathname.includes('video')) {
      extension = 'mp4';
    } else if (pathname.includes('.webp')) {
      extension = 'webp';
    } else if (pathname.includes('.png')) {
      extension = 'png';
    } else if (pathname.includes('.gif')) {
      extension = 'gif';
    } else if (pathname.includes('.jpeg')) {
      extension = 'jpeg';
    } else if (pathname.includes('.jpg')) {
      extension = 'jpg';
    }
    
    // Create filename with zero-padded index for proper sorting
    const paddedIndex = String(item.index).padStart(String(item.total).length, '0');
    const sanitizedUsername = sanitizeFilename(item.username);
    const filename = `${sanitizedUsername}_${paddedIndex}_of_${item.total}.${extension}`;
    
    // Validate URL one more time before downloading
    if (!isValidMediaUrl(item.url)) {
      console.error(`Invalid URL skipped: ${item.url}`);
      setTimeout(() => processDownloadQueue(), 0);
      return;
    }
    
    console.log('Background: Attempting to download:', item.url, 'as', filename);

    // Download the file
    // Note: For Instagram/Facebook CDN URLs, the original URL with query parameters is required
    try {
      const downloadId = await browser.downloads.download({
        url: item.url,
        filename: `threads-downloads/${sanitizedUsername}/${filename}`,
        saveAs: false,
        // Firefox will automatically include referrer for same-origin requests
      });
      console.log('Background: Download started with ID:', downloadId);
    } catch (downloadError) {
      console.error(`Background: Download failed for ${item.url}:`, downloadError);
      // Continue with next item instead of stopping
      setTimeout(() => processDownloadQueue(), 0);
      return;
    }
    
    downloadCount++;
    lastDownloadTime = Date.now();
    
    console.log(`Downloaded ${item.index}/${item.total}: ${filename}`);
    
    // Update saved state for resume functionality
    if (downloadQueue.length > 0 || downloadCount < totalFiles) {
      savedState = {
        queue: downloadQueue.map(item => ({ url: item.url, username: item.username, index: item.index, total: item.total })),
        totalFiles: totalFiles,
        downloadCount: downloadCount,
        username: item.username
      };
      browser.storage.local.set({ downloadState: savedState }).catch(() => {});
    }
    
    // Notify popup of progress
    browser.runtime.sendMessage({
      action: 'downloadProgress',
      current: item.index,
      total: item.total,
      remaining: downloadQueue.length,
      downloaded: downloadCount,
      totalFiles: totalFiles
    }).catch(() => {});
    
  } catch (error) {
    console.error(`Error downloading ${item.url}:`, error);
  }
  
  // Process next item
  setTimeout(() => processDownloadQueue(), 0);
}

// Listen for download completion
browser.downloads.onChanged.addListener((downloadDelta) => {
  if (downloadDelta.state && downloadDelta.state.current === 'complete') {
    // Download completed successfully
  } else if (downloadDelta.state && downloadDelta.state.current === 'interrupted') {
    console.error('Download interrupted:', downloadDelta);
  }
});

