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
