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
  const autoStartInput = getInputTagById(html, 'timer_auto_start');
  const firstPointInput = getInputTagById(html, 'timer_first_point_seconds');
  const subsequentInput = getInputTagById(html, 'timer_subsequent_point_seconds');
  const warningFlashInput = getInputTagById(html, 'timer_warning_flash_seconds');

  assert.ok(autoStartInput, 'expected auto-start timer input');
  assert.ok(firstPointInput, 'expected first-point timer input');
  assert.ok(subsequentInput, 'expected subsequent-point timer input');
  assert.ok(warningFlashInput, 'expected warning-flash timer input');

  assert.match(autoStartInput, /\btype=["']checkbox["']/);

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

  assert.match(warningFlashInput, /\btype=["']number["']/);
  assert.match(warningFlashInput, /\bmin=["']0["']/);
  assert.match(warningFlashInput, /\bstep=["']1["']/);
  assert.match(warningFlashInput, /\binputmode=["']numeric["']/);
  assert.match(warningFlashInput, /\bpattern=["']\[0-9\]\*["']/);

  const subsequentIndex = html.indexOf('id="timer_subsequent_point_seconds"');
  const warningFlashIndex = html.indexOf('id="timer_warning_flash_seconds"');
  assert.ok(subsequentIndex < warningFlashIndex, 'expected warning flash input immediately after additional points input');

  assert.equal(html.includes('id="question_timer_stop"'), false, 'timer stop button should be removed');
});

test('timer settings fieldset is positioned directly above score entry fieldset placeholder', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  const timerFieldsetIndex = html.indexOf('id="timer_fieldset"');
  const scoreEntryPlaceholderIndex = html.indexOf('id="score_entry_fieldset_placeholder"');

  assert.notEqual(timerFieldsetIndex, -1, 'expected timer fieldset in html');
  assert.notEqual(scoreEntryPlaceholderIndex, -1, 'expected score entry placeholder in html');
  assert.ok(timerFieldsetIndex < scoreEntryPlaceholderIndex, 'expected timer fieldset before score entry placeholder');
});
