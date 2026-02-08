var BLOCKS_MANAGER_OVERLAY_ID = "blocks-manager-overlay";
var blocksManagerLastFocus = null;

function update_block_manager_labels(overlay) {
  if (!overlay || typeof t !== "function") {
    return;
  }
  var title = overlay.querySelector("#blocks-manager-title");
  var closeButton = overlay.querySelector(".block-manager-close");
  if (title) {
    title.textContent = t("blocks.manage_title");
  }
  if (closeButton) {
    closeButton.textContent = t("blocks.manage_close");
  }
}

function closeBlockManagerDialog() {
  if (typeof document === "undefined") {
    return;
  }
  var overlay = document.getElementById(BLOCKS_MANAGER_OVERLAY_ID);
  if (!overlay) {
    return;
  }
  overlay.style.display = "none";
  overlay.setAttribute("aria-hidden", "true");
  if (blocksManagerLastFocus && typeof blocksManagerLastFocus.focus === "function") {
    blocksManagerLastFocus.focus();
  }
  blocksManagerLastFocus = null;
}

function ensure_block_manager_overlay() {
  if (typeof document === "undefined") {
    return null;
  }
  var overlay = document.getElementById(BLOCKS_MANAGER_OVERLAY_ID);
  if (overlay) {
    return overlay;
  }
  overlay = document.createElement("div");
  overlay.id = BLOCKS_MANAGER_OVERLAY_ID;
  overlay.className = "sync-dialog-overlay blocks-manager-overlay";
  overlay.style.display = "none";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = '<div class="sync-dialog block-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="blocks-manager-title">' +
    '<div class="block-manager-dialog-header">' +
      '<h2 id="blocks-manager-title"></h2>' +
      '<button type="button" class="config-add-btn block-manager-close"></button>' +
    '</div>' +
    '<div class="block-manager-dialog-body" id="blocks-manager-body"></div>' +
  '</div>';
  document.body.appendChild(overlay);

  var closeButton = overlay.querySelector(".block-manager-close");
  if (closeButton) {
    closeButton.addEventListener("click", closeBlockManagerDialog);
  }

  overlay.addEventListener("click", function(event) {
    if (event.target === overlay) {
      closeBlockManagerDialog();
    }
  });

  overlay.addEventListener("keydown", function(event) {
    if (event.key === "Escape") {
      closeBlockManagerDialog();
    }
  });

  return overlay;
}

function ensure_block_manager_trap_focus(overlay) {
  if (!overlay || overlay.getAttribute("data-trap-focus") === "true") {
    return;
  }
  if (typeof trapFocus === "function") {
    trapFocus(overlay);
    overlay.setAttribute("data-trap-focus", "true");
  }
}

function showBlockManagerDialog() {
  if (typeof document === "undefined") {
    return;
  }
  var root = document.documentElement;
  if (!root || root.getAttribute("data-ui-mode") !== "beta") {
    return;
  }
  var overlay = ensure_block_manager_overlay();
  if (!overlay) {
    return;
  }
  var body = overlay.querySelector("#blocks-manager-body");
  var blocksFieldset = document.getElementById("blocks_fieldset");
  if (body && blocksFieldset && !body.contains(blocksFieldset)) {
    body.appendChild(blocksFieldset);
  }
  update_block_manager_labels(overlay);
  ensure_block_manager_trap_focus(overlay);
  blocksManagerLastFocus = document.activeElement;
  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden", "false");

  var focusTarget = overlay.querySelector("input, button, [tabindex]:not([tabindex=\"-1\"])");
  if (focusTarget && typeof focusTarget.focus === "function") {
    focusTarget.focus();
  }
}

function initialize_block_manager() {
  if (typeof document === "undefined") {
    return;
  }
  var root = document.documentElement;
  var blocksFieldset = document.getElementById("blocks_fieldset");
  var blocksPlaceholder = document.getElementById("blocks_fieldset_placeholder");
  if (!root || !blocksFieldset || !blocksPlaceholder) {
    return;
  }

  var overlay = ensure_block_manager_overlay();
  var body = overlay ? overlay.querySelector("#blocks-manager-body") : null;

  function is_beta_mode_for_blocks() {
    return root.getAttribute("data-ui-mode") === "beta";
  }

  function sync_blocks_for_mode() {
    if (is_beta_mode_for_blocks()) {
      if (body && !body.contains(blocksFieldset)) {
        body.appendChild(blocksFieldset);
      }
      closeBlockManagerDialog();
      return;
    }

    if (blocksPlaceholder.parentNode &&
        !blocksPlaceholder.parentNode.contains(blocksFieldset)) {
      blocksPlaceholder.parentNode.insertBefore(blocksFieldset, blocksPlaceholder.nextSibling);
    }
    closeBlockManagerDialog();
  }

  if (typeof MutationObserver === "undefined") {
    sync_blocks_for_mode();
    return;
  }

  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].attributeName === "data-ui-mode") {
        sync_blocks_for_mode();
        break;
      }
    }
  });
  observer.observe(root, { attributes: true, attributeFilter: ["data-ui-mode"] });

  sync_blocks_for_mode();
}
