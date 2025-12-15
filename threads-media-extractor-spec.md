# Threads Media Extractor Firefox Extension - Technical Specification

## Overview
A minimal Firefox extension designed to extract high-quality media URLs from Threads user media pages (e.g., https://www.threads.com/@username/media). The extension automatically scrapes media links, handles dynamic loading via infinite scroll, collects unique URLs, and saves them as a downloadable TXT file using Firefox's downloads API.

## Architecture Components

### 1. Manifest.json
```json
{
  "manifest_version": 2,
  "name": "Threads Media Extractor",
  "version": "1.0",
  "description": "Extract high-quality media links from Threads user media pages",
  "permissions": [
    "downloads",
    "activeTab",
    "storage"
  ],
  "content_scripts": [
    {
      "matches": ["*://www.threads.com/*/media"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "background": {
    "scripts": ["background.js"],
    "persistent": false
  },
  "browser_action": {
    "default_popup": "popup.html",
    "default_title": "Extract Links"
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "threads-media-extractor@example.com"
    }
  }
}
```

**Key Elements:**
- **Permissions**: `downloads` for saving files, `activeTab` for content script injection, `storage` for potential caching
- **Content Scripts**: Injects into Threads media pages at document idle
- **Background Script**: Handles file creation and download operations
- **Browser Action**: Adds a popup with default HTML file for manual trigger
- **Firefox Specific**: Required gecko ID for Firefox extensions

### 2. Content Script (content.js)

**Core Logic:**
```javascript
// Wait for page load and media container
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initScraper, 2000); // Allow dynamic content to load
});

function initScraper() {
  const mediaUrls = new Set();
  const mediaContainer = findMediaContainer();
  if (!mediaContainer) return;

  // Initial extraction
  extractMediaUrls(mediaContainer, mediaUrls);

  // Handle dynamic loading
  handleInfiniteScroll(mediaContainer, mediaUrls);

  // Auto-download after collection
  setTimeout(() => {
    if (mediaUrls.size > 0) {
      browser.runtime.sendMessage({ action: 'download', urls: Array.from(mediaUrls) });
    }
  }, 10000); // 10 seconds to allow loading
}

function findMediaContainer() {
  // Look for common Threads media grid selectors
  return document.querySelector('[data-testid="media-grid"]') ||
         document.querySelector('.media-grid') ||
         document.querySelector('div[role="grid"]');
}

function extractMediaUrls(container, urls) {
  const mediaElements = container.querySelectorAll('img, video');

  mediaElements.forEach(element => {
    const url = extractHighResUrl(element);
    if (url && !urls.has(url)) {
      urls.add(url);
    }
  });
}

function extractHighResUrl(element) {
  // Prioritize high-resolution sources
  if (element.tagName === 'IMG') {
    // Check srcset for largest image
    if (element.srcset) {
      const sources = element.srcset.split(',').map(s => s.trim().split(' '));
      const largest = sources.reduce((max, curr) => {
        const width = parseInt(curr[1] || '0');
        return width > parseInt(max[1] || '0') ? curr : max;
      });
      return largest[0];
    }

    // Fallback to data-src or src
    return element.dataset.src || element.src;
  } else if (element.tagName === 'VIDEO') {
    return element.src || element.querySelector('source')?.src;
  }

  return null;
}

function handleInfiniteScroll(container, urls) {
  let lastHeight = 0;
  let scrollAttempts = 0;
  const maxScrolls = 10;

  const scrollInterval = setInterval(() => {
    const currentHeight = document.body.scrollHeight;
    if (currentHeight === lastHeight && scrollAttempts >= 3) {
      clearInterval(scrollInterval);
      return;
    }

    if (currentHeight === lastHeight) {
      scrollAttempts++;
    } else {
      scrollAttempts = 0;
      lastHeight = currentHeight;
      // Extract new media after scroll
      setTimeout(() => extractMediaUrls(container, urls), 1000);
    }

    // Scroll to bottom
    window.scrollTo(0, currentHeight);
  }, 2000);
}
```

**Key Features:**
- **DOM Selection**: Identifies media container using data attributes and common selectors
- **High-Resolution Priority**: Parses srcset for largest available image, falls back to data-src/src
- **Dynamic Loading**: Implements infinite scroll detection with height monitoring and timed scrolls
- **Unique Collection**: Uses Set to prevent duplicate URLs
- **Auto-Trigger**: Initiates scraping 2 seconds after DOM load, downloads after 10 seconds

### 3. Background Script (background.js)

**Core Logic:**
```javascript
browser.runtime.onMessage.addListener((message) => {
  if (message.action === 'download') {
    downloadMediaLinks(message.urls);
  }
});

function downloadMediaLinks(urls) {
  const content = urls.join('\n');
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const filename = `threads_media_links_${Date.now()}.txt`;

  browser.downloads.download({
    url: url,
    filename: filename,
    saveAs: false
  }).then(() => {
    URL.revokeObjectURL(url);
  }).catch(error => {
    console.error('Download failed:', error);
  });
}
```

**Key Features:**
- **Message Handling**: Listens for content script messages
- **File Generation**: Creates TXT file with one URL per line
- **Download API**: Uses Firefox downloads API for automatic saving
- **Resource Cleanup**: Revokes blob URL after download

### 4. Popup HTML (popup.html)

**Core Structure:**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { width: 200px; padding: 10px; }
    button { width: 100%; padding: 8px; }
  </style>
</head>
<body>
  <button id="extractBtn">Extract Links</button>
  <script src="popup.js"></script>
</body>
</html>
```

**Key Elements:**
- **Minimal Design**: Simple button interface with basic styling
- **Fixed Width**: 200px popup width for consistent appearance
- **Button Trigger**: Single "Extract Links" button for manual activation

### 5. Popup Script (popup.js)

**Core Logic:**
```javascript
document.getElementById('extractBtn').addEventListener('click', () => {
  browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    browser.tabs.sendMessage(tabs[0].id, { action: 'extract' });
  });
});
```

**Key Features:**
- **Button Handler**: Listens for button click events
- **Tab Query**: Identifies the active tab for message sending
- **Message Dispatch**: Sends extraction trigger to content script on active tab

### Modified Content Script (content.js)

**Updated Core Logic:**
```javascript
// Listen for messages from popup instead of auto-running
browser.runtime.onMessage.addListener((message) => {
  if (message.action === 'extract') {
    initScraper();
  }
});

