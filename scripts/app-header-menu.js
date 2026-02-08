var HEADER_MENU_OPEN_CLASS = "is-open";

function initialize_header_menu() {
  if (typeof document === "undefined") {
    return;
  }

  var root = document.documentElement;
  var toggle = document.getElementById("header_menu_toggle");
  var panel = document.getElementById("header_menu_panel");
  var sessionFieldset = document.getElementById("session_fieldset");
  var sessionSlot = document.getElementById("header_menu_session_slot");
  var sessionPlaceholder = document.getElementById("session_fieldset_placeholder");
  var roundingFieldset = document.getElementById("rounding_fieldset");
  var roundingSlot = document.getElementById("header_menu_rounding_slot");
  var roundingPlaceholder = document.getElementById("rounding_fieldset_placeholder");
  var questionFieldset = document.getElementById("header_menu_question_fieldset");
  var scoreEntryAdvancedPanel = document.getElementById("score_entry_advanced_options");
  var scoreEntryAdvancedPlaceholder = document.getElementById("score_entry_advanced_placeholder");
  var syncButton = document.getElementById("sync_button");
  var syncButtonSlot = document.getElementById("sync_button_slot");
  if (!root || !toggle || !panel) {
    return;
  }

  function is_beta_mode() {
    return root.getAttribute("data-ui-mode") === "beta";
  }

  function set_menu_state(isOpen) {
    if (isOpen) {
      panel.classList.add(HEADER_MENU_OPEN_CLASS);
    } else {
      panel.classList.remove(HEADER_MENU_OPEN_CLASS);
    }

    if (is_beta_mode()) {
      panel.setAttribute("aria-hidden", isOpen ? "false" : "true");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }
  }

  function move_session_fieldset_for_mode() {
    if (!sessionFieldset || !sessionSlot || !sessionPlaceholder) {
      return;
    }
    if (is_beta_mode()) {
      if (!sessionSlot.contains(sessionFieldset)) {
        sessionSlot.appendChild(sessionFieldset);
      }
      return;
    }
    if (sessionPlaceholder.parentNode && !sessionPlaceholder.parentNode.contains(sessionFieldset)) {
      sessionPlaceholder.parentNode.insertBefore(sessionFieldset, sessionPlaceholder.nextSibling);
    }
  }

  function move_rounding_fieldset_for_mode() {
    if (!roundingFieldset || !roundingSlot || !roundingPlaceholder) {
      return;
    }
    if (is_beta_mode()) {
      if (!roundingSlot.contains(roundingFieldset)) {
        roundingSlot.appendChild(roundingFieldset);
      }
      return;
    }
    if (roundingPlaceholder.parentNode && !roundingPlaceholder.parentNode.contains(roundingFieldset)) {
      roundingPlaceholder.parentNode.insertBefore(roundingFieldset, roundingPlaceholder.nextSibling);
    }
  }

  function move_sync_button_for_mode() {
    if (!syncButton || !syncButtonSlot || !sessionFieldset) {
      return;
    }
    if (is_beta_mode()) {
      var legend = sessionFieldset.querySelector("legend");
      if (legend) {
        if (legend.nextSibling !== syncButton) {
          sessionFieldset.insertBefore(syncButton, legend.nextSibling);
        }
      } else if (sessionFieldset.firstChild !== syncButton) {
        sessionFieldset.insertBefore(syncButton, sessionFieldset.firstChild);
      }
      return;
    }
    if (!syncButtonSlot.contains(syncButton)) {
      syncButtonSlot.appendChild(syncButton);
    }
  }

  function move_question_options_for_mode() {
    if (!questionFieldset || !scoreEntryAdvancedPanel || !scoreEntryAdvancedPlaceholder) {
      return;
    }
    if (is_beta_mode()) {
      if (!questionFieldset.contains(scoreEntryAdvancedPanel)) {
        questionFieldset.appendChild(scoreEntryAdvancedPanel);
      }
      return;
    }
    if (scoreEntryAdvancedPlaceholder.parentNode && !scoreEntryAdvancedPlaceholder.parentNode.contains(scoreEntryAdvancedPanel)) {
      scoreEntryAdvancedPlaceholder.parentNode.insertBefore(scoreEntryAdvancedPanel, scoreEntryAdvancedPlaceholder.nextSibling);
    }
  }

  function sync_menu_for_mode() {
    if (is_beta_mode()) {
      set_menu_state(false);
      move_session_fieldset_for_mode();
      move_rounding_fieldset_for_mode();
      move_question_options_for_mode();
      move_sync_button_for_mode();
      return;
    }

    panel.classList.remove(HEADER_MENU_OPEN_CLASS);
    panel.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "false");
    move_session_fieldset_for_mode();
    move_rounding_fieldset_for_mode();
    move_question_options_for_mode();
    move_sync_button_for_mode();
  }

  toggle.addEventListener("click", function(event) {
    if (!is_beta_mode()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    set_menu_state(!panel.classList.contains(HEADER_MENU_OPEN_CLASS));
  });

  document.addEventListener("click", function(event) {
    if (!is_beta_mode()) {
      return;
    }
    if (!panel.classList.contains(HEADER_MENU_OPEN_CLASS)) {
      return;
    }
    if (panel.contains(event.target) || toggle.contains(event.target)) {
      return;
    }
    set_menu_state(false);
  });

  document.addEventListener("keydown", function(event) {
    if (!is_beta_mode()) {
      return;
    }
    if (event.key !== "Escape") {
      return;
    }
    if (panel.classList.contains(HEADER_MENU_OPEN_CLASS)) {
      set_menu_state(false);
      toggle.focus();
    }
  });

  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].attributeName === "data-ui-mode") {
        sync_menu_for_mode();
        break;
      }
    }
  });
  observer.observe(root, { attributes: true, attributeFilter: ["data-ui-mode"] });

  sync_menu_for_mode();
}
