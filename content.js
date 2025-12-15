// Content script for extracting media from Threads pages

let isExtracting = false;

// Listen for messages from popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractMedia') {
    if (isExtracting) {
      sendResponse({ success: false, error: 'Already extracting' });
      return;
    }
    
    const limit = message.limit || null; // null means all, otherwise number
    const prepareOnly = !!message.prepareOnly;
    const usernameOverride = message.usernameOverride || null;
    extractAllMedia(limit, prepareOnly, usernameOverride).then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Keep message channel open
  }
  
  return false;
});

async function extractAllMedia(limit = null, prepareOnly = false, usernameOverride = null) {
  isExtracting = true;
  const mediaUrls = new Set();

  try {
    // Extract username from URL
    const urlMatch = window.location.pathname.match(/@([^/]+)/);
    const username = usernameOverride || (urlMatch ? urlMatch[1] : 'threads-user');

    const mediaContainer = findMediaContainer();
    if (!mediaContainer) {
      console.log('No media container found');
      isExtracting = false;
      return {
        success: false,
        error: 'No media container found on this page'
      };
    }

    // Initial extraction
    extractMediaUrls(mediaContainer, mediaUrls);
    console.log(`Initial extraction found ${mediaUrls.size} media URLs`);

    // Handle infinite scroll to load more media
    await handleInfiniteScroll(mediaContainer, mediaUrls, limit);

    // Convert Set to Array
    const mediaArray = Array.from(mediaUrls);

    // Filter out invalid URLs
    const validUrls = mediaArray.filter(url => {
      if (!url || !url.startsWith('http')) return false;
      // Filter out data URLs, blob URLs, and invalid patterns
      if (url.startsWith('data:') || url.startsWith('blob:') || url.includes('placeholder') || url.includes('avatar')) {
        return false;
      }
      // Accept valid media URLs
      return url.match(/\.(jpg|jpeg|png|webp|gif|mp4|webm|mov)$/i) ||
             url.includes('scontent') ||
             url.includes('cdn') ||
             url.includes('fbcdn') ||
             url.includes('instagram') ||
             url.includes('/image/') ||
             url.includes('/video/') ||
             url.includes('/media/');
    });

    // Remove duplicates while preserving query parameters
    const seen = new Set();
    const deduplicatedUrls = validUrls.filter(url => {
      try {
        const urlObj = new URL(url);
        const baseUrl = urlObj.origin + urlObj.pathname;
        if (seen.has(baseUrl)) {
          return false;
        }
        seen.add(baseUrl);
        return true;
      } catch (e) {
        if (seen.has(url)) {
          return false;
        }
        seen.add(url);
        return true;
      }
    });

    // Apply limit if specified
    let finalUrls = deduplicatedUrls;
    if (limit && deduplicatedUrls.length > limit) {
      finalUrls = deduplicatedUrls.slice(0, limit);
      console.log(`Limited to ${limit} media files (found ${deduplicatedUrls.length} total)`);
    }

    console.log(`Final extraction: ${finalUrls.length} unique media URLs found`);
    if (finalUrls.length > 0) {
      console.log('Sample URLs:', finalUrls.slice(0, 3));
    }

    // If prepareOnly, return URLs without sending to background
    if (prepareOnly) {
      isExtracting = false;
      return {
        success: true,
        count: finalUrls.length,
        username: username,
        urls: finalUrls,
        limit: limit
      };
    }

    // Send to background script for downloading
    if (finalUrls.length > 0) {
      browser.runtime.sendMessage({
        action: 'downloadMedia',
        urls: finalUrls,
        username: username
      }).catch(err => console.error('Error sending media URLs:', err));
    }

    isExtracting = false;
    return {
      success: true,
      count: finalUrls.length,
      username: username,
      limit: limit
    };

  } catch (error) {
    isExtracting = false;
    console.error('Error extracting media:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

function findMediaContainer() {
  // Try specific selectors first
  let container = document.querySelector('[data-testid="media-grid"]') ||
         document.querySelector('.media-grid') ||
         document.querySelector('div[role="grid"]') ||
         document.querySelector('[data-testid="user-profile-media-grid"]') ||
         document.querySelector('.user-profile-media-grid');

  if (container) return container;

  // Fallback: look for main content area
  container = document.querySelector('main') ||
             document.querySelector('[role="main"]') ||
             document.querySelector('.main') ||
             document.querySelector('#main');

  if (container) return container;

  // Last resort: use body but be careful
  console.log('Using document.body as container - may extract unwanted images');
  return document.body;
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

async function handleInfiniteScroll(container, urls, limit = null) {
  let noNewMediaCount = 0;
  const maxScrolls = 20;

  for (let i = 0; i < maxScrolls; i++) {
    const currentMediaCount = urls.size;

    // Scroll to bottom
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: 'smooth'
    });

    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Scroll a bit more to trigger lazy loading
    window.scrollTo({
      top: document.body.scrollHeight + 100,
      behavior: 'smooth'
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Extract new media
    extractMediaUrls(container, urls);

    // Check if we found new media
    if (urls.size === currentMediaCount) {
      noNewMediaCount++;
      if (noNewMediaCount >= 3) {
        break;
      }
    } else {
      noNewMediaCount = 0;
    }

    // Check limit
    if (limit && urls.size >= limit) {
      break;
    }
  }
}

// Auto-detect if we're on a media page and show indicator
if (window.location.pathname.includes('/media')) {
  // Could add a visual indicator here if needed
  console.log('Threads media page detected');
}

