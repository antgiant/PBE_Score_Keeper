function initialize_storage_persistence() {
  if (typeof navigator === "undefined") {
    return;
  }

  if (!navigator.storage || !navigator.storage.persisted) {
    return;
  }

  navigator.storage
    .persisted()
    .then(function (is_persisted) {
      if (is_persisted) {
        return;
      }
      return navigator.storage.persist();
    })
    .catch(function () {});
}
