# Threads Downloader

A browser extension to download media from Threads.net user media pages.

## Features

- **Download all media** from any Threads user's media page
- **Datetime-based filenames** - Consistent naming with `{username}_{YYYY-MM-DD_HH-M-S}.{ext}` format
- **Resume downloads** - Detects existing files and offers to continue from where you left off
- **Auto-export metadata** - Automatically saves post metadata as JSON or CSV when downloads complete
- **Auto-redirect** - Automatically redirect from profile to media page
- **Mobile support** - Works on Firefox for Android and Kiwi Browser

## Supported Browsers

| Browser | Desktop | Mobile |
|---------|---------|--------|
| Firefox | ✅ | ✅ (v120+) |
| Chrome | ✅ | ❌ (use Kiwi) |
| Edge | ✅ | ❌ (use Kiwi) |
| Kiwi Browser | - | ✅ |

## Installation

### Firefox
1. Download the latest release
2. Go to `about:addons` → Extensions
3. Click the gear icon → "Install Add-on From File"
4. Select the downloaded `.xpi` or `.zip` file

### Chrome / Edge
1. Download and unzip the Chrome version
2. Go to `chrome://extensions/` or `edge://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder

### Mobile (Firefox Android)
1. Open Firefox on your Android device
2. Go to `about:addons`
3. Search for "Threads Downloader"

### Mobile (Kiwi Browser)
1. Install Kiwi Browser from Google Play
2. Go to `kiwi://extensions/`
3. Enable "Developer mode"
4. Load the Chrome extension

## Usage

1. Navigate to a Threads user's media page: `threads.net/@username/media`
2. Click the extension icon
3. Click "Download Media" or "Prepare Queue"
4. For existing downloads, choose to resume or download all

## Settings

- **Cooldown between downloads**: Time to wait between each download (default: 2 seconds)
- **Cooldown after 100 downloads**: Longer pause after batch of 100 (default: 2 minutes)
- **Export metadata**: Enable to automatically save post metadata when downloads finish
- **Metadata format**: Choose JSON or CSV
- **Profile page redirect**: Behavior when on profile page (notify/auto/disabled)

## Filename Format

Files are saved as: `{username}_{YYYY-MM-DD_HH-M-S}.{ext}`

Example: `santhosh_shiva11_2026-02-21_16-41-32.jpg`

If multiple posts have the same timestamp, a suffix is added: `_1`, `_2`, etc.

## Metadata Fields

When metadata export is enabled, the following data is collected:

| Field | Description |
|-------|-------------|
| username | Thread username |
| datetime_iso | ISO 8601 datetime |
| datetime_display | Human-readable datetime |
| post_permalink | URL to the post |
| media_urls | Array of media URLs |
| post_content | Post caption/text |
| like_count | Number of likes |
| reply_count | Number of replies |

## License

MIT License - see [LICENSE](LICENSE) file.

## Privacy

This extension does not collect or transmit any user data. See [PRIVACY.md](PRIVACY.md) for details.
