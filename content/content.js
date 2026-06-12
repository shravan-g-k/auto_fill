/**
 * AutoFill Pro — Content Script
 * Automatically detects and fills form fields on web pages.
 * Uses AutoFillMatcher for intelligent field matching and AutoFillCrypto for decryption.
 */

(() => {
  'use strict';

  // ---- Constants ----
  const STORAGE_KEY = '__autofill_pro_profiles__';
  const ACTIVE_PROFILE_KEY = '__autofill_pro_active__';
  const DISABLED_SITES_KEY = '__autofill_pro_disabled_sites__';
  const FILLED_ATTR = 'data-autofill-pro-filled';
  const HELPER_ATTR = 'data-autofill-pro-helper';
  const DEBOUNCE_MS = 500;

  let profileData = null;
  let isDisabledOnThisSite = false;
  let fillCount = 0;
  let mutationTimer = null;
  let hasShownNotification = false;

  // ---- Profile Loading ----

  /**
   * Load and decrypt the active profile from storage
   */
  async function loadActiveProfile() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY, ACTIVE_PROFILE_KEY, DISABLED_SITES_KEY], async (result) => {
        // Check if current site is disabled
        const disabledSites = result[DISABLED_SITES_KEY] || [];
        const currentHost = window.location.hostname;
        if (disabledSites.some(site => currentHost.includes(site))) {
          isDisabledOnThisSite = true;
          resolve(null);
          return;
        }

        const profiles = result[STORAGE_KEY] || {};
        const activeId = result[ACTIVE_PROFILE_KEY] || 'default';
        let profile = profiles[activeId];

        if (!profile) {
          resolve(null);
          return;
        }

        // Decrypt profile
        try {
          profile = await AutoFillCrypto.decryptProfile(profile);
        } catch (e) {
          console.warn('AutoFill Pro: Decryption error', e);
        }

        resolve(profile);
      });
    });
  }

  // ---- Field Value Mapping ----

  /**
   * Get the stored value for a matched field key, respecting toggles
   */
  function getValueForField(fieldKey, profile) {
    if (!profile || !fieldKey) return null;

    // Check toggle
    if (profile.toggles && profile.toggles[fieldKey] === false) {
      return null;
    }

    // Handle fullName as composite of firstName + lastName
    if (fieldKey === 'fullName') {
      const first = profile.firstName || '';
      const last = profile.lastName || '';
      const full = (first + ' ' + last).trim();
      return full || null;
    }

    const value = profile[fieldKey];
    return (value && value.trim().length > 0) ? value.trim() : null;
  }

  // ---- Field Filling ----

  /**
   * Set value on a form field and dispatch events for framework compatibility
   */
  function setFieldValue(field, value) {
    if (!value) return false;

    const tag = field.tagName.toLowerCase();
    const type = (field.getAttribute('type') || 'text').toLowerCase();

    // Skip disabled, readonly, or already filled fields
    if (field.disabled || field.readOnly) return false;
    if (field.getAttribute(FILLED_ATTR)) return false;

    // Skip fields that already have user-entered values
    if (field.value && field.value.trim().length > 0) return false;

    if (tag === 'select') {
      return fillSelect(field, value);
    }

    if (tag === 'textarea' || tag === 'input') {
      return fillInput(field, value);
    }

    return false;
  }

  /**
   * Fill a text input or textarea
   */
  function fillInput(field, value) {
    // Use native setter for React/Angular/Vue compatibility
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;
    const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;

    const setter = field.tagName === 'TEXTAREA' ? nativeTextareaValueSetter : nativeInputValueSetter;

    if (setter) {
      setter.call(field, value);
    } else {
      field.value = value;
    }

    // Dispatch events for framework reactivity
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new Event('blur', { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

    // Mark as filled
    field.setAttribute(FILLED_ATTR, 'true');

    // Add glow animation
    field.classList.add('autofill-pro-filled');
    setTimeout(() => field.classList.remove('autofill-pro-filled'), 1500);

    return true;
  }

  /**
   * Fill a <select> element by fuzzy-matching option text
   */
  function fillSelect(field, value) {
    const valueLower = value.toLowerCase().trim();
    const options = Array.from(field.options);

    // Try exact match first
    let match = options.find(opt =>
      opt.value.toLowerCase() === valueLower ||
      opt.textContent.trim().toLowerCase() === valueLower
    );

    // Try partial match
    if (!match) {
      match = options.find(opt => {
        const optText = opt.textContent.trim().toLowerCase();
        const optValue = opt.value.toLowerCase();
        return optText.includes(valueLower) || valueLower.includes(optText) ||
               optValue.includes(valueLower) || valueLower.includes(optValue);
      });
    }

    // Try abbreviation match (e.g., "CA" for "California")
    if (!match && valueLower.length <= 3) {
      match = options.find(opt => opt.value.toLowerCase() === valueLower);
    }

    if (match && match.value !== field.value) {
      field.value = match.value;
      field.dispatchEvent(new Event('change', { bubbles: true }));
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.setAttribute(FILLED_ATTR, 'true');
      field.classList.add('autofill-pro-filled');
      setTimeout(() => field.classList.remove('autofill-pro-filled'), 1500);
      return true;
    }

    return false;
  }

  // ---- File Input Helpers ----

  /**
   * Create a floating helper button near a file input
   */
  function createFileHelper(fileInput, fileType, base64Data, filename) {
    if (fileInput.getAttribute(HELPER_ATTR)) return;

    const isResume = fileType === 'resume';
    const label = isResume ? '📄 Attach Resume' : '📷 Attach Photo';

    const helper = document.createElement('button');
    helper.className = 'autofill-pro-file-helper';
    helper.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1v8M4 5l3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M1 10v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      ${label}
    `;

    helper.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        // Convert base64 data URL to File object
        const response = await fetch(base64Data);
        const blob = await response.blob();
        const file = new File([blob], filename, { type: blob.type });

        // Create a DataTransfer and set the file
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;

        // Dispatch change event
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        fileInput.dispatchEvent(new Event('input', { bubbles: true }));

        // Update helper to show success
        helper.innerHTML = '✅ Attached!';
        helper.style.background = 'linear-gradient(135deg, #059669, #22c55e)';
        setTimeout(() => helper.remove(), 2000);

        fillCount++;
      } catch (err) {
        console.error('AutoFill Pro: File attach failed', err);
        helper.innerHTML = '❌ Failed';
        helper.style.background = 'linear-gradient(135deg, #dc2626, #ef4444)';
        setTimeout(() => {
          helper.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v8M4 5l3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M1 10v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            ${label}
          `;
          helper.style.background = '';
        }, 2000);
      }
    });

    // Position the helper near the file input
    const parent = fileInput.parentElement;
    if (parent) {
      parent.style.position = parent.style.position || 'relative';
      parent.appendChild(helper);
    } else {
      fileInput.insertAdjacentElement('afterend', helper);
    }

    fileInput.setAttribute(HELPER_ATTR, 'true');
  }

  // ---- Main Scan & Fill ----

  /**
   * Scan the page for form fields and fill them
   */
  function scanAndFill() {
    if (!profileData || isDisabledOnThisSite) return;

    const fields = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]),textarea,select'
    );

    if (fields.length === 0) return;

    // Group fields by form (or page-level if no form)
    const formGroups = new Map();
    fields.forEach(field => {
      const form = field.closest('form') || document.body;
      if (!formGroups.has(form)) formGroups.set(form, []);
      formGroups.get(form).push(field);
    });

    let filledThisScan = 0;

    formGroups.forEach((formFields, form) => {
      formFields.forEach((field, index) => {
        // Skip already processed fields
        if (field.getAttribute(FILLED_ATTR) || field.getAttribute(HELPER_ATTR)) return;

        // Handle file inputs
        if (AutoFillMatcher.isFileInput(field)) {
          const fileType = AutoFillMatcher.classifyFileInput(field);
          if (fileType === 'resume' && profileData.resumeBase64) {
            createFileHelper(field, 'resume', profileData.resumeBase64, profileData.resumeFilename || 'resume.pdf');
          } else if (fileType === 'photo' && profileData.photoBase64) {
            createFileHelper(field, 'photo', profileData.photoBase64, profileData.photoFilename || 'photo.jpg');
          }
          return;
        }

        // Match field
        const match = AutoFillMatcher.matchField(field, formFields, index);
        if (!match) return;

        // Get value
        const value = getValueForField(match.fieldKey, profileData);
        if (!value) return;

        // Fill
        const filled = setFieldValue(field, value);
        if (filled) {
          filledThisScan++;
          fillCount++;
        }
      });
    });

    // Show notification if fields were filled
    if (filledThisScan > 0 && !hasShownNotification) {
      showFillNotification(filledThisScan);
      hasShownNotification = true;
    }
  }

  // ---- Notification ----

  function showFillNotification(count) {
    const notification = document.createElement('div');
    notification.className = 'autofill-pro-notification';
    notification.innerHTML = `
      <div class="autofill-pro-notification-icon">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l2.5 2.5L10 3" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      AutoFill Pro filled <span class="autofill-pro-notification-count">${count}</span> field${count !== 1 ? 's' : ''}
    `;

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 4000);
  }

  // ---- MutationObserver ----

  function setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      let hasNewNodes = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if the added node contains form fields
              if (node.querySelector && (
                node.querySelector('input, textarea, select') ||
                ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName)
              )) {
                hasNewNodes = true;
                break;
              }
            }
          }
        }
        if (hasNewNodes) break;
      }

      if (hasNewNodes) {
        // Debounce re-scan
        clearTimeout(mutationTimer);
        mutationTimer = setTimeout(() => {
          hasShownNotification = false; // Allow new notification for dynamic forms
          scanAndFill();
        }, DEBOUNCE_MS);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // ---- Message Listener ----

  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'PROFILE_UPDATED') {
        // Reload profile and re-scan
        loadActiveProfile().then(profile => {
          profileData = profile;
          // Clear filled markers so fields can be re-filled with new data
          document.querySelectorAll(`[${FILLED_ATTR}]`).forEach(el => {
            el.removeAttribute(FILLED_ATTR);
          });
          document.querySelectorAll(`[${HELPER_ATTR}]`).forEach(el => {
            el.removeAttribute(HELPER_ATTR);
          });
          document.querySelectorAll('.autofill-pro-file-helper').forEach(el => el.remove());
          hasShownNotification = false;
          fillCount = 0;
          scanAndFill();
        });
        sendResponse({ ok: true });
      }

      if (message.type === 'MANUAL_FILL') {
        hasShownNotification = false;
        scanAndFill();
        sendResponse({ ok: true, filled: fillCount });
      }

      if (message.type === 'GET_FILL_STATUS') {
        sendResponse({ filled: fillCount, disabled: isDisabledOnThisSite });
      }

      return true; // Keep message channel open for async
    });
  }

  // ---- Initialize ----

  async function init() {
    // Don't run on chrome:// or extension pages
    if (window.location.protocol === 'chrome-extension:' || window.location.protocol === 'chrome:') {
      return;
    }

    setupMessageListener();

    profileData = await loadActiveProfile();
    if (!profileData || isDisabledOnThisSite) return;

    // Initial scan
    scanAndFill();

    // Watch for dynamic forms
    setupMutationObserver();

    // Also scan after a short delay for late-rendering SPAs
    setTimeout(scanAndFill, 1500);
    setTimeout(scanAndFill, 3500);
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
