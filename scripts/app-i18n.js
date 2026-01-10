// Internationalization (i18n) for PBE Score Keeper
// Follows the app-theme.js pattern for preference management

/**
 * Available translations
 * Each language file is loaded into this object
 */
var i18n_translations = {};

/**
 * Currently active language code
 */
var i18n_current_language = 'en';

/**
 * Default/fallback language
 */
var i18n_default_language = 'en';

/**
 * Available languages with display names
 */
var i18n_available_languages = {
  'en': 'English',
  'pig': 'Pig Latin'
};

/**
 * Initialize language preference on page load
 * Called early, before display initialization
 */
function initialize_language_preference() {
  var saved_language = get_saved_language_preference();
  var resolved_language = resolve_language(saved_language);
  i18n_current_language = resolved_language;
  update_html_lang(resolved_language);
}

/**
 * Get the saved language preference
 * Checks Yjs global doc first, then localStorage
 * @returns {string|null} Language code or null
 */
function get_saved_language_preference() {
  var global_language = get_global_language_preference();
  if (global_language) {
    return global_language;
  }
  return localStorage.getItem('language_preference');
}

/**
 * Get language preference from Yjs global doc
 * @returns {string|null} Language code or null
 */
function get_global_language_preference() {
  if (typeof getGlobalDoc !== 'function') {
    return null;
  }
  var doc = getGlobalDoc();
  if (!doc) {
    return null;
  }
  var meta = doc.getMap('meta');
  var saved_language = meta.get('languagePreference');
  if (saved_language && i18n_available_languages[saved_language]) {
    return saved_language;
  }
  return null;
}

/**
 * Set language preference in Yjs global doc
 * @param {string} language - Language code
 * @returns {boolean} Success
 */
function set_global_language_preference(language) {
  if (typeof getGlobalDoc !== 'function') {
    return false;
  }
  var doc = getGlobalDoc();
  if (!doc) {
    return false;
  }
  if (!i18n_available_languages[language] && language !== 'auto') {
    return false;
  }
  var meta = doc.getMap('meta');
  doc.transact(function() {
    meta.set('languagePreference', language);
  }, 'i18n');
  return true;
}

/**
 * Resolve language preference to actual language code
 * Handles 'auto' by detecting browser language
 * @param {string} saved_language - Saved preference ('auto', 'en', 'pig', etc.)
 * @returns {string} Resolved language code
 */
function resolve_language(saved_language) {
  // If explicit language selected, use it
  if (saved_language && saved_language !== 'auto' && i18n_available_languages[saved_language]) {
    return saved_language;
  }
  
  // Auto-detect from browser
  return detect_browser_language();
}

/**
 * Detect language from browser settings
 * @returns {string} Detected language code or default
 */
function detect_browser_language() {
  if (typeof navigator === 'undefined') {
    return i18n_default_language;
  }
  
  // Get browser languages (array or single)
  var browserLangs = navigator.languages || [navigator.language || navigator.userLanguage];
  
  for (var i = 0; i < browserLangs.length; i++) {
    var lang = browserLangs[i];
    if (!lang) continue;
    
    // Try exact match first (e.g., 'en-US')
    if (i18n_available_languages[lang]) {
      return lang;
    }
    
    // Try base language (e.g., 'en' from 'en-US')
    var baseLang = lang.split('-')[0];
    if (i18n_available_languages[baseLang]) {
      return baseLang;
    }
  }
  
  return i18n_default_language;
}

/**
 * Initialize language controls after DOM is ready
 */
function initialize_language_controls() {
  if (!get_root_element()) {
    return;
  }
  
  sync_language_preference_from_global();
  var saved_language = get_saved_language_preference() || 'auto';
  apply_language_preference(saved_language);
  
  // Set up language selector change handler
  $('#language_preference').on('change', function() {
    var selected = $(this).val();
    if (!i18n_available_languages[selected] && selected !== 'auto') {
      return;
    }
    localStorage.setItem('language_preference', selected);
    set_global_language_preference(selected);
    apply_language_preference(selected);
  });
  
  setup_language_preference_observer();
}

