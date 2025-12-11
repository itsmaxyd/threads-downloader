// Content script for extracting media from Threads pages

let isExtracting = false;

// Listen for messages from popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractMedia') {
    if (isExtracting) {
      sendResponse({ success: false, error: 'Already extracting' });
      return;
    }
    
    extractAllMedia().then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Keep message channel open
  }
  
  return false;
});

async function extractAllMedia() {
  isExtracting = true;
  const mediaUrls = new Set();
  let scrollAttempts = 0;
  const maxScrollAttempts = 50; // Prevent infinite scrolling
  let lastMediaCount = 0;
  let noNewMediaCount = 0;
  
  try {
    // Extract username from URL
    const urlMatch = window.location.pathname.match(/@([^/]+)/);
    const username = urlMatch ? urlMatch[1] : 'threads-user';
    
    // Function to extract media from current page
    function extractMediaFromPage() {
      // Look for images and videos in various possible locations
      // Threads uses different selectors, so we'll try multiple approaches
      
      // Method 1: Look for img tags with src or srcset
      const images = document.querySelectorAll('img[src], img[srcset]');
      images.forEach(img => {
        let url = img.src || img.getAttribute('src');
        if (!url) {
          const srcset = img.getAttribute('srcset');
          if (srcset) {
            // Get the highest quality URL from srcset
            const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
            url = urls[urls.length - 1]; // Last one is usually highest quality
          }
        }
        
        if (url && (url.includes('scontent') || url.includes('cdn') || url.includes('fbcdn') || url.includes('instagram') || url.startsWith('http'))) {
          // For Instagram/Facebook CDN URLs, preserve the original URL with all query parameters
          // These URLs require query parameters for authentication/validation
          if (url.includes('instagram') || url.includes('fbcdn') || url.includes('scontent')) {
            // Use original URL as-is - query parameters are required
            if (url.match(/\.(jpg|jpeg|png|webp|gif|mp4|webm|mov)$/i) || url.includes('image') || url.includes('video')) {
              mediaUrls.add(url);
            }
          } else {
            // For other CDNs, try to clean but keep original as fallback
            try {
              const urlObj = new URL(url);
              // Only remove size constraints from path if safe
              let path = urlObj.pathname.replace(/_[0-9]+x[0-9]+\.(jpg|jpeg|png|webp|gif)$/i, '.$1');
              if (!path.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
                path = urlObj.pathname;
              }
              // Keep query parameters - they might be needed
              const cleanUrl = urlObj.origin + path + urlObj.search;
              if (cleanUrl.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
                mediaUrls.add(cleanUrl);
              } else {
                mediaUrls.add(url); // Fallback to original
              }
            } catch (e) {
              // If URL parsing fails, use original
              mediaUrls.add(url);
            }
          }
        }
      });
      
      // Method 2: Look for video tags
      const videos = document.querySelectorAll('video source, video[src]');
      videos.forEach(video => {
        let url = video.src || video.getAttribute('src');
        if (url && (url.includes('scontent') || url.includes('cdn') || url.includes('fbcdn') || url.includes('instagram'))) {
          // Preserve original URL with query parameters for CDN URLs
          if (url.match(/\.(mp4|webm|mov)$/i) || url.includes('video')) {
            mediaUrls.add(url);
          }
        }
      });
      
      // Method 3: Look for background images in style attributes
      const elementsWithBg = document.querySelectorAll('[style*="background-image"]');
      elementsWithBg.forEach(el => {
        const style = el.getAttribute('style');
        const match = style.match(/url\(['"]?([^'")]+)['"]?\)/);
        if (match) {
          let url = match[1];
          if (url && (url.includes('scontent') || url.includes('cdn') || url.includes('fbcdn') || url.includes('instagram'))) {
            // Preserve original URL - query parameters are needed for CDN
            if (url.match(/\.(jpg|jpeg|png|webp|gif)$/i) || url.includes('image')) {
              mediaUrls.add(url);
            }
          }
        }
      });
      
      // Method 4: Look for data attributes that might contain media URLs
      const dataElements = document.querySelectorAll('[data-src], [data-url], [data-image]');
      dataElements.forEach(el => {
        let url = el.getAttribute('data-src') || el.getAttribute('data-url') || el.getAttribute('data-image');
        if (url && (url.includes('scontent') || url.includes('cdn') || url.includes('fbcdn') || url.includes('instagram'))) {
          // Preserve original URL with query parameters
          if (url.match(/\.(jpg|jpeg|png|webp|gif|mp4|webm|mov)$/i) || url.includes('image') || url.includes('video')) {
            mediaUrls.add(url);
          }
        }
      });
    }
    
    // Initial extraction
    extractMediaFromPage();
    
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
      
      // Accept URLs that:
      // 1. Have a file extension
      // 2. Are from known CDN domains (even without extension, they might be valid)
      return url.match(/\.(jpg|jpeg|png|webp|gif|mp4|webm|mov)$/i) || 
             url.includes('scontent') || 
             url.includes('cdn') || 
             url.includes('fbcdn') ||
             url.includes('instagram');
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
    
    // Send to background script for downloading
    if (deduplicatedUrls.length > 0) {
      browser.runtime.sendMessage({
        action: 'downloadMedia',
        urls: deduplicatedUrls,
        username: username
      }).catch(err => console.error('Error sending media URLs:', err));
    }
    
    isExtracting = false;
    return {
      success: true,
      count: deduplicatedUrls.length,
      username: username
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

