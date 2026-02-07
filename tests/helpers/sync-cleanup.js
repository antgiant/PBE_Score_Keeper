function cleanupSyncModule(syncModule) {
  if (!syncModule) return;

  if (typeof syncModule.stopSync === 'function') {
    try {
      syncModule.stopSync(false);
    } catch (error) {
      // Ignore cleanup errors to avoid hiding test failures.
    }
  }

  if (typeof syncModule.stopRegistryHealthCheck === 'function') {
    try {
      syncModule.stopRegistryHealthCheck();
    } catch (error) {
      // Ignore cleanup errors to avoid hiding test failures.
    }
  }

  if (typeof syncModule.stopRegistryRetry === 'function') {
    try {
      syncModule.stopRegistryRetry();
    } catch (error) {
      // Ignore cleanup errors to avoid hiding test failures.
    }
  }

  if (typeof syncModule.clearRetryTimeout === 'function') {
    try {
      syncModule.clearRetryTimeout();
    } catch (error) {
      // Ignore cleanup errors to avoid hiding test failures.
    }
  }
}

module.exports = {
  cleanupSyncModule
};
