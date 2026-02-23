#!/bin/bash

# Package Chrome extension for distribution
# This script creates a zip file suitable for Chrome Web Store submission

echo "Packaging Threads Media Downloader for Chrome..."

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Get version from manifest.json
VERSION=$(grep '"version"' manifest.json | cut -d'"' -f4)

# Output file name
OUTPUT_FILE="../threads-downloader-chrome-v${VERSION}.zip"

# Files and directories to include
FILES=(
  "manifest.json"
  "background.js"
  "content.js"
  "popup.js"
  "popup.html"
  "assets/"
)

# Check if all required files exist
echo "Checking required files..."
MISSING_FILES=0
for file in "${FILES[@]}"; do
  if [ ! -f "$file" ] && [ ! -d "$file" ]; then
    echo "ERROR: Missing required file/directory: $file"
    MISSING_FILES=1
  fi
done

if [ $MISSING_FILES -eq 1 ]; then
  echo "ERROR: Cannot package extension - missing required files"
  exit 1
fi

# Remove old package if it exists
if [ -f "$OUTPUT_FILE" ]; then
  echo "Removing old package..."
  rm "$OUTPUT_FILE"
fi

# Create the zip file
echo "Creating package..."
zip -r "$OUTPUT_FILE" "${FILES[@]}" \
  -x "*.git*" \
  -x "*.DS_Store" \
  -x "*~" \
  -x "*.swp"

# Check if zip was successful
if [ $? -eq 0 ]; then
  echo "✓ Package created successfully: $OUTPUT_FILE"
  
  # Show file size
  SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
  echo "  Package size: $SIZE"
  
  # List contents
  echo ""
  echo "Package contents:"
  unzip -l "$OUTPUT_FILE"
  
  echo ""
  echo "Next steps:"
  echo "1. Test the extension by loading it in Chrome"
  echo "2. Visit chrome://extensions/ and enable Developer mode"
  echo "3. Click 'Load unpacked' and select the chrome-version directory"
  echo "4. Test all functionality"
  echo "5. Upload $OUTPUT_FILE to Chrome Web Store Developer Dashboard"
  
else
  echo "ERROR: Failed to create package"
  exit 1
fi
