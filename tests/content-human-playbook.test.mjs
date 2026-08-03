import test from 'node:test';
import assert from 'node:assert/strict';

import { loadHumanPlaybook, withHumanPlaybook } from '../src/core/human-content-playbook.js';

test('loads the editable human strategy, copy, visual and review playbooks', () => {
  for (const name of ['content-strategy', 'copywriting', 'visual-direction', 'review-scorecard']) {
    const text = loadHumanPlaybook(name);
    assert.ok(text.length > 200, `${name} should contain a usable human playbook`);
  }
});

test('injects the selected human playbook into the model system prompt', () => {
  const result = withHumanPlaybook('BASE RULES', ['copywriting', 'visual-direction']);
  assert.match(result, /BASE RULES/);
  assert.match(result, /นักเขียนคอนเทนต์สรรหา/);
  assert.match(result, /ผู้กำกับศิลป์งานสรรหา/);
});

test('does not load arbitrary files outside the approved playbook set', () => {
  assert.equal(loadHumanPlaybook('../../.env'), '');
});
