# Differences Between Firefox and Chrome Versions

This document outlines the key differences between the Firefox and Chrome versions of the Threads Media Downloader extension.

## Manifest Differences

### Manifest Version
- **Firefox**: Manifest V2
- **Chrome**: Manifest V3 (required as of January 2023)

### Action API
- **Firefox**: Uses `browser_action`
- **Chrome**: Uses `action` (unified API in MV3)

### Background Scripts
- **Firefox**: Uses `background.scripts` array with optional `persistent` flag
- **Chrome**: Uses `background.service_worker` (single file, always non-persistent)

### Permissions
- **Firefox**: All permissions in `permissions` array
- **Chrome**: Separates `permissions` and `host_permissions` arrays

### Browser-Specific Settings
- **Firefox**: Includes `browser_specific_settings.gecko` with extension ID
- **Chrome**: No browser-specific settings needed

## API Differences

### Namespace
- **Firefox**: Uses `browser.*` API (Promise-based)
- **Chrome**: Uses `chrome.*` API (supports promises in MV3)

### Examples

```javascript
// Firefox
await browser.storage.local.set({ key: value });
const result = await browser.storage.local.get(['key']);

// Chrome (same in MV3!)
await chrome.storage.local.set({ key: value });
const result = await chrome.storage.local.get(['key']);
```

## Background Script Architecture

### Firefox (Manifest V2)
- Can be persistent or non-persistent
- Maintains state in memory
- Runs continuously if persistent
- File: `background.js` with `scripts` array

### Chrome (Manifest V3)
- Always non-persistent (service worker)
- Terminates after ~30 seconds of inactivity
- Must save state to `chrome.storage` frequently
- Automatically restarts when needed
- File: Single `background.js` service worker

### State Management

**Firefox**:
```javascript
// Can keep state in memory
let downloadQueue = [];
let isDownloading = false;
```

**Chrome**:
```javascript
// Must persist state to storage
let downloadQueue = [];
chrome.storage.local.set({ downloadState: { queue: downloadQueue } });

// Restore on service worker restart
chrome.storage.local.get(['downloadState'], (result) => {
  if (result.downloadState) {
    downloadQueue = result.downloadState.queue;
  }
});
```

## Feature Parity

Both versions support the same features:
- ✅ Media extraction from Threads pages
- ✅ Automatic pagination handling
- ✅ Configurable rate limiting
- ✅ Download queue management
- ✅ Pause/resume functionality
- ✅ Save/load queue files
- ✅ Skip already downloaded files
- ✅ Progress tracking
- ✅ Settings persistence

## Performance Considerations

### Firefox
- Persistent background script uses more memory
- Faster response time (always running)
- State always available in memory

### Chrome
- Service worker uses less memory
- Slight delay on cold start (service worker activation)
- State must be loaded from storage
- More efficient for battery life on laptops

## Installation Differences

### Firefox
1. Navigate to `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select `manifest.json`

### Chrome
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `chrome-version` directory

## File Structure

### Firefox Version (Root Directory)
```
manifest.json (MV2)
background.js (persistent/non-persistent)
content.js
popup.js
popup.html
icons/
```

### Chrome Version (chrome-version/)
```
manifest.json (MV3)
background.js (service worker)
content.js
popup.js
popup.html
icons/
```

## Code Changes Summary

### 1. Manifest Changes
```json
// Firefox (MV2)
{
  "manifest_version": 2,
  "browser_action": { ... },
  "background": {
    "scripts": ["background.js"],
    "persistent": false
  },
  "browser_specific_settings": { ... }
}

// Chrome (MV3)
{
  "manifest_version": 3,
  "action": { ... },
  "background": {
    "service_worker": "background.js"
  },
  "host_permissions": [ ... ]
}
```

### 2. API Namespace
All instances of `browser.*` replaced with `chrome.*`:
- `browser.runtime` → `chrome.runtime`
- `browser.storage` → `chrome.storage`
- `browser.downloads` → `chrome.downloads`
- `browser.tabs` → `chrome.tabs`

### 3. Service Worker Adaptations
- Added frequent state persistence to `chrome.storage.local`
- State restoration on service worker restart
- No functional changes to download logic

## Known Limitations

### Chrome Service Worker
- May terminate during long cooldown periods (handled by state persistence)
- Requires state to be serializable (no functions in saved state)
- Console logs may be lost when service worker terminates

### Firefox Persistent Background
- Uses more memory when persistent
- May be deprecated in future Firefox versions (moving to MV3)

## Migration Path

If you're switching from Firefox to Chrome version:

1. Your settings will not transfer automatically
2. Download queue state is browser-specific
3. Downloaded files are compatible (same naming scheme)
4. You can export queue files from Firefox and import to Chrome

## Future Compatibility

### Firefox
- Firefox is planning to adopt Manifest V3
- Current MV2 version will need updates
- May converge with Chrome version in the future

### Chrome
- Manifest V3 is the current standard
- No major changes expected
- Service worker model is stable

## Recommendations

### Use Firefox Version If:
- You prefer persistent background scripts
- You want slightly faster response times
- You're already using Firefox

### Use Chrome Version If:
- You're using Chrome/Chromium browsers
- You want better battery efficiency
- You prefer the latest extension standards

## Testing Differences

### Firefox Testing
- Use `about:debugging` for debugging
- Browser console shows all logs
- Background script always accessible

### Chrome Testing
- Use `chrome://extensions/` for debugging
- Service worker console separate from page console
- Service worker may need manual inspection

## Support

Both versions are actively maintained and receive the same feature updates. Bug fixes are applied to both versions simultaneously.

## Version Numbers

Both versions maintain the same version number for feature parity:
- Current version: 1.1.3
- Version numbers will stay synchronized

## Conclusion

While there are technical differences in implementation, both versions provide identical functionality to end users. The Chrome version uses modern Manifest V3 standards, while the Firefox version uses the more established Manifest V2. Both are fully functional and production-ready.
