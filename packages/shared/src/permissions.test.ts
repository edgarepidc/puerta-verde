import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canEditPermissionMatrix,
  normalizePermissionMatrixInput,
  parsePermissionsFromOrgSettings,
  resolvePermissionMatrix,
  roleHasPermission,
} from './permissions';
import { normalizeStaffRole } from './staff-roles';

test('normalizeStaffRole maps org_admin to branch_manager', () => {
  assert.equal(normalizeStaffRole('org_admin'), 'branch_manager');
  assert.equal(normalizeStaffRole('branch_manager'), 'branch_manager');
  assert.equal(normalizeStaffRole('staff'), 'staff');
  assert.equal(normalizeStaffRole('nope'), null);
});

test('resolvePermissionMatrix fills defaults and forces owner', () => {
  const matrix = resolvePermissionMatrix({
    'pos.edit_price': ['staff'],
    'sales.export': ['branch_manager', 'not-a-role'],
  });
  assert.deepEqual(matrix['pos.edit_price'], ['owner', 'staff']);
  assert.deepEqual(matrix['sales.export'], ['owner', 'branch_manager']);
  assert.ok(matrix['staff.manage'].includes('owner'));
  assert.ok(matrix['staff.manage'].includes('branch_manager'));
  assert.ok(matrix['products.manage'].includes('staff'));
  assert.ok(matrix['profit.view'].includes('branch_manager'));
  assert.equal(matrix['profit.view'].includes('staff'), false);
  assert.ok(matrix['stock.thresholds'].includes('branch_manager'));
  assert.equal(matrix['stock.thresholds'].includes('staff'), false);
  assert.ok(matrix['orders.edit'].includes('staff'));
  assert.ok(matrix['orders.edit'].includes('branch_manager'));
  assert.ok(matrix['orders.delete'].includes('branch_manager'));
  assert.equal(matrix['orders.delete'].includes('staff'), false);
  assert.ok(matrix['coupons.manage'].includes('branch_manager'));
  assert.equal(matrix['coupons.manage'].includes('staff'), false);
});

test('resolvePermissionMatrix remaps legacy org_admin in stored matrix', () => {
  const matrix = resolvePermissionMatrix({
    'staff.manage': ['org_admin'],
  });
  assert.deepEqual(matrix['staff.manage'], ['owner', 'branch_manager']);
});

test('parsePermissionsFromOrgSettings reads nested permissions', () => {
  const matrix = parsePermissionsFromOrgSettings({
    permissions: { 'inventory.adjust': ['owner'] },
  });
  assert.deepEqual(matrix['inventory.adjust'], ['owner']);
  assert.ok(matrix['purchases.manage'].includes('staff'));
});

test('roleHasPermission: owner always true; others follow matrix', () => {
  const matrix = resolvePermissionMatrix({
    'pos.edit_price': ['owner', 'branch_manager'],
  });
  assert.equal(roleHasPermission('owner', 'pos.edit_price', matrix), true);
  assert.equal(roleHasPermission('owner', 'sales.export', matrix), true);
  assert.equal(roleHasPermission('branch_manager', 'pos.edit_price', matrix), true);
  assert.equal(roleHasPermission('staff', 'pos.edit_price', matrix), false);
});

test('canEditPermissionMatrix is owner or administrador', () => {
  assert.equal(canEditPermissionMatrix('owner'), true);
  assert.equal(canEditPermissionMatrix('branch_manager'), true);
  assert.equal(canEditPermissionMatrix('staff'), false);
});

test('normalizePermissionMatrixInput rejects garbage', () => {
  const matrix = normalizePermissionMatrixInput('nope');
  assert.ok(matrix['sales.export'].includes('staff'));
  assert.ok(matrix['promotions.manage'].includes('branch_manager'));
});
