import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAcceptTalentSearchResult } from '../src/providers/jobbkk/resume-talent-entry.js';

test('does not accept leftover zero results on the first poll', () => {
  assert.equal(shouldAcceptTalentSearchResult({
    searching: false,
    sawSearching: false,
    changedIds: false,
    countText: 0,
    beforeCount: 0,
    elapsedMs: 0,
  }), false);
});

test('accepts zero only after minimum wait when searching indicator never appears', () => {
  assert.equal(shouldAcceptTalentSearchResult({
    searching: false,
    sawSearching: false,
    changedIds: false,
    countText: 0,
    beforeCount: 0,
    elapsedMs: 2500,
  }), true);
});

test('accepts when result count changes from previous keyword', () => {
  assert.equal(shouldAcceptTalentSearchResult({
    searching: false,
    sawSearching: false,
    changedIds: false,
    countText: 40,
    beforeCount: 0,
    elapsedMs: 800,
  }), true);
});

test('accepts new resume ids immediately', () => {
  assert.equal(shouldAcceptTalentSearchResult({
    searching: false,
    sawSearching: false,
    changedIds: true,
    countText: 0,
    beforeCount: 0,
    elapsedMs: 100,
  }), true);
});

test('waits while searching indicator is visible', () => {
  assert.equal(shouldAcceptTalentSearchResult({
    searching: true,
    sawSearching: true,
    changedIds: false,
    countText: 0,
    beforeCount: 0,
    elapsedMs: 5000,
  }), false);
});
