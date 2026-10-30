// -----------------------------------------------------------------------------
// The hub: the link to one Trilium instance and everything Gladys sees of it —
// the device, its states, the connection status, the scene events, and the
// notes written from scenes.
//
// Trilium pushes nothing: the container reads it every `refresh_minutes` (15
// by default) on its own timer (should_poll: false), and just after midnight
// so that "notes changed today" falls back to 0. A read is a handful of ETAPI
// searches: the instance (once), three counts (notes, changed today, open
// to-dos, read as a stream), the newest changed notes, and the notes changed
// since the last read (with their labels: no request per change).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  buildTriliumDevice,
  buildTriliumStates,
  instanceId,
  parseExternalId,
  triliumIds,
} from './devices.js';
import { TriliumClient, TriliumError, searchDate } from './trilium/client.js';
import {
  appendParagraph,
  labelNames,
  labelText,
  localDate,
  localTime,
  ownLabels,
  parseLabels,
  summarizeNote,
  textToHtml,
} from './trilium/model.js';
import { MemoryStore } from './store.js';
import { STATUS_TEXT, TEST_TEXT, commandMessage } from './texts.js';

const logger = createLogger({ name: 'trilium-hub' });

export const WIDGET_KEY = 'notes';
export const TRIGGERS = { changed: 'note_changed', labeled: 'labeled_note_changed' };

export const DEFAULT_TIMINGS = {
  // requestWidgetRefresh is dropped by the core beyond one call per 10 s.
  widgetGap: 10_500,
  // An unchanged value is sent again before Gladys calls it stale (48 h).
  heartbeat: 6 * 3_600_000,
  requestTimeout: 15_000,
  // How long the notes of one label, read for a widget, are reused.
  widgetCache: 60_000,
  // The read after midnight waits a little for the clock to be past it.
  midnightDelay: 5_000,
};

export const LATEST_COUNT = 20;
// The changed notes read at once, the oldest first: past that many changes
// between two reads (an import, a subtree moved), it is a burst — ten are
// announced and the rest is recorded as seen without firing.
export const CHANGES_PAGE = 50;
// Below a burst, the changes past ten wait for the next read, never lost.
export const MAX_EVENTS_PER_READ = 10;
// The notes written by the integration itself are never announced (a scene
// bound to "Note changed" that writes a note would loop).
const MAX_OWN = 200;
// Reads after which a change whose event Gladys keeps refusing is given up.
export const MAX_TRIES = 3;

const ALL_NOTES = "note.noteId != ''";
const changedSince = (time) => `note.utcDateModified >= '${searchDate(time)}'`;
const openTodos = (label) => `#${label} #!done`;

/** An Error carrying a coded, multi-language message. */
export class CommandError extends Error {
  constructor(code, language, values) {
    const messages = commandMessage(code, values);
    super(messages[language] ?? messages.en);
    this.code = code;
    this.messages = messages;
  }
}

const linkOf = (config) => JSON.stringify([config.url, config.token]);
const timeOf = (iso) => Date.parse(String(iso ?? '').replace(' ', 'T'));
const ownKey = (note) => `${note.noteId}@${timeOf(note.utcDateModified)}`;

