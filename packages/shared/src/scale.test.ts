import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPtiLabelString, parseScaleWeightLine } from './scale';

test('parseScaleWeightLine reads kg values', () => {
  assert.equal(parseScaleWeightLine('  1.250 kg'), 1.25);
  assert.equal(parseScaleWeightLine('W+002.500'), 2.5);
});

test('buildPtiLabelString builds GS1 elements', () => {
  const label = buildPtiLabelString({
    gtin: '1234567890123',
    lotCode: 'LOTE-A1',
    packDate: '2025-08-05',
  });
  assert.match(label, /\(01\)01234567890123/);
  assert.match(label, /\(10\)LOTE-A1/);
});
