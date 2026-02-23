# <img src="docs/media/icon/icon_128.png" alt="Threads Media Downloader icon" width="32" /> Threads Media Downloader

Download images and videos from Threads profile media pages — with a built-in queue and rate limiting to reduce the chance of blocked requests.

<p align="center">
  <a href="docs/media/promo_tile_440x280.png">
    <img src="docs/media/promo_tile_440x280.png" alt="Threads Media Downloader promo" width="440" />
  </a>
</p>

## What it does

Threads Media Downloader helps you save media from a Threads profile's media grid (for example: `https://www.threads.net/@username/media`).

It extracts media URLs from the page, auto-scrolls to load more items, then downloads the files to your normal Downloads folder in an organized subfolder.

## Features

- Download both images and videos from a profile's `/media` page
- Choose **All media**, or limit to the **recent 50 / 100** items
- Auto-scroll to load more media (infinite scroll / pagination)
- Built-in download queue with progress UI
- Rate limiting:
  - configurable delay between downloads
  - configurable cooldown after every 100 downloads
- Queue utilities:
  - **Prepare Queue**: save extracted links to a `.txt`
  - **Load Queue File**: download later from a saved list
  - **Stop / Resume** downloads
  - **Clear Queue**
- Tries to skip files you already downloaded (based on your browser's download history and the extension's filename pattern)

## Screenshots

![Screenshot 1](docs/media/screenshots/firefox/thumb/screenshot_1.jpg)
![Screenshot 2](docs/media/screenshots/firefox/thumb/screenshot_2.jpg)
![Screenshot 3](docs/media/screenshots/firefox/thumb/screenshot_3.jpg)
![Screenshot 4](docs/media/screenshots/firefox/thumb/screenshot_4.jpg)
![Screenshot 5](docs/media/screenshots/firefox/thumb/screenshot_5.jpg)

## Installation

### Chrome

Install from [Chrome Web Store](https://chromewebstore.google.com/detail/threads-media-downloader/jgiglfccgfjoajfgejioofaiojaljdim?authuser=0&hl=en)

**Developer Installation:**
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" using the toggle in the top right corner
3. Click "Load unpacked"
4. Select the `chrome-version` directory from this repository
5. The extension icon should appear in your Chrome toolbar

### Firefox

Install from [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/threads-media-downloader)

**Developer Installation:**
1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file from the root directory

For detailed installation instructions, see [INSTALL.md](INSTALL.md).

## How to use

1. Open a Threads profile media page:
   - `https://www.threads.net/@username/media` or `https://www.threads.com/@username/media`
2. Click the extension icon in your browser toolbar.
3. (Optional) Choose a download option:
   - **Download All Media**
   - **Recent 50 Media Files**
   - **Recent 100 Media Files**
4. (Optional) Set a **Filename prefix** (useful if the username can't be detected reliably).
5. Click **Download Media**.

### Where files are saved

- Media downloads: `threads-downloads/<username>/` inside your browser's default Downloads folder.
- Saved queues (link lists): `threads-queues/<username>-queue.txt` inside your browser's default Downloads folder.

### File naming

Files are named with a predictable, sortable pattern:

```text
username_001_of_150.jpg
username_002_of_150.mp4
username_003_of_150.webp
...
```

Files are zero-padded for proper sorting and include the total count for easy tracking.

## Settings

### Cooldown between downloads
Time in milliseconds to wait between each download (default: 2000ms = 2 seconds)
- Minimum: 500ms
- Maximum: 60000ms (1 minute)

### Cooldown after 100 downloads
Time in milliseconds to wait after downloading 100 files (default: 120000ms = 2 minutes)
- Minimum: 60000ms (1 minute)
- Maximum: 3600000ms (1 hour)

## Browser Compatibility

| Feature | Firefox | Chrome |
|---------|---------|--------|
| Manifest Version | V2 | V3 |
| Background | Background Script | Service Worker |
| API Namespace | `browser.*` | `chrome.*` |
| Features | Full support | Full support |

Both versions have identical functionality. For technical differences, see [chrome-version/DIFFERENCES.md](chrome-version/DIFFERENCES.md).

## Privacy & Security

- **No data collection**: This extension does not collect or transmit any user data
- **Local processing**: All media extraction happens locally in your browser
- **Secure downloads**: Only downloads from verified Threads CDN domains
- **No external servers**: No communication with external servers except Threads itself

For full details, see [PRIVACY.md](PRIVACY.md).

## Troubleshooting

### Extension not working
1. Make sure you're on a Threads media page (`threads.net/@username/media`)
2. Check that the extension has the necessary permissions
3. Try reloading the extension

### Downloads not starting
1. Check your browser's download settings
2. Ensure the extension has download permissions
3. Check the browser console for errors (F12 → Console)

### Chrome: Service worker inactive
Chrome may terminate the service worker after inactivity. This is normal - it will restart automatically when needed. Your download queue is saved and will resume.

## Permissions Explained

- **downloads**: To save media files to your computer
- **storage**: To save settings and download queue state
- **tabs**: To communicate with the Threads page and extract media
- **Host permissions** (threads.net, threads.com): To access and extract media from Threads pages

## Support

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/itsmaxyd/threads-downloader).

## License

See [LICENSE](LICENSE) file.

## Version

Current version: 1.1.3

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.
