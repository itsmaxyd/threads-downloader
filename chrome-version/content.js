// Content script for extracting media from Threads pages
// Chrome Manifest V3 version

let isExtracting = false;

// Check if current page is a profile page (not media page)
function isProfilePage() {
  const url = window.location.href;
  // Match /@username but NOT /@username/media or /@username/post/...
  // Handle query parameters and fragments by checking pathname only
  const pathname = window.location.pathname;
  const profilePattern = /^\/@[^/]+$/;
  return profilePattern.test(pathname);
}

// Get the media URL for current profile
function getMediaUrl() {
  const url = window.location.href;
  // Convert /@username to /@username/media
  // Preserve query parameters and fragments
  const origin = window.location.origin;
  const pathname = window.location.pathname;
  const search = window.location.search;
  const hash = window.location.hash;
  return `${origin}${pathname}/media${search}${hash}`;
}

// Redirect to media page
function redirectToMedia() {
  const mediaUrl = getMediaUrl();
  window.location.href = mediaUrl;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
  } else if (message.action === 'checkProfilePage') {
    sendResponse({
      isProfilePage: isProfilePage(),
      mediaUrl: getMediaUrl()
    });
    return true;
  } else if (message.action === 'redirectToMedia') {
    redirectToMedia();
    sendResponse({ success: true });
    return true;
  }
  
  return false;
});

