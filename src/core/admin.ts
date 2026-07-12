/**
 * Admin mode. No password (personal game): it turns on when the page is opened
 * once with ?admin in the URL, and then stays on for this browser. The admin
 * tools (Map Editor, Balance tuner) only show while it's on.
 */
const KEY = 'cc_admin';

export function isAdmin(): boolean {
  try {
    if (new URLSearchParams(location.search).has('admin')) localStorage.setItem(KEY, '1');
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setAdmin(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
