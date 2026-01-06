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

// Add keyboard shortcuts for undo/redo
document.addEventListener('keydown', function(e) {
  // Ctrl+Z / Cmd+Z for undo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    perform_undo();
  }
  // Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y / Cmd+Y for redo
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    perform_redo();
  }
});
