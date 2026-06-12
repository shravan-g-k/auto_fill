/**
 * AutoFill Pro — Popup Logic
 * Profile management, save/load, file handling, import/export
 */

(() => {
  'use strict';

  // ---- Constants ----
  const STORAGE_KEY = '__autofill_pro_profiles__';
  const ACTIVE_PROFILE_KEY = '__autofill_pro_active__';
  const MAX_PROFILES = 5;
  const PROFILE_FIELDS = [
    'firstName', 'lastName', 'email', 'phone', 'dob',
    'street', 'city', 'state', 'zip', 'country',
    'jobTitle', 'company', 'linkedin',
    'university', 'degree', 'gradYear', 'gpa'
  ];

  // ---- DOM References ----
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const profileSelect = $('#profileSelect');
  const addProfileBtn = $('#addProfileBtn');
  const deleteProfileBtn = $('#deleteProfileBtn');
  const saveBtn = $('#saveBtn');
  const exportBtn = $('#exportBtn');
  const importBtn = $('#importBtn');
  const importFile = $('#importFile');
  const statusBar = $('#statusBar');
  const statusText = $('#statusText');
  const toastContainer = $('#toastContainer');

  // File elements
  const resumeDropzone = $('#resumeDropzone');
  const resumeFile = $('#resumeFile');
  const resumeFileName = $('#resumeFileName');
  const resumeRemoveBtn = $('#resumeRemoveBtn');
  const photoDropzone = $('#photoDropzone');
  const photoFile = $('#photoFile');
  const photoFileName = $('#photoFileName');
  const photoRemoveBtn = $('#photoRemoveBtn');
  const photoPreview = $('#photoPreview');
  const photoPreviewImg = $('#photoPreviewImg');

  // Modal
  const newProfileModal = $('#newProfileModal');
  const newProfileName = $('#newProfileName');
  const cancelProfileBtn = $('#cancelProfileBtn');
  const confirmProfileBtn = $('#confirmProfileBtn');

  // ---- State ----
  let currentResumeBase64 = null;
  let currentResumeFilename = null;
  let currentPhotoBase64 = null;
  let currentPhotoFilename = null;

  // ---- Utilities ----
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function updateStatus(text, saved = false) {
    statusText.textContent = text;
    statusBar.classList.toggle('saved', saved);
  }

  // ---- Storage Helpers ----
  async function loadAllProfiles() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        resolve(result[STORAGE_KEY] || {});
      });
    });
  }

  async function saveAllProfiles(profiles) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [STORAGE_KEY]: profiles }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }

  async function getActiveProfileId() {
    return new Promise((resolve) => {
      chrome.storage.local.get([ACTIVE_PROFILE_KEY], (result) => {
        resolve(result[ACTIVE_PROFILE_KEY] || 'default');
      });
    });
  }

  async function setActiveProfileId(id) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [ACTIVE_PROFILE_KEY]: id }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }

  // ---- Create Default Profile ----
  function createEmptyProfile(name = 'Default Profile') {
    const profile = {
      id: name === 'Default Profile' ? 'default' : generateId(),
      name,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      toggles: {}
    };
    PROFILE_FIELDS.forEach(f => {
      profile[f] = '';
      profile.toggles[f] = true;
    });
    profile.resumeBase64 = '';
    profile.resumeFilename = '';
    profile.photoBase64 = '';
    profile.photoFilename = '';
    return profile;
  }

  // ---- Populate Profile Dropdown ----
  async function refreshProfileDropdown() {
    const profiles = await loadAllProfiles();
    const activeId = await getActiveProfileId();
    profileSelect.innerHTML = '';

    const ids = Object.keys(profiles);
    if (ids.length === 0) {
      const def = createEmptyProfile();
      profiles[def.id] = def;
      await saveAllProfiles(profiles);
      ids.push(def.id);
    }

    ids.forEach(id => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = profiles[id].name;
      if (id === activeId) opt.selected = true;
      profileSelect.appendChild(opt);
    });

    // Ensure active profile exists
    if (!profiles[activeId]) {
      await setActiveProfileId(ids[0]);
      profileSelect.value = ids[0];
    }
  }

  // ---- Load Profile Into Form ----
  async function loadProfileIntoForm(profileId) {
    const profiles = await loadAllProfiles();
    let profile = profiles[profileId];
    if (!profile) return;

    // Decrypt
    try {
      profile = await AutoFillCrypto.decryptProfile(profile);
    } catch (e) {
      console.warn('Decryption skipped:', e);
    }

    // Fill text fields
    PROFILE_FIELDS.forEach(field => {
      const input = $(`#${field}`);
      if (input) input.value = profile[field] || '';
    });

    // Toggles
    $$('.toggle-btn').forEach(btn => {
      const field = btn.dataset.field;
      const isActive = profile.toggles ? profile.toggles[field] !== false : true;
      btn.classList.toggle('active', isActive);
    });

    // Resume
    currentResumeBase64 = profile.resumeBase64 || null;
    currentResumeFilename = profile.resumeFilename || null;
    if (currentResumeBase64) {
      resumeFileName.textContent = currentResumeFilename || 'resume.pdf';
      resumeDropzone.classList.add('has-file');
      resumeRemoveBtn.hidden = false;
    } else {
      resumeFileName.textContent = '';
      resumeDropzone.classList.remove('has-file');
      resumeRemoveBtn.hidden = true;
    }

    // Photo
    currentPhotoBase64 = profile.photoBase64 || null;
    currentPhotoFilename = profile.photoFilename || null;
    if (currentPhotoBase64) {
      photoFileName.textContent = currentPhotoFilename || 'photo.jpg';
      photoDropzone.classList.add('has-file');
      photoRemoveBtn.hidden = false;
      photoPreview.hidden = false;
      photoPreviewImg.src = currentPhotoBase64;
      photoDropzone.querySelector('.photo-upload-icon').style.display = 'none';
    } else {
      photoFileName.textContent = '';
      photoDropzone.classList.remove('has-file');
      photoRemoveBtn.hidden = true;
      photoPreview.hidden = true;
      photoDropzone.querySelector('.photo-upload-icon').style.display = '';
    }

    // Status
    if (profile.updatedAt) {
      const d = new Date(profile.updatedAt);
      updateStatus(`Last saved: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`, true);
    } else {
      updateStatus('No data saved yet', false);
    }
  }

  // ---- Save Current Form To Profile ----
  async function saveCurrentProfile() {
    const activeId = profileSelect.value;
    const profiles = await loadAllProfiles();
    let profile = profiles[activeId] || createEmptyProfile();
    profile.id = activeId;
    profile.updatedAt = new Date().toISOString();

    // Read text fields
    PROFILE_FIELDS.forEach(field => {
      const input = $(`#${field}`);
      if (input) profile[field] = input.value.trim();
    });

    // Read toggles
    profile.toggles = profile.toggles || {};
    $$('.toggle-btn').forEach(btn => {
      profile.toggles[btn.dataset.field] = btn.classList.contains('active');
    });

    // Files
    profile.resumeBase64 = currentResumeBase64 || '';
    profile.resumeFilename = currentResumeFilename || '';
    profile.photoBase64 = currentPhotoBase64 || '';
    profile.photoFilename = currentPhotoFilename || '';

    // Encrypt
    try {
      profile = await AutoFillCrypto.encryptProfile(profile);
    } catch (e) {
      console.warn('Encryption skipped:', e);
    }

    profiles[activeId] = profile;
    await saveAllProfiles(profiles);

    // Notify background to update other tabs
    try {
      chrome.runtime.sendMessage({ type: 'PROFILE_UPDATED', profileId: activeId });
    } catch (e) { /* background may not be running */ }

    updateStatus(`Saved just now`, true);
    showToast('Profile saved successfully!', 'success');

    // Animate save button
    saveBtn.classList.add('saving');
    setTimeout(() => saveBtn.classList.remove('saving'), 600);
  }

  // ---- File Handling ----
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // NOTE: We do NOT use dropzone.click() -> fileInput.click() because
  // that causes the popup to lose focus and close when the OS file picker opens.
  // Instead, the native <input type="file"> overlays the dropzone invisibly,
  // so the user's click goes directly to the browser's own file input.
  // Chrome keeps the popup alive when its own file input triggers the dialog.

  function setupNativeFileInput(fileInput, onFile) {
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (file) {
        await onFile(file);
        // Auto-save after file selection so user doesn't lose data if popup closes
        await saveCurrentProfile();
      }
    });
  }

  async function handleResumeFile(file) {
    if (file.size > 10 * 1024 * 1024) {
      showToast('File too large (max 10MB)', 'error');
      return;
    }
    currentResumeBase64 = await fileToBase64(file);
    currentResumeFilename = file.name;
    resumeFileName.textContent = file.name;
    resumeDropzone.classList.add('has-file');
    resumeRemoveBtn.hidden = false;
    showToast('Resume loaded', 'info');
  }

  async function handlePhotoFile(file) {
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image too large (max 5MB)', 'error');
      return;
    }
    currentPhotoBase64 = await fileToBase64(file);
    currentPhotoFilename = file.name;
    photoFileName.textContent = file.name;
    photoDropzone.classList.add('has-file');
    photoRemoveBtn.hidden = false;
    photoPreview.hidden = false;
    photoPreviewImg.src = currentPhotoBase64;
    photoDropzone.querySelector('.photo-upload-icon').style.display = 'none';
    showToast('Photo loaded', 'info');
  }

  // ---- Section Collapse/Expand ----
  function setupSections() {
    $$('.section-header').forEach(header => {
      header.addEventListener('click', () => {
        const isExpanded = header.getAttribute('aria-expanded') === 'true';
        header.setAttribute('aria-expanded', !isExpanded);
        const content = header.nextElementSibling;
        content.classList.toggle('collapsed', isExpanded);
      });
    });
  }

  // ---- Toggle Buttons ----
  function setupToggles() {
    $$('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        btn.classList.toggle('active');
      });
    });
  }

  // ---- Import / Export ----
  async function exportProfile() {
    const activeId = profileSelect.value;
    const profiles = await loadAllProfiles();
    const profile = profiles[activeId];
    if (!profile) {
      showToast('No profile to export', 'error');
      return;
    }

    // Decrypt before export so user gets readable JSON
    let decrypted;
    try {
      decrypted = await AutoFillCrypto.decryptProfile(profile);
    } catch (e) {
      decrypted = profile;
    }

    const blob = new Blob([JSON.stringify(decrypted, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autofill-pro-${decrypted.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Profile exported!', 'success');
  }

  async function importProfile(file) {
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (!imported.name) {
        showToast('Invalid profile file', 'error');
        return;
      }

      const profiles = await loadAllProfiles();
      if (Object.keys(profiles).length >= MAX_PROFILES) {
        showToast(`Max ${MAX_PROFILES} profiles allowed`, 'error');
        return;
      }

      imported.id = generateId();
      imported.updatedAt = new Date().toISOString();

      // Encrypt before storing
      let encrypted;
      try {
        encrypted = await AutoFillCrypto.encryptProfile(imported);
      } catch (e) {
        encrypted = imported;
      }

      profiles[encrypted.id] = encrypted;
      await saveAllProfiles(profiles);
      await setActiveProfileId(encrypted.id);
      await refreshProfileDropdown();
      await loadProfileIntoForm(encrypted.id);
      showToast(`Imported "${imported.name}"`, 'success');
    } catch (e) {
      showToast('Failed to import profile', 'error');
      console.error(e);
    }
  }

  // ---- Profile Management ----
  function showNewProfileModal() {
    newProfileModal.hidden = false;
    newProfileName.value = '';
    newProfileName.focus();
  }

  function hideNewProfileModal() {
    newProfileModal.hidden = true;
  }

  async function createNewProfile() {
    const name = newProfileName.value.trim();
    if (!name) {
      showToast('Please enter a profile name', 'error');
      return;
    }

    const profiles = await loadAllProfiles();
    if (Object.keys(profiles).length >= MAX_PROFILES) {
      showToast(`Max ${MAX_PROFILES} profiles allowed`, 'error');
      hideNewProfileModal();
      return;
    }

    const profile = createEmptyProfile(name);
    profiles[profile.id] = profile;
    await saveAllProfiles(profiles);
    await setActiveProfileId(profile.id);
    await refreshProfileDropdown();
    await loadProfileIntoForm(profile.id);
    hideNewProfileModal();
    showToast(`Created "${name}"`, 'success');
  }

  async function deleteCurrentProfile() {
    const activeId = profileSelect.value;
    if (activeId === 'default') {
      showToast("Can't delete the Default Profile", 'error');
      return;
    }

    const profiles = await loadAllProfiles();
    const name = profiles[activeId]?.name || 'Profile';
    delete profiles[activeId];

    const remaining = Object.keys(profiles);
    if (remaining.length === 0) {
      const def = createEmptyProfile();
      profiles[def.id] = def;
      remaining.push(def.id);
    }

    await saveAllProfiles(profiles);
    await setActiveProfileId(remaining[0]);
    await refreshProfileDropdown();
    await loadProfileIntoForm(remaining[0]);
    showToast(`Deleted "${name}"`, 'info');
  }

  // ---- Event Listeners ----
  function setupEventListeners() {
    // Save
    saveBtn.addEventListener('click', saveCurrentProfile);

    // Profile switch
    profileSelect.addEventListener('change', async () => {
      await setActiveProfileId(profileSelect.value);
      await loadProfileIntoForm(profileSelect.value);
    });

    // Profile CRUD
    addProfileBtn.addEventListener('click', showNewProfileModal);
    deleteProfileBtn.addEventListener('click', deleteCurrentProfile);
    cancelProfileBtn.addEventListener('click', hideNewProfileModal);
    confirmProfileBtn.addEventListener('click', createNewProfile);
    newProfileName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') createNewProfile();
      if (e.key === 'Escape') hideNewProfileModal();
    });

    // File uploads — native file inputs overlay the dropzones
    setupNativeFileInput(resumeFile, handleResumeFile);
    setupNativeFileInput(photoFile, handlePhotoFile);

    resumeRemoveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentResumeBase64 = null;
      currentResumeFilename = null;
      resumeFileName.textContent = '';
      resumeDropzone.classList.remove('has-file');
      resumeRemoveBtn.hidden = true;
      resumeFile.value = '';
    });

    photoRemoveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentPhotoBase64 = null;
      currentPhotoFilename = null;
      photoFileName.textContent = '';
      photoDropzone.classList.remove('has-file');
      photoRemoveBtn.hidden = true;
      photoFile.value = '';
      photoPreview.hidden = true;
      photoDropzone.querySelector('.photo-upload-icon').style.display = '';
    });

    // Import / Export
    exportBtn.addEventListener('click', exportProfile);
    importBtn.addEventListener('click', () => {
      // For import, opening in a full tab is safest to avoid popup close
      if (isPopupMode()) {
        openInTab();
        return;
      }
      importFile.click();
    });
    importFile.addEventListener('change', () => {
      const file = importFile.files[0];
      if (file) importProfile(file);
      importFile.value = '';
    });

    // Open in Tab button
    const openInTabBtn = $('#openInTabBtn');
    if (openInTabBtn) {
      openInTabBtn.addEventListener('click', openInTab);
    }

    // Keyboard shortcut: Ctrl+S to save
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentProfile();
      }
    });
  }

  // ---- Popup vs Tab Mode ----
  function isPopupMode() {
    // Chrome extension popups have a small viewport and no window.opener
    return window.innerWidth <= 500 && !window.location.search.includes('tab=1');
  }

  function openInTab() {
    const url = chrome.runtime.getURL('popup/popup.html?tab=1');
    chrome.tabs.create({ url });
    window.close(); // Close the popup
  }

  // ---- Initialize ----
  async function init() {
    // Detect full-tab mode
    if (window.location.search.includes('tab=1')) {
      document.body.classList.add('full-tab');
    }

    setupSections();
    setupToggles();
    setupEventListeners();
    await refreshProfileDropdown();
    const activeId = await getActiveProfileId();
    await loadProfileIntoForm(activeId);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
