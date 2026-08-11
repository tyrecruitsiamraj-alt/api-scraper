import test from 'node:test';
import assert from 'node:assert/strict';
import { clickWithoutNavigationWait } from '../src/providers/jobbkk/browser/safe-click.js';

test('JobBKK search click does not wait for an unreliable navigation event', async () => {
  let receivedOptions = null;
  const locator = {
    async click(options) {
      receivedOptions = options;
    },
  };

  await clickWithoutNavigationWait(locator);

  assert.deepEqual(receivedOptions, { noWaitAfter: true, timeout: 15_000 });
});

test('JobBKK safe click still rejects an invalid locator', async () => {
  await assert.rejects(() => clickWithoutNavigationWait(null), /locator is required/i);
});
