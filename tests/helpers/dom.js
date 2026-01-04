const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createStorage } = require('./storage');

function extractScripts(html) {
  const matches = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
  return matches.map((match) => {
    const srcMatch = match[0].match(/src=["']([^"']+)["']/);
    return {
      src: srcMatch ? srcMatch[1] : null,
      inline: match[1] ? match[1].trim() : '',
    };
  });
}

function buildContext(seed = {}) {
  const localStorage = createStorage(seed);
  const elements = new Map();

  function getElement(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        children: [],
        props: {},
        styles: {},
        textContent: '',
        htmlContent: '',
        value: '',
      });
    }
    return elements.get(id);
  }

  function createChild(parent) {
    const child = {
      remove() {
        const index = parent.children.indexOf(child);
        if (index > -1) {
          parent.children.splice(index, 1);
        }
      },
    };
    parent.children.push(child);
  }

  function parseIds(markup) {
    if (typeof markup !== 'string') {
      return;
    }
    const idRegex = /id=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/g;
    let match = idRegex.exec(markup);
    while (match) {
      const id = match[1] || match[2] || match[3];
      if (id) {
        getElement(id);
      }
      match = idRegex.exec(markup);
    }
  }

  function wrap(element) {
    return {
      append(content) {
        parseIds(content);
        createChild(element);
        return this;
      },
      children() {
        return element.children;
      },
      html(value) {
        if (value === undefined) {
          return element.htmlContent;
        }
        element.htmlContent = String(value);
        return this;
      },
      text(value) {
        if (value === undefined) {
          return element.textContent;
        }
        element.textContent = String(value);
        return this;
      },
      val(value) {
        if (value === undefined) {
          return element.value;
        }
        element.value = String(value);
        return this;
      },
      prop(name, value) {
        if (value === undefined) {
          return element.props[name];
        }
        element.props[name] = value;
        return this;
      },
      controlgroup() {
        return this;
      },
      accordion() {
        return this;
      },
      keypress() {
        return this;
      },
      css() {
        if (arguments.length === 1) {
          return element.styles[arguments[0]];
        }
        if (arguments.length >= 2) {
          element.styles[arguments[0]] = arguments[1];
        }
        return this;
      },
      show() {
        element.styles.display = 'block';
        return this;
      },
      hide() {
        element.styles.display = 'none';
        return this;
      },
      trigger() {
        return this;
      },
      focus() {
        return this;
      },
    };
  }

  const document = {
    createTextNode(text) {
      return { nodeValue: text };
    },
    createElement() {
      return {
        _child: null,
        appendChild(node) {
          this._child = node;
        },
        get innerHTML() {
          return this._child ? String(this._child.nodeValue ?? '') : '';
        },
      };
    },
  };

  const noop = () => {};
  const jqueryStub = (selector) => {
    if (selector === document) {
      return { ready: noop };
    }
    if (typeof selector === 'string' && selector.startsWith('#')) {
      return wrap(getElement(selector.slice(1)));
    }
    return { ready: noop };
  };

  const windowStub = {
    confirm: () => true,
    alert: noop,
    File: function File() {},
    FileReader: function FileReader() {},
    FileList: function FileList() {},
    Blob: function Blob() {},
  };

  const context = {
    console,
    JSON,
    localStorage,
    document,
    window: windowStub,
    Blob: function Blob() {},
    URL: {
      createObjectURL: () => 'blob:fake',
    },
    $: jqueryStub,
  };

  windowStub.window = windowStub;
  windowStub.document = document;

  return { context, localStorage };
}

function loadApp(seed = {}) {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const { context, localStorage } = buildContext(seed);
  vm.createContext(context);
  const scripts = extractScripts(html);
  if (!scripts.length) {
    throw new Error('Inline script or script source not found in index.html');
  }
  scripts.forEach((script) => {
    if (script.src) {
      if (script.src.includes('jquery')) {
        return;
      }
      const content = fs.readFileSync(path.join(__dirname, '..', '..', script.src), 'utf8');
      vm.runInContext(content, context);
      return;
    }
    if (script.inline) {
      vm.runInContext(script.inline, context);
    }
  });
  return { context, localStorage };
}

module.exports = { buildContext, loadApp };
