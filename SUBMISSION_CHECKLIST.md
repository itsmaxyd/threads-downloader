# Firefox Add-ons Submission Checklist

## Pre-Submission Checklist

### Code Quality
- [x] Security audit completed
- [x] URL validation implemented
- [x] Filename sanitization added
- [x] Input validation in place
- [x] Error handling improved
- [x] No console.log statements in production (optional - can keep for debugging)

### Package Preparation
- [x] Package script created (`./package.sh`)
- [x] ZIP file created successfully
- [x] All required files included
- [x] No unnecessary files in package

### Required Files
- [x] manifest.json
- [x] background.js
- [x] content.js
- [x] popup.html
- [x] popup.js
- [x] icon16.png
- [x] icon48.png
- [x] icon128.png

### Submission Materials Needed

#### 1. Extension Information
- **Name**: Threads Media Downloader
- **Version**: 1.0.0
- **Summary** (max 250 chars): 
  "Download all media files from Threads user media pages with rate limiting, progress tracking, and automatic pagination support."
  
- **Description** (supports markdown):
```markdown
# Threads Media Downloader

A Firefox extension that allows you to download all media files (images and videos) from Threads user media pages.

## Features

- ✅ Downloads all media files from Threads user media pages
- ✅ Automatic pagination handling - scrolls through all media
- ✅ Visual progress bar with download status
- ✅ Stop/Resume functionality
- ✅ Configurable rate limiting to avoid blocked requests
- ✅ Automatic 2-minute cooldown after every 100 downloads
- ✅ Best quality media extraction
- ✅ Simple, minimal UI

## How to Use

1. Navigate to a Threads user media page (e.g., `https://www.threads.net/@username/media`)
2. Click the extension icon in the toolbar
3. Configure cooldown settings if needed
4. Click "Download All Media"
5. Files are saved to `threads-downloads/username/` in your download folder

## Privacy

This extension does not collect, store, or transmit any personal data. All settings are stored locally in your browser.
```

#### 2. Screenshots
You'll need at least 1 screenshot. Recommended:
- Screenshot of the popup UI
- Screenshot showing the extension in action on a Threads page
- Size: 1280x720 or 640x480

#### 3. Categories
Suggested categories:
- Photos & Media
- Productivity

#### 4. Tags
Suggested tags:
- threads
- download
- media
- images
- videos
- instagram

#### 5. Privacy Policy
Since the extension doesn't collect data, you can use:

```
Privacy Policy for Threads Media Downloader

This extension does not collect, store, or transmit any personal data.

Data Storage:
- Settings (cooldown values) are stored locally in your browser using Firefox's storage API
- No data is sent to external servers
- No analytics or tracking

Permissions:
- downloads: Required to download media files
- storage: Required to save user preferences locally
- tabs: Required to detect current Threads page URL
- threads.net/threads.com: Required to access Threads pages and extract media

Contact:
For questions about privacy, contact the extension developer via GitHub.
```

## Submission Steps

1. **Create Firefox Developer Account**
   - Go to https://addons.mozilla.org/developers/
   - Sign in with Firefox Account
   - Complete registration

2. **Submit Extension**
   - Go to https://addons.mozilla.org/developers/addon/submit/
   - Choose "On this site"
   - Upload `threads-downloader-v1.0.0.zip`
   - Fill in all required fields
   - Upload screenshots
   - Add privacy policy
   - Submit for review

3. **Wait for Review**
   - Automated review: Usually minutes to hours
   - Manual review: 1-7 days for new extensions

4. **After Approval**
   - Extension will be live on AMO
   - Users can install directly
   - You can update via developer dashboard

## Quick Start Commands

```bash
# Create package
./package.sh

# The package will be: threads-downloader-v1.0.0.zip
# Upload this to Firefox Add-ons
```

## Notes

- The extension is open source (GPL-3.0)
- All code is audited for security
- No external dependencies
- Works with Firefox 60+