/** Local midnight (the TZ of Gladys, injected by its supervisor) of a time. */
export function startOfDay(time) {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** The newest change seen: its time and the notes changed at that very millisecond. */
function advance(mark, note) {
  const at = timeOf(note.utcDateModified);
  if (!mark || at > mark.at) {
    return { at, ids: [note.noteId] };
  }
  if (at === mark.at && !mark.ids.includes(note.noteId)) {
    return { at, ids: [...mark.ids, note.noteId] };
  }
  return mark;
}

const seenBy = (mark, note) => {
  const at = timeOf(note.utcDateModified);
  return at < mark.at || (at === mark.at && mark.ids.includes(note.noteId));
};

export class Hub {
  constructor({ gladys, fetch, timings, now = Date.now, store }) {
    this.gladys = gladys;
    this.fetch = fetch;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.now = now;
    this.store = store ?? new MemoryStore();
    this.config = {
      url: null,
      urlInvalid: false,
      token: '',
      refreshMinutes: 15,
      todoLabel: 'todo',
      language: 'fr',
    };
    this.client = null;
    /** { id, version } */
    this.instance = null;
    /** { notes, today, todo } */
    this.counters = null;
    /** the notes changed last, summarized */
    this.latest = [];
    /** null (fine), or the kind of the last failure */
    this.failure = null;
    this.announced = false;
    this.lastStatus = '';
    /** what the triggers already saw: { instance, at, ids, since } */
    this.seen = null;
    /** `<note id>@<time>` of the changes written by the integration */
    this.own = new Set();
    /** `<note id>@<time>` -> { tries, sent }: events Gladys refused */
    this.retries = new Map();
    this.eventFailing = false;
    this.devicesFailing = false;
    this.publishFailing = false;
    this.widgetLists = new Map();
    this.configuring = Promise.resolve();
    this.writing = Promise.resolve();
    this.refreshTimer = null;
    this.midnightTimer = null;
    this.refreshing = null;
    this.refreshAgain = false;
    this.widgetRefreshAt = 0;
    this.widgetTimer = null;
    this.stopped = false;
  }

  get language() {
    return this.config.language;
  }

  get loaded() {
    return this.counters !== null;
  }

  async start(config) {
    const saved = await this.store.load();
    // A damaged file is a new baseline, not a crash on every read.
    this.seen =
      typeof saved.instance === 'string' &&
      Number.isFinite(saved.at) &&
      Array.isArray(saved.ids) &&
      saved.ids.every((id) => typeof id === 'string')
        ? {
            instance: saved.instance,
            at: saved.at,
            ids: saved.ids,
            since: Number.isFinite(saved.since) ? saved.since : saved.at,
          }
        : null;
    // The notes written from Gladys but not read back yet: never announced,
    // even after a restart.
    if (Array.isArray(saved.own)) {
      this.own = new Set(saved.own.filter((k) => typeof k === 'string').slice(-MAX_OWN));
    }
    this.#scheduleMidnight();
    await this.reconfigure(config);
  }

  /** One configuration change at a time: a second one waits for the first. */
  reconfigure(config) {
    const run = this.configuring.then(() => this.#reconfigure(config));
    this.configuring = run.catch(() => {});
    return run;
  }

  async #reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const linkChanged = linkOf(previous) !== linkOf(config) || !this.client;
    if (linkChanged || previous.refreshMinutes !== config.refreshMinutes) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (linkChanged) {
      this.client = null;
      this.instance = null;
      this.counters = null;
      this.latest = [];
      this.failure = null;
      this.announced = false;
      this.widgetLists.clear();
      if (config.url && config.token) {
        this.client = new TriliumClient({
          url: config.url,
          token: config.token,
          fetch: this.fetch,
          timeout: this.timings.requestTimeout,
        });
      }
    }
    if (this.client && !this.refreshTimer) {
      this.refreshTimer = setInterval(
        () => this.refresh().catch((err) => logger.error('Read failed', err)),
        config.refreshMinutes * 60_000,
      );
      this.refreshTimer.unref?.();
    }
    if (linkChanged || previous.todoLabel !== config.todoLabel) {
      await this.refresh();
    } else {
      // Language or interval only: same data, new names and texts.
      this.gladys.forgetPublishedStates?.();
      await this.#update();
    }
    await this.updateConnectionStatus();
  }

  /** Gladys reconnected (it may have restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.lastStatus = '';
    await this.reconfigure(config);
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.refreshTimer);
    clearTimeout(this.midnightTimer);
    clearTimeout(this.widgetTimer);
    this.refreshTimer = null;
    await this.store.flush();
  }

  /** A read just after local midnight: the count of the day starts again. */
  #scheduleMidnight() {
    if (this.stopped) {
      return;
    }
    const now = this.now();
    const tomorrow = new Date(startOfDay(now));
    tomorrow.setDate(tomorrow.getDate() + 1);
    const wait = tomorrow.getTime() - now + this.timings.midnightDelay;
    this.midnightTimer = setTimeout(() => {
      this.#scheduleMidnight();
      if (this.client) {
        this.refresh().catch((err) => logger.error('Read failed', err));
      }
    }, wait);
    this.midnightTimer.unref?.();
  }

  // --- Reading Trilium ------------------------------------------------------

  /** Read Trilium (one read at a time; a request during it runs once after). */
  refresh() {
    if (this.refreshing) {
      this.refreshAgain = true;
      return this.refreshing;
    }
    this.refreshing = (async () => {
      do {
        this.refreshAgain = false;
        try {
          await this.#refreshOnce();
        } catch (err) {
          // Never ends the loop: a read queued meanwhile (new address) still runs.
          logger.error('Read failed', err);
        }
      } while (this.refreshAgain && !this.stopped);
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  #known(instance) {
    return this.seen?.instance === instance ? this.seen : null;
  }

  async #refreshOnce() {
    const client = this.client;
    if (this.stopped) {
      return;
    }
    if (!client) {
      await this.publishDevices();
      return;
    }
    const todoLabel = this.config.todoLabel;
    let instance;
    let notes;
    let today;
    let todo;
    let recent;
    let changes;
    try {
      if (this.instance) {
        instance = this.instance;
      } else {
        const info = await client.appInfo();
        const root = await client.note('root');
        instance = { id: instanceId(root, this.config.url), version: info.appVersion };
      }
      const known = this.#known(instance.id);
      [notes, today, todo, recent, changes] = await Promise.all([
        client.count(ALL_NOTES),
        client.count(changedSince(startOfDay(this.now()))),
        client.count(openTodos(todoLabel)),
        client.search(ALL_NOTES, {
          orderBy: 'utcDateModified',
          orderDirection: 'desc',
          limit: LATEST_COUNT,
        }),
        known
          ? client.search(changedSince(known.at), {
              orderBy: 'utcDateModified',
              orderDirection: 'asc',
              limit: CHANGES_PAGE + 1,
            })
          : null,
      ]);
    } catch (err) {
      if (client !== this.client) {
        return;
      }
      this.#fail(err);
      await this.updateConnectionStatus();
      return;
    }
    if (client !== this.client || this.stopped) {
      return;
    }
    this.instance = instance;
    this.counters = { notes, today, todo };
    this.latest = recent.map((n) => summarizeNote(n, this.config.url));
    this.widgetLists.clear();
    this.#recover();
    await this.#update();
    if (client !== this.client || this.stopped || !this.instance) {
      return; // the configuration changed meanwhile
    }
    await this.#announce(
      recent,
      changes && { data: changes.slice(0, CHANGES_PAGE), burst: changes.length > CHANGES_PAGE },
    );
    await this.updateConnectionStatus();
  }

  /** Device, states and widget from the last read. */
  async #update() {
    await this.publishDevices();
    await this.publishStates();
    this.refreshWidget();
  }

  #fail(err) {
    const kind = err instanceof TriliumError ? err.kind : 'unreachable';
    if (this.failure === null) {
      logger.warn(`Trilium: ${err.message}`);
    } else {
      logger.debug(`Trilium still failing: ${err.message}`);
    }
    this.failure = kind;
  }

  #recover() {
    const count = this.counters.notes;
    if (this.failure !== null) {
      logger.info(`Trilium answers again (${count} notes)`);
    } else if (!this.announced) {
      logger.info(`Connected to Trilium ${this.instance.version} (${count} notes)`);
    }
    this.announced = true;
    this.failure = null;
  }

  // --- Scene events ---------------------------------------------------------

  /**
   * Fire the notes created or changed since the last read, the oldest first.
   * The first read of an instance is a silent baseline: installing the
   * integration announces nothing already there.
   * @param {object[]} recent the newest changed notes (baseline)
   * @param {{ data: object[], burst: boolean } | null} changes the notes changed since the mark, oldest first
   */
  async #announce(recent, changes) {
    const instance = this.instance.id;
    const known = this.#known(instance);
    let mark = known ? { at: known.at, ids: known.ids } : null;
    // The end of the last read that went through its whole list: a note
    // created after it is "created", even when its event waited a read.
    let since = known?.since ?? known?.at ?? 0;
    if (!known || !changes) {
      // Baseline: the newest change (an empty base: any note to come).
      mark = null;
      for (const note of recent) {
        mark = advance(mark, note);
      }
      mark ??= { at: 0, ids: [] };
      since = mark.at;
    } else {
      const fresh = changes.data.filter((n) => !seenBy(known, n) && !this.own.has(ownKey(n)));
      const pending = fresh.slice(0, MAX_EVENTS_PER_READ);
      if (changes.burst) {
        logger.info(`More than ${CHANGES_PAGE} notes changed at once: ${pending.length} announced`);
      }
      // The oldest first; the mark follows each note Gladys took.
      let stopped = false;
      let deferred = false;
      for (const note of changes.data) {
        if (this.own.has(ownKey(note)) || seenBy(known, note)) {
          mark = advance(mark, note);
          continue;
        }
        if (!pending.includes(note)) {
          deferred = true;
          break; // past ten: the next read
        }
        if ((await this.#fire(note, since)) === 'retry') {
          stopped = true;
          break;
        }
        mark = advance(mark, note);
      }
      if (changes.burst && !stopped) {
        // The rest of a burst is seen: the mark jumps to the newest change.
        for (const note of recent) {
          mark = advance(mark, note);
        }
      }
      if (!stopped && (changes.burst || !deferred)) {
        since = mark.at;
      }
    }
    for (const key of this.own) {
      if (Number(key.slice(key.lastIndexOf('@') + 1)) <= mark.at) {
        this.own.delete(key);
      }
    }
    const next = { instance, at: mark.at, ids: mark.ids, since, own: [...this.own] };
    if (JSON.stringify(next) !== JSON.stringify({ ...this.seen, own: next.own })) {
      this.seen = next;
      await this.store.save(next);
    }
  }

  /**
   * Fire the events of one changed note: one "Note changed", and one "Labeled
   * note changed" per label name (so a scene set on a label runs once).
   * @returns {Promise<'done' | 'retry'>}
   */
  async #fire(note, since) {
    const key = ownKey(note);
    const attempt = this.retries.get(key) ?? { tries: 0, sent: 0 };
    const data = this.#eventData(note, since);
    const events = [
      [TRIGGERS.changed, data],
      ...labelNames(note).map((label) => [
        TRIGGERS.labeled,
        { ...data, label: label.slice(0, 1000) },
      ]),
    ];
    // The events Gladys already took for this change are not sent again.
    for (const [index, [trigger, eventData]] of events.entries()) {
      if (index < attempt.sent) {
        continue;
      }
      logger.debug(`${trigger}: ${note.noteId}`);
      try {
        await this.gladys.publishSceneEvent(trigger, eventData);
        if (this.eventFailing) {
          logger.info('Scene events accepted again');
        }
        this.eventFailing = false;
        attempt.sent = index + 1;
      } catch (err) {
        if (this.eventFailing) {
          logger.debug(`Cannot fire ${trigger}: ${err.message}`);
        } else {
          logger.warn(`Cannot fire ${trigger}: ${err.message}`);
        }
        this.eventFailing = true;
        // A refusal for good (4xx but 429) is not retried: it would be
        // refused at every read. Otherwise (Gladys restarting), this change
        // and the next ones are fired again at the next read.
        const status = err?.status;
        const final = Number.isInteger(status) && status >= 400 && status < 500 && status !== 429;
        if (final) {
          attempt.sent = index + 1;
          continue;
        }
        // A change that keeps failing, read after read, is given up: it
        // would hold back every later one.
        const tries = attempt.tries + 1;
        if (tries < MAX_TRIES) {
          this.retries.set(key, { ...attempt, tries });
          return 'retry';
        }
        logger.warn(`Note ${note.noteId} not announced: Gladys refused it ${tries} times`);
        this.retries.delete(key);
        return 'done';
      }
    }
    this.retries.delete(key);
    return 'done';
  }

  #eventData(note, since) {
    const created = timeOf(note.utcDateCreated) > since;
    const summary = summarizeNote(note, this.config.url);
    return {
      change: created ? 'created' : 'updated',
      note_title: summary.title.slice(0, 1000),
      url: summary.url.slice(0, 1000),
      labels: labelText(ownLabels(note)).slice(0, 1000),
      note_id: note.noteId,
    };
  }

  // --- Device and states ----------------------------------------------------

  #isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  buildDevices() {
    if (!this.instance || !this.counters) {
      return [];
    }
    return [buildTriliumDevice(this.gladys, this.instance, this.language, this.config.url ?? '')];
  }

  async publishDevices() {
    if (this.stopped) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(this.buildDevices());
    } catch (err) {
      if (this.devicesFailing) {
        logger.debug(`Cannot publish the devices: ${err.message}`);
      } else {
        logger.warn(`Cannot publish the devices: ${err.message}`);
      }
      this.devicesFailing = true;
      return;
    }
    this.devicesFailing = false;
  }

  /**
   * The states of the device, once the user added it (Gladys drops the others).
   * @param {string} [justCreated] the external id of a device just added
   */
  async publishStates(justCreated) {
    if (!this.instance || !this.counters || this.stopped) {
      return;
    }
    const device = triliumIds(this.gladys, this.instance.id).device;
    if (device !== justCreated && !this.#isCreated(device)) {
      return;
    }
    const states = buildTriliumStates(
      this.gladys,
      this.instance.id,
      this.counters,
      this.latest[0],
      this.language,
    );
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeat });
    } catch (err) {
      if (this.publishFailing) {
        logger.debug(`Cannot publish the states: ${err.message}`);
      } else {
        logger.warn(`Cannot publish the states: ${err.message}`);
      }
      this.publishFailing = true;
      return;
    }
    if (this.publishFailing) {
      logger.info('States published again');
    }
    this.publishFailing = false;
  }

  #ours(device) {
    const parsed = parseExternalId(this.gladys, device?.external_id);
    return parsed !== null && parsed.instance === this.instance?.id ? parsed : null;
  }

  /** The user added the device: states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (!this.#ours(device)) {
      return;
    }
    this.gladys.forgetPublishedStates?.(device.external_id);
    await this.publishStates(device.external_id);
    this.refreshWidget();
  }

  /** The user renamed or deleted the device: the widget shows Gladys names. */
  onDeviceChanged(device) {
    if (this.#ours(device)) {
      this.refreshWidget();
    }
  }

  /** onPoll (the device is not polled: the container reads on its timer). */
  async poll(device) {
    if (this.#ours(device)) {
      await this.publishStates(device.external_id);
    }
  }

  // --- Widget ---------------------------------------------------------------

  /** Nudge the open dashboards, with a trailing call inside the core's 10 s gap. */
  refreshWidget() {
    if (this.stopped) {
      return;
    }
    const wait = this.widgetRefreshAt + this.timings.widgetGap - this.now();
    if (wait <= 0) {
      this.widgetRefreshAt = this.now();
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
      return;
    }
    if (!this.widgetTimer) {
      this.widgetTimer = setTimeout(() => {
        this.widgetTimer = null;
        this.refreshWidget();
      }, wait);
      this.widgetTimer.unref?.();
    }
  }

  /**
   * The notes a widget shows: the last changed of all (from the last read),
   * or those carrying a label and not `#done`, the last changed first (read
   * on demand, reused a minute). Null when Trilium cannot be read.
   * @param {string} label '' for all notes
   */
  async widgetNotes(label, count) {
    if (!this.loaded || this.failure !== null) {
      return null;
    }
    if (!label) {
      return this.latest.slice(0, count);
    }
    const cached = this.widgetLists.get(label);
    if (cached && this.now() - cached.at < this.timings.widgetCache) {
      return cached.notes.slice(0, count);
    }
    const client = this.client;
    try {
      const found = await client.search(openTodos(label), {
        orderBy: 'utcDateModified',
        orderDirection: 'desc',
        limit: count,
      });
      const notes = found.map((n) => summarizeNote(n, this.config.url));
      if (client === this.client) {
        this.widgetLists.set(label, { at: this.now(), notes });
      }
      return notes.slice(0, count);
    } catch (err) {
      logger.debug(`Widget list not read: ${err.message}`);
      return null;
    }
  }

  // --- Connection status ----------------------------------------------------

  statusKey() {
    if (this.config.urlInvalid) {
      return 'invalid';
    }
    if (!this.config.url) {
      return 'none';
    }
    if (!this.config.token) {
      return 'token';
    }
    if (this.failure) {
      return (
        {
          unauthorized: 'unauthorized',
          invalid: 'invalid_answer',
          not_found: 'invalid_answer',
          http: 'error',
          rejected: 'error',
        }[this.failure] ?? 'unreachable'
      );
    }
    return null;
  }

  statusMessage() {
    const key = this.statusKey();
    return key ? this.#statusOf(key) : null;
  }

  #statusOf(key) {
    return Object.fromEntries(
      Object.entries(STATUS_TEXT).map(([language, table]) => [language, table[key]]),
    );
  }

  async updateConnectionStatus() {
    if (this.stopped) {
      return;
    }
    // Nothing to say before the first answer or failure.
    if (this.client && !this.loaded && this.failure === null) {
      return;
    }
    const message = this.statusMessage();
    const connected = Boolean(this.client) && this.loaded && this.failure === null;
    const fingerprint = JSON.stringify({ connected, message });
    if (fingerprint === this.lastStatus) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(connected, message ?? undefined);
      // Recorded once Gladys took it: a failed call is sent again next time.
      this.lastStatus = fingerprint;
    } catch (err) {
      logger.warn(`Cannot set the connection status: ${err.message}`);
    }
  }

  // --- Actions --------------------------------------------------------------

  /** "Test the connection": a fresh read, then its outcome. */
  async testReport() {
    if (!this.client) {
      return this.statusMessage();
    }
    await this.refresh();
    const message = this.statusMessage();
    if (message) {
      return message;
    }
    if (!this.loaded) {
      // The configuration changed during the test: nothing read yet.
      return this.#statusOf('unreachable');
    }
    return Object.fromEntries(
      Object.entries(TEST_TEXT).map(([language, render]) => [
        language,
        render(this.instance.version, this.counters.notes),
      ]),
    );
  }

  #clientOrFail() {
    if (!this.client) {
      throw new CommandError('unreachable', this.language);
    }
    return this.client;
  }

  /**
   * The parent typed by the user: empty for the root, a note id, or the
   * exact title of a note (the one changed last when several share it).
   */
  async #resolveParent(client, wanted) {
    const text =
      typeof wanted === 'string' || typeof wanted === 'number' ? String(wanted).trim() : '';
    if (text === '') {
      return { noteId: 'root', title: 'root' };
    }
    if (/^[A-Za-z0-9_]{4,32}$/.test(text)) {
      try {
        return await client.note(text);
      } catch (err) {
        if (!(err instanceof TriliumError && err.kind === 'not_found')) {
          throw err;
        }
      }
    }
    const quoted = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const found = await client.search(`note.title = '${quoted}'`, {
      orderBy: 'utcDateModified',
      orderDirection: 'desc',
      limit: 10,
    });
    const exact = found.find((n) => n.title === text) ?? found[0];
    if (!exact) {
      throw new CommandError('parent', this.language, { name: text.slice(0, 100) });
    }
    return exact;
  }

  /** Writes one at a time: two lines added at once both land in the note. */
  #serialize(fn) {
    const run = this.writing.then(fn);
    this.writing = run.catch(() => {});
    return run;
  }

  /**
   * Create a text note under a parent (the root by default), with labels.
   * @param {{ parent?: unknown, title: unknown, content?: unknown, labels?: unknown }} request
   */
  createNote({ parent, title, content, labels }) {
    return this.#serialize(async () => {
      const language = this.language;
      const name = typeof title === 'string' ? title.trim().slice(0, 1000) : '';
      if (!name) {
        throw new CommandError('title', language);
      }
      const client = this.#clientOrFail();
      let note;
      let parentNote;
      try {
        parentNote = await this.#resolveParent(client, parent);
        note = await client.createNote({
          parentNoteId: parentNote.noteId,
          title: name,
          content: textToHtml(typeof content === 'string' ? content : ''),
        });
        for (const label of parseLabels(labels)) {
          await client.addLabel(note.noteId, label);
        }
      } catch (err) {
        throw this.#commandError(err);
      }
      this.#remember(note);
      logger.info('Note created');
      this.refresh().catch(() => {});
      return this.#written(note, parentNote.title);
    });
  }

  /**
   * Add a line at the end of the day note of today (Trilium's journal),
   * created by Trilium when missing.
   * @param {{ line: unknown, addTime?: unknown }} request
   */
  appendToDayNote({ line, addTime }) {
    return this.#serialize(async () => {
      const language = this.language;
      const typed = typeof line === 'string' ? line.trim().slice(0, 5000) : '';
      if (!typed) {
        throw new CommandError('line', language);
      }
      const now = this.now();
      const text =
        addTime === false || addTime === 'false' ? typed : `${localTime(now)} — ${typed}`;
      const client = this.#clientOrFail();
      let day;
      try {
        day = await client.dayNote(localDate(now));
        if (day.isProtected) {
          throw new CommandError('protected', language);
        }
        const html = await client.content(day.noteId);
        await client.setContent(day.noteId, appendParagraph(html, text));
        day = await client.note(day.noteId);
      } catch (err) {
        throw this.#commandError(err);
      }
      this.#remember(day);
      logger.info('Line added to the day note');
      this.refresh().catch(() => {});
      return this.#written(day);
    });
  }

  #written(note, parentTitle) {
    const summary = summarizeNote(note, this.config.url);
    return {
      note_id: note.noteId,
      note_title: summary.title,
      url: summary.url,
      ...(parentTitle === undefined ? {} : { parent_title: String(parentTitle) }),
    };
  }

  #remember(note) {
    if (!note?.utcDateModified) {
      return;
    }
    this.own.add(ownKey(note));
    if (this.own.size > MAX_OWN) {
      this.own.delete(this.own.values().next().value);
    }
    // Kept on disk: a restart before the next read must not announce it.
    if (this.seen) {
      this.store.save({ ...this.seen, own: [...this.own] }).catch(() => {});
    }
  }

  #commandError(err) {
    if (err instanceof CommandError) {
      return err;
    }
    const kind = err instanceof TriliumError ? err.kind : 'unreachable';
    const detail = err.message.replace(/^[^:]*: /, '');
    if (kind === 'unauthorized') {
      return new CommandError('unauthorized', this.language);
    }
    if (kind === 'rejected') {
      return new CommandError('rejected', this.language, { detail });
    }
    if (kind === 'timeout') {
      // The request may have reached Trilium: the note may be written.
      return new CommandError('timeout', this.language);
    }
    if (kind === 'unreachable') {
      return new CommandError('unreachable', this.language);
    }
    return new CommandError('http', this.language, { detail });
  }
}
