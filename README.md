# Threads Media Downloader - Firefox Extension

A minimal Firefox extension that extracts and downloads all media files from Threads user media pages with rate limiting to avoid blocked requests.

## Features

- ✅ Downloads all media files (images and videos) from Threads user media pages
- ✅ Automatic pagination handling - scrolls through all media
- ✅ Configurable cooldown between downloads
- ✅ Automatic 2-minute cooldown after every 100 downloads
- ✅ Best quality media extraction
- ✅ Simple, minimal UI
- ✅ Queue management

## Installation

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" in the left sidebar
3. Click "Load Temporary Add-on..."
4. Select the `manifest.json` file from this directory

## Usage

1. Navigate to a Threads user media page (e.g., `https://www.threads.net/@username/media`)
2. Click the extension icon in the toolbar
3. Configure cooldown settings if needed (default: 2 seconds between downloads, 2 minutes after 100 downloads)
4. Click "Download All Media"
5. The extension will:
   - Extract all media URLs from the page
   - Scroll through pagination to find all media
   - Queue downloads with rate limiting
   - Save files to `threads-downloads/username/` in your default download folder

## Settings

- **Cooldown between downloads**: Time in milliseconds to wait between each download (default: 2000ms = 2 seconds)
- **Cooldown after 100 downloads**: Time in milliseconds to wait after downloading 100 files (default: 120000ms = 2 minutes)

## Icons

The extension requires icon files (`icon16.png`, `icon48.png`, `icon128.png`). You can:
- Create simple placeholder icons
- Use any 16x16, 48x48, and 128x128 pixel PNG images
- The extension will work without icons, but Firefox may show a default icon

## Technical Details

- **Manifest Version**: 2 (Firefox WebExtension)
- **Permissions**: downloads, storage, tabs, threads.net access
- **Content Script**: Runs on threads.net pages to extract media
- **Background Script**: Manages download queue and rate limiting
- **Popup UI**: Simple interface for triggering downloads and managing settings

## Notes

- The extension respects rate limits to avoid being blocked
- Speed is not prioritized - completeness is the goal
- All media is saved with descriptive filenames: `username_index_of_total.extension`
- The extension handles both images and videos
- Pagination is handled automatically by scrolling and waiting for content to load

