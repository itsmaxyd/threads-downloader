// Content script for extracting media from Threads pages

let isExtracting = false;

// Helper function to parse count strings like "1.2K", "10K", "559"
function parseCount(str) {
  if (!str) return 0;
  
  str = str.trim().toLowerCase();
  
  // Handle K (thousands)
  if (str.endsWith('k')) {
    const num = parseFloat(str.slice(0, -1));
    return isNaN(num) ? 0 : Math.round(num * 1000);
  }
  
  // Handle M (millions)
  if (str.endsWith('m')) {
    const num = parseFloat(str.slice(0, -1));
    return isNaN(num) ? 0 : Math.round(num * 1000000);
  }
  
  // Handle plain numbers
  const num = parseInt(str, 10);
  return isNaN(num) ? 0 : num;
}

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
    console.log(`[METADATA DEBUG] Content: Extracted metadata for ${postMetadata.length} posts`);
    if (postMetadata.length > 0) {
      console.log(`[METADATA DEBUG] Content: Sample metadata:`, JSON.stringify(postMetadata[0], null, 2));
    }

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
        const bgResponse = await browser.runtime.sendMessage({
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
  // Try specific selectors first (keep for backward compatibility)
  let container = document.querySelector('[data-testid="media-grid"]') ||
         document.querySelector('.media-grid') ||
         document.querySelector('div[role="grid"]') ||
         document.querySelector('[data-testid="user-profile-media-grid"]') ||
         document.querySelector('.user-profile-media-grid');

  if (container) {
    console.log('Found media container with specific selector');
    return container;
  }

  // NEW: Find container via time elements (which exist on Threads pages)
  const timeElements = document.querySelectorAll('time[datetime]');
  if (timeElements.length > 0) {
    // Find common ancestor of all time elements
    let commonAncestor = timeElements[0];
    for (const time of timeElements) {
      while (!commonAncestor.contains(time)) {
        commonAncestor = commonAncestor.parentElement;
      }
    }
    console.log(`Found media container via ${timeElements.length} time elements`);
    return commonAncestor;
  }

  // NEW: Find via fbcdn images (Instagram CDN)
  const fbcdnImages = document.querySelectorAll('img[src*="fbcdn"]');
  if (fbcdnImages.length > 3) {
    let commonAncestor = fbcdnImages[0];
    for (const img of fbcdnImages) {
      while (!commonAncestor.contains(img)) {
        commonAncestor = commonAncestor.parentElement;
      }
    }
    console.log(`Found media container via ${fbcdnImages.length} fbcdn images`);
    return commonAncestor;
  }

  // Fallback: look for main content area
  container = document.querySelector('main') ||
             document.querySelector('[role="main"]') ||
             document.querySelector('.main') ||
             document.querySelector('#main');

  if (container) {
    console.log('Found media container via main element');
    return container;
  }

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
  // APPROACH 1: Use time elements as post anchors to get datetime
  const timeElements = container.querySelectorAll('time[datetime]');
  console.log(`extractMediaUrls: Found ${timeElements.length} time elements`);
  
  timeElements.forEach(timeElement => {
    const datetime = timeElement.getAttribute('datetime');
    const postLink = timeElement.closest('a[href*="/post/"]');
    const permalink = postLink ? postLink.href : null;
    
    // Find images associated with this post (traverse up to find container with images)
    let postContainer = timeElement;
    let foundImages = [];
    
    for (let i = 0; i < 10 && foundImages.length === 0; i++) {
      // Get ALL images in container, not just fbcdn
      const images = postContainer.querySelectorAll('img');
      foundImages = Array.from(images).filter(img => {
        return isPostImage(img);
      });
      if (foundImages.length > 0) break;
      postContainer = postContainer.parentElement;
    }
    
    // Add each image to the map with datetime
    foundImages.forEach(img => {
      const url = extractHighResUrl(img);
      if (url && !mediaMap.has(url)) {
        mediaMap.set(url, { 
          url, 
          type: 'image', 
          datetime,
          permalink
        });
      }
    });
  });
  
  // APPROACH 2: Scan ALL media elements directly (spec-style extraction)
  const allMediaElements = container.querySelectorAll('img, video, video source, picture source');
  console.log(`extractMediaUrls: Found ${allMediaElements.length} total media elements`);
  
  allMediaElements.forEach(element => {
    const url = extractHighResUrl(element);
    if (url && !mediaMap.has(url)) {
      // Skip profile pictures and obvious non-post images
      if (url.includes('/v/t51.2885-19/')) return; // Profile pics
      if (url.includes('avatar') || url.includes('icon') || url.includes('placeholder')) return;
      
      // Try to find datetime from nearby time element
      let datetime = null;
      let permalink = null;
      let parent = element.parentElement;
      for (let i = 0; i < 15; i++) {
        const time = parent.querySelector('time[datetime]');
        if (time) {
          datetime = time.getAttribute('datetime');
          const link = time.closest('a[href*="/post/"]');
          if (link) permalink = link.href;
          break;
        }
        parent = parent.parentElement;
        if (!parent) break;
      }
      
      const type = element.tagName === 'VIDEO' || element.tagName === 'SOURCE' ? 'video' : 'image';
      mediaMap.set(url, { url, type, datetime, permalink });
    }
  });
  
  console.log(`extractMediaUrls: Total ${mediaMap.size} media URLs found`);
}

// Check if an image element is a post image (not profile pic, icon, etc.)
function isPostImage(img) {
  const url = img.src || img.dataset.src || img.dataset.url || '';
  
  // Skip profile pictures
  if (url.includes('/v/t51.2885-19/')) return false;
  
  // Skip obvious non-post images
  if (url.includes('avatar')) return false;
  if (url.includes('icon')) return false;
  if (url.includes('placeholder')) return false;
  
  // Check image dimensions (profile pics are usually small and square)
  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
    // Skip small images (likely icons)
    if (img.naturalWidth < 50 || img.naturalHeight < 50) return false;
  }
  
  // Accept images from known CDN domains
  if (url.includes('fbcdn')) return true;
  if (url.includes('scontent')) return true;
  if (url.includes('cdninstagram')) return true;
  if (url.includes('threads')) return true;
  
  // Accept images with common media extensions
  if (url.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i)) return true;
  
  return false;
}

