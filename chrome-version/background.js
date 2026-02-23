// Background service worker for managing downloads with rate limiting
// Chrome Manifest V3 version

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
let usedDatetimes = new Map(); // Track used datetimes per username for collision handling
let postMetadata = []; // Store metadata for export
let settings = {
  cooldownMs: 2000, // Default 2 seconds between downloads
  cooldownAfter100: 120000 // 2 minutes = 120000ms
};

// Format ISO 8601 datetime to local time format: YYYY-MM-DD_HH-M-S
function formatDatetime(isoString) {
  if (!isoString) return null;
  
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return null;
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  } catch (e) {
    return null;
  }
}

// Convert metadata array to CSV format
function convertToCSV(metadata) {
  const headers = ['username', 'datetime_iso', 'datetime_display', 'post_permalink', 'media_urls', 'post_content', 'like_count', 'reply_count'];
  
  const rows = metadata.map(item => {
    return headers.map(h => {
      let value = item[h];
      // Handle array values (media_urls)
      if (Array.isArray(value)) {
        value = value.join('; ');
      }
      // Handle null/undefined
      if (value === null || value === undefined) {
        return '';
      }
      // Convert to string
      value = String(value);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
        value = '"' + value.replace(/"/g, '""') + '"';
      }
      return value;
    }).join(',');
  });
  
  return [headers.join(','), ...rows].join('\n');
}

// Load settings from storage on startup
chrome.storage.local.get(['cooldownMs', 'cooldownAfter100'], (result) => {
  if (result.cooldownMs !== undefined) {
    settings.cooldownMs = result.cooldownMs;
  }
  if (result.cooldownAfter100 !== undefined) {
    settings.cooldownAfter100 = result.cooldownAfter100;
  }
});

// Check for saved download state on startup (for resume)
chrome.storage.local.get(['downloadState'], (result) => {
  if (result.downloadState && result.downloadState.queue && result.downloadState.queue.length > 0) {
    savedState = result.downloadState;
    console.log('Found saved download state - ready to resume');
  }
});

// Listen for settings updates
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.cooldownMs) {
      settings.cooldownMs = changes.cooldownMs.newValue;
    }
    if (changes.cooldownAfter100) {
      settings.cooldownAfter100 = changes.cooldownAfter100.newValue;
    }
  }
});

