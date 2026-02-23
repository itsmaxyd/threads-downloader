# Threads Downloader - Microsoft Edge Version

## Compatibility

| Platform | Support Level | Notes |
|----------|---------------|-------|
| Edge Desktop (Windows/Mac/Linux) | ✅ Full Support | Via side-loading or Edge Add-ons store |
| Edge Mobile (Android/iOS) | ⚠️ Limited | Curated extensions only |
| Kiwi Browser (Android) | ✅ Full Support | Uses Chrome extension directly |

## Installation

### Edge Desktop

#### Method 1: Load Unpacked Extension

1. Download or clone this repository
2. Open Edge and navigate to `edge://extensions/`
3. Enable "Developer mode" using the toggle in the left sidebar
4. Click "Load unpacked"
5. Select the `chrome-version` folder from this repository
6. The extension icon will appear in your toolbar

#### Method 2: Package and Install

1. Run the packaging script:
   ```bash
   ./package-edge.sh
   ```
2. Extract the created `threads-downloader-edge-v*.zip` file
3. Follow steps 2-5 from Method 1, selecting the extracted folder

### Kiwi Browser (Android)

Kiwi Browser is the recommended way to use Chrome/Edge extensions on Android.

1. Install [Kiwi Browser](https://play.google.com/store/apps/details?id=com.kiwibrowser.browser) from Google Play Store
2. Open Kiwi and navigate to `kiwi://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Either:
   - Click "Load unpacked" and select the `chrome-version` folder, OR
   - Drag and drop the `.zip` file created by `./package-edge.sh`

## Differences from Firefox Version

| Feature | Firefox Version | Edge/Chrome Version |
|---------|-----------------|---------------------|
| Manifest Version | V2/V3 | V3 only |
| API Namespace | `browser.*` | `chrome.*` |
| Background Scripts | Background page | Service worker |
| Storage API | `browser.storage` | `chrome.storage` |
| Downloads API | `browser.downloads` | `chrome.downloads` |

All features and functionality remain the same across versions.

## Building the Edge Package

### Prerequisites

- Bash shell (Linux/macOS/WSL)
- zip utility

### Build Command

```bash
./package-edge.sh
```

This creates `threads-downloader-edge-v{VERSION}.zip` in the project root.

### Package Contents

```
threads-downloader-edge-v*.zip
├── manifest.json      # Extension manifest (Manifest V3)
├── background.js      # Service worker for background tasks
├── content.js         # Content script for Threads pages
├── popup.html         # Extension popup UI
├── popup.js           # Popup logic
└── assets/            # Icons and images
    ├── icon16.png
    ├── icon48.png
    ├── icon128.png
    └── app_icons/
```

## Publishing to Microsoft Edge Add-ons

To publish to the Microsoft Edge Add-ons store:

1. Go to [Microsoft Partner Center](https://partner.microsoft.com/dashboard)
2. Sign in with your Microsoft account
3. Click "Create new extension"
4. Upload the `.zip` package created by `./package-edge.sh`
5. Fill in the required store listing information:
   - Extension name
   - Description
   - Screenshots
   - Privacy policy URL
   - Category
6. Submit for review

### Review Process

- Microsoft reviews all extensions before publishing
- Review typically takes 1-3 business days
- You may be asked to make changes if issues are found

## Troubleshooting

### Extension Not Loading

1. Ensure "Developer mode" is enabled
2. Check that you selected the correct folder (`chrome-version`)
3. Look for errors in `edge://extensions/` (click "Errors" on the extension card)

### Downloads Not Working

1. Check that you've granted download permissions
2. Verify the Threads page URL matches `*.threads.net/*` or `*.threads.com/*`
3. Check Edge's download settings

### Popup Not Appearing

1. Click the puzzle piece icon in Edge's toolbar
2. Find "Threads Media Downloader"
3. Click the pin icon to keep it visible

## Support for Edge Mobile

Microsoft Edge for Android and iOS has limited extension support. Extensions are curated by Microsoft and not open to all developers.

### Alternatives for Mobile

1. **Kiwi Browser** (Android) - Full Chrome extension support
2. **Firefox for Android** - Use the Firefox version of this extension
3. **Wait for Edge Add-ons** - Microsoft may open extension support in the future

## Version History

| Version | Changes |
|---------|---------|
| 1.2 | Added Edge/Kiwi Browser support documentation |
| 1.1.3 | Initial Chrome/Edge compatible release |

## Related Documentation

- [MOBILE.md](MOBILE.md) - Mobile version documentation
- [chrome-version/DIFFERENCES.md](chrome-version/DIFFERENCES.md) - Chrome vs Firefox differences
- [INSTALL.md](INSTALL.md) - General installation guide
