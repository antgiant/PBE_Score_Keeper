var UI_MODE_STORAGE_KEY = "ui_mode_preference";
var UI_MODE_DEFAULT = "classic";

function get_saved_ui_mode() {
  if (typeof localStorage === "undefined") {
    return UI_MODE_DEFAULT;
  }
  var saved = localStorage.getItem(UI_MODE_STORAGE_KEY);
  if (saved === "beta" || saved === "classic") {
    return saved;
  }
  return UI_MODE_DEFAULT;
}

function apply_ui_mode(mode) {
  var root = (typeof document !== "undefined" && document.documentElement) ? document.documentElement : null;
  if (!root) {
    return;
  }
  var resolvedMode = mode === "beta" ? "beta" : "classic";
  root.setAttribute("data-ui-mode", resolvedMode);
  update_ui_mode_toggle(resolvedMode);
}

function update_ui_mode_toggle(mode) {
  if (typeof document === "undefined" || typeof document.getElementById !== "function") {
    return;
  }
  var toggle = document.getElementById("ui_mode_toggle");
  if (!toggle) {
    return;
  }
  var isBeta = mode === "beta";
  toggle.checked = isBeta;
  toggle.setAttribute("aria-checked", isBeta ? "true" : "false");
}

function initialize_ui_mode_preference() {
  apply_ui_mode(get_saved_ui_mode());
}

function initialize_ui_mode_controls() {
  if (typeof document === "undefined" || typeof document.getElementById !== "function") {
    return;
  }
  var toggle = document.getElementById("ui_mode_toggle");
  if (!toggle) {
    return;
  }
  update_ui_mode_toggle(get_saved_ui_mode());
  toggle.addEventListener("change", function() {
    var mode = toggle.checked ? "beta" : "classic";
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(UI_MODE_STORAGE_KEY, mode);
    }
    apply_ui_mode(mode);
  });

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("storage", function(event) {
      if (!event || event.key !== UI_MODE_STORAGE_KEY) {
        return;
      }
      apply_ui_mode(get_saved_ui_mode());
    });
  }
}

function initialize_max_points_controls_for_ui_mode() {
  if (typeof document === "undefined" || typeof document.getElementById !== "function") {
    return;
  }
  var root = document.documentElement;
  var controls = document.getElementById("max_points_controls");
  var fieldset = document.getElementById("max_points_fieldset");
  var slot = document.getElementById("max_points_controls_slot");
  var notice = document.getElementById("max_points_minimum_notice");
  var noticeSlot = document.getElementById("max_points_notice_slot");
  if (!root || !controls || !fieldset || !slot) {
    return;
  }

  function is_beta_mode_for_controls() {
    return root.getAttribute("data-ui-mode") === "beta";
  }

  function sync_controls_for_mode() {
    if (is_beta_mode_for_controls()) {
      if (!slot.contains(controls)) {
        slot.appendChild(controls);
      }
      if (notice && noticeSlot && !noticeSlot.contains(notice)) {
        noticeSlot.appendChild(notice);
      }
      return;
    }
    if (!fieldset.contains(controls)) {
      fieldset.appendChild(controls);
    }
    if (notice && !controls.contains(notice)) {
      controls.appendChild(notice);
    }
  }

  if (typeof MutationObserver === "undefined") {
    sync_controls_for_mode();
    return;
  }

  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].attributeName === "data-ui-mode") {
        sync_controls_for_mode();
        break;
      }
    }
  });
  observer.observe(root, { attributes: true, attributeFilter: ["data-ui-mode"] });

  sync_controls_for_mode();
}
