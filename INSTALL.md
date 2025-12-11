# Installation Instructions

## Quick Start

1. **Open Firefox** and navigate to `about:debugging`
2. Click **"This Firefox"** in the left sidebar
3. Click **"Load Temporary Add-on..."**
4. Navigate to this directory and select `manifest.json`
5. The extension is now loaded!

## Using the Extension

1. Navigate to a Threads user media page:
   - Example: `https://www.threads.net/@username/media`
   - Or: `https://threads.com/@username/media`

2. Click the extension icon in Firefox toolbar

3. Configure settings (optional):
   - **Cooldown between downloads**: Default is 2000ms (2 seconds)
   - **Cooldown after 100 downloads**: Default is 120000ms (2 minutes)
   - Click "Save Settings"

4. Click **"Download All Media"**

5. The extension will:
   - Extract all media URLs from the page
   - Scroll through pagination automatically
   - Download all files with rate limiting
   - Save to `threads-downloads/username/` folder

## Troubleshooting

- **Extension not loading**: Make sure you selected `manifest.json` (not a folder)
- **No media found**: Ensure you're on a `/media` page, not just a profile page
- **Downloads failing**: Check browser download permissions and disk space
- **Rate limiting**: Increase the cooldown settings if you're getting blocked

## Notes

- The extension works as a temporary add-on - you'll need to reload it after Firefox restarts
- For permanent installation, you'd need to package it and sign it through Firefox Add-ons
- Files are saved to your default Firefox download directory

