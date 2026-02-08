var TEAMS_MANAGER_OVERLAY_ID = "teams-manager-overlay";
var teamsManagerLastFocus = null;

function update_team_manager_labels(overlay) {
  if (!overlay || typeof t !== "function") {
    return;
  }
  var title = overlay.querySelector("#teams-manager-title");
  var closeButton = overlay.querySelector(".team-manager-close");
  if (title) {
    title.textContent = t("teams.manage_title");
  }
  if (closeButton) {
    closeButton.textContent = t("teams.manage_close");
  }
}

function closeTeamManagerDialog() {
  if (typeof document === "undefined") {
    return;
  }
  var overlay = document.getElementById(TEAMS_MANAGER_OVERLAY_ID);
  if (!overlay) {
    return;
  }
  overlay.style.display = "none";
  overlay.setAttribute("aria-hidden", "true");
  if (teamsManagerLastFocus && typeof teamsManagerLastFocus.focus === "function") {
    teamsManagerLastFocus.focus();
  }
  teamsManagerLastFocus = null;
}

function ensure_team_manager_overlay() {
  if (typeof document === "undefined") {
    return null;
  }
  var overlay = document.getElementById(TEAMS_MANAGER_OVERLAY_ID);
  if (overlay) {
    return overlay;
  }
  overlay = document.createElement("div");
  overlay.id = TEAMS_MANAGER_OVERLAY_ID;
  overlay.className = "sync-dialog-overlay teams-manager-overlay";
  overlay.style.display = "none";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = '<div class="sync-dialog team-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="teams-manager-title">' +
    '<div class="team-manager-dialog-header">' +
      '<h2 id="teams-manager-title"></h2>' +
      '<button type="button" class="config-add-btn team-manager-close"></button>' +
    '</div>' +
    '<div class="team-manager-dialog-body" id="teams-manager-body"></div>' +
  '</div>';
  document.body.appendChild(overlay);

  var closeButton = overlay.querySelector(".team-manager-close");
  if (closeButton) {
    closeButton.addEventListener("click", closeTeamManagerDialog);
  }

  overlay.addEventListener("click", function(event) {
    if (event.target === overlay) {
      closeTeamManagerDialog();
    }
  });

  overlay.addEventListener("keydown", function(event) {
    if (event.key === "Escape") {
      closeTeamManagerDialog();
    }
  });

  return overlay;
}

function ensure_team_manager_trap_focus(overlay) {
  if (!overlay || overlay.getAttribute("data-trap-focus") === "true") {
    return;
  }
  if (typeof trapFocus === "function") {
    trapFocus(overlay);
    overlay.setAttribute("data-trap-focus", "true");
  }
}

function showTeamManagerDialog() {
  if (typeof document === "undefined") {
    return;
  }
  var root = document.documentElement;
  if (!root || root.getAttribute("data-ui-mode") !== "beta") {
    return;
  }
  var overlay = ensure_team_manager_overlay();
  if (!overlay) {
    return;
  }
  var body = overlay.querySelector("#teams-manager-body");
  var teamsFieldset = document.getElementById("teams_fieldset");
  if (body && teamsFieldset && !body.contains(teamsFieldset)) {
    body.appendChild(teamsFieldset);
  }
  update_team_manager_labels(overlay);
  ensure_team_manager_trap_focus(overlay);
  teamsManagerLastFocus = document.activeElement;
  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden", "false");

  var focusTarget = overlay.querySelector("input, button, [tabindex]:not([tabindex=\"-1\"])");
  if (focusTarget && typeof focusTarget.focus === "function") {
    focusTarget.focus();
  }
}

function initialize_team_manager() {
  if (typeof document === "undefined") {
    return;
  }
  var root = document.documentElement;
  var teamsFieldset = document.getElementById("teams_fieldset");
  var teamsPlaceholder = document.getElementById("teams_fieldset_placeholder");
  if (!root || !teamsFieldset || !teamsPlaceholder) {
    return;
  }

  var overlay = ensure_team_manager_overlay();
  var body = overlay ? overlay.querySelector("#teams-manager-body") : null;

  function is_beta_mode_for_teams() {
    return root.getAttribute("data-ui-mode") === "beta";
  }

  function sync_teams_for_mode() {
    if (is_beta_mode_for_teams()) {
      if (body && !body.contains(teamsFieldset)) {
        body.appendChild(teamsFieldset);
      }
      closeTeamManagerDialog();
      return;
    }

    if (teamsPlaceholder.parentNode &&
        !teamsPlaceholder.parentNode.contains(teamsFieldset)) {
      teamsPlaceholder.parentNode.insertBefore(teamsFieldset, teamsPlaceholder.nextSibling);
    }
    closeTeamManagerDialog();
  }

  if (typeof MutationObserver === "undefined") {
    sync_teams_for_mode();
    return;
  }

  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].attributeName === "data-ui-mode") {
        sync_teams_for_mode();
        break;
      }
    }
  });
  observer.observe(root, { attributes: true, attributeFilter: ["data-ui-mode"] });

  sync_teams_for_mode();
}
