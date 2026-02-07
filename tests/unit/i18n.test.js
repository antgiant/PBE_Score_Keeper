const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Get all language files from i18n directory
function getLanguageFiles() {
  const i18nDir = path.join(__dirname, '../../scripts/i18n');
  return fs.readdirSync(i18nDir)
    .filter(f => f.endsWith('.js'))
    .map(f => ({
      code: f.replace('.js', ''),
      path: path.join(i18nDir, f)
    }));
}

// Load app-i18n.js and all language files in a sandboxed context
function createI18nContext() {
  const i18nCode = fs.readFileSync(path.join(__dirname, '../../scripts/app-i18n.js'), 'utf8');
  const languageFiles = getLanguageFiles();
  
  const silentConsole = {
    log: function() {},
    warn: function() {},
    error: function() {},
    info: function() {},
    debug: function() {}
  };
  const testConsole = process.env.TEST_LOGS ? console : silentConsole;

  const context = {
    localStorage: {
      _data: {},
      getItem(key) { return this._data[key] || null; },
      setItem(key, value) { this._data[key] = value; },
      removeItem(key) { delete this._data[key]; },
      clear() { this._data = {}; }
    },
    navigator: {
      language: 'en-US',
      languages: ['en-US', 'en']
    },
    document: {
      documentElement: {
        setAttribute: function() {}
      },
      readyState: 'complete', // Simulate page already loaded
      head: {
        appendChild: function() {}
      },
      createElement: function(tag) {
        return { src: '', async: false, onload: null, onerror: null };
      }
    },
    window: {
      addEventListener: function() {} // Noop for tests
    },
    $: function() {
      return {
        on: function() {},
        val: function() {},
        find: function() { return { each: function() {} }; },
        length: 0
      };
    },
    getGlobalDoc: function() { return null; },
    get_root_element: function() { return null; },
    console: testConsole
  };
  
  vm.createContext(context);
  
  // Load the i18n module first (defines register_i18n_language)
  vm.runInContext(i18nCode, context);
  
  // Then load all translation files (they call register_i18n_language)
  for (const langFile of languageFiles) {
    const langCode = fs.readFileSync(langFile.path, 'utf8');
    vm.runInContext(langCode, context);
  }
  
  return context;
}

