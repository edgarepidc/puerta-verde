import assert from 'node:assert/strict';
import test from 'node:test';

import { slugifyOrganizationName, validateOnboardingInput } from './onboarding';

test('slugifyOrganizationName normalizes names', () => {
  assert.equal(slugifyOrganizationName('Puerta Verde'), 'puerta-verde');
  assert.equal(slugifyOrganizationName('  La Huerta #1 '), 'la-huerta-1');
});

test('validateOnboardingInput requires valid fields', () => {
  assert.equal(
    validateOnboardingInput({
      organizationName: '',
      branchName: 'Torre A',
      branchSlug: 'torre-a',
      ownerName: 'Ana',
      email: 'ana@test.com',
      password: '12345678',
    }),
    'El nombre de la verdulería es obligatorio.',
  );

  assert.equal(
    validateOnboardingInput({
      organizationName: 'Puerta Verde',
      branchName: 'Torre A',
      branchSlug: 'torre-a',
      ownerName: 'Ana',
      email: 'ana@test.com',
      password: '12345678',
    }),
    null,
  );
});
