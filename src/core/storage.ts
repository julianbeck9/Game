/**
 * Shared helpers for the browser-persisted `cc_*` stores (balance overrides,
 * map edits, admin flag). Every store keeps its schema version baked into its
 * own key name (e.g. `cc_balance_v1`) — the version is part of what makes a
 * key valid, so a stale key from before a schema change (or from before an
 * admin "bake" of exported overrides into source) is simply a different,
 * unrecognized string and gets ignored rather than migrated-guessed.
 *
 * When you bake `exportBalance()`/`exportEdits()` output into source
 * (`champions/kits.ts`, `maps.ts`, …), bump that store's `SCHEMA_VERSION`
 * constant too — this orphans any leftover browser overrides that would
 * otherwise silently re-cover the freshly baked numbers on next load.
 */

/** Common prefix for every store this game keeps in localStorage. */
export const CC_PREFIX = 'cc_';

/**
 * Read + parse a versioned JSON store. Returns `fallback` (never throws) when
 * storage is unavailable, the value is missing, the JSON is malformed, or
 * `validate` rejects the parsed shape — a corrupt or pre-bake-stale store
 * boots clean on plain defaults instead of crashing or applying garbage.
 */
export function loadVersioned<T>(key: string, validate: (raw: unknown) => raw is T, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback();
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : fallback();
  } catch {
    return fallback();
  }
}

/** Write a store as JSON; failures (quota, disabled storage) are swallowed. */
export function saveVersioned<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / disabled — value stays live in memory for this session */
  }
}

/** True for a plain JSON object (not null, not an array). */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Admin "reset everything" — drops every `cc_*` key so the next load starts
 * from clean defaults (no balance overrides, no map edits, admin flag
 * cleared too). Callers should reload the page afterward so in-memory
 * caches (each store's module-level `load()` cache) restart alongside it.
 */
export function resetAllCCStorage(): void {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(CC_PREFIX));
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* storage unavailable — nothing to reset */
  }
}