/**
 * Sync language preference from global doc to localStorage
 */
function sync_language_preference_from_global() {
  var global_language = get_global_language_preference();
  if (global_language) {
    localStorage.setItem('language_preference', global_language);
    return;
  }
  var local_language = localStorage.getItem('language_preference');
  if (local_language && (i18n_available_languages[local_language] || local_language === 'auto')) {
    set_global_language_preference(local_language);
  } else {
    set_global_language_preference('auto');
    localStorage.setItem('language_preference', 'auto');
  }
}

/**
 * Set up observer for language preference changes from other tabs
 */
function setup_language_preference_observer() {
  if (typeof getGlobalDoc !== 'function') {
    return;
  }
  var doc = getGlobalDoc();
  if (!doc) {
    return;
  }
  var meta = doc.getMap('meta');
  meta.observe(function(event) {
    if (!event.keysChanged || !event.keysChanged.has('languagePreference')) {
      return;
    }
    var saved_language = get_global_language_preference();
    if (!saved_language) {
      return;
    }
    localStorage.setItem('language_preference', saved_language);
    apply_language_preference(saved_language);
  });
}

/**
 * Apply language preference
 * @param {string} preference - Language code or 'auto'
 */
function apply_language_preference(preference) {
  var resolved = resolve_language(preference);
  i18n_current_language = resolved;
  update_html_lang(resolved);
  update_language_selector(preference);
  translate_page();
}

/**
 * Update the HTML lang attribute
 * @param {string} language - Language code
 */
function update_html_lang(language) {
  var root = get_root_element();
  if (!root) {
    return;
  }
  // Map pig latin to 'en' for accessibility, but keep internal tracking
  var htmlLang = (language === 'pig') ? 'en' : language;
  root.setAttribute('lang', htmlLang);
}

/**
 * Update the language selector dropdown
 * @param {string} saved_language - Saved preference
 */
function update_language_selector(saved_language) {
  var selector = $('#language_preference');
  if (!selector.length) {
    return;
  }
  if (i18n_available_languages[saved_language] || saved_language === 'auto') {
    selector.val(saved_language);
  } else {
    selector.val('auto');
  }
}

/**
 * Get translation for a key
 * Supports nested keys with dot notation (e.g., 'config.teams')
 * Supports pluralization with _one/_other suffixes
 * Supports interpolation with {{variable}} syntax
 * 
 * @param {string} key - Translation key
 * @param {object} params - Optional parameters for interpolation and pluralization
 * @returns {string} Translated string or key if not found
 */
function t(key, params) {
  params = params || {};
  var translations = i18n_translations[i18n_current_language] || i18n_translations[i18n_default_language] || {};
  
  // Handle pluralization
  var lookupKey = key;
  if (typeof params.count !== 'undefined') {
    var pluralSuffix = (params.count === 1) ? '_one' : '_other';
    var pluralKey = key + pluralSuffix;
    // Check if plural key exists
    if (get_nested_translation(translations, pluralKey) !== null) {
      lookupKey = pluralKey;
    }
  }
  
  var value = get_nested_translation(translations, lookupKey);
  
  // Fallback to default language
  if (value === null && i18n_current_language !== i18n_default_language) {
    translations = i18n_translations[i18n_default_language] || {};
    value = get_nested_translation(translations, lookupKey);
  }
  
  // Return key if no translation found
  if (value === null) {
    return key;
  }
  
  // Interpolate variables
  value = interpolate(value, params);
  
  return value;
}

/**
 * Get nested translation value using dot notation
 * @param {object} obj - Translations object
 * @param {string} key - Dot-notation key
 * @returns {string|null} Translation or null
 */
function get_nested_translation(obj, key) {
  var parts = key.split('.');
  var current = obj;
  
  for (var i = 0; i < parts.length; i++) {
    if (current === null || typeof current !== 'object') {
      return null;
    }
    current = current[parts[i]];
  }
  
  return (typeof current === 'string') ? current : null;
}

