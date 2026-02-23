#!/bin/bash

# Package Microsoft Edge extension for Threads Downloader
# This creates a package compatible with Edge desktop and Kiwi Browser on Android
# 
# Edge uses the same Manifest V3 format as Chrome, so we package from chrome-version
# Kiwi Browser (Android) can directly load Chrome/Edge extensions

set -e

# Get the version from manifest
VERSION=$(grep '"version"' chrome-version/manifest.json | cut -d'"' -f4)
PACKAGE_NAME="threads-downloader-edge-v${VERSION}.zip"

echo "=========================================="
echo "Threads Downloader - Edge Package Builder"
echo "=========================================="
echo ""
echo "Version: $VERSION"
echo "Package: $PACKAGE_NAME"
echo ""

# Remove old package if exists
if [ -f "$PACKAGE_NAME" ]; then
    echo "Removing old package..."
    rm "$PACKAGE_NAME"
fi

# Create new package from chrome-version directory
# Edge uses the same extension format as Chrome (Manifest V3)
echo "Creating Edge package from chrome-version..."
cd chrome-version
zip -r ../$PACKAGE_NAME manifest.json background.js content.js popup.html popup.js assets
cd ..

echo ""
echo "=========================================="
echo "Package created successfully!"
echo "=========================================="
echo ""
echo "Output: $PACKAGE_NAME"
echo ""
echo "Installation Options:"
echo "--------------------"
echo ""
echo "1. Microsoft Edge Desktop:"
echo "   - Go to edge://extensions/"
echo "   - Enable 'Developer mode'"
echo "   - Click 'Load unpacked' and select chrome-version folder"
echo "   - Or extract $PACKAGE_NAME and load the folder"
echo ""
echo "2. Kiwi Browser (Android - Recommended for mobile):"
echo "   - Install Kiwi Browser from Google Play Store"
echo "   - Go to kiwi://extensions/"
echo "   - Enable 'Developer mode'"
echo "   - Click 'Load unpacked' or drag and drop $PACKAGE_NAME"
echo ""
echo "Note: Microsoft Edge for Android/iOS has limited extension support"
echo "      (curated extensions only). Use Kiwi Browser for mobile support."
echo ""
