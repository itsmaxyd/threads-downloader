# GitHub Pages Deployment

This directory contains the source files for the [Threads Downloader](https://itsmaxyd.github.io/threads-downloader/) GitHub Pages site.

## Development

To preview the site locally:

```bash
cd pages
python3 -m http.server 8080
```

Then open http://localhost:8080 in your browser.

## Deployment

The site is automatically deployed via GitHub Pages when changes are pushed to the main branch.

### Manual Deployment

1. Go to repository Settings → Pages
2. Ensure "Source" is set to "Deploy from a branch"
3. Set "Branch" to "main" and "Folder" to "/pages"
4. Click Save

## Pages

- **index.html** - Main landing page
- **features.html** - Features and changelog
- **download.html** - Download links (Chrome Web Store, Firefox Add-ons)
- **install.html** - Installation guide
- **screenshots.html** - Screenshot gallery
- **privacy.html** - Privacy policy
- **changelog.html** - Version history
- **styles.css** - Main stylesheet
