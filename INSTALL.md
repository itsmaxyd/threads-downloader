# Installation Guide - Threads Media Downloader

This guide will walk you through installing the Threads Media Downloader extension in your browser.

## Table of Contents

- [Chrome Installation](#chrome-installation)
- [Firefox Installation](#firefox-installation)
- [Updating the Extension](#updating-the-extension)
- [Troubleshooting](#troubleshooting)
- [Permissions Explained](#permissions-explained)
- [Uninstalling](#uninstalling)

---

## Chrome Installation

### Method 1: Chrome Web Store (Recommended)

Install directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/threads-media-downloader/jgiglfccgfjoajfgejioofaiojaljdim?authuser=0&hl=en):

1. Visit the Chrome Web Store page
2. Click "Add to Chrome"
3. Confirm the permissions
4. The extension will install automatically

### Method 2: Load Unpacked Extension (Developer Mode)

**Prerequisites:**
- Google Chrome browser (version 88 or later recommended)
- The `chrome-version` directory from this repository

**Steps:**

1. **Download the Extension**
   
   If you haven't already, download or clone this repository to your computer.

2. **Open Chrome Extensions Page**
   
   1. Open Google Chrome
   2. Navigate to `chrome://extensions/` by either:
      - Typing `chrome://extensions/` in the address bar and pressing Enter
      - Clicking the three-dot menu (⋮) → More tools → Extensions

3. **Enable Developer Mode**
   
   1. Look for the "Developer mode" toggle in the top right corner
   2. Click the toggle to enable it
   3. You should now see additional buttons: "Load unpacked", "Pack extension", and "Update"

4. **Load the Extension**
   
   1. Click the "Load unpacked" button
   2. In the file browser, navigate to the `chrome-version` directory
   3. Select the `chrome-version` folder and click "Select Folder"

5. **Verify Installation**
   
   1. The extension should appear in your list of installed extensions
   2. You should see:
      - Extension name: "Threads Media Downloader"
      - Version: 1.3.2
      - Status: Enabled
   3. The extension icon should appear in your Chrome toolbar
      - If you don't see it, click the puzzle piece icon (Extensions) in the toolbar
      - Find "Threads Media Downloader" and click the pin icon to pin it to the toolbar

---

## Firefox Installation

### Method 1: Firefox Add-ons (Recommended)

Install directly from [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/threads-media-downloader):

1. Visit the Firefox Add-ons page
2. Click "Add to Firefox"
3. Confirm the permissions
4. The extension will install automatically

### Method 2: Load Temporary Add-on (Developer Mode)

**Prerequisites:**
- Firefox browser
- The root directory of this repository

**Steps:**

1. **Download the Extension**
   
   If you haven't already, download or clone this repository to your computer.

2. **Open Firefox Debugging Page**
   
   1. Open Firefox
   2. Navigate to `about:debugging` by typing it in the address bar

3. **Load the Add-on**
   
   1. Click "This Firefox" in the left sidebar
   2. Click "Load Temporary Add-on"
   3. Navigate to the root directory of this repository
   4. Select the `manifest.json` file

4. **Verify Installation**
   
   1. The extension should appear in the temporary extensions list
   2. You should see:
      - Extension name: "Threads Media Downloader"
      - Version: 1.3.2
   3. The extension icon should appear in your Firefox toolbar

> **Note**: Temporary add-ons are removed when Firefox restarts. For permanent installation, use the Firefox Add-ons store.

---

## Updating the Extension

### Chrome (Web Store)

Updates are automatic. You can also:
1. Go to `chrome://extensions/`
2. Click "Update" at the top of the page

### Chrome (Developer Mode)

1. Download the updated `chrome-version` directory
2. Go to `chrome://extensions/`
3. Find "Threads Media Downloader"
4. Click the refresh/reload icon (circular arrow) on the extension card

### Firefox (Add-ons)

Updates are automatic through Firefox's add-on update mechanism.

### Firefox (Temporary Add-on)

You need to reload the add-on after each Firefox restart:
1. Go to `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select `manifest.json` again

---

## Troubleshooting

### Extension won't load

**Problem**: Error message when trying to load the extension

**Solutions**:
- **Chrome**: Make sure you selected the `chrome-version` directory, not a parent directory
- **Firefox**: Make sure you selected the `manifest.json` file in the root directory
- Check that all required files are present
- Look at the error message for specific details

### Extension loads but doesn't work

**Problem**: Extension appears installed but doesn't function

**Solutions**:
- Check that the extension is enabled
- Verify you're on a Threads page (`threads.net` or `threads.com`)
- Try reloading the extension
- Check the browser console for errors (F12 → Console tab)

### Extension icon not visible

**Problem**: Can't find the extension icon in the toolbar

**Solutions**:
- **Chrome**: Click the puzzle piece icon (Extensions) → Find the extension → Click the pin icon
- **Firefox**: Click the extensions icon in the toolbar → Right-click the extension → Pin to toolbar

### Downloads not working

**Problem**: Extension extracts media but downloads don't start

**Solutions**:
- Check your browser's download settings
- Verify the extension has download permissions
- Try reloading the page and the extension

### Chrome: Service worker inactive

**Problem**: Extension shows "Service worker (inactive)" in gray text

**Solution**: This is normal behavior in Chrome. The service worker will automatically activate when needed. Your download queue is saved and will resume when the service worker restarts.

### Firefox: Temporary add-on disappeared

**Problem**: Extension is gone after restarting Firefox

**Solution**: Temporary add-ons are removed on restart. Either:
- Load the add-on again from `about:debugging`
- Install from Firefox Add-ons for permanent installation

---

## Permissions Explained

The extension requires the following permissions:

| Permission | Purpose |
|------------|---------|
| **downloads** | Save media files to your computer |
| **storage** | Save settings and download queue state |
| **tabs** | Communicate with the Threads page and extract media |
| **Host permissions** (threads.net, threads.com) | Access and extract media from Threads pages |

---

## Uninstalling

### Chrome

1. Go to `chrome://extensions/`
2. Find "Threads Media Downloader"
3. Click "Remove"
4. Confirm the removal

### Firefox

1. Go to `about:addons`
2. Find "Threads Media Downloader"
3. Click the three-dot menu (⋮)
4. Select "Remove"

**Note**: Uninstalling will delete all saved settings and download queue state.

---

## Getting Help

If you encounter issues not covered in this guide:

1. Check the [README.md](README.md) for usage instructions
2. Review [chrome-version/DIFFERENCES.md](chrome-version/DIFFERENCES.md) for Chrome-specific technical details
3. Check the browser console for error messages (F12 → Console)
4. Visit the [GitHub repository](https://github.com/itsmaxyd/threads-downloader) for support

---

## Next Steps

After installation:

1. Navigate to a Threads user media page (e.g., `https://www.threads.net/@username/media`)
2. Click the extension icon
3. Configure your settings if needed
4. Click "Download Media" to start downloading

See [README.md](README.md) for detailed usage instructions.
