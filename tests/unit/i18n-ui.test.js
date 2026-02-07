const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function extractAttributes(tagContent) {
  const attrs = {};
  const attrRegex = /([a-zA-Z0-9-:]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = attrRegex.exec(tagContent)) !== null) {
    const name = match[1];
    const value = match[3] !== undefined ? match[3] : match[4];
    attrs[name] = value;
  }
  return attrs;
}

function hasLetters(value) {
  return /[A-Za-z]/.test(value);
}

function findUntranslatedContent(html) {
  const voidTags = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
    'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);
  const skipTags = new Set(['script', 'style']);
  const stack = [];
  const untranslatedText = [];
  const untranslatedAttributes = [];
  let skipDepth = 0;
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      const tail = html.slice(i);
      if (skipDepth === 0) {
        const trimmed = tail.replace(/\s+/g, ' ').trim();
        if (trimmed && hasLetters(trimmed) && !stack.some((entry) => entry.i18n)) {
          untranslatedText.push(trimmed);
        }
      }
      break;
    }

    if (lt > i && skipDepth === 0) {
      const text = html.slice(i, lt);
      const trimmed = text.replace(/\s+/g, ' ').trim();
      if (trimmed && hasLetters(trimmed) && !stack.some((entry) => entry.i18n)) {
        untranslatedText.push(trimmed);
      }
    }

    const gt = html.indexOf('>', lt + 1);
    if (gt === -1) {
      break;
    }

    const tagContent = html.slice(lt + 1, gt);

    if (tagContent.startsWith('!--')) {
      const endComment = html.indexOf('-->', gt + 1);
      if (endComment === -1) {
        break;
      }
      i = endComment + 3;
      continue;
    }

    const isClosing = /^\s*\//.test(tagContent);
    const tagNameMatch = tagContent.match(/^\s*\/?\s*([a-zA-Z0-9-]+)/);
    const tagName = tagNameMatch ? tagNameMatch[1].toLowerCase() : null;
    const isSelfClosing = /\/$/.test(tagContent) || (tagName && voidTags.has(tagName));

    if (tagName && !isClosing) {
      const attrs = extractAttributes(tagContent);
      const hasDataI18n = /\bdata-i18n(?=\s|=)/.test(tagContent);
      stack.push({ tagName, i18n: hasDataI18n });

      if (skipTags.has(tagName)) {
        skipDepth += 1;
      }

      ['aria-label', 'title', 'placeholder'].forEach((attrName) => {
        if (!attrs[attrName]) return;
        if (!hasLetters(attrs[attrName])) return;

        const hasI18nAttr =
          (attrName === 'aria-label' && (attrs['data-i18n-aria-label'] || attrs['data-i18n-target'] === 'aria-label')) ||
          (attrName === 'title' && (attrs['data-i18n-title'] || attrs['data-i18n-target'] === 'title')) ||
          (attrName === 'placeholder' && (attrs['data-i18n-placeholder'] || attrs['data-i18n-target'] === 'placeholder'));

        if (!hasI18nAttr) {
          untranslatedAttributes.push(`${tagName}:${attrName}=${attrs[attrName]}`);
        }
      });

      if (isSelfClosing) {
        stack.pop();
        if (skipTags.has(tagName)) {
          skipDepth = Math.max(0, skipDepth - 1);
        }
      }
    }

    if (tagName && isClosing) {
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s].tagName === tagName) {
          stack.splice(s, 1);
          break;
        }
      }
      if (skipTags.has(tagName)) {
        skipDepth = Math.max(0, skipDepth - 1);
      }
    }

    i = gt + 1;
  }

  return { untranslatedText, untranslatedAttributes };
}

test('UI strings use i18n attributes', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  const result = findUntranslatedContent(html);

  assert.deepStrictEqual(result.untranslatedText, [], `Untranslated text found: ${result.untranslatedText.join(' | ')}`);
  assert.deepStrictEqual(result.untranslatedAttributes, [], `Untranslated attributes found: ${result.untranslatedAttributes.join(' | ')}`);
});