async function extractAllMedia(limit = null, prepareOnly = false, usernameOverride = null) {
  isExtracting = true;
  // Use Map to store URL -> { url, type, datetime } objects
  const mediaMap = new Map();
  // Array to store metadata for each post
  let postMetadata = [];

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
    extractMediaUrls(mediaContainer, mediaMap);
    console.log(`Initial extraction found ${mediaMap.size} media URLs`);
    if (mediaMap.size > 0) {
      console.log('Initial URLs:', Array.from(mediaMap.values()).slice(0, 5));
    }

    // Handle infinite scroll to load more media
    await handleInfiniteScroll(mediaContainer, mediaMap, limit);

    // Extract metadata from all posts
    postMetadata = extractAllMetadata(mediaContainer, username);
    console.log(`Extracted metadata for ${postMetadata.length} posts`);

    // Convert Map to Array of media objects
    const mediaArray = Array.from(mediaMap.values());

    // Filter out invalid URLs
    console.log(`Filtering ${mediaArray.length} URLs...`);
    const validMedia = mediaArray.filter(item => {
      const url = item.url;
      if (!url || !url.startsWith('http')) return false;
      // Filter out data URLs, blob URLs, and invalid patterns
      if (url.startsWith('data:') || url.startsWith('blob:') || url.includes('placeholder') || url.includes('avatar') || url.includes('icon')) {
        return false;
      }
      // Accept URLs from known domains or with media keywords
      const isValid = url.includes('scontent') ||
             url.includes('cdn') ||
             url.includes('fbcdn') ||
             url.includes('instagram') ||
             url.includes('threads') ||
             url.includes('/image/') ||
             url.includes('/video/') ||
             url.includes('/media/') ||
             url.match(/\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|avi)$/i);
      if (!isValid) {
        console.log('Filtered out URL:', url);
      }
      return isValid;
    });
    console.log(`After filtering: ${validMedia.length} valid URLs`);
    if (validMedia.length > 0) {
      console.log('Valid media:', validMedia.slice(0, 5));
    }

    // Remove duplicates while preserving query parameters
    const seen = new Set();
    const deduplicatedMedia = validMedia.filter(item => {
      try {
        const urlObj = new URL(item.url);
        const baseUrl = urlObj.origin + urlObj.pathname;
        if (seen.has(baseUrl)) {
          return false;
        }
        seen.add(baseUrl);
        return true;
      } catch (e) {
        if (seen.has(item.url)) {
          return false;
        }
        seen.add(item.url);
        return true;
      }
    });

    // Apply limit if specified
    let finalMedia = deduplicatedMedia;
    if (limit && deduplicatedMedia.length > limit) {
      finalMedia = deduplicatedMedia.slice(0, limit);
      console.log(`Limited to ${limit} media files (found ${deduplicatedMedia.length} total)`);
    }

    console.log(`Final extraction: ${finalMedia.length} unique media URLs found`);
    if (finalMedia.length > 0) {
      console.log('Sample media:', finalMedia.slice(0, 3));
    }

    // If prepareOnly, return URLs without sending to background
    if (prepareOnly) {
      isExtracting = false;
      return {
        success: true,
        count: finalMedia.length,
        username: username,
        urls: finalMedia, // Return array of { url, type, datetime } objects
        metadata: postMetadata, // Include metadata
        limit: limit
      };
    }

    // Send to background script for downloading
    if (finalMedia.length > 0) {
      console.log('Content: Sending', finalMedia.length, 'media items to background script');
      try {
        const bgResponse = await chrome.runtime.sendMessage({
          action: 'downloadMedia',
          mediaItems: finalMedia, // Send array of objects with metadata
          username: username,
          metadata: postMetadata // Include metadata for storage
        });
        console.log('Content: Background response:', bgResponse);
      } catch (err) {
        console.error('Content: Error sending media URLs:', err);
      }
    } else {
      console.log('Content: No URLs to send to background');
    }

    isExtracting = false;
    return {
      success: true,
      count: finalMedia.length,
      username: username,
      metadata: postMetadata, // Include metadata in response
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

// Extract datetime from a post's article element
function extractPostDatetime(articleElement) {
  if (!articleElement) return null;
  
  const timeElement = articleElement.querySelector('time[datetime]');
  if (timeElement) {
    const datetime = timeElement.getAttribute('datetime');
    return datetime; // Return ISO 8601 string
  }
  return null;
}

// Extract human-readable datetime from title attribute
function extractDatetimeDisplay(articleElement) {
  if (!articleElement) return null;
  
  const timeElement = articleElement.querySelector('time[title]');
  if (timeElement) {
    return timeElement.getAttribute('title');
  }
  return null;
}

// Extract post permalink
function extractPermalink(articleElement, username) {
  if (!articleElement) return null;
  
  const link = articleElement.querySelector('a[href*="/post/"]');
  if (link) {
    const href = link.getAttribute('href');
    // Convert /@username/post/ID/media to https://www.threads.com/@username/post/ID
    const match = href.match(/\/(@[^/]+)\/post\/([^/]+)/);
    if (match) {
      return `https://www.threads.com/${match[1]}/post/${match[2]}`;
    }
  }
  return null;
}

// Extract all media URLs from an article element
function extractArticleMediaUrls(articleElement) {
  if (!articleElement) return [];
  
  const mediaUrls = [];
  const mediaElements = articleElement.querySelectorAll('img, video, video source, picture source');
  
  mediaElements.forEach(element => {
    const url = extractHighResUrl(element);
    if (url && url.startsWith('http')) {
      // Filter out avatars, icons, and placeholders
      if (!url.includes('avatar') && !url.includes('icon') && !url.includes('placeholder')) {
        mediaUrls.push(url);
      }
    }
  });
  
  return mediaUrls;
}

// Extract post content/caption
function extractPostContent(articleElement) {
  if (!articleElement) return null;
  
  // Find the span with dir="auto" containing the post text
  const contentSpans = articleElement.querySelectorAll('span[dir="auto"]');
  let content = '';
  
  contentSpans.forEach(span => {
    // Get direct text content, avoiding nested spans that might be counts
    const text = span.textContent.trim();
    // Skip if it's just a number (likely a count) or starts with @ (mention link)
    if (text && !text.match(/^\d+$/) && !text.startsWith('@')) {
      content += text + ' ';
    }
  });
  
  return content.trim() || null;
}

// Extract like count
function extractLikeCount(articleElement) {
  if (!articleElement) return 0;
  
  const likeSvg = articleElement.querySelector('svg[aria-label="Like"]');
  if (likeSvg) {
    // Find the count in nearby span with class x1o0tod
    const parentDiv = likeSvg.closest('div');
    if (parentDiv) {
      const countSpan = parentDiv.querySelector('span.x1o0tod');
      if (countSpan) {
        const count = parseInt(countSpan.textContent, 10);
        return isNaN(count) ? 0 : count;
      }
      // Fallback: look for any span with a number after the SVG
      const spans = parentDiv.querySelectorAll('span');
      for (const span of spans) {
        const text = span.textContent.trim();
        if (text.match(/^\d+$/)) {
          return parseInt(text, 10);
        }
      }
    }
  }
  return 0;
}

// Extract reply count
function extractReplyCount(articleElement) {
  if (!articleElement) return 0;
  
  const replySvg = articleElement.querySelector('svg[aria-label="Reply"]');
  if (replySvg) {
    // Find the count in nearby span with class x1o0tod
    const parentDiv = replySvg.closest('div');
    if (parentDiv) {
      const countSpan = parentDiv.querySelector('span.x1o0tod');
      if (countSpan) {
        const count = parseInt(countSpan.textContent, 10);
        return isNaN(count) ? 0 : count;
      }
      // Fallback: look for any span with a number after the SVG
      const spans = parentDiv.querySelectorAll('span');
      for (const span of spans) {
        const text = span.textContent.trim();
        if (text.match(/^\d+$/)) {
          return parseInt(text, 10);
        }
      }
    }
  }
  return 0;
}

// Extract all metadata from a post article element
function extractPostMetadata(articleElement, username) {
  return {
    username: username,
    datetime_iso: extractPostDatetime(articleElement),
    datetime_display: extractDatetimeDisplay(articleElement),
    post_permalink: extractPermalink(articleElement, username),
    media_urls: extractArticleMediaUrls(articleElement),
    post_content: extractPostContent(articleElement),
    like_count: extractLikeCount(articleElement),
    reply_count: extractReplyCount(articleElement)
  };
}

// Find the parent article element for a media element
function findParentArticle(element) {
  let current = element;
  while (current && current !== document.body) {
    if (current.tagName === 'ARTICLE' || current.getAttribute('role') === 'article') {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function extractMediaUrls(container, mediaMap, metadataMap = null) {
  // Look for all potential media elements
  const mediaElements = container.querySelectorAll('img, video, video source, picture source, [data-src], [data-url], [data-image], [data-lazy-src]');

  mediaElements.forEach(element => {
    const url = extractHighResUrl(element);
    if (url && !mediaMap.has(url)) {
      // Find parent article to extract datetime
      const article = findParentArticle(element);
      const datetime = extractPostDatetime(article);
      
      // Determine media type
      const tagName = element.tagName.toUpperCase();
      let type = 'image';
      if (tagName === 'VIDEO' || tagName === 'SOURCE') {
        const src = element.src || element.dataset.src || '';
        type = src.includes('video') || src.includes('.mp4') || src.includes('.webm') ? 'video' : 'image';
      }
      
      // Store as object with metadata in Map
      mediaMap.set(url, { url, type, datetime });
    }
  });
}

// Extract metadata from all unique articles in container
function extractAllMetadata(container, username) {
  const metadataArray = [];
  const seenArticles = new Set();
  
  // Find all article elements
  const articles = container.querySelectorAll('article, [role="article"]');
  
  articles.forEach(article => {
    // Create a unique key for the article based on permalink or content
    const permalink = extractPermalink(article, username);
    const key = permalink || article.textContent.substring(0, 100);
    
    if (!seenArticles.has(key)) {
      seenArticles.add(key);
      const metadata = extractPostMetadata(article, username);
      // Only add if we have meaningful data
      if (metadata.media_urls.length > 0 || metadata.post_content) {
        metadataArray.push(metadata);
      }
    }
  });
  
  return metadataArray;
}

function extractHighResUrl(element) {
  // Try multiple attributes for media URLs
  let url = element.dataset.src ||
            element.dataset.url ||
            element.dataset.image ||
            element.dataset.lazySrc ||
            element.dataset.original ||
            element.src;

  // For img elements, try srcset for highest quality
  if (element.tagName === 'IMG' && !url && element.srcset) {
    const sources = element.srcset.split(',').map(s => s.trim().split(' '));
    if (sources.length > 0) {
      // Get the last (usually highest quality) source
      url = sources[sources.length - 1][0];
    }
  }

  // For video/source elements
  if ((element.tagName === 'VIDEO' || element.tagName === 'SOURCE') && !url) {
    url = element.src;
  }

  return url || null;
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
