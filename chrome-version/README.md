# Threads Media Downloader - Chrome Extension

A Chrome extension that extracts and downloads all media files from Threads user media pages with rate limiting to avoid blocked requests.

## Features

- ✅ Downloads all media files (images and videos) from Threads user media pages
- ✅ Automatic pagination handling - scrolls through all media
- ✅ Configurable cooldown between downloads
- ✅ Automatic 2-minute cooldown after every 100 downloads
- ✅ Best quality media extraction
- ✅ Simple, minimal UI
- ✅ Queue management with pause/resume functionality
- ✅ Save and load download queues
- ✅ Skip already downloaded files

## Installation

### Method 1: Load Unpacked Extension (Developer Mode)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" using the toggle in the top right corner
3. Click "Load unpacked"
4. Select the `chrome-version` directory from this repository
5. The extension icon should appear in your Chrome toolbar

### Method 2: Chrome Web Store (Coming Soon)

The extension will be available on the Chrome Web Store once approved.

## Usage

1. Navigate to a Threads user media page (e.g., `https://www.threads.net/@username/media`)
2. Click the extension icon in the toolbar
3. Configure settings if needed:
   - **Download Options**: Choose to download all media or limit to recent 50/100 files
   - **Filename prefix**: Optionally override the username for file naming
   - **Cooldown settings**: Adjust timing between downloads (default: 2 seconds between downloads, 2 minutes after 100 downloads)
4. Click "Download Media"
5. The extension will:
   - Extract all media URLs from the page
   - Scroll through pagination to find all media
   - Queue downloads with rate limiting
   - Save files to `threads-downloads/username/` in your default download folder

## Features in Detail

### Download Options
- **Download All Media**: Extracts and downloads all available media from the page
- **Recent 50/100 Media Files**: Limits download to the most recent files

### Queue Management
- **Prepare Queue**: Save media URLs to a text file for later use
- **Load Queue File**: Load a previously saved queue file to download
- **Stop Download**: Pause the current download (can be resumed later)
- **Resume Download**: Continue a previously stopped download
- **Clear Queue**: Remove all pending downloads

### Smart Features
- **Skip Downloaded Files**: Automatically detects and skips files that have already been downloaded
- **Rate Limiting**: Prevents being blocked by respecting cooldown periods
- **Progress Tracking**: Real-time progress bar and status updates
- **Persistent State**: Download queue survives browser restarts

## Settings

### Cooldown between downloads
Time in milliseconds to wait between each download (default: 2000ms = 2 seconds)
- Minimum: 500ms
- Maximum: 60000ms (1 minute)

### Cooldown after 100 downloads
Time in milliseconds to wait after downloading 100 files (default: 120000ms = 2 minutes)
- Minimum: 60000ms (1 minute)
- Maximum: 3600000ms (1 hour)

## File Naming

Downloaded files are saved with descriptive names:
```
username_001_of_150.jpg
username_002_of_150.mp4
username_003_of_150.webp
...
```

Files are zero-padded for proper sorting and include the total count for easy tracking.

## Technical Details

- **Manifest Version**: 3 (Chrome Extension Manifest V3)
- **Permissions**: downloads, storage, tabs, host permissions for threads.net/threads.com
- **Content Script**: Runs on threads.net pages to extract media
- **Service Worker**: Manages download queue and rate limiting
- **Popup UI**: Simple interface for triggering downloads and managing settings

## Browser Compatibility

This is the **Chrome version** of the extension. For Firefox, see the main directory.

### Key Differences from Firefox Version
- Uses Manifest V3 (Chrome requirement)
- Uses `chrome.*` API instead of `browser.*`
- Service worker instead of persistent background script
- Optimized for Chrome's extension architecture

## Troubleshooting

### Extension not working
1. Make sure you're on a Threads media page (`threads.net/@username/media`)
2. Check that the extension has the necessary permissions
3. Try reloading the extension in `chrome://extensions/`

### Downloads not starting
1. Check Chrome's download settings
2. Ensure the extension has download permissions
3. Check the browser console for errors (F12 → Console)

### Service worker inactive
Chrome may terminate the service worker after inactivity. This is normal - it will restart automatically when needed. Your download queue is saved and will resume.

## Privacy & Security

- **No data collection**: This extension does not collect or transmit any user data
- **Local processing**: All media extraction happens locally in your browser
- **Secure downloads**: Only downloads from verified Threads CDN domains
- **No external servers**: No communication with external servers except Threads itself

## Notes

- The extension respects rate limits to avoid being blocked
- Speed is not prioritized - completeness is the goal
- All media is saved with descriptive filenames
- The extension handles both images and videos
- Pagination is handled automatically by scrolling and waiting for content to load
- Download state persists across browser restarts

## Support

For issues, questions, or contributions, please visit the GitHub repository.

## License

See LICENSE file in the root directory.

## Version

Current version: 1.1.3 (Chrome)

## Related

- [Firefox Version](../README.md) - Firefox extension in the main directory
- [Architecture Plan](../CHROME_PORT_PLAN.md) - Technical details of the Chrome port
