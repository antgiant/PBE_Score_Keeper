const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function getInputTagById(html, id) {
  const regex = new RegExp(`<input[^>]*id=["']${id}["'][^>]*>`, 'i');
  const match = html.match(regex);
  return match ? match[0] : null;
}

test('timer setting inputs use mobile numeric keypad hints', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  const firstPointInput = getInputTagById(html, 'timer_first_point_seconds');
  const subsequentInput = getInputTagById(html, 'timer_subsequent_point_seconds');

  assert.ok(firstPointInput, 'expected first-point timer input');
  assert.ok(subsequentInput, 'expected subsequent-point timer input');

  assert.match(firstPointInput, /\btype=["']number["']/);
  assert.match(firstPointInput, /\bmin=["']0["']/);
  assert.match(firstPointInput, /\bstep=["']1["']/);
  assert.match(firstPointInput, /\binputmode=["']numeric["']/);
  assert.match(firstPointInput, /\bpattern=["']\[0-9\]\*["']/);

  assert.match(subsequentInput, /\btype=["']number["']/);
  assert.match(subsequentInput, /\bmin=["']0["']/);
  assert.match(subsequentInput, /\bstep=["']1["']/);
  assert.match(subsequentInput, /\binputmode=["']numeric["']/);
  assert.match(subsequentInput, /\bpattern=["']\[0-9\]\*["']/);
});
