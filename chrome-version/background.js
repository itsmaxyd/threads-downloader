// Cross-browser background shim: chrome/ API on Chromium, browser/ on Firefox.
const extBg = (typeof browser !== 'undefined' && browser && browser.runtime) ? browser.runtime : chrome.runtime;
const extBgStorage = (typeof browser !== 'undefined' && browser && browser.storage) ? browser.storage : chrome.storage;
const extBgDownloads = (typeof browser !== 'undefined' && browser && browser.downloads) ? browser.downloads : chrome.downloads;
const extBgTabs = (typeof browser !== 'undefined' && browser && browser.tabs) ? browser.tabs : chrome.tabs;

let downloadQueue = [];
let isDownloading = false;
let shouldStop = false;
let downloadCount = 0;
let lastDownloadTime = 0;
let cooldownUntil = 0;
let totalFiles = 0;
let savedState = null; // For resume functionality
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
  const headers = ['username', 'author', 'datetime_iso', 'datetime_display', 'post_permalink', 'media_urls', 'post_content', 'like_count', 'reply_count', 'source_tab', 'is_reply'];

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

// Load settings from storage
extBgStorage.local.get(['cooldownMs', 'cooldownAfter100']).then((result) => {
  if (result.cooldownMs !== undefined) {
    settings.cooldownMs = result.cooldownMs;
  }
  if (result.cooldownAfter100 !== undefined) {
    settings.cooldownAfter100 = result.cooldownAfter100;
  }
});

// Check for saved download state on startup (for resume)
extBgStorage.local.get(['downloadState']).then((result) => {
  if (result.downloadState && result.downloadState.queue && result.downloadState.queue.length > 0) {
    savedState = result.downloadState;
  }
}).catch(() => { });

// Listen for settings updates
extBgStorage.onChanged.addListener((changes) => {
  if (changes.cooldownMs) {
    settings.cooldownMs = changes.cooldownMs.newValue;
  }
  if (changes.cooldownAfter100) {
    settings.cooldownAfter100 = changes.cooldownAfter100.newValue;
  }
});

// Validate URL to prevent malicious downloads
function isValidMediaUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const urlObj = new URL(url);
    // Only allow https URLs
    if (urlObj.protocol !== 'https:') {
      return false;
    }

    // Allow specific CDN domains for security.
    // lookaside = threads.com redirector used by newer web delivery;
    // updated 2025-2026 after the threads.net -> threads.com migration.
    const hostname = urlObj.hostname.toLowerCase();

    // Check for known CDN patterns in hostname
    const isCDN = hostname.includes('fbcdn') ||
      hostname.includes('scontent') ||
      hostname.includes('cdninstagram') ||
      hostname.includes('instagram') ||
      hostname.includes('threads') ||
      hostname.includes('lookaside');

    if (!isCDN) {
      return false;
    }

    // For CDN URLs, be very permissive - if it's from a known CDN and has query params, it's likely valid
    const hasQueryParams = urlObj.search.length > 0;
    const pathname = urlObj.pathname.toLowerCase();

    // Check for valid media indicators.
    // Threads stores uploads as HEIC and the CDN converts on delivery
    // (URLs may end in .heic while the bytes are JPEG); AVIF + HLS (m3u8)
    // appear in newer delivery, so accept both here and resolve the real
    // extension at download time where possible.
    const hasValidExtension = pathname.match(/\.(jpg|jpeg|png|webp|gif|heic|heif|avif|mp4|m4v|mov|webm|m3u8)(\?|$)/i);
    const hasMediaPath = pathname.includes('/v/t51.') ||  // Instagram CDN path
      pathname.includes('/image/') ||
      pathname.includes('/video/') ||
      pathname.includes('/media/') ||
      pathname.includes('videoplayback');

    // Accept if: has extension, has media path, or is CDN URL with query params
    return Boolean(hasValidExtension || hasMediaPath || hasQueryParams);
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
    const downloads = await extBgDownloads.search({
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

  } catch (error) {
    // Silently fail
  }

  return existingFiles;
}