function initScraper() {
  const mediaUrls = new Set();
  const mediaContainer = findMediaContainer();
  if (!mediaContainer) return;

  // Initial extraction
  extractMediaUrls(mediaContainer, mediaUrls);

  // Handle dynamic loading
  handleInfiniteScroll(mediaContainer, mediaUrls);

  // Download after collection
  setTimeout(() => {
    if (mediaUrls.size > 0) {
      browser.runtime.sendMessage({ action: 'download', urls: Array.from(mediaUrls) });
    }
  }, 10000); // 10 seconds to allow loading
}

// ... (rest of functions remain unchanged)
```

**Key Changes:**
- **Message-Driven**: Replaced DOMContentLoaded auto-trigger with runtime message listener
- **On-Demand Extraction**: Only scrapes when popup button is clicked
- **Preserved Logic**: All extraction functions remain identical for compatibility

## Permissions Analysis

| Permission | Purpose | Justification |
|------------|---------|---------------|
| `downloads` | Save TXT file to user's downloads folder | Required for core functionality |
| `activeTab` | Inject content script into Threads pages | Enables scraping on target pages |
| `storage` | Potential caching of extracted URLs | Allows persistence across page reloads (optional enhancement) |

## Firefox Compliance

- **WebExtensions API**: Uses standard APIs available in Firefox
- **Manifest V2**: Compatible with current Firefox versions
- **CSP Compliance**: No inline scripts or eval usage
- **Security**: Content script only accesses DOM, no privileged APIs

## Limitations & Considerations

1. **Dynamic Content**: Relies on DOM selectors that may change with Threads updates
2. **Rate Limiting**: Basic scroll timing may not handle aggressive rate limits
3. **Media Types**: Currently handles img/video tags; may miss other formats
4. **User Experience**: Automatic download may surprise users; consider adding UI trigger
5. **Privacy**: Only accesses target pages when user visits them

## Future Enhancements

- Add browser action popup for manual trigger
- Implement progress indicator
- Add filtering options (images only, videos only)
- Cache results to avoid re-scraping
- Handle authentication-required content

## Testing Strategy

1. **Unit Tests**: Test URL extraction logic with mock DOM elements
2. **Integration Tests**: Verify on actual Threads pages (may require test accounts)
3. **Edge Cases**: Test with empty media pages, single media, large grids
4. **Firefox Versions**: Test across different Firefox versions

## Deployment

1. Package as .xpi file
2. Submit to Firefox Add-ons (AMO) or distribute as experimental extension
3. Include clear privacy policy and usage instructions