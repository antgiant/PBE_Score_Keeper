function initialize_theme_preference() {
  var saved_theme = localStorage.getItem("theme_preference");
  var resolved_theme = resolve_theme(saved_theme);
  apply_theme(resolved_theme);
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
  var saved_theme = localStorage.getItem("theme_preference");
  apply_theme(resolve_theme(saved_theme));
  update_theme_selector(saved_theme);

  $("#theme_preference").on("change", function () {
    var selected = $(this).val();
    if (selected === "system") {
      localStorage.setItem("theme_preference", "system");
      apply_theme(resolve_theme("system"));
    } else {
      localStorage.setItem("theme_preference", selected);
      apply_theme(selected);
    }
  });

  if (saved_theme === "system") {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    var media = window.matchMedia("(prefers-color-scheme: dark)");
    if (media && typeof media.addEventListener === "function") {
      media.addEventListener("change", function (event) {
        if (localStorage.getItem("theme_preference") === "system") {
          apply_theme(event.matches ? "dark" : "light");
          update_theme_selector("system");
        }
      });
    } else if (media && typeof media.addListener === "function") {
      media.addListener(function (event) {
        if (localStorage.getItem("theme_preference") === "system") {
          apply_theme(event.matches ? "dark" : "light");
          update_theme_selector("system");
        }
      });
    }
  }
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
