import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVisualBrief, composeVisualPrompt } from '../src/core/visual-brief.js';

test('driver brief locks the role and excludes medical imagery', () => {
  const brief = buildVisualBrief({ position: 'พนักงานขับรถ' });
  assert.equal(brief.role, 'driver');
  assert.match(brief.subject, /driver/i);
  assert.ok(brief.forbidden_elements.includes('medical scrubs'));
  assert.match(composeVisualPrompt(brief, 'a nurse portrait'), /Never show:.*nurse uniform/i);
});

test('brief always reserves the generated image for editable poster text', () => {
  const brief = buildVisualBrief({ position: 'ช่างเทคนิค' });
  assert.match(brief.composition, /right side/i);
  assert.ok(brief.constraints.some((x) => /no text/i.test(x)));
});
