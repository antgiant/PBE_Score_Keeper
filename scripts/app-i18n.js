// Internationalization (i18n) for PBE Score Keeper
// Follows the app-theme.js pattern for preference management
// 
// To add a new language:
// 1. Create a new file: scripts/i18n/{code}.js that calls register_i18n_language()
// 2. Add a <script> tag for it in index.html (before app-i18n.js)
// 
// All languages are loaded upfront for simplicity and instant language switching.

/**
 * Language metadata registry
 * Populated by language files calling register_i18n_language()
 * Maps language code to { name, locale, rtl }
 */
var i18n_language_registry = {};

/**
 * Translations storage
 * Populated by language files calling register_i18n_language()
 */
if (typeof i18n_translations === 'undefined') {
  var i18n_translations = {};
}

/**
 * Currently active language code
 */
var i18n_current_language = 'en';

/**
 * Default/fallback language
 */
var i18n_default_language = 'en';

/**
 * Register a language with its metadata and translations
 * Called by each language file (scripts/i18n/*.js)
 * 
 * @param {string} code - Language code (e.g., 'en', 'es', 'pig')
 * @param {object} config - Language configuration
 * @param {string} config.name - Display name (e.g., 'English', 'Español')
 * @param {string} [config.locale] - Locale for date formatting (defaults to code)
 * @param {boolean} [config.rtl] - Right-to-left language (default: false)
 * @param {object} config.translations - Translation strings object
 */
function register_i18n_language(code, config) {
  if (!code || !config || !config.name || !config.translations) {
    console.error('register_i18n_language: Invalid language config for', code);
    return;
  }
  
  // Store metadata
  i18n_language_registry[code] = {
    name: config.name,
    locale: config.locale || code,
    rtl: config.rtl || false
  };
  
  // Store translations
  i18n_translations[code] = config.translations;
}

/**
 * Get available languages with display names
 * @returns {object} Map of language codes to display names
 */
function get_available_languages() {
  var result = {};
  for (var code in i18n_language_registry) {
    if (i18n_language_registry.hasOwnProperty(code)) {
      result[code] = i18n_language_registry[code].name;
    }
  }
  return result;
}

/**
 * Check if a language is registered (loaded)
 * @param {string} code - Language code
 * @returns {boolean} True if language is loaded
 */
function is_language_loaded(code) {
  return !!(i18n_language_registry[code] && i18n_translations[code]);
}

/**
 * Check if a language code is available
 * @param {string} code - Language code
 * @returns {boolean} True if language is registered
 */
