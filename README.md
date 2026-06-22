# AutoFill Pro Extension

## Overview
AutoFill Pro is a privacy‑first Chrome extension that automatically detects and fills web forms using **locally stored, encrypted** user data. All personal information (including resumes and photos) stays **offline**, encrypted with **AES‑GCM**, ensuring complete privacy.

## Directory Structure
```
form_fill/
├─ .git/                     # Version control metadata
├─ background/               # Service worker & background scripts
│   └─ background.js         # Handles context‑menu creation, storage, and messaging
├─ content/                  # Content scripts injected into web pages
│   ├─ content.js            # Main script that scans the page for form fields
│   ├─ content.css           # Minimal styling applied to injected UI elements
│   └─ ... (additional helpers)
├─ icons/                    # Extension icons in various sizes
│   ├─ icon16.png
│   ├─ icon48.png
│   └─ icon128.png
├─ popup/                    # UI shown when the extension icon is clicked
│   ├─ popup.html            # HTML markup of the profile manager
│   ├─ popup.css             # Premium dark‑glassmorphism styling
│   └─ popup.js              # Interaction logic (profile selection, encryption)
├─ utils/                    # Shared utility libraries
│   ├─ crypto.js             # AES‑GCM encryption/decryption helpers
│   └─ matching.js           # Smart field‑matching algorithms (3‑strategy engine)
├─ test-form.html            # Sample form used for manual testing
└─ manifest.json             # Chrome extension manifest (manifest v3)
```

## How It Works

1. **Manifest (manifest.json)** – Declares permissions (`storage`, `activeTab`, `scripting`, `contextMenus`), registers the background service worker, and defines the content script that runs on every page.
2. **Background Service Worker** (`background/background.js`)
   * Creates a context‑menu entry "Manage AutoFill Profiles".
   * Listens for messages from the popup or content scripts.
   * Stores encrypted user profiles in `chrome.storage.local`.
3. **Popup UI** (`popup/*`)
   * Provides a sleek, dark‑mode, glass‑morphism interface for adding, editing, and selecting profiles.
   * When a profile is saved, it is encrypted with a master key derived from the user's passphrase via PBKDF2 and stored locally.
4. **Content Script** (`content/content.js`)
   * Runs after the page loads (`document_idle`).
   * Scans the DOM for input fields, applies the **3‑strategy matching engine** (exact name, fuzzy similarity, and label‑value heuristics) located in `utils/matching.js`.
   * Requests the matching encrypted profile from the background worker, decrypts it using `utils/crypto.js`, and auto‑populates the fields.
5. **Utility Libraries**
   * `crypto.js` – Implements AES‑GCM encryption, decryption, and key derivation.
   * `matching.js` – Contains the field‑matching logic that works across diverse form layouts.
6. **Testing** (`test-form.html`)
   * A simple HTML page with various input types to verify the extension’s auto‑fill behavior during development.

## Usage
1. Load the extension in Chrome via **Developer mode → Load unpacked** and select the `form_fill` folder.
2. Click the extension icon to open the popup, create a profile, and set a master password.
3. Visit any web form – the extension will automatically fill matching fields based on the stored profile.

## Security Model
* All data is encrypted **client‑side only**; no network requests are made.
* The master password never leaves the browser; it is used only to derive an encryption key.
* Encrypted blobs are stored in `chrome.storage.local`, which is sandboxed per‑extension.

## Development
* Run `npm run lint` (if you add a build step) to keep the code tidy.
* Modify the matching heuristics in `utils/matching.js` to improve detection for new form patterns.
* UI tweaks can be made in `popup/popup.css` – the current design follows a premium dark glassmorphism aesthetic.

---
*Created with love for privacy‑first developers.*
