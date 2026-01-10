const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Load app-i18n.js in a sandboxed context
function createI18nContext() {
  const i18nCode = fs.readFileSync(path.join(__dirname, '../../scripts/app-i18n.js'), 'utf8');
  
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
      }
    },
    window: {},
    $: function() {
      return {
        on: function() {},
        val: function() {},
        length: 0
      };
    },
    getGlobalDoc: function() { return null; },
    get_root_element: function() { return null; },
    console: console
  };
  
  vm.createContext(context);
  vm.runInContext(i18nCode, context);
  
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
    assert.strictEqual(ctx.i18n_translations['pig'].app.title, 'BEPay Orescay Eeperkay');
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
    assert.ok(langs['pig'], 'Pig Latin should be available');
    assert.strictEqual(langs['en'], 'English');
    assert.strictEqual(langs['pig'], 'Pig Latin');
  });
  
  await t.test('switching language changes t() output', () => {
    const ctx = createI18nContext();
    
    // English
    ctx.i18n_current_language = 'en';
    assert.strictEqual(ctx.t('app.title'), 'PBE Score Keeper');
    
    // Pig Latin
    ctx.i18n_current_language = 'pig';
    assert.strictEqual(ctx.t('app.title'), 'BEPay Orescay Eeperkay');
  });
  
  await t.test('Pig Latin has all English translation keys', () => {
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
    const pigKeys = getKeys(ctx.i18n_translations['pig']).sort();
    
    // Check counts match
    assert.strictEqual(enKeys.length, pigKeys.length, 
      'Pig Latin should have same number of keys as English');
    
    // Check all English keys exist in Pig Latin
    const missingInPig = enKeys.filter(k => pigKeys.indexOf(k) === -1);
    assert.strictEqual(missingInPig.length, 0, 
      'All English keys should exist in Pig Latin. Missing: ' + missingInPig.join(', '));
  });
  
  await t.test('Pig Latin translations are different from English', () => {
    const ctx = createI18nContext();
    
    // Verify key translations are actually different (not just copies)
    assert.notStrictEqual(
      ctx.i18n_translations['en'].app.title,
      ctx.i18n_translations['pig'].app.title,
      'Pig Latin title should differ from English'
    );
    assert.notStrictEqual(
      ctx.i18n_translations['en'].config.instructions,
      ctx.i18n_translations['pig'].config.instructions,
      'Pig Latin instructions should differ from English'
    );
    assert.notStrictEqual(
      ctx.i18n_translations['en'].advanced.import_warning,
      ctx.i18n_translations['pig'].advanced.import_warning,
      'Pig Latin import warning should differ from English'
    );
  });
  
  await t.test('Pig Latin interpolation works correctly', () => {
    const ctx = createI18nContext();
    ctx.i18n_current_language = 'pig';
    
    // Test interpolation with team name label
    const result = ctx.t('teams.name_label', { number: 3 });
    assert.strictEqual(result, 'Eamtay 3 Amenay:');
    
    // Test pluralization
    const singular = ctx.t('teams.count', { count: 1 });
    assert.strictEqual(singular, '1 eamtay');
    
    const plural = ctx.t('teams.count', { count: 5 });
    assert.strictEqual(plural, '5 eamstay');
  });
  
});
