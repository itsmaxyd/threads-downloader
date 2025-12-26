#!/bin/bash

# Package Chrome extension for distribution
# This script creates a zip file suitable for Chrome Web Store submission

echo "Packaging Threads Media Downloader for Chrome..."

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Output file name
OUTPUT_FILE="../threads-downloader-chrome-v1.1.3.zip"

# Files to include
FILES=(
  "manifest.json"
  "background.js"
  "content.js"
  "popup.js"
  "popup.html"
  "icon16.png"
  "icon48.png"
  "icon128.png"
  "README.md"
  "INSTALL.md"
  "DIFFERENCES.md"
)

# Check if all required files exist
echo "Checking required files..."
MISSING_FILES=0
for file in "${FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "ERROR: Missing required file: $file"
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
