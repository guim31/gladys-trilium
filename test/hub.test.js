// -----------------------------------------------------------------------------
// The hub against the SDK's fake Gladys and a fake Trilium built from real
// answers: device and states, the timer, the triggers, the scene actions, the
// widget and the connection status.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { MAX_TRIES, startOfDay } from '../src/hub.js';
import { MemoryStore } from '../src/store.js';
import { DAY_CONTENT, HOST, TOKEN, createTrilium, settle } from './helpers/fakeTrilium.js';
import { CONFIG, createAll, createWorld, mainDevice, mainFeature } from './helpers/world.js';

const changed = (fake) => fake.sceneEvents.filter((e) => e.key === 'note_changed');
const labeled = (fake) => fake.sceneEvents.filter((e) => e.key === 'labeled_note_changed');

test('one Trilium device, its states once added', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => [d.name, d.external_id]),
    [['Trilium', mainDevice]],
  );
  assert.equal(world.fake.states.length, 0, 'no state before the device is added');
  await createAll(world.fake);
  // The root and the hidden notes are not counted.
  assert.equal(world.fake.lastState(mainFeature('notes')), 6);
  assert.equal(world.fake.lastState(mainFeature('today')), 6);
  assert.equal(world.fake.lastState(mainFeature('todo')), 1, '#todo, not #done');
  assert.equal(world.fake.lastState(mainFeature('latest')), 'New note');
  assert.equal(devices[0].params.find((p) => p.name === 'TRILIUM_VERSION').value, '0.106.1');
  assert.equal(devices[0].params.find((p) => p.name === 'TRILIUM_URL').value, HOST);
});

test('the container reads Trilium on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const world = await createWorld({ config: { ...CONFIG, refresh_minutes: '5' } });
  t.after(() => world.app.stop());
  await createAll(world.fake);
  world.server.addNote({ title: 'Read me', labels: ['todo'] });
  t.mock.timers.tick(5 * 60_000);
  await settle(20);
  assert.equal(world.fake.lastState(mainFeature('notes')), 7);
  assert.equal(world.fake.lastState(mainFeature('todo')), 2);
  assert.equal(world.fake.lastState(mainFeature('latest')), 'Read me');
  assert.ok(!world.fake.requests.some((r) => r.path?.includes('poll')));
});

test('notes changed today fall back to 0 after midnight', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world.fake);
  world.clock.now = startOfDay(world.clock.now) + 24 * 3_600_000 + 60_000;
  world.server.state.clock = world.clock.now;
  await world.hub.refresh();
  assert.equal(world.fake.lastState(mainFeature('today')), 0);
  world.server.editNote('06KP9ZzkZnIn');
  await world.hub.refresh();
  assert.equal(world.fake.lastState(mainFeature('today')), 1);
  assert.equal(world.fake.lastState(mainFeature('notes')), 6);
});

test('a custom to-do label', async (t) => {
  const world = await createWorld({ config: { ...CONFIG, todo_label: '#courses' } });
  t.after(() => world.app.stop());
  world.server.addNote({ title: 'Lait', labels: ['courses'] });
  world.server.addNote({ title: 'Pain', labels: ['courses', 'done'] });
  await createAll(world.fake);
  await world.hub.refresh();
  assert.equal(world.fake.lastState(mainFeature('todo')), 1);
  assert.ok(world.server.state.requests.some((r) => r.includes('search=%23courses+%23%21done')));
});

test('note changed: silent baseline, created then updated, labels', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(world.fake.sceneEvents.length, 0, 'the first read announces nothing');
  const note = world.server.addNote({
    title: 'Chaudière : panne',
    labels: ['incident', { name: 'pièce', value: 'cave' }],
  });
  await world.hub.refresh();
  world.server.editNote(note.noteId, { content: '<p>Réparée</p>' });
  world.server.editNote('UNboi6UrliH1');
  await world.hub.refresh();
  await world.hub.refresh();
  const url = (id) => `${HOST}/#root/${id}`;
  assert.deepEqual(
    changed(world.fake).map((e) => e.data),
    [
      {
        change: 'created',
        note_title: 'Chaudière : panne',
        url: url(note.noteId),
        labels: '#incident #pièce=cave',
        note_id: note.noteId,
      },
      {
        change: 'updated',
        note_title: 'Chaudière : panne',
        url: url(note.noteId),
        labels: '#incident #pièce=cave',
        note_id: note.noteId,
      },
      {
        change: 'updated',
        note_title: 'Note 2',
        url: url('UNboi6UrliH1'),
        labels: '#todo',
        note_id: 'UNboi6UrliH1',
      },
    ],
  );
  // One labeled event per label name: a scene set on "incident" runs once.
  assert.deepEqual(
    labeled(world.fake).map((e) => [e.data.label, e.data.change]),
    [
      ['incident', 'created'],
      ['pièce', 'created'],
      ['incident', 'updated'],
      ['pièce', 'updated'],
      ['todo', 'updated'],
    ],
  );
});

