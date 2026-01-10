// Initialize display only after state is ready
var stateInitialized = false;

$(document).ready(function() {
  // Wait for state to be initialized before initializing display
  var checkStateReady = setInterval(function() {
    if (stateInitialized) {
      clearInterval(checkStateReady);
      initialize_display();
    }
  }, 50);
});

initialize_theme_preference();
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

