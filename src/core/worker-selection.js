function normalized(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * SCRAPE_PREFERRED_WORKER may pin either one runner slot (scraper-1) or the
 * physical machine (SONB-RM009).  A pool exposes each slot as a separate
 * worker name, so machine pins must be resolved through heartbeat metadata.
 */
export function selectPreferredScrapeWorker(workers = [], configuredWorker = '') {
  const ready = Array.isArray(workers) ? workers : [];
  const configured = normalized(configuredWorker);
  if (!configured) return ready[0]?.name ?? null;

  const match = ready.find((worker) => (
    normalized(worker?.name) === configured
    || normalized(worker?.meta?.machine_name) === configured
  ));
  return match?.name ?? null;
}
