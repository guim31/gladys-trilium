// -----------------------------------------------------------------------------
// The Trilium client, the model helpers and the configuration, on the answers
// recorded on a real TriliumNext v0.106.1: the token header, errors by kind,
// the streamed counts.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TriliumClient, TriliumError, searchDate } from '../src/trilium/client.js';
import {
  appendParagraph,
  labelName,
  ownLabels,
  parseLabels,
  textToHtml,
} from '../src/trilium/model.js';
import { instanceId } from '../src/devices.js';
import { normalizeConfig, normalizeUrl } from '../src/config.js';
import { HOST, fixture } from './helpers/fakeTrilium.js';

/** A fetch answering one recorded fixture (in chunks of `size` bytes), keeping the request. */
function replay(name, { size = 0 } = {}) {
  const calls = [];
  const { status, body } = fixture(name);
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    const stream =
      size > 0
        ? new ReadableStream({
            start(controller) {
              for (let i = 0; i < bytes.length; i += size) {
                controller.enqueue(bytes.slice(i, i + size));
              }
              controller.close();
            },
          })
        : bytes;
    return new Response(stream, { status, headers: { 'content-type': 'application/json' } });
  };
  return { calls, client: new TriliumClient({ url: HOST, token: 'tok', fetch }) };
}

test('the token goes in the Authorization header, searches carry their options', async () => {
  const { calls, client } = replay('search-recent');
  const notes = await client.search("note.noteId != ''", {
    orderBy: 'utcDateModified',
    orderDirection: 'desc',
    limit: 6,
  });
  assert.equal(notes.length, 6);
  assert.equal(calls[0].init.headers.Authorization, 'tok');
  assert.equal(
    calls[0].url,
    `${HOST}/etapi/notes?search=note.noteId+%21%3D+%27%27&orderBy=utcDateModified&orderDirection=desc&limit=6`,
  );
  assert.equal(searchDate(Date.parse('2026-10-29T23:00:00Z')), '2026-10-29 23:00:00.000Z');
});

test('counts are read as a stream, whatever the cut of the chunks', async () => {
  for (const size of [0, 1, 7, 64, 4096]) {
    const { client } = replay('search-recent', { size });
    assert.equal(await client.count("note.noteId != ''"), 6, `chunks of ${size}`);
  }
  // The root and the hidden notes are not counted.
  const withSystem = {
    results: [
      { noteId: 'root', attributes: [] },
      { noteId: '_hidden', attributes: [{ noteId: '_hidden' }] },
      ...fixture('search-todo').body.results,
    ],
  };
  const fetch = async () => new Response(JSON.stringify(withSystem));
  assert.equal(await new TriliumClient({ url: HOST, token: 't', fetch }).count('x'), 1);
  const { client } = replay('search-bad');
  assert.equal(await client.count("note.title = 'x"), 0);
});

test('a count that is not a search answer is refused', async () => {
  const fetch = async () => new Response('<html>Login</html>', { status: 200 });
  const client = new TriliumClient({ url: HOST, token: 't', fetch });
  await assert.rejects(client.count('x'), (err) => err.kind === 'invalid');
  await assert.rejects(client.appInfo(), (err) => err.kind === 'invalid');
});

test('errors by kind, with the reason Trilium gave and never the token', async () => {
  const cases = [
    ['unauthorized', 'unauthorized', /Not authenticated/, (c) => c.appInfo()],
    ['no-token', 'unauthorized', /Not authenticated/, (c) => c.appInfo()],
    ['note-not-found', 'not_found', /not found/, (c) => c.note('doesNotExist1')],
    ['unknown-route', 'invalid', /Router not found/, (c) => c.appInfo()],
    ['create-bad-parent', 'rejected', /does not exist/, (c) => c.createNote({})],
    ['day-bad', 'rejected', /not valid/, (c) => c.dayNote('2026-13-45')],
    ['search-missing', 'rejected', /mandatory/, (c) => c.search('')],
  ];
  for (const [name, kind, message, call] of cases) {
    const { client } = replay(name);
    await assert.rejects(
      call(client),
      (err) =>
        err instanceof TriliumError &&
        err.kind === kind &&
        message.test(err.message) &&
        !err.message.includes('tok'),
      name,
    );
  }
});