test('i18n module', async (t) => {
  
  await t.test('t() returns translation for simple key', () => {
    const ctx = createI18nContext();
    const result = ctx.t('app.title');
    assert.strictEqual(result, 'PBE Score Keeper');
  });
  
  await t.test('t() returns key when translation not found', () => {
    const ctx = createI18nContext();
    const result = ctx.t('nonexistent.key');
    assert.strictEqual(result, 'nonexistent.key');
  });
  
  await t.test('t() handles interpolation', () => {
    const ctx = createI18nContext();
    const result = ctx.t('teams.name_label', { number: 5 });
    assert.strictEqual(result, 'Team 5 Name:');
  });
  
  await t.test('t() handles pluralization - singular', () => {
    const ctx = createI18nContext();
    const result = ctx.t('teams.count', { count: 1 });
    assert.strictEqual(result, '1 team');
  });
  
  await t.test('t() handles pluralization - plural', () => {
    const ctx = createI18nContext();
    const result = ctx.t('teams.count', { count: 5 });
    assert.strictEqual(result, '5 teams');
  });
  
  await t.test('Pig Latin translations exist', () => {
    const ctx = createI18nContext();
    assert.ok(ctx.i18n_translations['pig'], 'Pig Latin translations should exist');
    assert.strictEqual(ctx.i18n_translations['pig'].app.title, 'BPE-ay Ore-Scay Eeper-Kay');
  });
  
  await t.test('Spanish translations exist', () => {
    const ctx = createI18nContext();
    assert.ok(ctx.i18n_translations['es'], 'Spanish translations should exist');
    assert.strictEqual(ctx.i18n_translations['es'].app.title, 'PBE Marcador');
  });
  
  await t.test('French translations exist', () => {
    const ctx = createI18nContext();
    assert.ok(ctx.i18n_translations['fr'], 'French translations should exist');
    assert.strictEqual(ctx.i18n_translations['fr'].app.title, 'PBE Marqueur');
  });
  
  await t.test('detect_browser_language returns detected language', () => {
    const ctx = createI18nContext();
    const result = ctx.detect_browser_language();
    assert.strictEqual(result, 'en');
  });
  
  await t.test('detect_browser_language falls back to default for unknown language', () => {
    const ctx = createI18nContext();
    ctx.navigator.languages = ['xx-XX'];
    ctx.navigator.language = 'xx-XX';
    const result = ctx.detect_browser_language();
    assert.strictEqual(result, 'en');
  });
  
  await t.test('resolve_language returns explicit language when set', () => {
    const ctx = createI18nContext();
    const result = ctx.resolve_language('pig');
    assert.strictEqual(result, 'pig');
  });
  
  await t.test('resolve_language auto-detects when set to auto', () => {
    const ctx = createI18nContext();
    const result = ctx.resolve_language('auto');
    assert.strictEqual(result, 'en');
  });
  
  await t.test('get_available_languages returns language map', () => {
    const ctx = createI18nContext();
    const langs = ctx.get_available_languages();
    assert.ok(langs['en'], 'English should be available');
    assert.ok(langs['pig'], 'Secret Code should be available');
    assert.ok(langs['es'], 'Spanish should be available');
    assert.ok(langs['fr'], 'French should be available');
    assert.strictEqual(langs['en'], 'English');
    assert.strictEqual(langs['pig'], 'Secret Code');
    assert.strictEqual(langs['es'], 'Español');
    assert.strictEqual(langs['fr'], 'Français');
  });
  
  await t.test('all language files are registered', () => {
    const ctx = createI18nContext();
    const languageFiles = getLanguageFiles();
    const registeredLangs = Object.keys(ctx.get_available_languages());
    
    for (const langFile of languageFiles) {
      assert.ok(
        registeredLangs.includes(langFile.code),
        `Language file ${langFile.code}.js should be registered`
      );
    }
    
    // Also verify the count matches
    assert.strictEqual(
      languageFiles.length,
      registeredLangs.length,
      `Number of language files (${languageFiles.length}) should match registered languages (${registeredLangs.length})`
    );
  });
  
  await t.test('switching language changes t() output', () => {
    const ctx = createI18nContext();
    
    // English
    ctx.i18n_current_language = 'en';
    assert.strictEqual(ctx.t('app.title'), 'PBE Score Keeper');
    
    // Pig Latin
    ctx.i18n_current_language = 'pig';
    assert.strictEqual(ctx.t('app.title'), 'BPE-ay Ore-Scay Eeper-Kay');
  });
  
  await t.test('All languages have the same translation keys as English', () => {
    const ctx = createI18nContext();
    
    function getKeys(obj, prefix) {
      prefix = prefix || '';
      let keys = [];
      for (const key in obj) {
        const fullKey = prefix ? prefix + '.' + key : key;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          keys = keys.concat(getKeys(obj[key], fullKey));
        } else {
          keys.push(fullKey);
        }
      }
      return keys;
    }
    
    const enKeys = getKeys(ctx.i18n_translations['en']).sort();
    const registeredLangs = Object.keys(ctx.get_available_languages());
    
    for (const langCode of registeredLangs) {
      if (langCode === 'en') continue; // Skip English (it's the reference)
      
      const langKeys = getKeys(ctx.i18n_translations[langCode]).sort();
      
      // Check counts match
      assert.strictEqual(langKeys.length, enKeys.length, 
        `${langCode} should have same number of keys as English (${langKeys.length} vs ${enKeys.length})`);
      
      // Check all English keys exist in this language
      const missingKeys = enKeys.filter(k => langKeys.indexOf(k) === -1);
      assert.strictEqual(missingKeys.length, 0, 
        `All English keys should exist in ${langCode}. Missing: ${missingKeys.slice(0, 5).join(', ')}${missingKeys.length > 5 ? '...' : ''}`);
      
      // Check for extra keys not in English
      const extraKeys = langKeys.filter(k => enKeys.indexOf(k) === -1);
      assert.strictEqual(extraKeys.length, 0, 
        `${langCode} should not have extra keys not in English. Extra: ${extraKeys.slice(0, 5).join(', ')}${extraKeys.length > 5 ? '...' : ''}`);
    }
  });
  
  await t.test('Non-English translations are different from English', () => {
    const ctx = createI18nContext();
    const registeredLangs = Object.keys(ctx.get_available_languages());
    
    for (const langCode of registeredLangs) {
      if (langCode === 'en') continue;
      
      // Verify key translations are actually different (not just copies)
      assert.notStrictEqual(
        ctx.i18n_translations['en'].app.title,
        ctx.i18n_translations[langCode].app.title,
        `${langCode} title should differ from English`
      );
      assert.notStrictEqual(
        ctx.i18n_translations['en'].config.instructions,
        ctx.i18n_translations[langCode].config.instructions,
        `${langCode} instructions should differ from English`
      );
    }
  });
  
  await t.test('Interpolation works for all languages', () => {
    const ctx = createI18nContext();
    const registeredLangs = Object.keys(ctx.get_available_languages());
    
    for (const langCode of registeredLangs) {
      ctx.i18n_current_language = langCode;
      
      // Test interpolation with team name label
      const result = ctx.t('teams.name_label', { number: 3 });
      assert.ok(result.includes('3'), `${langCode} interpolation should include number 3`);
      assert.notStrictEqual(result, 'teams.name_label', `${langCode} should have teams.name_label translation`);
      
      // Test pluralization - singular
      const singular = ctx.t('teams.count', { count: 1 });
      assert.ok(singular.includes('1'), `${langCode} singular count should include 1`);
      
      // Test pluralization - plural
      const plural = ctx.t('teams.count', { count: 5 });
      assert.ok(plural.includes('5'), `${langCode} plural count should include 5`);
    }
  });
  
});
