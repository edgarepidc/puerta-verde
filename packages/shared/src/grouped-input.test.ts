import assert from 'node:assert/strict';
import test from 'node:test';

import {
  caretForGroupedDisplay,
  formatGroupedNumber,
  groupedCaretFromDisplay,
} from './grouped-input';

test('formatGroupedNumber keeps a trailing decimal point', () => {
  assert.equal(formatGroupedNumber('2634.'), '2,634.');
  assert.equal(formatGroupedNumber('2634.5'), '2,634.5');
  assert.equal(formatGroupedNumber('.'), '.');
});

test('caret stays after a newly typed decimal point', () => {
  const display = '2,634.';
  const typed = groupedCaretFromDisplay(display, display.length);
  assert.deepEqual(typed, { intDigits: 4, afterDot: true, fracDigits: 0 });
  assert.equal(caretForGroupedDisplay(display, typed), display.length);
});

test('caret stays after digits that follow the decimal point', () => {
  const display = '2,634.50';
  const typed = groupedCaretFromDisplay(display, display.length);
  assert.deepEqual(typed, { intDigits: 4, afterDot: true, fracDigits: 2 });
  assert.equal(caretForGroupedDisplay(display, typed), display.length);
});

test('caret in the integer part ignores the fraction', () => {
  const display = '2,634.50';
  const typed = groupedCaretFromDisplay(display, 3);
  assert.deepEqual(typed, { intDigits: 2, afterDot: false, fracDigits: 0 });
  assert.equal(caretForGroupedDisplay(display, typed), 3);
});
