# Installation Guide - Threads Media Downloader for Chrome

This guide will walk you through installing the Threads Media Downloader extension in Google Chrome.

## Prerequisites

- Google Chrome browser (version 88 or later recommended)
- The `chrome-version` directory from this repository

## Installation Steps

### Step 1: Download the Extension

If you haven't already, download or clone this repository to your computer.

### Step 2: Open Chrome Extensions Page

1. Open Google Chrome
2. Navigate to `chrome://extensions/` by either:
   - Typing `chrome://extensions/` in the address bar and pressing Enter
   - Clicking the three-dot menu (⋮) → More tools → Extensions

### Step 3: Enable Developer Mode

1. Look for the "Developer mode" toggle in the top right corner of the Extensions page
2. Click the toggle to enable Developer mode
3. You should now see additional buttons appear: "Load unpacked", "Pack extension", and "Update"

### Step 4: Load the Extension

1. Click the "Load unpacked" button
2. In the file browser that opens, navigate to the `chrome-version` directory
3. Select the `chrome-version` folder and click "Select Folder" (or "Open" on some systems)

### Step 5: Verify Installation

1. The extension should now appear in your list of installed extensions
2. You should see:
   - Extension name: "Threads Media Downloader"
   - Version: 1.1.3
   - Status: Enabled (toggle should be blue/on)
3. The extension icon should appear in your Chrome toolbar
   - If you don't see it, click the puzzle piece icon (Extensions) in the toolbar
   - Find "Threads Media Downloader" and click the pin icon to pin it to the toolbar

## Updating the Extension

When a new version is released:

1. Download the updated `chrome-version` directory
2. Go to `chrome://extensions/`
3. Find "Threads Media Downloader" in your extensions list
4. Click the refresh/reload icon (circular arrow) on the extension card
5. Alternatively, click "Update" at the top of the page to update all extensions

## Troubleshooting

### Extension won't load

**Problem**: Error message when trying to load the extension

**Solutions**:
- Make sure you selected the `chrome-version` directory, not a parent directory
- Check that all required files are present: `manifest.json`, `background.js`, `content.js`, `popup.js`, `popup.html`, and icon files
- Look at the error message for specific details about what's wrong

### Extension loads but doesn't work

**Problem**: Extension appears installed but doesn't function

**Solutions**:
- Check that the extension is enabled (toggle is on)
- Verify you're on a Threads page (`threads.net` or `threads.com`)
- Try reloading the extension:
  1. Go to `chrome://extensions/`
  2. Find the extension
  3. Click the refresh icon
- Check the browser console for errors (F12 → Console tab)

### Extension icon not visible

**Problem**: Can't find the extension icon in the toolbar

**Solutions**:
- Click the puzzle piece icon (Extensions) in the Chrome toolbar
- Find "Threads Media Downloader" in the list
- Click the pin icon next to it to pin it to the toolbar

### Downloads not working

**Problem**: Extension extracts media but downloads don't start

**Solutions**:
- Check Chrome's download settings:
  1. Go to `chrome://settings/downloads`
  2. Make sure downloads are enabled
  3. Check the download location is accessible
- Verify the extension has download permissions:
  1. Go to `chrome://extensions/`
  2. Click "Details" on the Threads Media Downloader
  3. Check that permissions are granted
- Try reloading the page and the extension

### Service worker inactive

**Problem**: Extension shows "Service worker (inactive)" in gray text

**Solution**: This is normal behavior in Chrome. The service worker will automatically activate when needed. Your download queue is saved and will resume when the service worker restarts.

## Permissions Explained

The extension requires the following permissions:

- **downloads**: To save media files to your computer
- **storage**: To save settings and download queue state
- **tabs**: To communicate with the Threads page and extract media
- **Host permissions** (threads.net, threads.com): To access and extract media from Threads pages

## Uninstalling

To remove the extension:

1. Go to `chrome://extensions/`
2. Find "Threads Media Downloader"
3. Click "Remove"
4. Confirm the removal

Note: This will delete all saved settings and download queue state.

## Chrome Web Store Installation (Future)

Once the extension is published to the Chrome Web Store, you'll be able to install it directly:

1. Visit the Chrome Web Store page for Threads Media Downloader
2. Click "Add to Chrome"
3. Confirm the permissions
4. The extension will install automatically

## Getting Help

If you encounter issues not covered in this guide:

1. Check the [README.md](README.md) for usage instructions
2. Review the [DIFFERENCES.md](DIFFERENCES.md) for Chrome-specific information
3. Check the browser console for error messages (F12 → Console)
4. Visit the GitHub repository for support

## Next Steps

After installation:

1. Navigate to a Threads user media page (e.g., `https://www.threads.net/@username/media`)
2. Click the extension icon
3. Configure your settings if needed
4. Click "Download Media" to start downloading

See [README.md](README.md) for detailed usage instructions.
