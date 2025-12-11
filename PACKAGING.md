# Packaging and Publishing Guide for Firefox Add-ons

## Step 1: Prepare Your Extension Package

### 1.1 Create a ZIP file

The extension must be packaged as a ZIP file with the following structure:

```
threads-downloader/
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.js
├── icon16.png
├── icon48.png
└── icon128.png
```

**Important**: The ZIP file must contain the files directly, not a folder containing the files.

### 1.2 Create the ZIP package

```bash
# Navigate to your extension directory
cd /home/max/scripts/threads-downloader

# Create ZIP file (files at root level, not in a folder)
zip -r threads-downloader.zip \
  manifest.json \
  background.js \
  content.js \
  popup.html \
  popup.js \
  icon16.png \
  icon48.png \
  icon128.png \
  -x "*.git*" "*.md" "*.DS_Store"
```

Or use this automated script:

```bash
#!/bin/bash
# Create package for Firefox Add-ons
cd /home/max/scripts/threads-downloader
zip -r threads-downloader-v1.0.0.zip \
  manifest.json \
  background.js \
  content.js \
  popup.html \
  popup.js \
  icon16.png \
  icon48.png \
  icon128.png \
  -x "*.git*" "*.md" "*.DS_Store" "*.gitignore" "LICENSE" "INSTALL.md" "README.md" "SECURITY.md" "PACKAGING.md"
```

## Step 2: Create a Firefox Developer Account

1. Go to [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/)
2. Sign in with your Firefox Account (or create one)
3. Complete the developer registration if required

## Step 3: Prepare Submission Materials

### 3.1 Required Information

- **Name**: Threads Media Downloader
- **Summary**: Brief description (max 250 characters)
  - Example: "Download all media files from Threads user media pages with rate limiting and progress tracking"
- **Description**: Full description (supports markdown)
- **Categories**: Choose appropriate categories
- **Tags**: Relevant keywords
- **Screenshots**: At least 1 screenshot (1280x720 or 640x480 recommended)
- **Icon**: Already included in package

### 3.2 Privacy Policy

Since the extension:
- Doesn't collect user data
- Only stores settings locally
- Doesn't make external API calls

You can use this privacy policy:

```
Privacy Policy for Threads Media Downloader

This extension does not collect, store, or transmit any personal data.

Data Storage:
- Settings (cooldown values) are stored locally in your browser
- No data is sent to external servers
- No analytics or tracking

Permissions:
- downloads: Required to download media files
- storage: Required to save user preferences locally
- tabs: Required to detect current Threads page
- threads.net/threads.com: Required to access Threads pages

Contact:
For questions about privacy, contact the extension developer.
```

## Step 4: Submit Your Extension

1. Go to [Submit a New Add-on](https://addons.mozilla.org/developers/addon/submit/)
2. Choose "On this site" (not "On your own")
3. Upload your ZIP file
4. Fill in all required information:
   - Name
   - Summary
   - Description
   - Categories
   - Tags
5. Upload screenshots
6. Add privacy policy (if required)
7. Submit for review

## Step 5: Review Process

- **Automated Review**: Usually takes a few minutes to hours
- **Manual Review**: May take 1-7 days for new extensions
- **Common Issues**:
  - Missing manifest fields
  - Security issues
  - Privacy policy required
  - Screenshots required

## Step 6: After Approval

- Your extension will be available on addons.mozilla.org
- Users can install it directly
- You can update it by uploading new versions

## Step 7: Update Your Extension

When updating:

1. Update version in `manifest.json`
2. Create new ZIP package
3. Go to your add-on's developer dashboard
4. Click "Upload a new version"
5. Upload the new ZIP file
6. Add release notes

## Tips for Approval

1. **Clear Description**: Explain what the extension does clearly
2. **Screenshots**: Show the extension in action
3. **Privacy Policy**: Include one if you collect any data (even if you don't)
4. **Source Code**: Consider making it open source (already is!)
5. **Version Number**: Use semantic versioning (1.0.0, 1.0.1, etc.)

## Alternative: Self-Hosting

If you prefer not to publish on AMO:

1. Host the ZIP file on your website
2. Users can install via "Install Add-on From File" in Firefox
3. Note: Extensions installed this way won't auto-update

## Checklist Before Submission

- [ ] All files are in the ZIP (manifest.json, scripts, icons)
- [ ] Version number is correct in manifest.json
- [ ] Icons are present (16x16, 48x48, 128x128)
- [ ] No unnecessary files in ZIP
- [ ] Extension tested and working
- [ ] Description and summary written
- [ ] Screenshots prepared
- [ ] Privacy policy ready (if needed)

