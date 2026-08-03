import { test, expect } from '@playwright/test';
import { buildPostIdentity } from '../src/helpers/postLog';
import { isCaptionVariationEnabled, varyCaptionForGroup } from '../src/helpers/captionVariation';

test.describe('post integrity helpers', () => {
  test('post identity is stable for the same content and target', () => {
    const input = { userId: 'u1', jobId: 'j1', groupId: 'g1', caption: 'รับสมัคร พนักงานขับรถ' };
    expect(buildPostIdentity(input)).toEqual(buildPostIdentity(input));
  });

  test('post identity changes with group or content', () => {
    const base = buildPostIdentity({ userId: 'u1', jobId: 'j1', groupId: 'g1', caption: 'A' });
    const group = buildPostIdentity({ userId: 'u1', jobId: 'j1', groupId: 'g2', caption: 'A' });
    const content = buildPostIdentity({ userId: 'u1', jobId: 'j1', groupId: 'g1', caption: 'B' });
    expect(group.idempotencyKey).not.toBe(base.idempotencyKey);
    expect(content.idempotencyKey).not.toBe(base.idempotencyKey);
  });

  test('caption variation is opt-in and preserves approved copy by default', () => {
    delete process.env.CAPTION_VARIATION_ENABLED;
    expect(isCaptionVariationEnabled()).toBe(false);
    expect(varyCaptionForGroup('สนใจทักมาได้', '123')).toBe('สนใจทักมาได้');
  });
});