// Validate URL to prevent malicious downloads
function isValidMediaUrl(url) {
  if (!url || typeof url !== 'string') {
    console.log('Background: Invalid URL type:', typeof url);
    return false;
  }
  
  try {
    const urlObj = new URL(url);
    // Only allow https URLs
    if (urlObj.protocol !== 'https:') {
      console.log('Background: Non-HTTPS URL rejected:', url);
      return false;
    }
    
    // Only allow specific CDN domains for security
    const allowedDomains = [
      'scontent', 'fbcdn', 'instagram', 'cdn',
      'threads.net', 'threads.com'
    ];
    
    const hostname = urlObj.hostname.toLowerCase();
    const isAllowed = allowedDomains.some(domain => hostname.includes(domain));
    
    if (!isAllowed) {
      console.log('Background: Domain not allowed:', hostname);
      return false;
    }
    
    // Check for valid media file extensions OR query parameters (Instagram CDN uses query params)
    const pathname = urlObj.pathname.toLowerCase();
    const hasValidExtension = pathname.match(/\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|avi)$/i);
    const hasMediaPath = pathname.includes('/image/') || pathname.includes('/video/') || pathname.includes('/media/');
    const hasQueryParams = urlObj.search.length > 0; // Instagram CDN URLs have query params
    
    const isValid = hasValidExtension || hasMediaPath || (isAllowed && hasQueryParams);
    
    if (!isValid) {
      console.log('Background: URL validation failed - no valid extension, media path, or query params:', url);
    }
    
    return isValid;
  } catch (e) {
    console.log('Background: URL parsing error:', e, url);
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
    const downloads = await chrome.downloads.search({
      query: username,
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

// Check for existing downloads in the user's folder (for resume functionality)
async function checkExistingDownloads(username) {
  try {
    // Search for downloads with the username in the path
    const downloads = await chrome.downloads.search({
      query: `threads-downloads/${username}`,
      exists: true
    });
    
    // Filter to only include files in the correct folder
    const filtered = downloads.filter(download => {
      if (!download.filename) return false;
      // Check if the file is in threads-downloads/{username}/ folder
      const pathPattern = new RegExp(`threads-downloads[/\\\\]${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[/\\\\]`);
      return pathPattern.test(download.filename);
    });
    
    console.log(`Found ${filtered.length} existing downloads for ${username}`);
    return filtered;
  } catch (error) {
    console.error('Error checking existing downloads:', error);
    return [];
  }
}

// Parse datetime from filename
// New format: username_YYYY-MM-DD_HH-M-S.ext or username_YYYY-MM-DD_HH-M-S_1.ext
// Legacy format: username_XXX_of_YYY.ext - no datetime, return null
function parseDatetimeFromFilename(filename) {
  if (!filename) return null;
  
  // Extract just the filename from the path
  const basename = filename.split(/[/\\]/).pop();
  
  // New format: username_YYYY-MM-DD_HH-M-S.ext or username_YYYY-MM-DD_HH-M-S_1.ext
  const newFormatMatch = basename.match(/_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})/);
  if (newFormatMatch) {
    // Parse: YYYY-MM-DD_HH-M-S
    const datetimeStr = newFormatMatch[1];
    const [datePart, timePart] = datetimeStr.split('_');
    const [year, month, day] = datePart.split('-');
    const [hours, minutes, seconds] = timePart.split('-');
    
    // Create date object (month is 0-indexed)
    const date = new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hours, 10),
      parseInt(minutes, 10),
      parseInt(seconds, 10)
    );
    
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Legacy format: username_XXX_of_YYY.ext - no datetime
  return null;
}

// Find latest datetime from existing files
function findLatestDatetime(files) {
  let latest = null;
  
  for (const file of files) {
    const dt = parseDatetimeFromFilename(file.filename);
    if (dt && (!latest || dt > latest)) {
      latest = dt;
    }
  }
  
  return latest;
}

// Filter media items newer than a datetime
function filterNewerMedia(mediaItems, cutoffDatetime) {
  if (!cutoffDatetime) return mediaItems;
  
  return mediaItems.filter(item => {
    if (!item.datetime) return true; // Include if no datetime (might be newer)
    const itemDate = new Date(item.datetime);
    return itemDate > cutoffDatetime;
  });
}

