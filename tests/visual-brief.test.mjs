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

test('landscape site supervisor does not inherit driver imagery', () => {
  const brief = buildVisualBrief({ position: 'หัวหน้าไซด์', family: 'Landscape Management' });
  assert.equal(brief.role, 'landscape-site-supervisor');
  assert.match(brief.subject, /landscape site supervisor/i);
  assert.ok(brief.required_elements.includes('clipboard or landscape plan'));
  assert.ok(brief.forbidden_elements.includes('driver uniform'));
  assert.ok(brief.forbidden_elements.includes('steering wheel'));
});