test('labels in effect through a template fire too, but are not listed', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.server.editNote('Pq0AXYtJG6X0');
  await world.hub.refresh();
  assert.equal(changed(world.fake)[0].data.labels, '#dateNote=2026-10-30');
  assert.deepEqual(
    labeled(world.fake).map((e) => e.data.label),
    ['dateNote', 'iconClass', 'excludeFromNoteMap'],
  );
});

test('more than ten changes: ten now, the rest at the next read, oldest first', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (let i = 0; i < 15; i += 1) {
    world.server.addNote({ title: `Note ${i}` });
  }
  await world.hub.refresh();
  assert.deepEqual(
    changed(world.fake).map((e) => e.data.note_title),
    Array.from({ length: 10 }, (_, i) => `Note ${i}`),
  );
  await world.hub.refresh();
  await world.hub.refresh();
  assert.deepEqual(
    changed(world.fake).map((e) => e.data.note_title),
    Array.from({ length: 15 }, (_, i) => `Note ${i}`),
  );
});

test('a note created then edited, announced a read later, is still "created"', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const late = world.server.addNote({ title: 'Late' });
  for (let i = 0; i < 10; i += 1) {
    world.server.addNote({ title: `Note ${i}` });
  }
  world.server.editNote(late.noteId);
  await world.hub.refresh();
  await world.hub.refresh();
  assert.deepEqual(
    changed(world.fake)
      .filter((e) => e.data.note_title === 'Late')
      .map((e) => e.data.change),
    ['created'],
  );
});

test('a burst (an import): ten announced, the rest seen', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (let i = 0; i < 60; i += 1) {
    world.server.addNote({ title: `Import ${i}` });
  }
  await world.hub.refresh();
  assert.equal(changed(world.fake).length, 10);
  world.server.addNote({ title: 'After' });
  await world.hub.refresh();
  assert.equal(changed(world.fake).at(-1).data.note_title, 'After');
  assert.equal(changed(world.fake).length, 11, 'never twice');
});

test('an event Gladys took is not sent again when a later one fails', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  let fail = 1;
  world.gladys.publishSceneEvent = async (key, data) => {
    if (key === 'labeled_note_changed' && fail > 0) {
      fail -= 1;
      throw Object.assign(new Error('busy'), { status: 503 });
    }
    return publish(key, data);
  };
  world.server.addNote({ title: 'Labeled', labels: ['incident'] });
  await world.hub.refresh();
  await world.hub.refresh();
  assert.equal(changed(world.fake).length, 1);
  assert.equal(labeled(world.fake).length, 1);
});

test('an event Gladys did not take is fired again at the next read', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  let down = true;
  world.gladys.publishSceneEvent = async (...args) => {
    if (down) {
      throw Object.assign(new Error('Gladys restarting'), { status: 503 });
    }
    return publish(...args);
  };
  world.server.addNote({ title: 'First' });
  world.server.addNote({ title: 'Second' });
  await world.hub.refresh();
  assert.equal(changed(world.fake).length, 0);
  down = false;
  await world.hub.refresh();
  assert.deepEqual(
    changed(world.fake).map((e) => e.data.note_title),
    ['First', 'Second'],
  );
});

test('a change Gladys keeps refusing is given up, the next ones go through', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  world.gladys.publishSceneEvent = async (key, data) => {
    if (data.note_title === 'Poison') {
      throw Object.assign(new Error('boom'), { status: 500 });
    }
    return publish(key, data);
  };
  world.server.addNote({ title: 'Poison' });
  world.server.addNote({ title: 'Fine' });
  for (let i = 0; i < MAX_TRIES; i += 1) {
    await world.hub.refresh();
  }
  assert.deepEqual(
    changed(world.fake).map((e) => e.data.note_title),
    ['Fine'],
  );
});

test('the last change seen survives a restart', async (t) => {
  const store = new MemoryStore();
  const server = createTrilium();
  const first = await createWorld({ server, store });
  server.addNote({ title: 'Before' });
  await first.hub.refresh();
  assert.equal(changed(first.fake).length, 1);
  await first.app.stop();
  server.addNote({ title: 'While stopped' });
  const second = await createWorld({ server, store });
  t.after(() => second.app.stop());
  assert.deepEqual(
    changed(second.fake).map((e) => e.data.note_title),
    ['While stopped'],
  );
});

