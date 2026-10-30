// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

import { labelName } from './trilium/model.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const REFRESH_MINUTES = ['5', '15', '30', '60'];

export const DEFAULT_CONFIG = {
  url: '',
  token: '',
  refresh_minutes: '15',
  todo_label: 'todo',
  language: 'fr',
};

/**
 * Turn what the user typed into the base URL of Trilium, without `/etapi`:
 * - `192.0.2.10:8080` or `notes.local`: http, that address;
 * - `https://example.org/notes/`: exactly that address (reverse proxy).
 * A pasted `/etapi` suffix, the `#root/...` of a note or the login page are
 * dropped. Returns null when it is not usable.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (text === '') {
    return null;
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(hasScheme ? text : `http://${text}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.hostname === '') {
    return null;
  }
  if (url.username || url.password) {
    // Credentials in the URL would end up in logs and error messages.
    return null;
  }
  const path = url.pathname
    .replace(/\/(etapi|login|api|set-password)(\/.*)?$/i, '')
    .replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${path}`;
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const typed = text(source.url);
  const url = normalizeUrl(typed);
  const refresh = String(source.refresh_minutes ?? '');
  const todo = labelName(source.todo_label);
  return {
    url,
    urlInvalid: typed !== '' && url === null,
    // A token pasted with its header name works as well.
    token: text(source.token).replace(/^(authorization:\s*)?(bearer\s+)?/i, ''),
    refreshMinutes: Number(
      REFRESH_MINUTES.includes(refresh) ? refresh : DEFAULT_CONFIG.refresh_minutes,
    ),
    todoLabel: todo || DEFAULT_CONFIG.todo_label,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
