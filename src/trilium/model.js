// -----------------------------------------------------------------------------
// Trilium answers -> plain values, and what users type in scenes (a parent
// note, labels, a line for the day note) -> what ETAPI wants.
// -----------------------------------------------------------------------------

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/** The address of a note in Trilium (it finds the path from the id). */
export const noteUrl = (baseUrl, noteId) => `${baseUrl}/#root/${encodeURIComponent(noteId)}`;

/**
 * The labels a note carries itself (not those of its template or inherited
 * from a parent), as `{ name, value }`.
 */
export function ownLabels(note) {
  return (Array.isArray(note?.attributes) ? note.attributes : [])
    .filter((a) => a?.type === 'label' && a.noteId === note.noteId && clean(a.name) !== '')
    .map((a) => ({ name: clean(a.name), value: clean(a.value) }));
}

/** The distinct names of every label in effect on a note (inherited ones too). */
export function labelNames(note) {
  const seen = new Set();
  for (const a of Array.isArray(note?.attributes) ? note.attributes : []) {
    if (a?.type === 'label' && clean(a.name) !== '') {
      seen.add(clean(a.name));
    }
  }
  return [...seen];
}

/** `[{ name: 'todo' }, { name: 'priority', value: 'high' }]` -> `#todo #priority=high`. */
export const labelText = (labels) =>
  labels.map((l) => (l.value ? `#${l.name}=${l.value}` : `#${l.name}`)).join(' ');

/**
 * A note as the integration keeps it.
 * @param {object} note
 * @param {string} baseUrl
 */
export function summarizeNote(note, baseUrl) {
  return {
    id: note.noteId,
    title: clean(note.title) || note.noteId,
    created: note.utcDateCreated,
    updated: note.utcDateModified,
    url: noteUrl(baseUrl, note.noteId),
  };
}

/**
 * A label name as Trilium accepts it (letters, digits, `_`, `:`), with or
 * without its `#`; '' when nothing usable is left.
 * @param {unknown} raw
 */
export function labelName(raw) {
  const text = clean(typeof raw === 'string' ? raw : '').replace(/^#/, '');
  return /^[\p{L}\p{N}_:]+$/u.test(text) ? text.slice(0, 100) : '';
}

/**
 * `todo, priority=high` (or `#todo #priority=high`) ->
 * `[{ name: 'todo' }, { name: 'priority', value: 'high' }]`; names Trilium
 * would refuse are left out.
 * @param {unknown} text
 */
export function parseLabels(text) {
  const labels = [];
  const seen = new Set();
  const source = clean(typeof text === 'string' ? text : '');
  // `#a #b=c` is split on the hashes; anything else on commas, semicolons, lines.
  const parts = /^#/.test(source) ? source.split(/\s+(?=#)/) : source.split(/[,;\n]/);
  for (const part of parts) {
    const cut = part.indexOf('=');
    const name = labelName(cut < 0 ? part : part.slice(0, cut));
    const value = cut < 0 ? '' : clean(part.slice(cut + 1)).slice(0, 200);
    if (name && !seen.has(name)) {
      seen.add(name);
      labels.push(value ? { name, value } : { name });
    }
  }
  return labels.slice(0, 20);
}

export const escapeHtml = (text) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** Plain text -> the HTML of a text note: one paragraph per line. */
export function textToHtml(text) {
  const lines = clean(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
}

const two = (n) => String(n).padStart(2, '0');

/** `2026-10-30`, the local date (TZ of Gladys, set by its supervisor). */
export function localDate(time) {
  const date = new Date(time);
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** `08:15`, the local time. */
export function localTime(time) {
  const date = new Date(time);
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
}

/**
 * The HTML of a text note once a paragraph is added at its end (the line is
 * escaped: it comes from a scene).
 * @param {string} html
 * @param {string} line
 */
export function appendParagraph(html, line) {
  const before = (typeof html === 'string' ? html : '').replace(/\s+$/, '');
  return `${before}<p>${escapeHtml(line)}</p>`;
}
