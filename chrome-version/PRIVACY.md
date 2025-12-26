# Privacy Policy for Threads Media Downloader Chrome Extension

**Last Updated: December 26, 2025**

## Overview

Threads Media Downloader ("we", "our", or "us") is a Chrome extension that allows users to download media content from Threads (threads.net) user profiles. This Privacy Policy explains how we collect, use, and protect your information.

By installing and using this extension, you agree to the practices described in this Privacy Policy.

---

## What Data We Collect

### 1. Data You Provide Directly

- **Custom Usernames**: If you manually enter a username in the extension settings, this is stored locally in your browser's storage.
- **Queue Files**: When you load a queue file containing media URLs, the URLs are processed locally.

### 2. Data Collected Automatically

- **Download Settings**: Your cooldown preferences (between downloads and after 100 downloads) are stored locally in Chrome's storage API.
- **Download State**: If you stop a download session, the remaining queue and progress are temporarily stored locally to allow resumption. This data is automatically cleared when downloads complete.
- **Usage Statistics**: We do NOT collect any usage analytics, click tracking, or behavioral data.

### 3. Data Processed During Use

- **Media URLs**: When you download media, the extension processes URLs from Threads pages. These URLs are processed locally and sent directly to Chrome's download API.
- **Page Content**: The content script temporarily accesses the current Threads page to extract media URLs. This data is processed locally and is not stored or transmitted to any external servers (other than the media files being downloaded).

### 4. Data We Do NOT Collect

- We do NOT collect, store, or transmit:
  - Your Threads account credentials
  - Your browsing history
  - Personal identification information
  - Media content you download (files go directly to your device)
  - Any data to third-party servers

---

## How We Use Your Data

The data collected is used exclusively for the following purposes:

1. **Download Functionality**: To enable media download from Threads profiles
2. **Resume Feature**: To remember incomplete download sessions (stored locally)
3. **User Preferences**: To remember your cooldown settings between sessions
4. **Extension Operation**: To function as intended within your browser

---

## How Data Is Shared

**We do NOT share any data with third parties.** 

- All data processing happens locally on your device
- Media files are downloaded directly from Threads' CDN to your device
- No data is transmitted to our servers or any third-party servers
- No data is sold, rented, or traded

---

## Security Measures

We implement the following security measures to protect your data:

### 1. Data Storage Security

- All stored data uses Chrome's local storage API
- Download state and settings are stored only on your device
- Data is automatically cleared when no longer needed

### 2. Input Validation

- All URLs are validated before processing
- Filenames are sanitized to prevent path traversal attacks
- Only HTTPS URLs from approved CDN domains are allowed

### 3. Domain Restrictions

- The extension only operates on threads.net and threads.com domains
- Media is only downloaded from approved CDN domains (scontent, fbcdn, instagram, threads)

### 4. No External Data Transmission

- No network requests to external servers (other than downloading media from Threads CDN)
- No analytics or tracking pixels
- No third-party SDKs or libraries that transmit data

---

## User Rights Regarding Data

As a user of this extension, you have the following rights:

### 1. Right to Access

You can view all data stored by the extension by:
- Opening the extension popup
- Checking your saved settings
- Viewing Chrome's extension storage via chrome://extensions → Developer mode → Inspect views

### 2. Right to Delete

You can delete your data at any time:

**Option A - Clear Download State:**
1. Open the extension popup
2. Click "Clear Queue" button

**Option B - Reset All Settings:**
1. Go to Chrome → Settings → Extensions
2. Find Threads Media Downloader
3. Click "Remove from Chrome" to uninstall
4. This deletes all locally stored data

**Option C - Manual Deletion:**
1. Go to `chrome://settings/cookies`
2. Search for "extension" or clear site data for threads.net

### 3. Right to Control

- **Opt-out of Resume Feature**: Simply clear the queue when done downloading
- **Control Download Settings**: Adjust cooldown times or use incognito mode
- **Limit Data Collection**: Use the extension without saving any custom settings

### 4. Right to Export

You can export your download queue as a text file using the "Prepare Queue" feature.

---

## Data Retention

- **Download Settings**: Retained until you uninstall the extension or change them
- **Download State**: Retained only during active or paused download sessions; automatically cleared when complete
- **Custom Usernames**: Retained until you clear them or uninstall the extension

---

## Children's Privacy

This extension is not intended for use by individuals under the age of 13. We do not knowingly collect data from children.

---

## Changes to This Privacy Policy

We may update this Privacy Policy from time to time. Changes will be:
1. Updated in the GitHub repository
2. Noted in the extension's changelog
3. Effective immediately upon posting

We encourage you to review this Privacy Policy periodically.

---

## Contact Information

For questions about this Privacy Policy or our data practices:

- **GitHub Issues**: [Report an Issue](https://github.com/itsmaxyd/threads-downloader/issues)
- **Repository**: https://github.com/itsmaxyd/threads-downloader

---

## Disclaimer

This extension is an independent tool and is not affiliated with, endorsed by, or sponsored by Meta (Threads). Users are responsible for ensuring they have the right to download content they access through this extension.

By using this extension, you agree to use it responsibly and in compliance with Threads' Terms of Service.
