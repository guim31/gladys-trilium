// -----------------------------------------------------------------------------
// A fake Trilium behind a `fetch` function: it starts from the bodies recorded
// on a real TriliumNext v0.106.1 (test/fixtures/trilium/v0.106.1/), keeps its
// notes in memory, understands the few searches the integration sends, and
// answers the errors the real server answers (401, 404 coded or not, 400).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const HOST = 'http://192.0.2.50:8080';
export const TOKEN = 'tokenid0000_secret00000000000000000000000000000000=';
// The creation time of the recorded root note, as an instance id.
export const INSTANCE = '20261030120049898';
// Half an hour after the fixtures were recorded (12:00 to 12:08 UTC).
export const NOW = Date.parse('2026-10-30T12:30:00.000Z');

const DIR = new URL('../fixtures/trilium/v0.106.1/', import.meta.url);
export const fixture = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, DIR), 'utf8'));
export const DAY_CONTENT = readFileSync(new URL('day-content.html', DIR), 'utf8');

export const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const stampOf = (time) => new Date(time).toISOString().replace('T', ' ');
const localStamp = (time) => stampOf(time).replace('Z', '+0000');
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function createTrilium() {
  const root = fixture('root').body;
  const hidden = { ...structuredClone(root), noteId: '_hidden', title: 'Hidden Notes' };
  const state = {
    appInfo: fixture('app-info').body,
    // The recorded notes, the newest change first, plus the root and the
    // root of the hidden subtree (both in the answers of the real server).
    notes: [
      structuredClone(root),
      hidden,
      ...structuredClone(fixture('search-recent').body.results),
    ],
    // The recorded day note holds the "Tasks" of the default day template.
    content: new Map([['Pq0AXYtJG6X0', DAY_CONTENT]]),
    down: false,
    html: false,
    requests: [],
    clock: Date.parse('2026-10-30T12:10:00.000Z'),
    serial: 0,
  };
  const answer = (status, body, type = 'application/json') =>
    new Response(
      status === 204 ? null : type === 'application/json' ? JSON.stringify(body) : body,
      { status, headers: { 'content-type': type } },
    );
  const byId = (id) => state.notes.find((n) => n.noteId === id);
  const tick = () => {
    state.clock += 60_000;
    return state.clock;
  };
  const newId = () => `fake${String((state.serial += 1)).padStart(8, '0')}`;

  /** A note created by a user (or by ETAPI) in Trilium. */
  function addNote({ title = 'New note', labels = [], parent = 'root', content = '' } = {}) {
    const at = tick();
    const noteId = newId();
    const note = {
      noteId,
      isProtected: false,
      title,
      type: 'text',
      mime: 'text/html',
      blobId: `blob${noteId}`,
      dateCreated: localStamp(at),
      dateModified: localStamp(at),
      utcDateCreated: stampOf(at),
      utcDateModified: stampOf(at),
      parentNoteIds: [parent],
      childNoteIds: [],
      parentBranchIds: [`${parent}_${noteId}`],
      childBranchIds: [],
      attributes: [],
    };
    for (const label of labels) {
      addLabel(note, typeof label === 'string' ? { name: label } : label);
    }
    state.notes.push(note);
    state.content.set(noteId, content);
    return note;
  }

  function addLabel(note, { name, value = '' }) {
    const attribute = {
      attributeId: `attr${newId()}`,
      noteId: note.noteId,
      type: 'label',
      name,
      value,
      position: (note.attributes.length + 1) * 10,
      isInheritable: false,
      utcDateModified: stampOf(state.clock),
    };
    note.attributes.push(attribute);
    return attribute;
  }

  /** A note saved by a user: its modification time moves. */
  function editNote(id, { title, content } = {}) {
    const note = byId(id);
    const at = tick();
    note.utcDateModified = stampOf(at);
    note.dateModified = localStamp(at);
    if (title !== undefined) {
      note.title = title;
    }
    if (content !== undefined) {
      state.content.set(id, content);
    }
    return note;
  }

  const hasLabel = (note, name) =>
    note.attributes.some((a) => a.type === 'label' && a.name === name);

  function search(params) {
    const query = params.get('search');
    let notes = [...state.notes];
    let match;
    if (query === "note.noteId != ''") {
      // every note
    } else if ((match = query.match(/^note\.utcDateModified >= '([^']+)'$/))) {
      notes = notes.filter((n) => n.utcDateModified >= match[1]);
    } else if ((match = query.match(/^#([\p{L}\p{N}_:]+) #!done$/u))) {
      notes = notes.filter((n) => hasLabel(n, match[1]) && !hasLabel(n, 'done'));
    } else if ((match = query.match(/^note\.title = '((?:[^'\\]|\\.)*)'$/))) {
      const title = match[1].replace(/\\(.)/g, '$1').toLowerCase();
      notes = notes.filter((n) => n.title.toLowerCase() === title);
    } else {
      throw new Error(`fake Trilium: no search ${query}`);
    }
    const orderBy = params.get('orderBy');
    if (orderBy) {
      const direction = params.get('orderDirection') === 'desc' ? -1 : 1;
      notes.sort((a, b) =>
        a[orderBy] < b[orderBy] ? -direction : a[orderBy] > b[orderBy] ? direction : 0,
      );
    }
    const limit = Number(params.get('limit') ?? 0);
    return { results: structuredClone(limit > 0 ? notes.slice(0, limit) : notes) };
  }

  function dayNote(date) {
    const existing = state.notes.find((n) =>
      n.attributes.some((a) => a.name === 'dateNote' && a.value === date),
    );
    if (existing) {
      return existing;
    }
    const day = new Date(`${date}T12:00:00Z`);
    const note = addNote({
      title: `${date.slice(8)} - ${WEEKDAYS[day.getUTCDay()]}`,
      content: DAY_CONTENT,
    });
    addLabel(note, { name: 'dateNote', value: date });
    return note;
  }

  async function fetch(url, init = {}) {
    const { pathname, searchParams } = new URL(url);
    const path = pathname.replace(/^\/etapi/, '');
    const method = init.method ?? 'GET';
    state.requests.push(`${method} ${path}${searchParams.size ? `?${searchParams}` : ''}`);
    if (state.down) {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }
    if (state.html) {
      return answer(200, '<html>Login</html>', 'text/html');
    }
    const authorization = init.headers?.Authorization;
    if (!authorization) {
      return answer(401, fixture('no-token').body);
    }
    if (authorization !== TOKEN) {
      return answer(401, fixture('unauthorized').body);
    }
    const json = () => JSON.parse(init.body);
    const id = decodeURIComponent(path.split('/')[2] ?? '');

    if (method === 'GET' && path === '/app-info') {
      return answer(200, state.appInfo);
    }
    if (method === 'GET' && path === '/notes') {
      if (!searchParams.get('search')) {
        return answer(400, fixture('search-missing').body);
      }
      return answer(200, search(searchParams));
    }
    if (/^\/notes\/[^/]+(\/content)?$/.test(path)) {
      const note = byId(id);
      if (!note) {
        return answer(404, {
          status: 404,
          code: 'NOTE_NOT_FOUND',
          message: `Note '${id}' not found.`,
        });
      }
      if (method === 'GET' && !path.endsWith('/content')) {
        return answer(200, structuredClone(note));
      }
      if (method === 'GET') {
        return answer(200, state.content.get(id) ?? '', 'text/html; charset=utf-8');
      }
      if (method === 'PUT') {
        editNote(id, { content: init.body });
        return answer(204);
      }
    }
    if (method === 'GET' && path.startsWith('/calendar/days/')) {
      const date = path.slice('/calendar/days/'.length);
      if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) {
        return answer(400, fixture('day-bad').body);
      }
      return answer(200, structuredClone(dayNote(date)));
    }
    if (method === 'POST' && path === '/create-note') {
      const body = json();
      if (!byId(body.parentNoteId)) {
        return answer(400, fixture('create-bad-parent').body);
      }
      const note = addNote({
        title: body.title ?? 'New note',
        parent: body.parentNoteId,
        content: body.content,
      });
      return answer(201, {
        note: structuredClone(note),
        branch: { branchId: `${body.parentNoteId}_${note.noteId}`, noteId: note.noteId },
      });
    }
    if (method === 'POST' && path === '/attributes') {
      const body = json();
      const note = byId(body.noteId);
      if (!note) {
        return answer(400, fixture('create-bad-parent').body);
      }
      // Adding a label leaves the modification time of the note alone.
      return answer(201, addLabel(note, { name: body.name, value: body.value }));
    }
    return answer(404, fixture('unknown-route').body);
  }

  return {
    state,
    fetch,
    addNote,
    addLabel: (id, label) => addLabel(byId(id), label),
    editNote,
    note: byId,
    remove(id) {
      state.notes = state.notes.filter((n) => n.noteId !== id);
    },
    goDown() {
      state.down = true;
    },
    goUp() {
      state.down = false;
    },
  };
}
