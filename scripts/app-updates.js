/**
 * App Updates & Cache Management
 * Handles:
 * - Checking for app updates
 * - Clearing cache and restarting
 * - Periodic background sync for auto-updates (when installed as PWA)
 */

var APP_VERSION = "2.21.0";

/**
 * Check for updates by comparing service worker versions
 * Shows toast notification with update status
 */
function checkForUpdates() {
  if (!navigator || !navigator.serviceWorker) {
    showUpdateNotification(t("advanced.no_update_available"), "info");
    return;
  }

  var statusElement = document.getElementById("check_updates_button");
  if (statusElement) {
    statusElement.textContent = t("advanced.checking_updates");
    statusElement.disabled = true;
  }

  navigator.serviceWorker.getRegistration()
    .then(function(registration) {
      if (!registration) {
        showUpdateNotification(t("advanced.no_update_available"), "info");
        resetUpdateButton();
        return;
      }

      // Force check for updates
      registration.update().then(function() {
        if (registration.waiting) {
          // Update is waiting to be activated
          showUpdateNotification(t("advanced.update_available"), "warning");
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        } else if (registration.installing) {
          // Update is being downloaded
          showUpdateNotification(t("advanced.checking_updates"), "info");
        } else {
          // Already on latest version
          showUpdateNotification(t("advanced.no_update_available"), "success");
        }
        resetUpdateButton();
      }).catch(function(error) {
        console.warn("Error checking for updates:", error);
        showUpdateNotification(t("advanced.no_update_available"), "info");
        resetUpdateButton();
      });
    })
    .catch(function(error) {
      console.warn("Error getting service worker registration:", error);
      showUpdateNotification(t("advanced.no_update_available"), "info");
      resetUpdateButton();
    });
}

/**
 * Clear all app caches and restart the application
 */
function clearCacheAndRestart() {
  var confirmed = confirm(
    t("advanced.clear_cache") + "\n\nThis will delete all cached data and restart the app."
  );
  if (!confirmed) {
    return;
  }

  var statusElement = document.getElementById("clear_cache_button");
  if (statusElement) {
    statusElement.textContent = t("advanced.cache_cleared");
    statusElement.disabled = true;
  }

  // Get all cache names and delete them
  caches.keys().then(function(cacheNames) {
    return Promise.all(
      cacheNames.map(function(cacheName) {
        return caches.delete(cacheName);
      })
    );
  }).then(function() {
    showUpdateNotification(t("advanced.cache_cleared"), "success");
    // Wait a moment for notification to show, then reload
    setTimeout(function() {
      window.location.reload();
    }, 1000);
  }).catch(function(error) {
    console.warn("Error clearing cache:", error);
    resetClearCacheButton();
  });
}

/**
 * Reset the check updates button to normal state
 */
function resetUpdateButton() {
  var statusElement = document.getElementById("check_updates_button");
  if (statusElement) {
    statusElement.textContent = t("advanced.check_updates");
    statusElement.disabled = false;
  }
}

/**
 * Reset the clear cache button to normal state
 */
function resetClearCacheButton() {
  var statusElement = document.getElementById("clear_cache_button");
  if (statusElement) {
    statusElement.textContent = t("advanced.clear_cache");
    statusElement.disabled = false;
  }
}

/**
 * Show a toast notification with update status
 * @param {string} message - The message to display
 * @param {string} type - The type of notification: 'info', 'success', 'warning', 'error'
 */
function showUpdateNotification(message, type) {
  type = type || "info";
  
  var notification = document.createElement("div");
  notification.className = "update-notification update-notification-" + type;
  notification.textContent = message;
  notification.style.cssText = "position: fixed; bottom: 20px; right: 20px; padding: 12px 20px; background-color: var(--bg-secondary, #f5f5f5); color: var(--text-primary, #333); border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 10000; font-size: 14px; max-width: 300px; word-wrap: break-word;";
  
  if (type === "success") {
    notification.style.borderLeft = "4px solid #4caf50";
  } else if (type === "warning") {
    notification.style.borderLeft = "4px solid #ff9800";
  } else if (type === "error") {
    notification.style.borderLeft = "4px solid #f44336";
  } else {
    notification.style.borderLeft = "4px solid #2196f3";
  }
  
  document.body.appendChild(notification);
  
  setTimeout(function() {
    notification.style.opacity = "0";
    notification.style.transition = "opacity 0.3s ease-out";
    setTimeout(function() {
      notification.remove();
    }, 300);
  }, 4000);
}

/**
 * Register for periodic background sync
 * Checks for updates every 24 hours when the app is installed as a PWA
 * This runs in the background without user interaction
 */
function registerPeriodicBackgroundSync() {
  if (!navigator || !navigator.serviceWorker || !navigator.serviceWorker.ready) {
    return;
  }

  navigator.serviceWorker.ready.then(function(registration) {
    if (!registration.periodicSync) {
      // Periodic Background Sync not supported
      return;
    }

    // Register 24-hour periodic sync
    registration.periodicSync.register("check-app-updates", {
      minInterval: 24 * 60 * 60 * 1000  // 24 hours
    }).catch(function(error) {
      console.log("Periodic sync registration failed:", error);
    });
  }).catch(function(error) {
    console.log("Service worker ready failed:", error);
  });
}

// Initialize periodic background sync on app load
if (typeof window !== "undefined" && document.readyState === "complete") {
  registerPeriodicBackgroundSync();
} else if (typeof window !== "undefined") {
  window.addEventListener("load", registerPeriodicBackgroundSync);
}
