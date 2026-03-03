# Changelog

All notable changes to the Threads Downloader extension will be documented in this file.

## [1.3.2] - 2026-03-03

### Added
- **Extraction verification system**: Implemented verification to ensure media is fully extracted before download
- **Duplicate download checking**: Avoids re-downloading existing files by checking for duplicates
- **Resume functionality**: Enhanced support for resuming interrupted downloads
- **Metadata appending**: Posts now accumulate rather than overwrite, preserving historical data
- **Single media download from URL**: Added ability to download individual media files from a URL

### Fixed
- **Firefox mobile compatibility**: Fixed issues with Firefox for Android browser
- **Cross-browser API compatibility**: Improved compatibility between Firefox and Chrome APIs
- **Background handling**: Improved background script handling to avoid partial extraction
- **Manifest compliance**: Updated manifests to comply with Firefox and Chrome guidelines

### Changed
- Updated minimum Firefox version to 140.0 (desktop) and 142.0 (Android)
- Version synchronization between Firefox and Chrome manifests

## [1.2.0] - 2026-02-23

### Added
- **Datetime-based filenames**: Files are now named with datetime format `{username}_{YYYY-MM-DD_HH-M-S}.{ext}` for consistency across sessions
- **Resume download with folder detection**: Automatically detects existing downloads and offers to resume from the latest file
- **Metadata export**: Export post metadata (username, datetime, permalink, media URLs, content, like/reply counts) in JSON or CSV format
- **Profile page redirect**: Option to auto-redirect or notify when on profile page instead of media page
- **Firefox for Android support**: Mobile-responsive UI with touch-friendly controls
- **Microsoft Edge support**: Compatible with Edge desktop and Kiwi Browser on Android
- **Collision handling**: Adds `_1`, `_2` suffix when multiple posts have the same timestamp

### Changed
- Filename format changed from `{username}_{XXX}_of_{YYY}.{ext}` to `{username}_{YYYY-MM-DD_HH-M-S}.{ext}`
- Settings panel now includes metadata export options and redirect preferences
- Minimum Firefox version: 109.0 (desktop), 120.0 (Android)

### Fixed
- Improved filename consistency across download sessions
- Better handling of existing downloads to avoid duplicates

## [1.1.3] - 2025-01-15

### Added
- Resume download functionality
- Download state persistence
- Stop and resume buttons

### Fixed
- Rate limiting improvements
- Memory optimization for large downloads

## [1.1.0] - 2025-01-01

### Added
- Chrome version support (Manifest V3)
- Dark/light theme support
- Download queue management
- Prepare queue feature (save URLs to file)

### Changed
- Improved UI with icons
- Better error handling

## [1.0.0] - 2024-12-01

### Added
- Initial release
- Download all media from Threads user media pages
- Automatic scrolling for infinite scroll pages
- Progress tracking
- Cooldown settings for rate limiting