// Extract metadata from all unique posts in container
// Uses time elements as post anchors since article elements don't exist
function extractAllMetadata(container, username) {
  const metadataArray = [];
  const seenPosts = new Set();
  
  // Use time elements as post anchors
  const timeElements = container.querySelectorAll('time[datetime]');
  console.log(`[METADATA DEBUG] extractAllMetadata: Found ${timeElements.length} time elements`);
  console.log(`[METADATA DEBUG] Container tagName: ${container.tagName}, className: ${container.className}`);
  
  timeElements.forEach(timeElement => {
    const datetime = timeElement.getAttribute('datetime');
    const datetimeDisplay = timeElement.getAttribute('title');
    
    // Get post link (time is inside the link)
    const postLink = timeElement.closest('a[href*="/post/"]');
    const permalink = postLink ? postLink.href : null;
    
    // Skip if we've already processed this post
    const postKey = permalink || datetime;
    if (seenPosts.has(postKey)) return;
    seenPosts.add(postKey);
    
    // Find images for this post (traverse up to find container with images)
    let postContainer = timeElement;
    let postImages = [];
    
    for (let i = 0; i < 10; i++) {
      const images = postContainer.querySelectorAll('img');
      postImages = Array.from(images).filter(img => isPostImage(img));
      if (postImages.length > 0) break;
      postContainer = postContainer.parentElement;
    }
    
    // Use extractHighResUrl to get best quality URLs
    const mediaUrls = postImages.map(img => extractHighResUrl(img)).filter(url => url);
    
    // Extract content/caption (if available) - look for text near the post
    let postContent = null;
    // Try to find text content in the post container
    if (postContainer) {
      const textSpans = postContainer.querySelectorAll('span[dir="auto"]');
      const textParts = [];
      textSpans.forEach(span => {
        const text = span.textContent.trim();
        // Skip if it's just a number or very short
        if (text && text.length > 3 && !text.match(/^\d+$/)) {
          textParts.push(text);
        }
      });
      if (textParts.length > 0) {
        postContent = textParts.join(' ').substring(0, 500); // Limit length
      }
    }
    
    // Extract like and reply counts from the post container
    let likeCount = 0;
    let replyCount = 0;
    
    // Try to find engagement counts in the post container
    if (postContainer) {
      // Method 1: Look for specific SVG icons with aria-labels
      const likeSvg = postContainer.querySelector('svg[aria-label="Like"], svg[aria-label="Liked"]');
      if (likeSvg) {
        // Find count in nearby span
        const parentDiv = likeSvg.closest('div');
        if (parentDiv) {
          const spans = parentDiv.querySelectorAll('span');
          for (const span of spans) {
            const text = span.textContent.trim();
            // Handle formats like "559", "1.2K", "10K"
            if (text && (text.match(/^\d+$/) || text.match(/^\d+\.\d+[KkMm]$/))) {
              likeCount = parseCount(text);
              console.log(`[METADATA DEBUG] Found like count via SVG: ${likeCount}`);
              break;
            }
          }
        }
      }
      
      const replySvg = postContainer.querySelector('svg[aria-label="Reply"]');
      if (replySvg) {
        const parentDiv = replySvg.closest('div');
        if (parentDiv) {
          const spans = parentDiv.querySelectorAll('span');
          for (const span of spans) {
            const text = span.textContent.trim();
            if (text && (text.match(/^\d+$/) || text.match(/^\d+\.\d+[KkMm]$/))) {
              replyCount = parseCount(text);
              console.log(`[METADATA DEBUG] Found reply count via SVG: ${replyCount}`);
              break;
            }
          }
        }
      }
      
      // Method 2: Look for elements with specific roles or data attributes
      // Threads uses specific button structures for engagement
      const buttons = postContainer.querySelectorAll('button, [role="button"]');
      for (const btn of buttons) {
        const ariaLabel = btn.getAttribute('aria-label') || '';
        const text = btn.textContent.trim();
        
        if (ariaLabel.toLowerCase().includes('like') && text) {
          const countMatch = text.match(/^(\d+|\d+\.\d+[KkMm])\s*(likes?)?$/i);
          if (countMatch && likeCount === 0) {
            likeCount = parseCount(countMatch[1]);
            console.log(`[METADATA DEBUG] Found like count via button: ${likeCount}`);
          }
        }
        
        if (ariaLabel.toLowerCase().includes('repl') && text) {
          const countMatch = text.match(/^(\d+|\d+\.\d+[KkMm])\s*(replies?)?$/i);
          if (countMatch && replyCount === 0) {
            replyCount = parseCount(countMatch[1]);
            console.log(`[METADATA DEBUG] Found reply count via button: ${replyCount}`);
          }
        }
      }
      
      // Method 3: Look for common engagement count patterns
      // Engagement counts often appear in specific span structures
      const allSpans = postContainer.querySelectorAll('span');
      for (const span of allSpans) {
        const text = span.textContent.trim();
        // Look for patterns like "559 likes" or "12 replies"
        if (text && text.length < 50) {
          const likeMatch = text.match(/^(\d+|\d+\.\d+[KkMm])\s*likes?$/i);
          if (likeMatch && likeCount === 0) {
            likeCount = parseCount(likeMatch[1]);
            console.log(`[METADATA DEBUG] Found like count via span pattern: ${likeCount}`);
          }
          
          const replyMatch = text.match(/^(\d+|\d+\.\d+[KkMm])\s*replies?$/i);
          if (replyMatch && replyCount === 0) {
            replyCount = parseCount(replyMatch[1]);
            console.log(`[METADATA DEBUG] Found reply count via span pattern: ${replyCount}`);
          }
        }
      }
      
      if (likeCount === 0 && replyCount === 0) {
        console.log(`[METADATA DEBUG] No engagement counts found for post at ${permalink}`);
      }
    }
    
    const metadata = {
      username: username,
      datetime_iso: datetime,
      datetime_display: datetimeDisplay,
      post_permalink: permalink,
      media_urls: mediaUrls,
      post_content: postContent,
      like_count: likeCount,
      reply_count: replyCount
    };
    
    if (mediaUrls.length > 0 || postContent) {
      metadataArray.push(metadata);
      console.log(`[METADATA DEBUG] Added post #${metadataArray.length}: datetime=${datetime}, mediaUrls=${mediaUrls.length}, permalink=${permalink}`);
    } else {
      console.log(`[METADATA DEBUG] Skipped post: mediaUrls=${mediaUrls.length}, postContent=${postContent ? 'present' : 'null'}`);
    }
  });
  
  console.log(`[METADATA DEBUG] extractAllMetadata: Final count: ${metadataArray.length} posts with metadata`);
  return metadataArray;
}

