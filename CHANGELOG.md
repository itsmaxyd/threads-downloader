# Changelog

## [1.1.0] - 2025-12-15

### Fixed
- Fixed broken media extraction logic by replacing complex extraction with simpler, more reliable approach from threads-media-extractor-spec
- Fixed prepare queue function to properly extract and save media links
- Fixed infinite scroll pagination to properly load all media by improving scroll triggering logic

### Added
- Improved queue/links saving support with better media URL detection

### Changed
- Updated media extraction to use findMediaContainer, extractMediaUrls, and handleInfiniteScroll functions