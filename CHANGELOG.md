# Changelog

All notable changes to the Threads Downloader extension will be documented in this file.

## [1.4.1] - 2026-10-07

### Fixed
- **UI/UX consistency pass**: every label is now `for`-bound to its control, all buttons
  carry `type="button"`, decorative icons use empty `alt`, inline flex/width styles moved
  into shared `.check-row`/`.subgroup`/`.full-width` classes, keyboard focus rings restored
  (`:focus-visible`), status/progress/dialogs expose `role` + `aria-live`/`aria-modal`
  semantics, single-URL field uses `type="url"`, resume dialog traps initial focus and
  returns it on close, saved source-tab preference wins over tab auto-preselect,
  progress-bar `aria-valuenow` stays in sync via a single `setProgress()` helper,
  version badge in the header renders from the manifest

## [1.4.0] - 2026-10-07

### Added
- **Replies-tab downloads**: source selector (Auto / Media / Replies) with author attribution,
  foreign-media filtering (opt-in "include other users' media"), `_reply` filename markers,
  `author`/`source_tab`/`is_reply` metadata fields, and tab-mismatch redirect prompts
- **threads.com-native delivery support**: `lookaside` redirector allowlist, HEIC/HEIF, AVIF,
  and HLS (`m3u8`) handling, srcset/currentSrc/poster resolution, origin+pathname dedup
- **Login-wall awareness**: extraction reports truncation when Threads gates pagination

### Fixed
- **Firefox mobile (Fenix) overhaul**: valid `gecko` + `gecko_android` manifest keys
  (previously `gecko_android` lived at top level where AMO ignores it), capability-probed
  `downloads` options (flat `threads-<user>-<file>` names on Android, no `saveAs`),
  single-shot `downloads.search` resume check, URL-based tab fallback when the content
  script is unreachable, scripting-API guard for MV2, touch-tuned scroll/pagination,
  and a validating `package-mobile.sh`
- **Background queue**: `source_tab` carried through all four queue paths + resume state,
  one download retry with backoff, typed extension detection (video posters keep image ext)
- `detectExtensionFromUrl` no longer mislabels unknown-type `.mp4` URLs as `.jpg`

### Changed
- **Memory-efficient extraction core**: single incremental scan (MutationObserver +
  scroll-container detection), WeakSet seen-tracking, per-post aggregates built in one
  pass, bounded maps, cooperative yields — replaces repeated full-DOM rescans + DOM mutation
- Chrome/Edge (`chrome-version/`) re-synced with Firefox sources behind cross-browser shims

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
