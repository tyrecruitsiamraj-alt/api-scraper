/**
 * Click a control whose application owns the navigation lifecycle.
 *
 * JobBKK can start a document navigation without completing Playwright's
 * implicit navigation waiter. Callers must verify the resulting page/cards
 * explicitly after this click.
 */
export async function clickWithoutNavigationWait(locator, timeout = 15_000) {
  if (!locator || typeof locator.click !== 'function') {
    throw new TypeError('A Playwright locator is required');
  }
  try {
    await locator.click({ noWaitAfter: true, timeout });
  } catch (error) {
    // Ant Design wrappers look clickable but stay disabled/readOnly — force the hit.
    await locator.click({ noWaitAfter: true, force: true, timeout: Math.min(timeout, 5_000) }).catch(() => {
      throw error;
    });
  }
}
