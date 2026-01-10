function initialize_theme_preference() {
  var saved_theme = get_saved_theme_preference();
  var resolved_theme = resolve_theme(saved_theme);
  apply_theme(resolved_theme);
}
function get_saved_theme_preference() {
  var global_theme = get_global_theme_preference();
  if (global_theme) {
    return global_theme;
  }
  return localStorage.getItem("theme_preference");
}
function get_global_theme_preference() {
  if (typeof getGlobalDoc !== "function") {
    return null;
  }
  var doc = getGlobalDoc();
  if (!doc) {
    return null;
  }
  var meta = doc.getMap("meta");
  var saved_theme = meta.get("themePreference");
  if (saved_theme === "light" || saved_theme === "dark" || saved_theme === "system") {
    return saved_theme;
  }
  return null;
}
function set_global_theme_preference(preference) {
  if (typeof getGlobalDoc !== "function") {
    return false;
  }
  var doc = getGlobalDoc();
  if (!doc) {
    return false;
  }
  if (preference !== "light" && preference !== "dark" && preference !== "system") {
    return false;
  }
  var meta = doc.getMap("meta");
  doc.transact(function() {
    meta.set("themePreference", preference);
  }, "theme");
  return true;
}
function apply_theme_preference(preference) {
  apply_theme(resolve_theme(preference));
  update_theme_selector(preference);
}
function resolve_theme(saved_theme) {
  if (saved_theme === "light" || saved_theme === "dark") {
    return saved_theme;
  }
  if (saved_theme === "system") {
    saved_theme = null;
  }
  if (typeof window !== "undefined"
      && window.matchMedia
      && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}
function initialize_theme_controls() {
  if (!get_root_element()) {
    return;
  }
  sync_theme_preference_from_global();
  var saved_theme = get_saved_theme_preference();
  apply_theme_preference(saved_theme);

  $("#theme_preference").on("change", function () {
    var selected = $(this).val();
    if (selected !== "light" && selected !== "dark" && selected !== "system") {
      return;
    }
    localStorage.setItem("theme_preference", selected);
    set_global_theme_preference(selected);
    apply_theme_preference(selected);
  });

  if (saved_theme === "system") {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    var media = window.matchMedia("(prefers-color-scheme: dark)");
    if (media && typeof media.addEventListener === "function") {
      media.addEventListener("change", function (event) {
        if (get_saved_theme_preference() === "system") {
          apply_theme(event.matches ? "dark" : "light");
          update_theme_selector("system");
        }
      });
    } else if (media && typeof media.addListener === "function") {
      media.addListener(function (event) {
        if (get_saved_theme_preference() === "system") {
          apply_theme(event.matches ? "dark" : "light");
          update_theme_selector("system");
        }
      });
    }
  }

  setup_theme_preference_observer();
}
function sync_theme_preference_from_global() {
  var global_theme = get_global_theme_preference();
  if (global_theme) {
    localStorage.setItem("theme_preference", global_theme);
    return;
  }
  var local_theme = localStorage.getItem("theme_preference");
  if (local_theme === "light" || local_theme === "dark" || local_theme === "system") {
    set_global_theme_preference(local_theme);
  } else {
    set_global_theme_preference("system");
    localStorage.setItem("theme_preference", "system");
  }
}
function setup_theme_preference_observer() {
  if (typeof getGlobalDoc !== "function") {
    return;
  }
  var doc = getGlobalDoc();
  if (!doc) {
    return;
  }
  var meta = doc.getMap("meta");
  meta.observe(function(event) {
    if (!event.keysChanged || !event.keysChanged.has("themePreference")) {
      return;
    }
    var saved_theme = get_global_theme_preference();
    if (!saved_theme) {
      return;
    }
    localStorage.setItem("theme_preference", saved_theme);
    apply_theme_preference(saved_theme);
  });
}
function get_root_element() {
  if (typeof document === "undefined" || !document.documentElement) {
    return null;
  }
  return document.documentElement;
}
function apply_theme(theme) {
  var root = get_root_element();
  if (!root) {
    return;
  }
  root.setAttribute("data-theme", theme);
}
function update_theme_selector(saved_theme) {
  var root = get_root_element();
  if (!root) {
    return;
  }
  var selector = $("#theme_preference");
  if (!selector.length) {
    return;
  }
  if (saved_theme === "light" || saved_theme === "dark" || saved_theme === "system") {
    selector.val(saved_theme);
  } else {
    selector.val("system");
  }
}
