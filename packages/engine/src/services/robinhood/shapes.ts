/**
 * Lenient readers for Robinhood's MCP payloads.
 *
 * Robinhood publishes integration guides but no response reference — there is
 * no documented output for `get_equity_positions` or anything else, so these
 * shapes were derived from observed responses and the long-standing field
 * names of Robinhood's own API. Everything here therefore reads *tolerantly*:
 * accept any of the plausible key spellings, coerce numeric strings (Robinhood
 * sends money as strings), and return undefined rather than throwing when a
 * field is missing.
 *
 * The alternative — a strict parser — would turn a harmless new field or a
 * renamed one into a blank portfolio screen. Being liberal here and explicit
 * about missing data at the edges is the safer trade.
 */

/** MCP tool payloads arrive wrapped as `{ data, guide }`; unwrap to the data. */
export function unwrapData(payload: unknown): unknown {
  if (isRecord(payload) && 'data' in payload && 'guide' in payload) return payload.data;
  if (isRecord(payload) && 'data' in payload && Object.keys(payload).length === 1) {
    return payload.data;
  }
  return payload;
}

/**
 * Coax a list out of a payload.
 *
 * Collections come back either bare, or under `results` (Robinhood's REST
 * convention), or under a name matching the resource.
 */
export function asArray(payload: unknown, ...keys: string[]): Record<string, unknown>[] {
  const data = unwrapData(payload);
  if (Array.isArray(data)) return data.filter(isRecord);

  if (isRecord(data)) {
    for (const key of ['results', ...keys]) {
      const value = data[key];
      if (Array.isArray(value)) return value.filter(isRecord);
    }
  }
  return [];
}

export function asRecord(payload: unknown): Record<string, unknown> {
  const data = unwrapData(payload);
  return isRecord(data) ? data : {};
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * First present key read as a finite number.
 *
 * Robinhood serialises money as strings ("1234.5600"), so a plain Number()
 * coercion is the point rather than an accident. Empty strings and nulls are
 * treated as absent, not as zero — a zero would render as real data.
 */
export function num(source: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null || value === '') continue;
    const parsed = typeof value === 'number' ? value : Number(String(value));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function str(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number') return String(value);
  }
  return undefined;
}

/** Nested lookup for payloads that group fields, e.g. `{ balances: { cash } }`. */
export function nested(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  return isRecord(value) ? value : {};
}

/**
 * Normalize a timestamp to ISO 8601.
 *
 * Returns undefined for unparseable input rather than the epoch, so a bad
 * value doesn't silently sort to the bottom of an activity feed as 1970.
 */
export function isoTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}
