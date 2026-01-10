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
  'pig': 'Secret Code'
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
 * Get available languages
 * @returns {object} Map of language codes to display names
 */
function get_available_languages() {
  return i18n_available_languages;
}

/**
 * Load translations from external JSON files
 * @param {string} langCode - Language code to load
 * @param {function} callback - Optional callback when loaded
 */
function load_translations(langCode, callback) {
  if (i18n_translations[langCode]) {
    // Already loaded
    if (callback) callback();
    return;
  }
  
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'scripts/i18n/' + langCode + '.json', true);
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        try {
          i18n_translations[langCode] = JSON.parse(xhr.responseText);
          if (callback) callback();
        } catch (e) {
          console.error('Failed to parse translations for ' + langCode + ':', e);
          if (callback) callback(e);
        }
      } else {
        console.error('Failed to load translations for ' + langCode + ': HTTP ' + xhr.status);
        if (callback) callback(new Error('HTTP ' + xhr.status));
      }
    }
  };
  xhr.send();
}

/**
 * Load all available translations
 * @param {function} callback - Called when all translations are loaded
 */
function load_all_translations(callback) {
  var langs = Object.keys(i18n_available_languages);
  var loaded = 0;
  var errors = [];
  
  langs.forEach(function(lang) {
    load_translations(lang, function(err) {
      if (err) errors.push({ lang: lang, error: err });
      loaded++;
      if (loaded === langs.length) {
        if (callback) callback(errors.length > 0 ? errors : null);
      }
    });
  });
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
  
  // Map internal language codes to locale codes
  var locale = i18n_current_language;
  if (locale === 'pig') {
    locale = 'en'; // Pig Latin uses English locale for dates
  }
  
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
 * Initialize translations synchronously for initial page load
 * Falls back to embedded defaults if JSON loading fails
 */
function init_default_translations() {
  // Embedded fallback for English (minimal set for initial render)
  if (!i18n_translations['en']) {
    i18n_translations['en'] = {
      app: { title: 'PBE Score Keeper', theme: 'Theme', language: 'Language', auto: 'Auto' },
      theme: { system: 'System', light: 'Light', dark: 'Dark' }
    };
  }
}

// Initialize default translations immediately
init_default_translations();

// Load full translations asynchronously
if (typeof XMLHttpRequest !== 'undefined') {
  load_all_translations(function(errors) {
    if (errors) {
      console.warn('Some translations failed to load:', errors);
    }
    // Re-translate page if already initialized
    if (typeof translate_page === 'function' && typeof $ !== 'undefined' && $('[data-i18n]').length > 0) {
      translate_page();
    }
  });
}