function is_language_available(code) {
  return is_language_loaded(code);
}

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
  if (saved_language && is_language_available(saved_language)) {
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
  if (!is_language_available(language) && language !== 'auto') {
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
  if (saved_language && saved_language !== 'auto' && is_language_available(saved_language)) {
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
    if (is_language_available(lang)) {
      return lang;
    }
    
    // Try base language (e.g., 'en' from 'en-US')
    var baseLang = lang.split('-')[0];
    if (is_language_available(baseLang)) {
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
  
  // Populate language selector dynamically from registered languages
  populate_language_selector();
  
  sync_language_preference_from_global();
  var saved_language = get_saved_language_preference() || 'auto';
  apply_language_preference(saved_language);
  
  // Set up language selector change handler
  $('#language_preference').on('change', function() {
    var selected = $(this).val();
    if (!is_language_available(selected) && selected !== 'auto') {
      return;
    }
    localStorage.setItem('language_preference', selected);
    set_global_language_preference(selected);
    apply_language_preference(selected);
  });
  
  setup_language_preference_observer();
}

/**
 * Populate the language selector dropdown from registered languages
 * This ensures all loaded languages appear in the dropdown automatically
 */
function populate_language_selector() {
  var selector = $('#language_preference');
  if (!selector.length) {
    return;
  }
  
  // Clear existing options except 'auto'
  selector.empty();
  
  // Add 'Auto' option first
  var autoOption = $('<option></option>')
    .attr('value', 'auto')
    .attr('data-i18n', 'app.auto')
    .text(t('app.auto'));
  selector.append(autoOption);
  
  // Get all registered languages and sort by name
  var languages = get_available_languages();
  var sortedCodes = Object.keys(languages).sort(function(a, b) {
    return languages[a].localeCompare(languages[b]);
  });
  
  // Add an option for each registered language
  for (var i = 0; i < sortedCodes.length; i++) {
    var code = sortedCodes[i];
    var name = languages[code];
    var option = $('<option></option>')
      .attr('value', code)
      .text(name);
    selector.append(option);
  }
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
  if (local_language && (is_language_available(local_language) || local_language === 'auto')) {
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
  
  // Refresh dynamically generated content
  if (typeof refresh_history_display === 'function') {
    refresh_history_display();
  }
  if (typeof sync_data_to_display === 'function') {
    sync_data_to_display();
  }
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
  
  // Get locale from registry, or use code
  var meta = i18n_language_registry[language];
  var htmlLang = meta ? meta.locale : language;
  
  root.setAttribute('lang', htmlLang);
  
  // Handle RTL languages
  if (meta && meta.rtl) {
    root.setAttribute('dir', 'rtl');
  } else {
    root.removeAttribute('dir');
  }
}

/**
 * Update the language selector dropdown value
 * @param {string} saved_language - Saved preference
 */
function update_language_selector(saved_language) {
  var selector = $('#language_preference');
  if (!selector.length) {
    return;
  }
  if (is_language_available(saved_language) || saved_language === 'auto') {
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
 * Get pluralized translation for a key
 * Convenience wrapper around t() that explicitly takes count as second parameter
 * 
 * @param {string} key - Translation key (without _one/_other suffix)
 * @param {number} count - Count for pluralization
 * @param {object} params - Optional additional parameters for interpolation
 * @returns {string} Translated and pluralized string
 */
function t_plural(key, count, params) {
  params = params || {};
  params.count = count;
  return t(key, params);
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
  
  // Update document title
  if (typeof document !== 'undefined') {
    document.title = t('app.title');
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
 * Get language metadata
 * @param {string} code - Language code
 * @returns {object|null} Language metadata or null
 */
function get_language_metadata(code) {
  return i18n_language_registry[code] || null;
}

/**
 * Check if translations are loaded for a language
 * @param {string} langCode - Language code to check
 * @returns {boolean} True if translations are loaded
 */
function is_translation_loaded(langCode) {
  return is_language_loaded(langCode);
}

/**
 * Check if all registered translations are loaded
 * @returns {boolean} True if all translations are loaded
 */
function are_all_translations_loaded() {
  return Object.keys(i18n_language_registry).length > 0;
}

/**
 * Format a date according to the current language's locale
 * @param {Date|number} date - Date object or timestamp
 * @param {object} options - Intl.DateTimeFormat options (optional)
 * @returns {string} Formatted date string
 */
function format_date(date, options) {
  if (typeof date === 'number') {
    date = new Date(date);
  }
  if (!(date instanceof Date) || isNaN(date)) {
    return t('history.unknown_time');
  }
  
  // Get locale from language registry
  var meta = i18n_language_registry[i18n_current_language];
  var locale = meta ? meta.locale : i18n_current_language;
  
  // Default options for date+time
  var defaultOptions = {
    year: 'numeric',
    month: 'numeric', 
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric'
  };
  
  options = options || defaultOptions;
  
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch (e) {
    // Fallback to toLocaleString
    return date.toLocaleString(locale);
  }
}

/**
 * Format a time according to the current language's locale
 * @param {Date|number} date - Date object or timestamp
 * @returns {string} Formatted time string
 */
function format_time(date) {
  return format_date(date, {
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric'
  });
}

/**
 * Format a number according to the current language's locale
 * @param {number} num - Number to format
 * @param {object} options - Intl.NumberFormat options (optional)
 * @returns {string} Formatted number string
 */
function format_number(num, options) {
  if (typeof num !== 'number' || isNaN(num)) {
    return String(num);
  }
  
  // Get locale from language registry
  var meta = i18n_language_registry[i18n_current_language];
  var locale = meta ? meta.locale : i18n_current_language;
  
  try {
    return new Intl.NumberFormat(locale, options || {}).format(num);
  } catch (e) {
    // Fallback to basic toString
    return num.toString();
  }
}

/**
 * Format a percentage according to the current language's locale
 * @param {number} num - Number to format as percentage (e.g., 0.85 for 85%)
 * @param {number} decimalPlaces - Number of decimal places (default: 2)
 * @returns {string} Formatted percentage string
 */
function format_percent(num, decimalPlaces) {
  if (typeof num !== 'number' || isNaN(num)) {
    return String(num);
  }
  
  if (typeof decimalPlaces !== 'number') {
    decimalPlaces = 2;
  }
  
  // Get locale from language registry
  var meta = i18n_language_registry[i18n_current_language];
  var locale = meta ? meta.locale : i18n_current_language;
  
  try {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces
    }).format(num);
  } catch (e) {
    // Fallback to basic formatting
    return (num * 100).toFixed(decimalPlaces) + '%';
  }
}

/**
 * Format a score ratio (e.g., "45/50") according to the current language's locale
 * Uses locale-aware number formatting for both parts
 * @param {number} earned - Points earned
 * @param {number} possible - Points possible
 * @returns {string} Formatted score string (e.g., "45/50" or "45 / 50")
 */
function format_score(earned, possible) {
  return format_number(earned) + '/' + format_number(possible);
}

/**
 * Initialize - verify at least one language is loaded
 */
function init_i18n() {
  if (Object.keys(i18n_language_registry).length === 0) {
    console.warn('No languages registered. Ensure language files are included before app-i18n.js');
  }
  if (!is_language_loaded(i18n_default_language)) {
    console.warn('Default language (' + i18n_default_language + ') not loaded.');
  }
}

// Initialize on load
if (typeof document !== 'undefined' && document.readyState === 'complete') {
  init_i18n();
} else if (typeof window !== 'undefined') {
  window.addEventListener('load', init_i18n);
}
