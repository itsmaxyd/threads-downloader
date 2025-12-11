// Background script for managing downloads with rate limiting

let downloadQueue = [];
let isDownloading = false;
let shouldStop = false;
let downloadCount = 0;
let lastDownloadTime = 0;
let cooldownUntil = 0;
let totalFiles = 0;
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

// Listen for media URLs from content script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadMedia') {
    const mediaUrls = message.urls || [];
    let username = message.username || 'threads-user';
    
    // Sanitize username to prevent path traversal
    username = sanitizeFilename(username);
    
    // Validate and filter URLs
    const validUrls = mediaUrls.filter(url => isValidMediaUrl(url));
    
    if (validUrls.length === 0) {
      sendResponse({ success: false, error: 'No valid media URLs found' });
      return true;
    }
    
    console.log(`Received ${validUrls.length} valid media URLs (${mediaUrls.length - validUrls.length} filtered) for ${username}`);
    
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
    
    // Reset stop flag when starting new download
    shouldStop = false;
    
    // Start processing if not already downloading
    if (!isDownloading) {
      processDownloadQueue();
    }
    
    sendResponse({ success: true, queued: mediaUrls.length });
  } else if (message.action === 'clearQueue') {
    downloadQueue = [];
    shouldStop = true;
    isDownloading = false;
    downloadCount = 0;
    totalFiles = 0;
    sendResponse({ success: true });
  } else if (message.action === 'stopDownload') {
    shouldStop = true;
    downloadQueue = [];
    sendResponse({ success: true });
  } else if (message.action === 'getStatus') {
    sendResponse({
      isDownloading: isDownloading,
      queueLength: downloadQueue.length,
      downloadCount: downloadCount,
      totalFiles: totalFiles,
      cooldownUntil: cooldownUntil
    });
  }
  
  return true; // Keep message channel open for async response
});

async function processDownloadQueue() {
  // Check if we should stop
  if (shouldStop) {
    isDownloading = false;
    shouldStop = false;
    downloadCount = 0;
    totalFiles = 0;
    browser.runtime.sendMessage({ action: 'downloadStopped' }).catch(() => {});
    return;
  }
  
  if (downloadQueue.length === 0) {
    isDownloading = false;
    downloadCount = 0;
    totalFiles = 0;
    browser.runtime.sendMessage({ action: 'downloadComplete' }).catch(() => {});
    return;
  }
  
  isDownloading = true;
  
  // Check if we're in cooldown period
  const now = Date.now();
  if (now < cooldownUntil) {
    const waitTime = cooldownUntil - now;
    console.log(`In cooldown, waiting ${waitTime}ms`);
    setTimeout(() => processDownloadQueue(), waitTime);
    return;
  }
  
  // Check if we need cooldown after 100 downloads
  if (downloadCount > 0 && downloadCount % 100 === 0) {
    console.log(`Reached 100 downloads, starting ${settings.cooldownAfter100}ms cooldown`);
    cooldownUntil = now + settings.cooldownAfter100;
    browser.runtime.sendMessage({ 
      action: 'cooldownStarted', 
      duration: settings.cooldownAfter100 
    }).catch(() => {});
    setTimeout(() => processDownloadQueue(), settings.cooldownAfter100);
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
    
    // Download the file
    // Note: For Instagram/Facebook CDN URLs, the original URL with query parameters is required
    try {
      await browser.downloads.download({
        url: item.url,
        filename: `threads-downloads/${sanitizedUsername}/${filename}`,
        saveAs: false,
        // Firefox will automatically include referrer for same-origin requests
      });
    } catch (downloadError) {
      console.error(`Download failed for ${item.url}:`, downloadError);
      // Continue with next item instead of stopping
      setTimeout(() => processDownloadQueue(), 0);
      return;
    }
    
    downloadCount++;
    lastDownloadTime = Date.now();
    
    console.log(`Downloaded ${item.index}/${item.total}: ${filename}`);
    
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

