# Threads Media Downloader - Chrome Port Architecture Plan

## Overview
This plan outlines the process of porting the Firefox extension to Chrome, creating a separate `chrome-version/` directory to maintain both versions independently.

## Key Differences: Firefox vs Chrome Extensions

### 1. Manifest Version
- **Firefox**: Uses Manifest V2
- **Chrome**: Requires Manifest V3 (V2 deprecated as of January 2023)

### 2. API Namespace
- **Firefox**: Uses `browser.*` API (Promise-based)
- **Chrome**: Uses `chrome.*` API (callback-based, but supports promises in MV3)

### 3. Background Scripts
- **Firefox MV2**: Persistent or non-persistent background scripts
- **Chrome MV3**: Service workers only (non-persistent, event-driven)

### 4. Key API Changes for MV3

| Firefox MV2 | Chrome MV3 | Notes |
|-------------|------------|-------|
| `browser_action` | `action` | Unified action API |
| `background.scripts` | `background.service_worker` | Single service worker file |
| `browser_specific_settings` | Not needed | Chrome-specific config removed |
| `browser.runtime.*` | `chrome.runtime.*` | Namespace change |
| `browser.storage.*` | `chrome.storage.*` | Namespace change |
| `browser.downloads.*` | `chrome.downloads.*` | Namespace change |
| `browser.tabs.*` | `chrome.tabs.*` | Namespace change |

## Architecture Changes Required

### 1. Manifest V3 Structure

**Key Changes:**
- `manifest_version`: 2 → 3
- `browser_action` → `action`
- `background.scripts` → `background.service_worker`
- Remove `browser_specific_settings.gecko`
- Move some permissions to `host_permissions`
- Add `permissions` array with required permissions

### 2. Background Script Service Worker

**Key Changes:**
- Replace all `browser.*` with `chrome.*`
- Service workers are non-persistent - state must be saved to `chrome.storage`
- Use `chrome.storage.local` for queue state persistence
- Handle service worker lifecycle (may be terminated and restarted)
- Convert Promise-based code to work with Chrome's callback/promise hybrid
- Use `chrome.alarms` API for long delays to prevent service worker timeout

### 3. Content Script

**Key Changes:**
- Replace `browser.runtime` with `chrome.runtime`
- API calls remain largely the same
- Message passing works similarly

### 4. Popup Script

**Key Changes:**
- Replace all `browser.*` with `chrome.*`
- `chrome.tabs.query()` returns promises in MV3
- `chrome.storage.local` API similar to Firefox
- `chrome.downloads` API similar to Firefox

## File Structure

```
chrome-version/
├── manifest.json          (Manifest V3)
├── background.js          (Service worker)
├── content.js             (Content script)
├── popup.html             (Same as Firefox)
├── popup.js               (Chrome API version)
├── icon16.png             (Copy from root)
├── icon48.png             (Copy from root)
├── icon128.png            (Copy from root)
├── README.md              (Chrome-specific)
├── INSTALL.md             (Chrome installation guide)
└── DIFFERENCES.md         (Document key differences)
```

## Critical Implementation Details

### 1. Service Worker State Management

Since service workers are non-persistent, the download queue state must be managed carefully:

```javascript
// Save state frequently to chrome.storage.local
chrome.storage.local.set({ downloadState: savedState });

// Restore state when service worker restarts
chrome.storage.local.get(['downloadState'], (result) => {
  if (result.downloadState) {
    // Restore queue
  }
});
```

### 2. Message Passing

Chrome MV3 supports promises for most APIs:

```javascript
// Firefox (Promise-based)
const response = await browser.runtime.sendMessage({ action: 'getStatus' });

// Chrome MV3 (Promise-based, same syntax!)
const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
```

### 3. Downloads API

The downloads API is very similar:

```javascript
// Firefox
await browser.downloads.download({ url, filename, saveAs: false });

// Chrome
await chrome.downloads.download({ url, filename, saveAs: false });
```

### 4. Storage API

Storage API is nearly identical:

```javascript
// Firefox
await browser.storage.local.set({ key: value });
const result = await browser.storage.local.get(['key']);

// Chrome
await chrome.storage.local.set({ key: value });
const result = await chrome.storage.local.get(['key']);
```

## Detailed Migration Steps

### Step 1: Create Directory Structure
- Create `chrome-version/` directory
- Copy all necessary files as base

### Step 2: Port manifest.json
- Update to Manifest V3 format
- Change `browser_action` to `action`
- Change `background.scripts` to `background.service_worker`
- Remove `browser_specific_settings`
- Update permissions structure

### Step 3: Port background.js
- Replace all `browser.*` with `chrome.*`
- Ensure state persistence using `chrome.storage.local`
- Handle service worker lifecycle
- Test download queue management
- Implement proper error handling

### Step 4: Port content.js
- Replace `browser.runtime` with `chrome.runtime`
- Test message passing
- Verify media extraction works correctly

### Step 5: Port popup.js
- Replace all `browser.*` with `chrome.*`
- Test UI interactions
- Verify settings persistence
- Test download controls

### Step 6: Copy Static Files
- Copy `popup.html` (no changes needed)
- Copy icon files (icon16.png, icon48.png, icon128.png)

### Step 7: Create Documentation
- Create Chrome-specific README.md
- Create INSTALL.md for Chrome
- Create DIFFERENCES.md documenting key differences

### Step 8: Create Packaging Script
- Create `package-chrome.sh` for building Chrome extension zip

## Testing Strategy

### 1. Load Unpacked Extension
- Open `chrome://extensions/`
- Enable "Developer mode"
- Click "Load unpacked"
- Select `chrome-version/` directory

### 2. Test Core Functionality
- Navigate to Threads media page
- Extract media URLs
- Download queue management
- Rate limiting and cooldowns
- Resume functionality
- Settings persistence