// Listen for media URLs from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadMedia') {
    console.log('Background: Received downloadMedia message with', message.mediaItems ? message.mediaItems.length : 0, 'media items');

    // Reset state for a fresh run
    downloadQueue = [];
    downloadCount = 0;
    totalFiles = 0;
    cooldownUntil = 0;
    lastCooldownMilestone = 0;
    usedDatetimes = new Map(); // Reset datetime collision tracking
    postMetadata = []; // Reset metadata

    // Support both new mediaItems format and legacy urls format
    const mediaItems = message.mediaItems || (message.urls ? message.urls.map(url => ({ url, type: 'image', datetime: null })) : []);
    let username = message.username || 'threads-user';

    console.log('Background: Processing media items for username:', username);

    // Sanitize username to prevent path traversal
    username = sanitizeFilename(username);

    // Validate and filter media items
    const validItems = mediaItems.filter(item => isValidMediaUrl(item.url));

    console.log(`Background: Filtered to ${validItems.length} valid items (${mediaItems.length - validItems.length} invalid)`);

    if (validItems.length === 0) {
      console.log('Background: No valid items, sending error response');
      sendResponse({ success: false, error: 'No valid media URLs found' });
      return true;
    }

    console.log(`Background: Starting download for ${validItems.length} items`);
    
    // Store metadata if provided
    if (message.metadata && Array.isArray(message.metadata)) {
      postMetadata = message.metadata;
      console.log(`Background: Stored metadata for ${postMetadata.length} posts`);
    }
    
    // Add to download queue
    totalFiles = validItems.length;
    validItems.forEach((item, index) => {
      downloadQueue.push({
        url: item.url,
        username: username,
        index: index + 1,
        total: validItems.length,
        type: item.type || 'image',
        datetime: item.datetime || null
      });
    });

    // Save state for resume functionality
    savedState = {
      queue: downloadQueue.map(item => ({ url: item.url, username: item.username, index: item.index, total: item.total, type: item.type, datetime: item.datetime })),
      totalFiles: totalFiles,
      downloadCount: downloadCount,
      username: username,
      metadata: postMetadata
    };
    chrome.storage.local.set({ downloadState: savedState });
    
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
    sendResponse({ success: true, queued: downloadQueue.length, skipped: 0 });
    
    return true; // Keep channel open for async response
  } else if (message.action === 'getMetadata') {
    // Return stored metadata
    sendResponse({ success: true, metadata: postMetadata });
    return true;
  } else if (message.action === 'exportMetadata') {
    // Export metadata in specified format
    const format = message.format || 'json';
    const username = message.username || 'threads-user';
    
    if (postMetadata.length === 0) {
      sendResponse({ success: false, error: 'No metadata available to export' });
      return true;
    }
    
    let content, mimeType, extension;
    if (format === 'csv') {
      content = convertToCSV(postMetadata);
      mimeType = 'text/csv';
      extension = 'csv';
    } else {
      content = JSON.stringify(postMetadata, null, 2);
      mimeType = 'application/json';
      extension = 'json';
    }
    
    // Create download
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    chrome.downloads.download({
      url: url,
      filename: `threads-downloads/${username}_metadata.${extension}`,
      saveAs: false
    }).then(() => {
      URL.revokeObjectURL(url);
      sendResponse({ success: true });
    }).catch((error) => {
      URL.revokeObjectURL(url);
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Keep channel open for async response
  } else if (message.action === 'clearQueue') {
    downloadQueue = [];
    shouldStop = true;
    isDownloading = false;
    downloadCount = 0;
    totalFiles = 0;
    lastCooldownMilestone = 0;
    usedDatetimes = new Map(); // Reset datetime collision tracking
    postMetadata = []; // Reset metadata
    savedState = null;
    chrome.storage.local.remove(['downloadState']);
    sendResponse({ success: true });
  } else if (message.action === 'stopDownload') {
    shouldStop = true;
    // Keep queue for resume, but stop processing
    sendResponse({ success: true });
  } else if (message.action === 'resumeDownload') {
    // Load saved state and resume
    chrome.storage.local.get(['downloadState'], (result) => {
      if (result.downloadState) {
        savedState = result.downloadState;
        downloadQueue = savedState.queue.map(item => ({
          url: item.url,
          username: item.username,
          index: item.index,
          total: item.total,
          type: item.type || 'image',
          datetime: item.datetime || null
        }));
        totalFiles = savedState.totalFiles;
        downloadCount = savedState.downloadCount || 0;
        lastCooldownMilestone = Math.floor(downloadCount / 100) * 100; // Restore milestone
        usedDatetimes = new Map(); // Reset datetime collision tracking for resume
        postMetadata = savedState.metadata || []; // Restore metadata
        shouldStop = false;
        if (!isDownloading) {
          processDownloadQueue();
        }
        sendResponse({ success: true, resumed: true });
      } else {
        sendResponse({ success: false, error: 'No saved state found' });
      }
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
    usedDatetimes = new Map(); // Reset datetime collision tracking
    postMetadata = []; // Reset metadata (no metadata when loading from file)

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
        total: validUrls.length,
        type: 'image',
        datetime: null
      });
    });

    // Save state for resume functionality
    savedState = {
      queue: downloadQueue.map(item => ({ url: item.url, username: item.username, index: item.index, total: item.total, type: item.type, datetime: item.datetime })),
      totalFiles: totalFiles,
      downloadCount: downloadCount,
      username: username
    };
    chrome.storage.local.set({ downloadState: savedState });

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
    chrome.storage.local.get(['downloadState'], (result) => {
      const hasSavedState = result.downloadState && result.downloadState.queue && result.downloadState.queue.length > 0;
      sendResponse({
        isDownloading: isDownloading,
        queueLength: downloadQueue.length,
        downloadCount: downloadCount,
        totalFiles: totalFiles,
        cooldownUntil: cooldownUntil,
        hasSavedState: hasSavedState
      });
    });
    return true; // Keep channel open for async
  } else if (message.action === 'checkProfilePage') {
    // Query the active tab to check if it's a profile page
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
          const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'checkProfilePage' });
          sendResponse(response);
        } else {
          sendResponse({ isProfilePage: false });
        }
      } catch (error) {
        console.error('Error checking profile page:', error);
        sendResponse({ isProfilePage: false });
      }
    })();
    return true; // Keep channel open for async
  } else if (message.action === 'redirectToMedia') {
    // Redirect the active tab to media page
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
          await chrome.tabs.sendMessage(tabs[0].id, { action: 'redirectToMedia' });
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'No active tab' });
        }
      } catch (error) {
        console.error('Error redirecting to media:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep channel open for async
  } else if (message.action === 'checkExistingDownloads') {
    // Check for existing downloads for a username
    const username = message.username || 'threads-user';
    
    (async () => {
      try {
        const existingFiles = await checkExistingDownloads(username);
        const latestDatetime = findLatestDatetime(existingFiles);
        sendResponse({
          exists: existingFiles.length > 0,
          count: existingFiles.length,
          latestDatetime: latestDatetime ? latestDatetime.toISOString() : null
        });
      } catch (error) {
        console.error('Error checking existing downloads:', error);
        sendResponse({
          exists: false,
          count: 0,
          latestDatetime: null
        });
      }
    })();
    
    return true; // Keep channel open for async
  } else if (message.action === 'downloadMediaWithResume') {
    console.log('Background: Received downloadMediaWithResume message with', message.mediaItems ? message.mediaItems.length : 0, 'media items');

    // Reset state for a fresh run
    downloadQueue = [];
    downloadCount = 0;
    totalFiles = 0;
    cooldownUntil = 0;
    lastCooldownMilestone = 0;
    usedDatetimes = new Map(); // Reset datetime collision tracking
    postMetadata = []; // Reset metadata

    // Support both new mediaItems format and legacy urls format
    let mediaItems = message.mediaItems || (message.urls ? message.urls.map(url => ({ url, type: 'image', datetime: null })) : []);
    let username = message.username || 'threads-user';

    console.log('Background: Processing media items for username:', username);

    // Sanitize username to prevent path traversal
    username = sanitizeFilename(username);

    // If resumeFromDatetime is provided, filter media items
    if (message.resumeFromDatetime) {
      const cutoff = new Date(message.resumeFromDatetime);
      const originalCount = mediaItems.length;
      mediaItems = filterNewerMedia(mediaItems, cutoff);
      console.log(`Background: Filtered to ${mediaItems.length} items newer than ${cutoff.toISOString()} (${originalCount - mediaItems.length} older items skipped)`);
      
      if (mediaItems.length === 0) {
        console.log('Background: No items newer than cutoff, nothing to download');
        sendResponse({ success: true, queued: 0, skipped: originalCount, message: 'No new media to download' });
        return true;
      }
    }

    // Validate and filter media items
    const validItems = mediaItems.filter(item => isValidMediaUrl(item.url));

    console.log(`Background: Filtered to ${validItems.length} valid items (${mediaItems.length - validItems.length} invalid)`);

    if (validItems.length === 0) {
      console.log('Background: No valid items, sending error response');
      sendResponse({ success: false, error: 'No valid media URLs found' });
      return true;
    }

    console.log(`Background: Starting download for ${validItems.length} items`);
    
    // Store metadata if provided
    if (message.metadata && Array.isArray(message.metadata)) {
      postMetadata = message.metadata;
      console.log(`Background: Stored metadata for ${postMetadata.length} posts`);
    }
    
    // Add to download queue
    totalFiles = validItems.length;
    validItems.forEach((item, index) => {
      downloadQueue.push({
        url: item.url,
        username: username,
        index: index + 1,
        total: validItems.length,
        type: item.type || 'image',
        datetime: item.datetime || null
      });
    });

    // Save state for resume functionality
    savedState = {
      queue: downloadQueue.map(item => ({ url: item.url, username: item.username, index: item.index, total: item.total, type: item.type, datetime: item.datetime })),
      totalFiles: totalFiles,
      downloadCount: downloadCount,
      username: username,
      metadata: postMetadata
    };
    chrome.storage.local.set({ downloadState: savedState });
    
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
    sendResponse({ success: true, queued: downloadQueue.length, skipped: 0 });
    
    return true; // Keep channel open for async response
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
    chrome.runtime.sendMessage({ action: 'downloadStopped' }).catch(() => {});
    return;
  }
  
  if (downloadQueue.length === 0) {
    isDownloading = false;
    downloadCount = 0;
    totalFiles = 0;
    lastCooldownMilestone = 0;
    usedDatetimes = new Map(); // Reset datetime collision tracking
    // Note: Keep postMetadata for export after download completes
    savedState = null; // Clear saved state when complete
    chrome.storage.local.remove(['downloadState']);
    chrome.runtime.sendMessage({ action: 'downloadComplete' }).catch(() => {});
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
    chrome.runtime.sendMessage({ 
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
    
    const sanitizedUsername = sanitizeFilename(item.username);
    let filename;
    
    // Try to use datetime-based filename
    const formattedDatetime = formatDatetime(item.datetime);
    if (formattedDatetime) {
      // Check for datetime collision
      if (!usedDatetimes.has(sanitizedUsername)) {
        usedDatetimes.set(sanitizedUsername, new Set());
      }
      const userDatetimes = usedDatetimes.get(sanitizedUsername);
      
      if (userDatetimes.has(formattedDatetime)) {
        // Collision detected - find next available suffix
        let suffix = 1;
        while (userDatetimes.has(`${formattedDatetime}_${suffix}`)) {
          suffix++;
        }
        filename = `${sanitizedUsername}_${formattedDatetime}_${suffix}.${extension}`;
        userDatetimes.add(`${formattedDatetime}_${suffix}`);
        console.log(`Background: Datetime collision resolved with suffix _${suffix}`);
      } else {
        filename = `${sanitizedUsername}_${formattedDatetime}.${extension}`;
        userDatetimes.add(formattedDatetime);
      }
    } else {
      // Fallback to index-based naming when no datetime available
      const paddedIndex = String(item.index).padStart(String(item.total).length, '0');
      filename = `${sanitizedUsername}_${paddedIndex}_of_${item.total}.${extension}`;
      console.log('Background: No datetime available, using index-based filename');
    }
    
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
      const downloadId = await chrome.downloads.download({
        url: item.url,
        filename: `threads-downloads/${sanitizedUsername}/${filename}`,
        saveAs: false
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
        queue: downloadQueue.map(item => ({ url: item.url, username: item.username, index: item.index, total: item.total, type: item.type, datetime: item.datetime })),
        totalFiles: totalFiles,
        downloadCount: downloadCount,
        username: item.username,
        metadata: postMetadata
      };
      chrome.storage.local.set({ downloadState: savedState });
    }
    
    // Notify popup of progress
    chrome.runtime.sendMessage({
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
chrome.downloads.onChanged.addListener((downloadDelta) => {
  if (downloadDelta.state && downloadDelta.state.current === 'complete') {
    // Download completed successfully
  } else if (downloadDelta.state && downloadDelta.state.current === 'interrupted') {
    console.error('Download interrupted:', downloadDelta);
  }
});