// Check for existing downloads in the user's folder (for resume functionality).
// `sourceTab` scopes the check: 'media' matches legacy files (no marker) plus
// explicit media files; 'replies' matches only `_reply` files. Desktop uses
// `threads-downloads/<user>/` paths, Android uses flat `threads-<user>-` names;
// a single downloads.search call covers both (GeckoView supports one query).
async function checkExistingDownloads(username, sourceTab) {
  const tab = normalizeSourceTab(sourceTab, 'media');
  try {
    const downloads = await extBgDownloads.search({
      query: [`threads-${username}`],
      orderBy: ['-startTime'],
      limit: 5000
    });

    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const desktopRe = new RegExp(`threads-downloads[/\\\\]${escaped}[/\\\\]`);
    const androidRe = new RegExp(`threads-${escaped}-`);
    const isReplyFile = (name) => /_reply(?:_|\.)/i.test(name.split(/[/\\]/).pop());

    return downloads.filter(download => {
      if (!download || !download.filename) return false;
      const name = download.filename;
      if (!desktopRe.test(name) && !androidRe.test(name)) return false;
      const reply = isReplyFile(name);
      return tab === 'replies' ? reply : !reply;
    });
  } catch (error) {
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

// Determine a download file extension from a media URL.
// `type` hint (image/video from the content script) disambiguates CDN
// URLs whose path mentions "video" only because they are video posters.
// Unknown type (queue files, single-URL downloads) trusts real extensions.
function detectExtensionFromUrl(url, type) {
  const t = (type === 'video') ? 'video' : ((type === 'image') ? 'image' : 'unknown');
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const has = (ext) => pathname.includes(ext);
    if (t === 'video') {
      if (has('.mp4') || has('.m4v')) return 'mp4';
      if (has('.mov')) return 'mov';
      if (has('.webm')) return 'webm';
      if (has('.m3u8')) return 'mp4';
      if (pathname.includes('video') || pathname.includes('videoplayback')) return 'mp4';
      return 'mp4';
    }
    if (has('.png')) return 'png';
    if (has('.webp')) return 'webp';
    if (has('.gif')) return 'gif';
    if (has('.avif')) return 'avif';
    if (has('.jpeg')) return 'jpeg';
    if (has('.jpg')) return 'jpg';
    // HEIC URLs deliver converted JPEG bytes over the wire.
    if (has('.heic') || has('.heif')) return 'jpg';
    if (t === 'image') return 'jpg';
    // Unknown type: trust real video extensions/paths, else fall back to jpg.
    if (has('.mp4') || has('.m4v')) return 'mp4';
    if (has('.mov')) return 'mov';
    if (has('.webm')) return 'webm';
    if (has('.m3u8')) return 'mp4';
    if (pathname.includes('videoplayback')) return 'mp4';
  } catch (e) {
    // Fall through to default
  }
  // Query-param style CDN delivery (no extension in path): trust the type.
  return t === 'video' ? 'mp4' : 'jpg';
}

// Derive page info from a tab URL alone (fallback when the content script
// can't be reached — Firefox Android drops registrations on process death).
function pageInfoFromUrl(tabUrl) {
  try {
    const u = new URL(tabUrl);
    const hostOk = /threads\.(com|net)$/.test(u.hostname.replace(/^www\./, ''));
    if (!hostOk) return { isProfilePage: false };
    const m = u.pathname.match(/\/@([^/ ?#]+)/);
    const username = m ? decodeURIComponent(m[1]) : null;
    const clean = u.pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    let kind = 'other';
    if (/^\/@[^/]+$/.test(clean)) kind = 'profile';
    else if (/^\/@[^/]+\/media$/.test(clean)) kind = 'media';
    else if (/^\/@[^/]+\/replies$/.test(clean)) kind = 'replies';
    else if (/^\/@[^/]+\/reposts$/.test(clean)) kind = 'reposts';
    else if (clean.includes('/post/')) kind = 'post';
    const base = `https://www.threads.com/${username ? `@${username}/` : ''}`;
    return {
      isProfilePage: kind === 'profile',
      kind,
      username,
      mediaUrl: username ? `${base}media` : null,
      repliesUrl: username ? `${base}replies` : null
    };
  } catch (e) {
    return { isProfilePage: false };
  }
}

// Normalize an item's source tab for filenames/metadata.
function normalizeSourceTab(value, fallback) {
  const v = String(value || fallback || 'media').toLowerCase();
  if (v === 'replies' || v === 'media' || v === 'reposts' || v === 'profile' || v === 'post') return v;
  return String(fallback || 'media').toLowerCase();
}

// Build a unique filename for a queue item, handling datetime collisions.
// Replies-tab items get a `_reply` marker so media + replies for the same
// account never collide and stay distinguishable in one folder.
function buildQueueFilename(item, extension) {
  const sanitizedUsername = sanitizeFilename(item.username);
  const formattedDatetime = formatDatetime(item.datetime);
  const sourceTag = normalizeSourceTab(item.source_tab, null) === 'replies' ? '_reply' : '';

  if (!formattedDatetime) {
    const paddedIndex = String(item.index).padStart(String(item.total).length, '0');
    return `${sanitizedUsername}${sourceTag}_${paddedIndex}_of_${item.total}.${extension}`;
  }

  if (!usedDatetimes.has(sanitizedUsername)) {
    usedDatetimes.set(sanitizedUsername, new Set());
  }
  const userDatetimes = usedDatetimes.get(sanitizedUsername);

  if (!userDatetimes.has(formattedDatetime + sourceTag)) {
    userDatetimes.add(formattedDatetime + sourceTag);
    return `${sanitizedUsername}_${formattedDatetime}${sourceTag}.${extension}`;
  }

  let suffix = 1;
  while (userDatetimes.has(`${formattedDatetime}${sourceTag}_${suffix}`)) {
    suffix++;
  }
  userDatetimes.add(`${formattedDatetime}${sourceTag}_${suffix}`);
  return `${sanitizedUsername}_${formattedDatetime}${sourceTag}_${suffix}.${extension}`;
}

// ---------------------------------------------------------------------------
// Platform-aware download options (desktop + Firefox Android).
// Firefox for Android (GeckoView): no `saveAs` support, no subdirectory
// filenames, no conflictAction/headers in some builds — probe capabilities
// once and fall back so the queue never dies on Android-only errors.
// ---------------------------------------------------------------------------
let platformInfoCache = null;
let downloadsCapsCache = null;

async function getPlatformInfoCached() {
  if (platformInfoCache) return platformInfoCache;
  try {
    platformInfoCache = await extBg.getPlatformInfo();
  } catch (e) {
    platformInfoCache = { os: 'unknown' };
  }
  return platformInfoCache;
}

async function getDownloadsCaps() {
  if (downloadsCapsCache) return downloadsCapsCache;
  const caps = { saveAs: true, subdir: true };
  try {
    if (typeof extBgDownloads.setShelfEnabled === 'function') {
      // Desktop-only API surface exists; Android lacks subdirectory + saveAs.
      const info = await getPlatformInfoCached();
      if (info && info.os === 'android') {
        caps.saveAs = false;
        caps.subdir = false;
      }
    } else {
      const info = await getPlatformInfoCached();
      if (info && info.os === 'android') {
        caps.saveAs = false;
        caps.subdir = false;
      }
    }
  } catch (e) {
    try {
      const info = await getPlatformInfoCached();
      if (info && info.os === 'android') {
        caps.saveAs = false;
        caps.subdir = false;
      }
    } catch (e2) { /* keep desktop defaults */ }
  }
  downloadsCapsCache = caps;
  return caps;
}

function buildFilenameForPlatform({ usernameDir, filename }, caps) {
  if (caps && caps.subdir === false) {
    // Flat namespace on Android: prefix the user dir into the basename.
    const safeDir = String(usernameDir || 'threads-user').replace(/[\\/]+/g, '_');
    return `threads-${safeDir}-${filename}`;
  }
  return `threads-downloads/${usernameDir}/${filename}`;
}

async function buildDownloadOptions({ url, usernameDir, filename }) {
  const caps = await getDownloadsCaps();
  const options = {
    url,
    filename: buildFilenameForPlatform({ usernameDir, filename }, caps)
  };
  if (caps.saveAs) {
    options.saveAs = false;
  }
  return options;
}

// Listen for media URLs from content script
extBg.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadMedia') {

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
    const requestTab = normalizeSourceTab(message.source_tab, 'media');


    // Sanitize username to prevent path traversal
    username = sanitizeFilename(username);

    // Validate and filter media items
    const validItems = [];

    mediaItems.forEach(item => {
      if (isValidMediaUrl(item.url)) {
        validItems.push(item);
      }
    });

    if (validItems.length === 0) {
      sendResponse({ success: false, error: 'No valid media URLs found. Check console for details.' });
      return true;
    }


    // Store metadata if provided
    if (message.metadata && Array.isArray(message.metadata)) {
      postMetadata = message.metadata;
    }

    // Add to download queue (carry source_tab through for filenames/resume)
    totalFiles = validItems.length;
    validItems.forEach((item, index) => {
      downloadQueue.push({
        url: item.url,
        username: username,
        index: index + 1,
        total: validItems.length,
        type: item.type || 'image',
        datetime: item.datetime || null,
        source_tab: normalizeSourceTab(item.source_tab, requestTab)
      });
    });

    // Save state for resume functionality
    savedState = {
      queue: downloadQueue.map(item => ({ url: item.url, username: item.username, index: item.index, total: item.total, type: item.type, datetime: item.datetime, source_tab: item.source_tab })),
      totalFiles: totalFiles,
      downloadCount: downloadCount,
      username: username,
      metadata: postMetadata
    };
    extBgStorage.local.set({ downloadState: savedState }).catch(() => { });

    // Reset stop flag and cooldown milestone when starting new download
    shouldStop = false;
    lastCooldownMilestone = Math.floor(downloadCount / 100) * 100; // Set to current milestone


    // Start processing if not already downloading
    if (!isDownloading) {
      processDownloadQueue();
    }

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

    (async () => {
      // Manual metadata export has no per-user folder: pass the filename
      // through as the basename so Android flattening keeps it intact.
      const filename = `${username}_metadata.${extension}`;
      try {
        const downloadOptions = await buildDownloadOptions({
          url,
          usernameDir: '.',
          filename
        });
        // buildDownloadOptions prefixes threads-downloads/. — strip it back
        // to the bare filename for folder-less manual exports.
        downloadOptions.filename = filename;
        await extBgDownloads.download(downloadOptions);
        URL.revokeObjectURL(url);
        sendResponse({ success: true });
      } catch (error) {
        URL.revokeObjectURL(url);
        sendResponse({ success: false, error: error.message });
      }
    })();
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
    extBgStorage.local.remove(['downloadState']).catch(() => { });
    sendResponse({ success: true });
    return true;
  } else if (message.action === 'stopDownload') {
    shouldStop = true;
    // Keep queue for resume, but stop processing
    sendResponse({ success: true });
    return true;
  } else if (message.action === 'resumeDownload') {
    // Load saved state and resume
    extBgStorage.local.get(['downloadState']).then((result) => {
      if (result.downloadState) {
        savedState = result.downloadState;
        downloadQueue = savedState.queue.map(item => ({
          url: item.url,
          username: item.username,
          index: item.index,
          total: item.total,
          type: item.type || 'image',
          datetime: item.datetime || null,
          source_tab: normalizeSourceTab(item.source_tab, 'media')
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
    }).catch(() => {
      sendResponse({ success: false, error: 'Failed to load saved state' });
    });
    return true; // Keep channel open for async
  } else if (message.action === 'downloadMediaFromList') {

    // Reset state for a fresh run
    downloadQueue = [];
    downloadCount = 0;
    totalFiles = 0;
    cooldownUntil = 0;
    lastCooldownMilestone = 0;
    usedDatetimes = new Map(); // Reset datetime collision tracking
    postMetadata = []; // Reset metadata (no metadata when loading from file)
    const sourceTab = normalizeSourceTab(message.source_tab, 'media'); // forward source for filenames/export

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


    // Add to download queue
    totalFiles = validUrls.length;
    validUrls.forEach((url, index) => {
      downloadQueue.push({
        url: url,
        username: username,
        index: index + 1,
        total: validUrls.length,
        type: 'image',
        datetime: null,
        source_tab: sourceTab
      });
    });

    // Save state for resume functionality
    savedState = {
      queue: downloadQueue.map(item => ({ url: item.url, username: item.username, index: item.index, total: item.total, type: item.type, datetime: item.datetime, source_tab: item.source_tab })),
      totalFiles: totalFiles,
      downloadCount: downloadCount,
      username: username,
      metadata: postMetadata
    };
    extBgStorage.local.set({ downloadState: savedState }).catch(() => { });

    // Reset stop flag and cooldown milestone when starting new download
    shouldStop = false;
    lastCooldownMilestone = 0;

    // Start processing if not already downloading
    if (!isDownloading) {
      processDownloadQueue();
    }

    sendResponse({ success: true, queued: downloadQueue.length });
    return true;
  } else if (message.action === 'getStatus') {
    // Check if there's a saved state for resume
    extBgStorage.local.get(['downloadState']).then((result) => {
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
  } else if (message.action === 'checkProfilePage') {
    // Query the active tab and return full page info (kind/urls/username).
    // Falls back to URL parsing when the content script is unreachable
    // (common on Firefox Android after process restarts).
    (async () => {
      try {
        const tabs = await extBgTabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        if (!tab) {
          sendResponse({ isProfilePage: false });
          return;
        }
        try {
          const response = await extBgTabs.sendMessage(tab.id, { action: 'checkProfilePage' });
          sendResponse(response);
          return;
        } catch (csError) {
          sendResponse(pageInfoFromUrl(tab.url));
        }
      } catch (error) {
        sendResponse({ isProfilePage: false });
      }
    })();
    return true; // Keep channel open for async
  } else if (message.action === 'redirectToTab') {
    // Redirect the active tab to a given profile tab (media/replies)
    const tab = message.tab || 'media';
    (async () => {
      try {
        const tabs = await extBgTabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
          try {
            await extBgTabs.sendMessage(tabs[0].id, { action: 'redirectToTab', tab });
            sendResponse({ success: true });
          } catch (csError) {
            // Content script unreachable: navigate the tab directly.
            const info = pageInfoFromUrl(tabs[0].url);
            if (info.username) {
              await extBgTabs.update(tabs[0].id, {
                url: `https://www.threads.com/@${info.username}/${tab}`
              });
              sendResponse({ success: true, viaUrl: true });
            } else {
              sendResponse({ success: false, error: 'Could not determine profile username' });
            }
          }
        } else {
          sendResponse({ success: false, error: 'No active tab' });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep channel open for async
  } else if (message.action === 'redirectToMedia') {
    // Redirect the active tab to media page
    (async () => {
      try {
        const tabs = await extBgTabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
          await extBgTabs.sendMessage(tabs[0].id, { action: 'redirectToMedia' });
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'No active tab' });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep channel open for async
  } else if (message.action === 'checkExistingDownloads') {
    // Check for existing downloads for a username, scoped to the source tab
    const username = message.username || 'threads-user';

    checkExistingDownloads(username, message.source_tab).then((existingFiles) => {
      const latestDatetime = findLatestDatetime(existingFiles);
      sendResponse({
        exists: existingFiles.length > 0,
        count: existingFiles.length,
        latestDatetime: latestDatetime ? latestDatetime.toISOString() : null
      });
    }).catch(() => {
      sendResponse({
        exists: false,
        count: 0,
        latestDatetime: null
      });
    });

    return true; // Keep channel open for async
  } else if (message.action === 'downloadMediaWithResume') {

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
    const resumeTab = normalizeSourceTab(message.source_tab, 'media');


    // Sanitize username to prevent path traversal
    username = sanitizeFilename(username);

    // If resumeFromDatetime is provided, filter media items
    if (message.resumeFromDatetime) {
      const cutoff = new Date(message.resumeFromDatetime);
      const originalCount = mediaItems.length;
      mediaItems = filterNewerMedia(mediaItems, cutoff);

      if (mediaItems.length === 0) {
        sendResponse({ success: true, queued: 0, skipped: originalCount, message: 'No new media to download' });
        return true;
      }
    }

    // Validate and filter media items
    const validItems = [];

    mediaItems.forEach(item => {
      if (isValidMediaUrl(item.url)) {
        validItems.push(item);
      }
    });

    if (validItems.length === 0) {
      sendResponse({ success: false, error: 'No valid media URLs found.' });
      return true;
    }


    // Store metadata if provided
    if (message.metadata && Array.isArray(message.metadata)) {
      postMetadata = message.metadata;
    }

    // Add to download queue (carry source_tab through for filenames/resume)
    totalFiles = validItems.length;
    validItems.forEach((item, index) => {
      downloadQueue.push({
        url: item.url,
        username: username,
        index: index + 1,
        total: validItems.length,
        type: item.type || 'image',
        datetime: item.datetime || null,
        source_tab: normalizeSourceTab(item.source_tab, resumeTab)
      });
    });

    // Save state for resume functionality
    savedState = {
      queue: downloadQueue.map(item => ({ url: item.url, username: item.username, index: item.index, total: item.total, type: item.type, datetime: item.datetime, source_tab: item.source_tab })),
      totalFiles: totalFiles,
      downloadCount: downloadCount,
      username: username,
      metadata: postMetadata
    };
    extBgStorage.local.set({ downloadState: savedState }).catch(() => { });

    // Reset stop flag and cooldown milestone when starting new download
    shouldStop = false;
    lastCooldownMilestone = Math.floor(downloadCount / 100) * 100; // Set to current milestone


    // Start processing if not already downloading
    if (!isDownloading) {
      processDownloadQueue();
    }

    sendResponse({ success: true, queued: downloadQueue.length, skipped: 0 });

    return true; // Keep channel open for async response
  } else if (message.action === 'downloadSingleMedia') {
    const url = typeof message.url === 'string' ? message.url.trim() : '';
    const username = sanitizeFilename(message.username || 'threads-user');

    if (!url) {
      sendResponse({ success: false, error: 'No media URL provided' });
      return true;
    }

    if (!isValidMediaUrl(url)) {
      sendResponse({ success: false, error: 'URL is not a supported Threads/Instagram CDN media URL' });
      return true;
    }

    const extension = detectExtensionFromUrl(url);
    const filename = `${username}_single_${Date.now()}.${extension}`;

    (async () => {
      try {
        const downloadOptions = await buildDownloadOptions({
          url,
          usernameDir: username,
          filename
        });
        await extBgDownloads.download(downloadOptions);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message || 'Download failed' });
      }
    })();

    return true; // Keep channel open for async response
  }

  return true; // Keep message channel open for async response
});

async function processDownloadQueue() {
  // Check if we should stop
  if (shouldStop) {
    isDownloading = false;
    // Don't clear state when stopped - allow resume
    // Keep downloadCount, totalFiles, and lastCooldownMilestone for resume
    extBg.sendMessage({ action: 'downloadStopped' }).catch(() => { });
    return;
  }

  if (downloadQueue.length === 0) {
    isDownloading = false;
    downloadCount = 0;
    totalFiles = 0;
    lastCooldownMilestone = 0;
    usedDatetimes = new Map(); // Reset datetime collision tracking
    // Note: Keep postMetadata for export after download completes

    // Auto-export metadata if setting is enabled
    if (postMetadata.length > 0) {
      // Capture username before clearing savedState (storage callback is async)
      const exportUsername = savedState ? savedState.username : 'threads-user';
      extBgStorage.local.get(['exportMetadata', 'metadataFormat']).then((result) => {
        if (result.exportMetadata) {
          const format = result.metadataFormat || 'json';
          const username = exportUsername;

          // Generate filename with today's date
          const today = new Date();
          const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

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

          const blob = new Blob([content], { type: mimeType });
          const url = URL.createObjectURL(blob);

          (async () => {
            const filename = `${username}_${dateStr}_metadata.${extension}`;
            try {
              const downloadOptions = await buildDownloadOptions({
                url,
                usernameDir: username,
                filename
              });
              await extBgDownloads.download(downloadOptions);
            } catch (e) { /* ignore */ }
            URL.revokeObjectURL(url);
          })();
        }
      }).catch(() => { });
    }

    savedState = null; // Clear saved state when complete
    extBgStorage.local.remove(['downloadState']).catch(() => { });
    extBg.sendMessage({ action: 'downloadComplete' }).catch(() => { });
    return;
  }

  isDownloading = true;

  const now = Date.now();

  // Check if we need cooldown after 100 downloads (only if queue is not empty and we haven't already applied cooldown for this milestone)
  const currentMilestone = Math.floor(downloadCount / 100) * 100;
  if (downloadCount > 0 && downloadCount % 100 === 0 && downloadQueue.length > 0 && currentMilestone > lastCooldownMilestone) {
    lastCooldownMilestone = currentMilestone;
    cooldownUntil = now + settings.cooldownAfter100;
    extBg.sendMessage({
      action: 'cooldownStarted',
      duration: settings.cooldownAfter100
    }).catch(() => { });
    setTimeout(() => processDownloadQueue(), settings.cooldownAfter100);
    return;
  }

  // Check if we're in cooldown period (only if queue is not empty)
  if (now < cooldownUntil && downloadQueue.length > 0) {
    const waitTime = cooldownUntil - now;
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

    const extension = detectExtensionFromUrl(item.url, item.type);
    const sanitizedUsername = sanitizeFilename(item.username);
    const filename = buildQueueFilename(item, extension);

    // Validate URL one more time before downloading
    if (!isValidMediaUrl(item.url)) {
      setTimeout(() => processDownloadQueue(), 0);
      return;
    }

    // Download the file
    // Note: For Instagram/Facebook CDN URLs, the original URL with query parameters is required
    try {
      const downloadOptions = await buildDownloadOptions({
        url: item.url,
        usernameDir: sanitizedUsername,
        filename
      });

      await extBgDownloads.download(downloadOptions);
    } catch (downloadError) {
      // One retry after a short backoff (mobile networks often hiccup once).
      try {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const retryOptions = await buildDownloadOptions({
          url: item.url,
          usernameDir: sanitizedUsername,
          filename
        });
        await extBgDownloads.download(retryOptions);
      } catch (retryError) {
        // Continue with next item instead of stopping
        setTimeout(() => processDownloadQueue(), 0);
        return;
      }
    }

    downloadCount++;
    lastDownloadTime = Date.now();

    // Update saved state for resume functionality
    if (downloadQueue.length > 0 || downloadCount < totalFiles) {
      savedState = {
        queue: downloadQueue.map(entry => ({ url: entry.url, username: entry.username, index: entry.index, total: entry.total, type: entry.type, datetime: entry.datetime, source_tab: entry.source_tab })),
        totalFiles: totalFiles,
        downloadCount: downloadCount,
        username: item.username,
        metadata: postMetadata
      };
      extBgStorage.local.set({ downloadState: savedState }).catch(() => { });
    }

    // Notify popup of progress
    extBg.sendMessage({
      action: 'downloadProgress',
      current: item.index,
      total: item.total,
      remaining: downloadQueue.length,
      downloaded: downloadCount,
      totalFiles: totalFiles
    }).catch(() => { });

  } catch (error) {
    // Silently fail - continue with next item
  }

  // Process next item
  setTimeout(() => processDownloadQueue(), 0);
}

// Listen for download completion
extBgDownloads.onChanged.addListener((downloadDelta) => {
  if (downloadDelta.state && downloadDelta.state.current === 'complete') {
    // Download completed successfully
  } else if (downloadDelta.state && downloadDelta.state.current === 'interrupted') {
    // Download interrupted silently
  }
});