test('append_day_note: a timed line at the end of the day note, never announced', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  // 12:30 UTC: the 30th from UTC-12 to UTC+11.
  const local = new Date(world.clock.now);
  const day = `2026-10-${String(local.getDate()).padStart(2, '0')}`;
  let ack = await world.fake.sceneAction('append_day_note', {
    line: 'Pression basse : 0,8 bar',
    add_time: true,
  });
  assert.equal(ack.success, true, ack.error);
  const { note_id: noteId, url } = ack.data.outputs;
  assert.ok(world.server.state.requests.includes(`GET /calendar/days/${day}`));
  assert.equal(url, `${HOST}/#root/${noteId}`);
  ack = await world.fake.sceneAction('append_day_note', { line: '<b>Relancée</b> & ok' });
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.outputs.note_id, noteId);
  await world.fake.sceneAction('append_day_note', { line: 'Sans heure', add_time: false });
  const hhmm = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`;
  assert.equal(
    world.server.state.content.get(noteId),
    `${DAY_CONTENT.trimEnd()}<p>${hhmm} — Pression basse : 0,8 bar</p>` +
      `<p>${hhmm} — &lt;b&gt;Relancée&lt;/b&gt; &amp; ok</p><p>Sans heure</p>`,
  );
  await world.hub.refresh();
  await world.hub.refresh();
  assert.equal(world.fake.sceneEvents.length, 0, 'no loop through the trigger');
  // A person who edits the day note afterwards is announced.
  world.server.editNote(noteId);
  await world.hub.refresh();
  assert.deepEqual(
    changed(world.fake).map((e) => e.data.note_id),
    [noteId],
  );
});

test('two lines at once both land in the day note', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const lines = ['One', 'Two', 'Three'];
  const acks = await Promise.all(
    lines.map((line) => world.fake.sceneAction('append_day_note', { line, add_time: false })),
  );
  assert.ok(acks.every((a) => a.success));
  const html = world.server.state.content.get(acks[0].data.outputs.note_id);
  assert.ok(html.endsWith('<p>One</p><p>Two</p><p>Three</p>'), html);
});

test('create_note: under a note by title or id, at the root, with content and labels', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let ack = await world.fake.sceneAction('create_note', {
    parent: 'note 2',
    title: 'Acheter du lait',
    content: 'Deux bouteilles\n\n<demi-écrémé>',
    labels: 'todo, priorité=haute, todo, bad name',
  });
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.outputs.parent_title, 'Note 2');
  const note = world.server.note(ack.data.outputs.note_id);
  assert.deepEqual(note.parentNoteIds, ['UNboi6UrliH1']);
  assert.equal(
    world.server.state.content.get(note.noteId),
    '<p>Deux bouteilles</p><p>&lt;demi-écrémé&gt;</p>',
  );
  assert.deepEqual(
    note.attributes.map((a) => [a.name, a.value]),
    [
      ['todo', ''],
      ['priorité', 'haute'],
    ],
  );
  ack = await world.fake.sceneAction('create_note', { parent: '06KP9ZzkZnIn', title: 'Sous 3' });
  assert.deepEqual(world.server.note(ack.data.outputs.note_id).parentNoteIds, ['06KP9ZzkZnIn']);
  ack = await world.fake.sceneAction('create_note', { title: 'À la racine' });
  assert.deepEqual(world.server.note(ack.data.outputs.note_id).parentNoteIds, ['root']);
  // The notes written by the integration are never announced.
  await world.hub.refresh();
  await world.hub.refresh();
  assert.equal(world.fake.sceneEvents.length, 0);
  assert.equal(world.fake.lastState(mainFeature('todo')), undefined, 'device not added');
  assert.equal(world.hub.counters.todo, 2);
});

test('scene actions: errors in clear words, an unknown parent is never created', async (t) => {
  const world = await createWorld({ config: { ...CONFIG, language: 'en' } });
  t.after(() => world.app.stop());
  const before = world.server.state.notes.length;
  let ack = await world.fake.sceneAction('create_note', { parent: 'Garage', title: 'X' });
  assert.equal(ack.success, false);
  assert.equal(ack.error, 'No note "Garage" in Trilium.');
  assert.equal(world.server.state.notes.length, before);
  ack = await world.fake.sceneAction('create_note', { title: ' ' });
  assert.equal(ack.error, 'Enter the title of the note.');
  ack = await world.fake.sceneAction('append_day_note', { line: ' ' });
  assert.equal(ack.error, 'Enter the line to add.');
  ack = await world.fake.sceneAction('append_day_note', { line: 'x' });
  world.server.note(ack.data.outputs.note_id).isProtected = true;
  ack = await world.fake.sceneAction('append_day_note', { line: 'y' });
  assert.equal(
    ack.error,
    'The day note is protected: Trilium does not let the integration write in it.',
  );
  world.hub.client.token = 'wrong';
  ack = await world.fake.sceneAction('create_note', { title: 'X' });
  assert.equal(ack.error, 'Trilium refused the ETAPI token: nothing was done.');
  world.hub.client.token = TOKEN;
  world.server.goDown();
  ack = await world.fake.sceneAction('create_note', { title: 'X' });
  assert.equal(ack.error, 'Trilium does not answer: nothing was done.');
});

test('widget: counters, notes changed last, a label list, counters hidden', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let content = (await world.fake.widgetGet('notes', { language: 'fr', settings: {} })).data
    .content;
  validateWidgetContent(content);
  assert.deepEqual(
    content.components.slice(0, 3).map((c) => [c.label, c.value]),
    [
      ['Notes', 6],
      ["Aujourd'hui", 6],
      ['Tâches', 1],
    ],
  );
  const list = content.components[3];
  assert.equal(list.type, 'card-list');
  assert.deepEqual(
    list.items.map((i) => i.title),
    ['New note', 'Note 1', 'Note 3', 'Note 2', '30 - Friday', '10 - October'],
  );
  assert.match(list.items[0].subtitle, /^3[01] oct\./);
  assert.equal(list.items[0].links, undefined, 'no link to a Trilium on plain http');

  world.server.addNote({ title: 'Pain', labels: ['courses'] });
  world.server.addNote({ title: 'Beurre', labels: ['courses', 'done'] });
  content = (
    await world.fake.widgetGet('notes', {
      language: 'en',
      settings: { label: '#courses', hide_counters: true },
    })
  ).data.content;
  validateWidgetContent(content);
  assert.equal(content.components.length, 1);
  assert.deepEqual(
    content.components[0].items.map((i) => i.title),
    ['Pain'],
  );
  content = (await world.fake.widgetGet('notes', { settings: { label: 'nothing_here' } })).data
    .content;
  assert.ok(content.components.some((c) => c.text === 'No note to show yet.'));
});

test('widget links to Trilium over https', async (t) => {
  const world = await createWorld({
    config: { ...CONFIG, url: 'https://notes.example.org/#root/abc' },
  });
  t.after(() => world.app.stop());
  const content = (await world.fake.widgetGet('notes', { settings: {} })).data.content;
  assert.deepEqual(content.components[3].items[0].links, [
    { url: 'https://notes.example.org/#root/93H5v8KRe7D6', label: 'Open in Trilium' },
  ]);
});

test('connection status: missing settings, refused token, down and back, not Trilium', async (t) => {
  const world = await createWorld({ config: { url: '' } });
  t.after(() => world.app.stop());
  assert.match(world.fake.connectionStatus.message.en, /Enter the address/);
  await world.fake.configUpdated({ url: 'ftp://x', token: TOKEN });
  assert.match(world.fake.connectionStatus.message.en, /not valid/);
  await world.fake.configUpdated({ url: HOST });
  assert.match(world.fake.connectionStatus.message.en, /Enter an ETAPI token/);
  await world.fake.configUpdated({ url: HOST, token: 'wrong' });
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.en, /refused the ETAPI token/);
  // The address of the ETAPI, pasted whole, works as well.
  await world.fake.configUpdated({ url: `${HOST}/etapi/`, token: ` ${TOKEN} ` });
  assert.equal(world.fake.connectionStatus.connected, true);
  world.server.goDown();
  await world.hub.refresh();
  assert.match(world.fake.connectionStatus.message.en, /does not answer/);
  const widget = (await world.fake.widgetGet('notes', { settings: {} })).data.content;
  assert.ok(widget.components.some((c) => /does not answer/.test(c.text ?? '')));
  world.server.goUp();
  await world.hub.refresh();
  assert.equal(world.fake.connectionStatus.connected, true);
  world.server.state.html = true;
  await world.hub.refresh();
  assert.match(world.fake.connectionStatus.message.en, /does not answer like Trilium/);
});

test('test_connection: the version and how many notes', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action('test_connection');
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.message.fr, 'Connecté à Trilium 0.106.1 : 6 note(s).');
});

test('the device id follows the document, not the address', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const before = world.fake.discoveredDevices[0].external_id;
  await world.fake.configUpdated({ ...CONFIG, url: 'http://192.0.2.51:8080' });
  // The fake answers whatever the address: the same document.
  assert.equal(world.fake.discoveredDevices[0].external_id, before);
});

test('the language changes the names, not the device', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const before = world.fake.discoveredDevices.map((d) => d.external_id);
  assert.equal(world.fake.discoveredDevices[0].features[1].name, "Notes modifiées aujourd'hui");
  await world.fake.configUpdated({ ...CONFIG, language: 'de' });
  assert.deepEqual(
    world.fake.discoveredDevices.map((d) => d.external_id),
    before,
  );
  assert.equal(world.fake.discoveredDevices[0].features[1].name, 'Heute geänderte Notizen');
});