test('network failures and timeouts', async () => {
  const down = new TriliumClient({
    url: HOST,
    token: 't',
    fetch: async () => {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    },
  });
  await assert.rejects(down.appInfo(), (err) => err.kind === 'unreachable');
  const slow = new TriliumClient({
    url: HOST,
    token: 't',
    timeout: 20,
    fetch: (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason));
      }),
  });
  await assert.rejects(slow.appInfo(), (err) => err.kind === 'timeout');
});

test('the real answers: app info, day note, a new note, its labels', async () => {
  assert.equal((await replay('app-info').client.appInfo()).appVersion, '0.106.1');
  const day = await replay('day-note').client.dayNote('2026-10-30');
  assert.equal(day.title, '30 - Friday');
  // Only the labels of the note itself: not those of its template.
  assert.deepEqual(ownLabels(day), [{ name: 'dateNote', value: '2026-10-30' }]);
  const { client, calls } = replay('create-note');
  const note = await client.createNote({ parentNoteId: 'root', title: 'Buy milk', content: '' });
  assert.equal(note.title, 'Buy milk');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    parentNoteId: 'root',
    title: 'Buy milk',
    type: 'text',
    content: '',
  });
  assert.equal(instanceId(fixture('root').body, HOST), '20261030120049898');
  assert.equal(instanceId(null, 'https://Notes.example.org:8443/x'), 'notes.example.org-8443-x');
});

test('labels, text and paragraphs', () => {
  assert.deepEqual(parseLabels('todo, priorité=haute ; todo\nbad name, =x, a:b'), [
    { name: 'todo' },
    { name: 'priorité', value: 'haute' },
    { name: 'a:b' },
  ]);
  assert.deepEqual(parseLabels('#todo #due=2026-11-01'), [
    { name: 'todo' },
    { name: 'due', value: '2026-11-01' },
  ]);
  assert.deepEqual(parseLabels(undefined), []);
  assert.equal(labelName(' #todo '), 'todo');
  assert.equal(labelName('two words'), '');
  assert.equal(textToHtml(' a < b \r\n\r\n c & d '), '<p>a &lt; b</p><p>c &amp; d</p>');
  assert.equal(textToHtml(''), '');
  assert.equal(appendParagraph('<p>x</p>\n', '"y"'), '<p>x</p><p>&quot;y&quot;</p>');
  assert.equal(appendParagraph('', 'y'), '<p>y</p>');
});

test('configuration: address, token, interval, to-do label, language', () => {
  assert.equal(normalizeUrl('192.0.2.10:8080'), 'http://192.0.2.10:8080');
  assert.equal(
    normalizeUrl('https://notes.example.org/trilium/etapi/'),
    'https://notes.example.org/trilium',
  );
  assert.equal(normalizeUrl('http://192.0.2.10:8080/#root/abc'), 'http://192.0.2.10:8080');
  assert.equal(normalizeUrl('http://192.0.2.10:8080/login'), 'http://192.0.2.10:8080');
  assert.equal(normalizeUrl('http://user:pass@192.0.2.10'), null);
  assert.equal(normalizeUrl('ftp://x'), null);
  const config = normalizeConfig({
    url: ' 192.0.2.10:8080 ',
    token: ' Authorization: abc_def= ',
    refresh_minutes: '7',
    todo_label: 'two words',
    language: 'it',
  });
  assert.deepEqual(config, {
    url: 'http://192.0.2.10:8080',
    urlInvalid: false,
    token: 'abc_def=',
    refreshMinutes: 15,
    todoLabel: 'todo',
    language: 'fr',
  });
  assert.equal(normalizeConfig({ todo_label: '#courses' }).todoLabel, 'courses');
  assert.equal(normalizeConfig({ url: 'ftp://x' }).urlInvalid, true);
  assert.equal(normalizeConfig(null).url, null);
});
