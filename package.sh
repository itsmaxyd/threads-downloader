#!/bin/bash
# Package script for Firefox Add-on submission

VERSION=$(grep '"version"' manifest.json | cut -d'"' -f4)
PACKAGE_NAME="threads-downloader-v${VERSION}.zip"

echo "Packaging Threads Media Downloader v${VERSION}..."

# Remove old package if exists
rm -f threads-downloader-*.zip

# Create ZIP with only necessary files
zip -r "${PACKAGE_NAME}" \
  manifest.json \
  background.js \
  content.js \
  popup.html \
  popup.js \
  icon16.png \
  icon48.png \
  icon128.png \
  -x "*.git*" "*.md" "*.DS_Store" "*.gitignore" "LICENSE" "INSTALL.md" "README.md" "SECURITY.md" "PACKAGING.md" "package.sh"

if [ $? -eq 0 ]; then
  echo "✅ Package created: ${PACKAGE_NAME}"
  echo "📦 File size: $(du -h "${PACKAGE_NAME}" | cut -f1)"
  echo ""
  echo "Ready for submission to Firefox Add-ons!"
  echo "Upload this file at: https://addons.mozilla.org/developers/addon/submit/"
else
  echo "❌ Error creating package"
  exit 1
fi

