const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const headerMenuScript = fs.readFileSync(
  path.join(__dirname, '..', '..', 'scripts', 'app-header-menu.js'),
  'utf8',
);

function createClassList() {
  const classes = new Set();
  return {
    add(name) {
      classes.add(name);
    },
    remove(name) {
      classes.delete(name);
    },
    contains(name) {
      return classes.has(name);
    },
  };
}

function createElement(id) {
  const listeners = {};
  const attributes = {};
  const children = [];
  const element = {
    id,
    dataset: {},
    classList: createClassList(),
    attributes,
    children,
    parentNode: null,
    firstChild: null,
    lastChild: null,
    previousSibling: null,
    nextSibling: null,
    addEventListener(type, handler) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(handler);
    },
    dispatch(type, event) {
      const handlers = listeners[type] || [];
      handlers.forEach((handler) => handler(event || {}));
    },
    contains(target) {
      return target === element || children.includes(target);
    },
    appendChild(child) {
      if (!children.includes(child)) {
        child.parentNode = element;
        children.push(child);
        element.firstChild = children[0] || null;
        element.lastChild = children[children.length - 1] || null;
      }
    },
    insertBefore(child) {
      element.appendChild(child);
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return attributes[name];
    },
    querySelector() {
      return null;
    },
    focus() {},
  };
  return element;
}

function setupContext() {
  const root = createElement('root');
  root.setAttribute('data-ui-mode', 'default');

  const toggle = createElement('header_menu_toggle');
  const panel = createElement('header_menu_panel');

  const documentListeners = {};
  const document = {
    documentElement: root,
    getElementById(id) {
      if (id === 'header_menu_toggle') return toggle;
      if (id === 'header_menu_panel') return panel;
      return null;
    },
    addEventListener(type, handler) {
      documentListeners[type] = documentListeners[type] || [];
      documentListeners[type].push(handler);
    },
    dispatch(type, event) {
      const handlers = documentListeners[type] || [];
      handlers.forEach((handler) => handler(event || {}));
    },
  };

  function MutationObserver() {}
  MutationObserver.prototype.observe = function() {};

  const context = {
    document,
    MutationObserver,
    console,
  };

  vm.createContext(context);
  vm.runInContext(headerMenuScript, context);
  context.initialize_header_menu();

  return { toggle, panel, document };
}

test('header menu closes on horizontal swipe gesture', () => {
  const { toggle, panel } = setupContext();

  toggle.dispatch('click', {
    preventDefault() {},
    stopPropagation() {},
  });
  assert.equal(panel.classList.contains('is-open'), true);

  panel.dispatch('touchstart', {
    touches: [{ clientX: 220, clientY: 30 }],
  });
  panel.dispatch('touchend', {
    changedTouches: [{ clientX: 120, clientY: 36 }],
  });

  assert.equal(panel.classList.contains('is-open'), false);
});

test('header menu stays open on mostly vertical touch movement', () => {
  const { toggle, panel } = setupContext();

  toggle.dispatch('click', {
    preventDefault() {},
    stopPropagation() {},
  });
  assert.equal(panel.classList.contains('is-open'), true);

  panel.dispatch('touchstart', {
    touches: [{ clientX: 120, clientY: 20 }],
  });
  panel.dispatch('touchend', {
    changedTouches: [{ clientX: 132, clientY: 115 }],
  });

  assert.equal(panel.classList.contains('is-open'), true);
});

test('header menu opens on left-edge swipe from left to right', () => {
  const { panel, document } = setupContext();

  assert.equal(panel.classList.contains('is-open'), false);

  document.dispatch('touchstart', {
    touches: [{ clientX: 10, clientY: 24 }],
  });
  document.dispatch('touchend', {
    changedTouches: [{ clientX: 110, clientY: 30 }],
  });

  assert.equal(panel.classList.contains('is-open'), true);
});