/**
 * UI Mode Toggle Tests
 * Validates beta/classic mode state, persistence, and toggle behavior.
 */

const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('../helpers/dom.js');

function createUiModeHarness(context) {
  const root = {
    attrs: {},
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    getAttribute(name) {
      return this.attrs[name];
    },
  };

  const toggle = {
    checked: false,
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener(eventName, handler) {
      if (eventName === 'change') {
        this._onChange = handler;
      }
    },
  };

  context.document.documentElement = root;
  context.document.getElementById = (id) => (id === 'ui_mode_toggle' ? toggle : null);

  return { root, toggle };
}

test('UI Mode - initializes from saved preference', () => {
  const { context } = loadApp({ ui_mode_preference: 'beta' });
  const { root, toggle } = createUiModeHarness(context);

  context.initialize_ui_mode_preference();

  assert.strictEqual(root.getAttribute('data-ui-mode'), 'beta', 'Should apply beta mode to root');
  assert.strictEqual(toggle.checked, true, 'Toggle should be checked for beta');
  assert.strictEqual(toggle.attributes['aria-checked'], 'true', 'ARIA should reflect beta state');
});

test('UI Mode - toggle updates localStorage and root attribute', () => {
  const { context, localStorage } = loadApp();
  const { root, toggle } = createUiModeHarness(context);

  context.initialize_ui_mode_preference();
  context.initialize_ui_mode_controls();

  assert.strictEqual(root.getAttribute('data-ui-mode'), 'classic', 'Default should be classic');

  toggle.checked = true;
  toggle._onChange();
  assert.strictEqual(localStorage.getItem('ui_mode_preference'), 'beta', 'Should persist beta preference');
  assert.strictEqual(root.getAttribute('data-ui-mode'), 'beta', 'Root should reflect beta mode');

  toggle.checked = false;
  toggle._onChange();
  assert.strictEqual(localStorage.getItem('ui_mode_preference'), 'classic', 'Should persist classic preference');
  assert.strictEqual(root.getAttribute('data-ui-mode'), 'classic', 'Root should reflect classic mode');
});