/**
 * Interpolate variables in a string
 * @param {string} str - String with {{variable}} placeholders
 * @param {object} params - Variables to interpolate
 * @returns {string} Interpolated string
 */
function interpolate(str, params) {
  return str.replace(/\{\{(\w+)\}\}/g, function(match, key) {
    return (typeof params[key] !== 'undefined') ? params[key] : match;
  });
}

/**
 * Translate all elements with data-i18n attribute
 */
function translate_page() {
  if (typeof $ === 'undefined') {
    return;
  }
  
  $('[data-i18n]').each(function() {
    var $el = $(this);
    var key = $el.attr('data-i18n');
    var params = {};
    
    // Get any data-i18n-* attributes for params
    var attrs = this.attributes;
    for (var i = 0; i < attrs.length; i++) {
      var attr = attrs[i];
      if (attr.name.indexOf('data-i18n-') === 0 && attr.name !== 'data-i18n') {
        var paramName = attr.name.replace('data-i18n-', '');
        params[paramName] = attr.value;
      }
    }
    
    var translated = t(key, params);
    
    // Handle different element types
    var target = $el.attr('data-i18n-target');
    if (target === 'placeholder') {
      $el.attr('placeholder', translated);
    } else if (target === 'title') {
      $el.attr('title', translated);
    } else if (target === 'aria-label') {
      $el.attr('aria-label', translated);
    } else {
      $el.text(translated);
    }
  });
}

/**
 * Get current language code
 * @returns {string} Current language code
 */
function get_current_language() {
  return i18n_current_language;
}

/**
 * Get available languages
 * @returns {object} Map of language codes to display names
 */
function get_available_languages() {
  return i18n_available_languages;
}

// English translations
i18n_translations['en'] = {
  // App title and header
  app: {
    title: 'PBE Score Keeper',
    theme: 'Theme',
    language: 'Language',
    auto: 'Auto'
  },
  
  // Theme options
  theme: {
    system: 'System',
    light: 'Light',
    dark: 'Dark'
  },
  
  // Configuration section
  config: {
    title: 'Configuration (Session/Round/Game)',
    instructions_title: 'Instructions',
    instructions: 'This is a score keeper for the Pathfinder Bible Experience (aka the Bible Bowl). Please enter your number of teams as well as blocks/groups below so that the scoring grid can be created',
    storage_title: 'Data Storage Note',
    storage_note: 'Data is stored only on your device, and is not shared in any way with any server. This also means that if you change devices your data will not appear on the new device.',
    new_session: 'New Session',
    enter_scores: 'Enter Scores'
  },
  
  // Teams section
  teams: {
    title: 'Set up your Teams',
    count_one: '{{count}} team',
    count_other: '{{count}} teams',
    team: 'team',
    teams: 'teams',
    name_label: 'Team {{number}} Name:',
    score_label: "{{name}}'s score",
    score_label_s: "{{name}}' score"
  },
  
  // Blocks section
  blocks: {
    title: 'Set up your Blocks/Groups',
    count_one: '{{count}} block/group',
    count_other: '{{count}} blocks/groups',
    block: 'block/group',
    blocks: 'blocks/groups',
    name_label: 'Block/Group {{number}} Name:'
  },
  
  // Points section
  points: {
    title: 'Maximum Points per Question',
    count_one: '{{count}} point',
    count_other: '{{count}} points',
    point: 'point',
    points: 'points',
    possible: 'Possible Points for Question'
  },
  
  // Rounding section
  rounding: {
    title: "Rounding Live Team score to best team's total?",
    yes: 'Yes',
    no: 'No'
  },
  
  // Score entry section
  score_entry: {
    title: 'Score Entry',
    previous: 'Previous Question',
    next: 'Next Question',
    new: 'New Question',
    ignore: 'Ignore this Question in Score Calculations',
    extra_credit: 'Allow Extra Credit',
    question: 'Question',
    block_group: 'Block/Group'
  },
  
  // Score display sections
  scores: {
    team_exact: 'Score by Team (Exact)',
    team_rounded: 'Score by Team (Rounded)',
    by_block: 'Score by Block/Group',
    team_and_block: 'Score by Team & Block/Group',
    question_log: 'Question Log'
  },
  
  // Table headers
  table: {
    team_name: 'Team Name',
    percent: 'Percent',
    score: 'Score',
    placement: 'Placement',
    block_name: 'Block/Group Name',
    question: 'Question',
    possible_points: 'Possible Points'
  },
  
  // History section
  history: {
    title: 'History',
    change_log: 'Change Log',
    time: 'Time',
    session: 'Session',
    action: 'Action',
    details: 'Details',
    no_changes: 'No changes recorded yet. Make some changes to see them here!'
  },
  
  // Advanced section
  advanced: {
    title: 'Advanced',
    export_csv: 'Export CSV',
    export_team: 'Export Score by Team',
    export_block: 'Export Score by Block/Group',
    export_team_and_block: 'Export Score by Team & Block/Group',
    export_question_log: 'Export Question Log',
    export_json: 'Export for Importing',
    export_session: 'Export Session (Round/Game)',
    export_all: 'Export All',
    import: 'Import',
    import_warning: 'Warning: Importing bad files can corrupt your data. It is strongly recommended that you run an "Export for Importing" before importing.',
    select_file: 'Please Select file to import:',
    danger_zone: 'Danger Zone',
    delete: 'Delete',
    delete_session: 'Delete this Session (Round/Game)',
    no_import_support: 'Your Browser does not support importing.'
  },
  
  // Footer
  footer: {
    feedback: 'Have an idea to make this better?',
    let_me_know: 'Let me know'
  },
  
  // Placeholders for dynamic content
  placeholders: {
    team_scores: 'Team Scores Go Here',
    rounded_scores: 'Rounded Team Scores Go Here',
    block_scores: 'Block/Group Scores Go Here',
    team_block_scores: 'Team & Block/Group Scores Go Here',
    question_log: 'Question Log Goes Here'
  }
};

