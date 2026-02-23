# Changelog

All notable changes to the Threads Downloader extension will be documented in this file.

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
