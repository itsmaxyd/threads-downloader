# Threads Downloader - Mobile Version

## Firefox for Android

### Installation

1. Open Firefox on your Android device
2. Go to `about:addons`
3. Search for "Threads Downloader" or install from the Firefox Add-ons store
4. Tap "Add to Firefox"

### Usage

1. Navigate to a Threads user's media page (e.g., `threads.net/@username/media`)
2. Tap the extension icon in the Firefox menu
3. Use the popup to download media

### Mobile-Specific Features

- Touch-optimized UI with larger buttons
- Responsive layout for smaller screens
- Optimized for portrait orientation
- Minimum touch target size of 44x44 pixels for accessibility
- Font sizes optimized for mobile readability (16px minimum for inputs)

### Building the Mobile Package

Run the mobile packaging script:

```bash
./package-mobile.sh
```

This creates `threads-downloader-firefox-mobile-v1.2.zip` ready for submission to Firefox Add-ons.

### Technical Details

#### Manifest Configuration

The extension includes `gecko_android` settings in `browser_specific_settings`:

```json
{
  "browser_specific_settings": {
    "gecko": {
      "id": "threads-downloader@itsmaxyd.github.io",
      "strict_min_version": "109.0"
    },
    "gecko_android": {
      "strict_min_version": "120.0"
    }
  }
}
```

#### Mobile CSS Adaptations

- Viewport meta tag prevents zooming issues
- Touch targets are minimum 44px height
- Responsive breakpoints at 400px for mobile screens
- Font sizes 16px+ to prevent iOS zoom on focus

### Limitations

- Download progress shown in Firefox downloads panel
- Large downloads may take longer on mobile networks
- Background downloads may be paused if Firefox is backgrounded

### Testing Checklist

- [ ] Extension installs on Firefox for Android
- [ ] Popup displays correctly on mobile screen sizes
- [ ] All buttons are touch-friendly (min 48px height)
- [ ] Text is readable on mobile screens
- [ ] Downloads work correctly on mobile
- [ ] Settings are saved and loaded correctly

### Compatibility

- Firefox for Android 120.0+
- Firefox Desktop 109.0+
- Tested on Android 10+ devices

---

## Microsoft Edge

### Desktop Installation

1. Open Edge and go to `edge://extensions/`
2. Enable "Developer mode" (toggle in left sidebar)
3. Click "Load unpacked" and select the `chrome-version` folder
4. Or install from Microsoft Edge Add-ons store (when available)

### Mobile Support

**Important**: Microsoft Edge for Android/iOS has limited extension support. Extensions are curated by Microsoft and not open to all developers.

For mobile Edge extension support, users should consider Kiwi Browser (see below).

---

## Kiwi Browser (Recommended for Chrome/Edge extensions on Android)

Kiwi Browser is a Chromium-based browser that supports Chrome extensions on Android devices.

### Installation

1. Install Kiwi Browser from Google Play Store
2. Open Kiwi and go to `kiwi://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked" and select the extension folder
   - Or drag and drop the Chrome extension `.zip` file directly

### Kiwi Browser Compatibility

The Chrome version of Threads Downloader is fully compatible with Kiwi Browser:

- Uses same Manifest V3 format as Chrome
- All features work identically to desktop version
- Mobile-responsive UI adapts to screen size
- Downloads work through Kiwi's download manager

### Building the Kiwi/Edge Package

Run the Edge packaging script:

```bash
./package-edge.sh
```

This creates `threads-downloader-edge-v{VERSION}.zip` compatible with:
- Microsoft Edge Desktop
- Kiwi Browser on Android

### Kiwi Browser Features

- Full Chrome extension support on Android
- Desktop-like extension experience on mobile
- Supports both unpacked extensions and .crx/.zip files
- Extensions work in background when enabled

### Limitations

- Some Chrome APIs may behave differently on mobile
- Background downloads may be paused if Kiwi is backgrounded
- Large downloads may take longer on mobile networks

### Testing Checklist for Kiwi Browser

- [ ] Extension installs on Kiwi Browser
- [ ] Popup displays correctly on mobile screen sizes
- [ ] All buttons are touch-friendly
- [ ] Downloads work correctly
- [ ] Settings are saved and loaded correctly
- [ ] Extension persists after browser restart

### Compatibility

- Kiwi Browser (latest version from Play Store)
- Android 5.0+ devices
- Works with Chrome Manifest V3 extensions
