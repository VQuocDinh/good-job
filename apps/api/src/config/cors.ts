/**
 * Allowed browser origins, shared by HTTP CORS and the socket.io gateway.
 * WEB_ORIGIN is a comma-separated list (e.g. "https://app.example.com").
 * Unset -> reflect any origin (development convenience only).
 */
export function corsOrigin(): string[] | boolean {
  const raw = process.env.WEB_ORIGIN;
  if (!raw) return true;
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
