import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTENT_DISABLED_OPERATOR_MESSAGE,
  PRODUCT_MODULES,
  isContentGenerationEnabled,
  productScopeSummary,
} from '../src/core/product-scope.js';

test('ผลิตภัณฑ์เปิดเฉพาะ Scrap และ Autopost', () => {
  assert.equal(PRODUCT_MODULES.scraping, true);
  assert.equal(PRODUCT_MODULES.autopost, true);
  assert.equal(PRODUCT_MODULES.contentGeneration, false);
  assert.equal(isContentGenerationEnabled(), false);
  assert.match(productScopeSummary(), /ค้นหาผู้สมัคร/);
  assert.match(productScopeSummary(), /โพสต์ Facebook/);
  assert.doesNotMatch(productScopeSummary(), /สร้างประกาศ/);
  assert.match(CONTENT_DISABLED_OPERATOR_MESSAGE, /ไม่รับงานสร้างประกาศ/);
});
