// Initialize display only after state is ready
var stateInitialized = false;

$(document).ready(function() {
  initialize_feedback_link();

  // Wait for state to be initialized before initializing display
  var checkStateReady = setInterval(function() {
    if (stateInitialized) {
      clearInterval(checkStateReady);
      initialize_display();
    }
  }, 50);
});

initialize_language_preference();
initialize_theme_preference();
initialize_ui_mode_preference();
initialize_storage_persistence();

// Yjs bundle loads synchronously and sets window.yjsModulesLoaded
// But just to be safe, we'll check and wait if needed
function initializeApp() {
  initialize_yjs();  // Initialize Yjs before state
  initialize_state();  // This will set stateInitialized = true when done
}

if (window.yjsModulesLoaded) {
  initializeApp();
} else {
  // Fallback: wait for event (shouldn't be needed with sync script)
  window.addEventListener('yjsModulesLoaded', initializeApp, { once: true });
}

/**
 * Update the footer feedback link with the current app version.
 * Supports Google Form prefill when data-feedback-version-entry is configured.
 */
function initialize_feedback_link() {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

  var feedbackLink = document.getElementById('footer_feedback_link');
  if (!feedbackLink) {
    return;
  }

  var baseUrl = feedbackLink.getAttribute('data-feedback-base-url') || feedbackLink.getAttribute('href');
  if (!baseUrl) {
    return;
  }

  var versionElement = document.querySelector('[data-i18n="footer.version"]');
  if (!versionElement) {
    return;
  }

  var version = versionElement.getAttribute('data-i18n-version');
  if (!version) {
    return;
  }

  var url;
  try {
    url = new URL(baseUrl, window.location.href);
  } catch (error) {
    return;
  }

  var versionEntryField = feedbackLink.getAttribute('data-feedback-version-entry');
  if (versionEntryField) {
    url.searchParams.set(versionEntryField, version);
    url.searchParams.set('usp', 'pp_url');
  } else {
    url.searchParams.set('app_version', version);
  }

  feedbackLink.setAttribute('href', url.toString());
}
