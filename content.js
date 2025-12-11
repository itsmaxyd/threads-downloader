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
    extractAllMedia(limit).then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Keep message channel open
  }
  
  return false;
});

async function extractAllMedia(limit = null) {
  isExtracting = true;
  const mediaUrls = new Set();
  let scrollAttempts = 0;
  const maxScrollAttempts = 50; // Prevent infinite scrolling
  let lastMediaCount = 0;
  let noNewMediaCount = 0;
  
  // If limit is set, we can stop scrolling earlier
  const shouldLimit = limit !== null && limit > 0;
  
  try {
    // Extract username from URL
    const urlMatch = window.location.pathname.match(/@([^/]+)/);
    const username = urlMatch ? urlMatch[1] : 'threads-user';
    
    // Function to extract media from current page
    function extractMediaFromPage() {
      // Look for images and videos in various possible locations
      // Threads uses different selectors, so we'll try multiple approaches
      
      // Method 1: Look for ALL img tags (including those without src initially)
      const images = document.querySelectorAll('img');
      images.forEach(img => {
        let url = img.src || img.getAttribute('src') || img.getAttribute('data-src');
        
        // Try to get URL from srcset
        if (!url) {
          const srcset = img.getAttribute('srcset');
          if (srcset) {
            // Get the highest quality URL from srcset
            const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
            url = urls[urls.length - 1]; // Last one is usually highest quality
          }
        }
        
        // Check for lazy-loaded images
        if (!url || url === '' || url.startsWith('data:') || url.startsWith('blob:')) {
          url = img.getAttribute('data-src') || 
                img.getAttribute('data-lazy-src') ||
                img.getAttribute('data-original') ||
                img.getAttribute('data-url');
        }
        
        // Get computed style background image
        if (!url || url.startsWith('data:') || url.startsWith('blob:')) {
          try {
            const computedStyle = window.getComputedStyle(img);
            const bgImage = computedStyle.backgroundImage;
            if (bgImage && bgImage !== 'none') {
              const match = bgImage.match(/url\(['"]?([^'")]+)['"]?\)/);
              if (match && match[1] && !match[1].startsWith('data:') && !match[1].startsWith('blob:')) {
                url = match[1];
              }
            }
          } catch (e) {
            // Ignore errors
          }
        }
        
        // Process the URL if it's valid
        if (url && url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('blob:')) {
          // For Instagram/Facebook CDN URLs, preserve the original URL with all query parameters
          if (url.includes('instagram') || url.includes('fbcdn') || url.includes('scontent') || url.includes('cdn')) {
            // Use original URL as-is - query parameters are required
            mediaUrls.add(url);
          } else {
            // For other URLs, check if they look like media files
            if (url.match(/\.(jpg|jpeg|png|webp|gif|mp4|webm|mov)$/i) || 
                url.includes('image') || 
                url.includes('video') ||
                url.includes('media')) {
              mediaUrls.add(url);
            }
          }
        }
      });
      
      // Method 2: Look for video tags and picture elements
      const videos = document.querySelectorAll('video, video source, picture source');
      videos.forEach(video => {
        let url = video.src || video.getAttribute('src') || video.getAttribute('data-src');
        if (!url) {
          url = video.getAttribute('data-lazy-src') || video.getAttribute('data-original');
        }
        
        if (url && url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('blob:')) {
          // Preserve original URL with query parameters for CDN URLs
          if (url.match(/\.(mp4|webm|mov)$/i) || url.includes('video') || url.includes('scontent') || url.includes('cdn') || url.includes('fbcdn') || url.includes('instagram')) {
            mediaUrls.add(url);
          }
        }
      });
      
      // Method 3: Look for background images in style attributes and computed styles
      const elementsWithBg = document.querySelectorAll('[style*="background-image"], [style*="backgroundImage"]');
      elementsWithBg.forEach(el => {
        const style = el.getAttribute('style');
        const match = style.match(/url\(['"]?([^'")]+)['"]?\)/);
        if (match) {
          let url = match[1];
          if (url && url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('blob:')) {
            mediaUrls.add(url);
          }
        }
        
        // Also check computed style
        try {
          const computedStyle = window.getComputedStyle(el);
          const bgImage = computedStyle.backgroundImage;
          if (bgImage && bgImage !== 'none') {
            const bgMatch = bgImage.match(/url\(['"]?([^'")]+)['"]?\)/);
            if (bgMatch && bgMatch[1] && bgMatch[1].startsWith('http') && !bgMatch[1].startsWith('data:') && !bgMatch[1].startsWith('blob:')) {
              mediaUrls.add(bgMatch[1]);
            }
          }
        } catch (e) {
          // Ignore errors
        }
      });
      
      // Method 4: Look for data attributes that might contain media URLs
      const dataElements = document.querySelectorAll('[data-src], [data-url], [data-image], [data-lazy-src], [data-original]');
      dataElements.forEach(el => {
        let url = el.getAttribute('data-src') || 
                  el.getAttribute('data-url') || 
                  el.getAttribute('data-image') ||
                  el.getAttribute('data-lazy-src') ||
                  el.getAttribute('data-original');
        
        if (url && url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('blob:')) {
          mediaUrls.add(url);
        }
      });
      
      // Method 5: Look for links that point to media files
      const mediaLinks = document.querySelectorAll('a[href*=".jpg"], a[href*=".jpeg"], a[href*=".png"], a[href*=".webp"], a[href*=".gif"], a[href*=".mp4"], a[href*=".webm"]');
      mediaLinks.forEach(link => {
        const url = link.href || link.getAttribute('href');
        if (url && url.startsWith('http') && url.match(/\.(jpg|jpeg|png|webp|gif|mp4|webm|mov)$/i)) {
          mediaUrls.add(url);
        }
      });
    }
    
    // Initial extraction
    extractMediaFromPage();
    console.log(`Initial extraction found ${mediaUrls.size} media URLs`);
    
    // Scroll and extract until no new media is found
    while (scrollAttempts < maxScrollAttempts) {
      lastMediaCount = mediaUrls.size;
      
      // Scroll to bottom gradually
      const scrollHeight = document.body.scrollHeight;
      window.scrollTo({
        top: scrollHeight,
        behavior: 'smooth'
      });
      
      // Wait for content to load - Threads uses lazy loading
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Also try scrolling a bit more to trigger lazy loading
      window.scrollTo({
        top: document.body.scrollHeight + 100,
        behavior: 'smooth'
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Extract again
      extractMediaFromPage();
      
      // Check if we found new media
      if (mediaUrls.size === lastMediaCount) {
        noNewMediaCount++;
        if (noNewMediaCount >= 3) {
          // No new media found after 3 scrolls, we're done
          break;
        }
      } else {
        noNewMediaCount = 0;
      }
      
      // If we have a limit and reached it, stop scrolling
      if (shouldLimit && mediaUrls.size >= limit) {
        console.log(`Reached limit of ${limit} media files, stopping extraction`);
        break;
      }
      
      scrollAttempts++;
      
      // Log progress
      console.log(`Extraction progress: Found ${mediaUrls.size} media files (scroll ${scrollAttempts}/${maxScrollAttempts})`);
    }
    
    // Convert Set to Array - use URLs as-is to preserve required query parameters
    // Instagram/Facebook CDN URLs require query parameters for authentication
    const mediaArray = Array.from(mediaUrls);
    
    // Filter out invalid URLs but keep original URLs with all parameters
    const uniqueUrls = mediaArray.filter(url => {
      if (!url || !url.startsWith('http')) return false;
      
      // Filter out data URLs, blob URLs, and invalid patterns
      if (url.startsWith('data:') || url.startsWith('blob:') || url.includes('placeholder') || url.includes('avatar')) {
        return false;
      }
      
      // Accept URLs that:
      // 1. Have a file extension
      // 2. Are from known CDN domains
      // 3. Contain media-related keywords
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
    const deduplicatedUrls = uniqueUrls.filter(url => {
      // Use URL without query params for deduplication, but keep original with params
      try {
        const urlObj = new URL(url);
        const baseUrl = urlObj.origin + urlObj.pathname;
        if (seen.has(baseUrl)) {
          return false;
        }
        seen.add(baseUrl);
        return true;
      } catch (e) {
        // If URL parsing fails, use full URL for deduplication
        if (seen.has(url)) {
          return false;
        }
        seen.add(url);
        return true;
      }
    });
    
    // Apply limit if specified (take first N items - most recent)
    let finalUrls = deduplicatedUrls;
    if (shouldLimit && deduplicatedUrls.length > limit) {
      finalUrls = deduplicatedUrls.slice(0, limit);
      console.log(`Limited to ${limit} most recent media files (found ${deduplicatedUrls.length} total)`);
    }
    
    console.log(`Final extraction: ${finalUrls.length} unique media URLs found`);
    if (finalUrls.length > 0) {
      console.log('Sample URLs:', finalUrls.slice(0, 3));
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

// Auto-detect if we're on a media page and show indicator
if (window.location.pathname.includes('/media')) {
  // Could add a visual indicator here if needed
  console.log('Threads media page detected');
}

