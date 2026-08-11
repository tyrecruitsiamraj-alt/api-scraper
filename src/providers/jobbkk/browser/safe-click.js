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
  await locator.click({ noWaitAfter: true, timeout });
}
