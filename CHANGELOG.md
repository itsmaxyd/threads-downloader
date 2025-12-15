# Changelog

## [1.1.3] - 2025-12-15

### Fixed
- Fixed prepare queue blob URL compatibility for temporary Firefox add-ons

## [1.1.0] - 2025-12-15

### Fixed
- Fixed broken media extraction logic by replacing complex extraction with simpler, more reliable approach from threads-media-extractor-spec
- Fixed prepare queue function to properly extract and save media links using data URLs for compatibility
- Fixed infinite scroll pagination to properly load all media by improving scroll triggering logic
- Fixed URL validation to accept Instagram CDN URLs with query parameters
- Fixed missing downloadMediaFromList handler for queue loading functionality
- Fixed background script persistence for proper operation in temporary add-ons

### Added
- Comprehensive debug logging throughout extraction and download processes
- Improved media URL detection with multiple attribute fallbacks
- Better error handling and user feedback

### Changed
- Updated media extraction to use findMediaContainer, extractMediaUrls, and handleInfiniteScroll functions
- Modified prepare queue to auto-save TXT files for better compatibility

### Added
- Improved queue/links saving support with better media URL detection

### Changed
- Updated media extraction to use findMediaContainer, extractMediaUrls, and handleInfiniteScroll functions