function extractHighResUrl(element) {
  // For img elements, prioritize srcset for highest quality
  if (element.tagName === 'IMG') {
    // Check srcset first - this often has the highest resolution
    if (element.srcset) {
      const sources = element.srcset.split(',').map(s => s.trim().split(' '));
      if (sources.length > 0) {
        // Find the largest image by width descriptor
        const largest = sources.reduce((max, curr) => {
          const width = parseInt((curr[1] || '0').replace('w', ''));
          const maxWidth = parseInt((max[1] || '0').replace('w', ''));
          return width > maxWidth ? curr : max;
        });
        if (largest[0]) {
          return largest[0];
        }
      }
    }
  }
  
  // Try multiple data attributes for lazy-loaded images
  let url = element.dataset.src ||
            element.dataset.url ||
            element.dataset.image ||
            element.dataset.lazySrc ||
            element.dataset.original ||
            element.dataset.srcset ||
            element.src;

  // For video/source elements
  if ((element.tagName === 'VIDEO' || element.tagName === 'SOURCE')) {
    url = url || element.src;
    // Check for source elements inside video
    if (!url && element.tagName === 'VIDEO') {
      const source = element.querySelector('source');
      if (source) {
        url = source.src || source.dataset.src;
      }
    }
  }

  return url || null;
}

async function handleInfiniteScroll(container, urls, limit = null) {
  let noNewMediaCount = 0;
  const maxScrolls = 30; // Increased from 20

  for (let i = 0; i < maxScrolls; i++) {
    const currentMediaCount = urls.size;

    // Scroll to bottom
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: 'smooth'
    });

    // Wait longer for content to load (increased from 2000ms)
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Scroll a bit more to trigger lazy loading
    window.scrollTo({
      top: document.body.scrollHeight + 200,
      behavior: 'smooth'
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Extract new media
    extractMediaUrls(container, urls);

    console.log(`Scroll ${i + 1}: Found ${urls.size} media URLs (${urls.size - currentMediaCount} new)`);

    // Check if we found new media
    if (urls.size === currentMediaCount) {
      noNewMediaCount++;
      if (noNewMediaCount >= 5) { // Increased from 3
        console.log('No new media for 5 consecutive scrolls, stopping');
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