// Pig Latin translations (placeholder/test language)
i18n_translations['pig'] = {
  // App title and header
  app: {
    title: 'BEPay Orescay Eeperkay',
    theme: 'Emethay',
    language: 'Anguagelay',
    auto: 'Autoay'
  },
  
  // Theme options
  theme: {
    system: 'Ystemsay',
    light: 'Ightlay',
    dark: 'Arkday'
  },
  
  // Configuration section
  config: {
    title: 'Onfigurationcay (Essionsay/Oundray/Amegay)',
    instructions_title: 'Instructionsay',
    instructions: 'Isthay isay aay orescay eeperkay orfay ethay Athfinderpay Iblebay Experienceay (akaway ethay Iblebay Owlbay). Easeplay enteray ouryay umbernay ofay eamstay asay ellway asay ocksblay/oupsgray elowbay osay atthay ethay oringscay idgray ancay ebay eatedcray',
    storage_title: 'Ataday Oragesay Otenay',
    storage_note: 'Ataday isay oredstay onlyay onay ouryay eviceday, anday isay otnay aredshay inay anyay ayway ithway anyay erversay. Isthay alsoay eansmay atthay ifay ouyay angechay evicesay ouryay ataday illway otnay appearay onay ethay ewnay eviceday.',
    new_session: 'Ewnay Essionsay',
    enter_scores: 'Enteray Orescay'
  },
  
  // Teams section
  teams: {
    title: 'Etsay upay ouryay Eamstay',
    count_one: '{{count}} eamtay',
    count_other: '{{count}} eamstay',
    team: 'eamtay',
    teams: 'eamstay',
    name_label: 'Eamtay {{number}} Amenay:',
    score_label: "{{name}}'say orescay",
    score_label_s: "{{name}}' orescay"
  },
  
  // Blocks section
  blocks: {
    title: 'Etsay upay ouryay Ocksblay/Oupsgray',
    count_one: '{{count}} ockblay/oupgray',
    count_other: '{{count}} ocksblay/oupsgray',
    block: 'ockblay/oupgray',
    blocks: 'ocksblay/oupsgray',
    name_label: 'Ockblay/Oupgray {{number}} Amenay:'
  },
  
  // Points section
  points: {
    title: 'Aximummay Ointspay erpay Estionquay',
    count_one: '{{count}} ointpay',
    count_other: '{{count}} ointspay',
    point: 'ointpay',
    points: 'ointspay',
    possible: 'Ossiblepay Ointspay orfay Estionquay'
  },
  
  // Rounding section
  rounding: {
    title: "Oundingray Ivelay Eamtay orescay otay estbay eamtay's otaltay?",
    yes: 'Esyay',
    no: 'Onay'
  },
  
  // Score entry section
  score_entry: {
    title: 'Orescay Entryay',
    previous: 'Eviouspray Estionquay',
    next: 'Extnay Estionquay',
    new: 'Ewnay Estionquay',
    ignore: 'Ignoreay isthay Estionquay inay Orescay Alculationscay',
    extra_credit: 'Alloway Extraay Editcray',
    question: 'Estionquay',
    block_group: 'Ockblay/Oupgray'
  },
  
  // Score display sections
  scores: {
    team_exact: 'Orescay ybay Eamtay (Exactay)',
    team_rounded: 'Orescay ybay Eamtay (Oundedray)',
    by_block: 'Orescay ybay Ockblay/Oupgray',
    team_and_block: 'Orescay ybay Eamtay & Ockblay/Oupgray',
    question_log: 'Estionquay Oglay'
  },
  
  // Table headers
  table: {
    team_name: 'Eamtay Amenay',
    percent: 'Ercentpay',
    score: 'Orescay',
    placement: 'Acementplay',
    block_name: 'Ockblay/Oupgray Amenay',
    question: 'Estionquay',
    possible_points: 'Ossiblepay Ointspay'
  },
  
  // History section
  history: {
    title: 'Istoryhay',
    change_log: 'Angechay Oglay',
    time: 'Imetay',
    session: 'Essionsay',
    action: 'Actionay',
    details: 'Etailsday',
    no_changes: 'Onay angeschay ecordedray etyay. Akemay omesay angeschay otay eesay emthay erehay!'
  },
  
  // Advanced section
  advanced: {
    title: 'Advanceday',
    export_csv: 'Exportay SVCay',
    export_team: 'Exportay Orescay ybay Eamtay',
    export_block: 'Exportay Orescay ybay Ockblay/Oupgray',
    export_team_and_block: 'Exportay Orescay ybay Eamtay & Ockblay/Oupgray',
    export_question_log: 'Exportay Estionquay Oglay',
    export_json: 'Exportay orfay Importingay',
    export_session: 'Exportay Essionsay (Oundray/Amegay)',
    export_all: 'Exportay Allay',
    import: 'Importay',
    import_warning: 'Arningway: Importingay adbay ilesfay ancay orruptcay ouryay ataday. Itay isay onglystray ecommendedray atthay ouyay unray anay "Exportay orfay Importingay" eforebay importingay.',
    select_file: 'Easeplay Electsay ilefay otay importay:',
    danger_zone: 'Angerday Onezay',
    delete: 'Eleteday',
    delete_session: 'Eleteday isthay Essionsay (Oundray/Amegay)',
    no_import_support: 'Ouryay Owserbray oesday otnay upportsay importingay.'
  },
  
  // Footer
  footer: {
    feedback: 'Avehay anay ideaay otay akemay isthay etterbay?',
    let_me_know: 'Etlay emay owknay'
  },
  
  // Placeholders for dynamic content
  placeholders: {
    team_scores: 'Eamtay Orescay Ogay Erehay',
    rounded_scores: 'Oundedray Eamtay Orescay Ogay Erehay',
    block_scores: 'Ockblay/Oupgray Orescay Ogay Erehay',
    team_block_scores: 'Eamtay & Ockblay/Oupgray Orescay Ogay Erehay',
    question_log: 'Estionquay Oglay Oesgay Erehay'
  }
};