### 3. Test Service Worker Lifecycle
- Verify state persists across service worker restarts
- Test long-running downloads
- Monitor service worker in Chrome DevTools

### 4. Test Error Handling
- Invalid URLs
- Network errors
- Permission issues
- Service worker timeout scenarios

## Potential Issues & Solutions

### Issue 1: Service Worker Timeout
**Problem**: Chrome service workers terminate after 30 seconds of inactivity.
**Solution**: 
- Use `chrome.alarms` API for long delays
- Keep service worker alive with periodic messages during downloads
- Save state frequently to survive restarts

### Issue 2: Download Permissions
**Problem**: Chrome may require additional permissions for downloads.
**Solution**: 
- Ensure `downloads` permission is in manifest
- Test with various file types
- Handle permission errors gracefully

### Issue 3: CORS Issues
**Problem**: Service workers may have different CORS behavior.
**Solution**: 
- Ensure proper host permissions in manifest
- Test with actual Threads CDN URLs
- Handle CORS errors appropriately

### Issue 4: Blob URL Downloads
**Problem**: Chrome may handle blob URLs differently in service workers.
**Solution**: 
- Test the "Prepare Queue" feature thoroughly
- May need to use different approach for saving text files

## Migration Checklist

- [ ] Create `chrome-version/` directory
- [ ] Port `manifest.json` to Manifest V3
- [ ] Update `background.js` with `chrome.*` API and service worker patterns
- [ ] Update `content.js` with `chrome.*` API
- [ ] Update `popup.js` with `chrome.*` API
- [ ] Copy `popup.html` (no changes needed)
- [ ] Copy icon files (icon16.png, icon48.png, icon128.png)
- [ ] Create Chrome-specific `README.md`
- [ ] Create Chrome-specific `INSTALL.md`
- [ ] Create `DIFFERENCES.md` documenting key differences
- [ ] Create `package-chrome.sh` packaging script
- [ ] Test all functionality in Chrome
- [ ] Test service worker lifecycle
- [ ] Test error scenarios
- [ ] Verify downloads work correctly
- [ ] Verify settings persistence
- [ ] Test resume functionality

## Code Changes Summary

### manifest.json Changes
```json
{
  "manifest_version": 3,  // Changed from 2
  "action": {  // Changed from browser_action
    "default_popup": "popup.html",
    "default_icon": { ... }
  },
  "background": {
    "service_worker": "background.js"  // Changed from scripts array
  },
  "host_permissions": [  // New in MV3
    "https://www.threads.net/*",
    "https://threads.net/*",
    "https://www.threads.com/*",
    "https://threads.com/*"
  ]
  // Removed: browser_specific_settings
}
```

### API Namespace Changes
- All `browser.*` → `chrome.*`
- `browser.runtime.sendMessage()` → `chrome.runtime.sendMessage()`
- `browser.storage.local` → `chrome.storage.local`
- `browser.downloads` → `chrome.downloads`
- `browser.tabs` → `chrome.tabs`

### Service Worker Considerations
- No persistent state - use `chrome.storage.local`
- May be terminated - save state frequently
- Use `chrome.alarms` for long delays
- Event-driven architecture

## Performance Considerations

### Firefox vs Chrome
- **Service Worker Lifecycle**: Chrome service workers are more aggressive about termination
- **Memory Usage**: Service workers use less memory than persistent background pages
- **Startup Time**: Service workers may have slightly slower cold start
- **Download Speed**: Should be similar, rate limiting is the bottleneck

## Security Considerations

### Manifest V3 Security Improvements
- More restrictive permissions model
- Better isolation of service workers
- Improved content security policy
- No remote code execution

### Extension Security
- URL validation remains the same
- Filename sanitization remains the same
- Permission model is more explicit in MV3

## Future Enhancements

### Potential Improvements
1. **Cross-browser compatibility**: Use WebExtension Polyfill for unified codebase
2. **Better error reporting**: Enhanced error messages for Chrome users
3. **Performance monitoring**: Track service worker restarts and performance
4. **Chrome Web Store**: Prepare for Chrome Web Store submission

## Documentation Structure

### README.md (Chrome-specific)
- Installation instructions for Chrome
- Chrome-specific features or limitations
- Link to Firefox version
- Troubleshooting section

### INSTALL.md (Chrome)
- Step-by-step installation guide
- Developer mode instructions
- Loading unpacked extension
- Updating the extension

### DIFFERENCES.md
- Manifest V3 vs V2 differences
- Service worker vs background script
- Any feature differences
- Performance considerations
- Known limitations

## Packaging for Chrome

### package-chrome.sh
```bash
#!/bin/bash
cd chrome-version
zip -r ../threads-downloader-chrome.zip . \
  -x "*.git*" \
  -x "*.DS_Store" \
  -x "node_modules/*"
echo "Chrome extension packaged: threads-downloader-chrome.zip"
```

## Conclusion

This architecture plan provides a comprehensive roadmap for porting the Firefox extension to Chrome while maintaining both versions separately. The main challenges are:

1. **Manifest V3 migration** - structural changes to manifest
2. **Service worker adaptation** - handling non-persistent background context
3. **API namespace changes** - `browser.*` → `chrome.*`
4. **State persistence** - ensuring download queue survives service worker restarts

The good news is that Chrome's Manifest V3 has improved promise support, making the migration smoother than it would have been with older Chrome versions. The core functionality (media extraction, download queue, rate limiting) will work identically once the API changes are made.

## Next Steps

1. Review and approve this plan
2. Switch to Code mode to implement the changes
3. Test thoroughly in Chrome
4. Document any issues or differences discovered during implementation
5. Create final documentation for users
