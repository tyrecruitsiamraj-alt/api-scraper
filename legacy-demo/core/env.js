export function envString(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value.trim();
}

export function envInt(name, fallback) {
  const parsed = Number.parseInt(envString(name, String(fallback)), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function envBool(name, fallback = false) {
  const value = envString(name, String(fallback)).toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  if (['false', '0', 'no', 'off'].includes(value)) return false;
  return fallback;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
