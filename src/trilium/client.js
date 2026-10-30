// -----------------------------------------------------------------------------
// ETAPI, the REST API of Trilium Notes (`<base>/etapi/...`), the few calls the
// integration needs, authenticated by an ETAPI token (`Authorization: <token>`).
//
// Facts checked on a real server, TriliumNext v0.106.1 (triliumnext/trilium),
// see test/fixtures/trilium/v0.106.1/:
// - `GET /notes?search=` answers `{ results: [note, ...] }`, each note with its
//   effective attributes (its own and those of its templates or inherited
//   ones, told apart by `attribute.noteId`), never its content. `orderBy`,
//   `orderDirection` and `limit` shape it; there is no offset and no total.
//   The hidden subtree is left out, but for its root `_hidden`; `root` is in.
// - `note.utcDateModified >= '2026-10-30 00:00:00.000Z'` compares the stored
//   UTC strings: the container computes the bound, in the time zone of Gladys.
// - `#todo #!done`: notes with the label `todo` and without the label `done`.
// - `GET /calendar/days/YYYY-MM-DD` returns the day note, creating it (and its
//   month and year notes) when missing.
// - `PUT /notes/{id}/content` (text/plain body, HTML for a text note) answers
//   204 and moves `utcDateModified`; adding a label does not.
// - Errors are `{ status, code, message }`: 401 `NOT_AUTHENTICATED` without or
//   with a wrong token, 404 `NOTE_NOT_FOUND`, 400 `PROPERTY_VALIDATION_ERROR`;
//   an unknown route is a 404 without `code`.
// -----------------------------------------------------------------------------

export const DEFAULT_TIMEOUT = 15_000;

export class TriliumError extends Error {
  /**
   * @param {'unreachable' | 'unauthorized' | 'not_found' | 'timeout' | 'http' | 'invalid' | 'rejected' | 'redirect'} kind
   * @param {string} message never carries a credential
   * @param {number} [status]
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'TriliumError';
    this.kind = kind;
    this.status = status;
  }
}

/** A time as Trilium stores `utcDateModified`: `2026-10-30 08:15:00.000Z`. */
export const searchDate = (time) => new Date(time).toISOString().replace('T', ' ');

/** Notes of the hidden subtree (`_hidden`, `_options`...) and the root. */
export const isSystemNote = (noteId) =>
  typeof noteId !== 'string' || noteId === 'root' || noteId.startsWith('_');

export class TriliumClient {
  /**
   * @param {object} options
   * @param {string} options.url normalized base URL (see normalizeUrl)
   * @param {string} options.token
   * @param {typeof fetch} [options.fetch]
   * @param {number} [options.timeout]
   */
  constructor({ url, token, fetch: fetchImpl, timeout }) {
    this.url = url;
    this.token = token;
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.timeout = timeout ?? DEFAULT_TIMEOUT;
  }

  /** The response of a request, checked; the caller reads its body. */
  async #request(method, path, body, contentType = 'application/json', timeout = this.timeout) {
    const headers = { Accept: 'application/json', Authorization: this.token };
    if (body !== undefined) {
      headers['Content-Type'] = contentType;
    }
    let response;
    try {
      response = await this.fetch(`${this.url}/etapi${path}`, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(timeout),
        // Never followed: a redirection from http to https drops the token
        // (another origin), and turns a POST into a GET.
        redirect: 'manual',
      });
    } catch (err) {
      throw this.#network(err, timeout);
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => {});
      let target = '';
      try {
        target = ` to ${new URL(response.headers.get('location') ?? '', this.url).origin}`;
      } catch {
        // no usable Location
      }
      throw new TriliumError('redirect', `Trilium redirects${target}`, response.status);
    }
    if (!response.ok) {
      let raw = '';
      try {
        raw = await response.text();
      } catch {
        // the status alone tells enough
      }
      throw TriliumClient.#fail(path, response.status, raw);
    }
    return response;
  }

  #network(err, timeout = this.timeout) {
    if (err instanceof TriliumError) {
      return err;
    }
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return new TriliumError('timeout', `No answer from Trilium within ${timeout} ms`);
    }
    const cause = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? 'error';
    return new TriliumError('unreachable', `Trilium unreachable (${cause})`);
  }

  async #json(method, path, body) {
    const response = await this.#request(
      method,
      path,
      body === undefined ? undefined : JSON.stringify(body),
    );
    let raw;
    try {
      raw = await response.text();
    } catch (err) {
      throw this.#network(err);
    }
    try {
      return JSON.parse(raw);
    } catch {
      // A proxy login page answering 200 in HTML, for instance.
      throw new TriliumError('invalid', `${path.split('?')[0]}: the answer is not JSON`);
    }
  }

  static #fail(path, status, raw) {
    let detail = raw.trim() || `HTTP ${status}`;
    let code = null;
    try {
      const data = JSON.parse(raw);
      if (typeof data?.message === 'string') {
        detail = data.message;
      }
      code = typeof data?.code === 'string' ? data.code : null;
    } catch {
      // not JSON
    }
    if (/^\s*</.test(detail)) {
      detail = `HTTP ${status}`;
    }
    let kind = 'http';
    if (status === 401 || status === 403) {
      kind = 'unauthorized';
    } else if (status === 404) {
      // A coded 404 is a missing note; any other, a wrong address.
      kind = code ? 'not_found' : 'invalid';
    } else if (status === 400) {
      kind = 'rejected';
    }
    return new TriliumError(
      kind,
      `${path.split('?')[0]}: ${detail.replace(/\s+/g, ' ').slice(0, 120)}`,
      status,
    );
  }

  static #search(search, options = {}) {
    const params = new URLSearchParams({ search });
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined) {
        params.set(key, String(value));
      }
    }
    return `/notes?${params}`;
  }

  /** `{ appVersion, dbVersion, ... }` */
  async appInfo() {
    const data = await this.#json('GET', '/app-info');
    if (typeof data?.appVersion !== 'string') {
      throw new TriliumError('invalid', 'This address does not answer like Trilium');
    }
    return data;
  }

  /** One note, without its content. */
  async note(noteId) {
    const data = await this.#json('GET', `/notes/${encodeURIComponent(noteId)}`);
    if (typeof data?.noteId !== 'string') {
      throw new TriliumError('invalid', 'Trilium did not answer the note');
    }
    return data;
  }

  /**
   * Notes matching a search, parsed.
   * @param {string} search
   * @param {{ orderBy?: string, orderDirection?: 'asc' | 'desc', limit?: number }} [options]
   * @returns {Promise<object[]>}
   */
  async search(search, { orderBy, orderDirection, limit } = {}) {
    const data = await this.#json(
      'GET',
      TriliumClient.#search(search, { orderBy, orderDirection, limit }),
    );
    if (!Array.isArray(data?.results)) {
      throw new TriliumError('invalid', 'Trilium did not answer the search');
    }
    return data.results.filter((note) => !isSystemNote(note?.noteId));
  }

  /**
   * How many notes match a search (the system notes left out). ETAPI has no
   * count: the answer is read as a stream and its notes counted on the fly,
   * so a base of tens of thousands of notes never sits whole in the 256 MB of
   * the container. Each note of `results` starts with `{"noteId":`; an
   * attribute starts with `{"attributeId":`.
   * @param {string} search
   */
  async count(search) {
    // A large base takes a while to list: four times the usual delay.
    const timeout = this.timeout * 4;
    const response = await this.#request(
      'GET',
      TriliumClient.#search(search),
      undefined,
      undefined,
      timeout,
    );
    const decoder = new TextDecoder();
    const pattern = /\{"noteId":"([^"]*)"/g;
    let carry = '';
    let started = false;
    let count = 0;
    const scan = (text) => {
      for (const match of text.matchAll(pattern)) {
        if (!isSystemNote(match[1])) {
          count += 1;
        }
      }
    };
    try {
      for await (const chunk of response.body ?? []) {
        let text = carry + decoder.decode(chunk, { stream: true });
        if (!started) {
          if (text.length < 12) {
            carry = text;
            continue;
          }
          if (!/^\s*\{"results":\[/.test(text)) {
            throw new TriliumError('invalid', 'Trilium did not answer the search');
          }
          started = true;
        }
        // A match holds no "{": everything before the last one is complete.
        const cut = text.lastIndexOf('{');
        if (cut > 0) {
          scan(text.slice(0, cut));
          text = text.slice(cut);
        }
        carry = text;
      }
    } catch (err) {
      throw this.#network(err, timeout);
    }
    if (!started && !/^\s*\{"results":\[/.test(carry)) {
      throw new TriliumError('invalid', 'Trilium did not answer the search');
    }
    scan(carry + decoder.decode());
    return count;
  }

  /** The day note of a date (`YYYY-MM-DD`), created by Trilium when missing. */
  async dayNote(date) {
    const data = await this.#json('GET', `/calendar/days/${encodeURIComponent(date)}`);
    if (typeof data?.noteId !== 'string') {
      throw new TriliumError('invalid', 'Trilium did not answer the day note');
    }
    return data;
  }

  /** The content of a note (HTML for a text note). */
  async content(noteId) {
    const response = await this.#request('GET', `/notes/${encodeURIComponent(noteId)}/content`);
    try {
      return await response.text();
    } catch (err) {
      throw this.#network(err);
    }
  }

  async setContent(noteId, content) {
    const response = await this.#request(
      'PUT',
      `/notes/${encodeURIComponent(noteId)}/content`,
      content,
      'text/plain',
    );
    await response.text().catch(() => {});
  }

  /**
   * @param {{ parentNoteId: string, title: string, content: string }} note a text note
   * @returns {Promise<object>} the new note
   */
  async createNote({ parentNoteId, title, content }) {
    const data = await this.#json('POST', '/create-note', {
      parentNoteId,
      title,
      type: 'text',
      content,
    });
    if (typeof data?.note?.noteId !== 'string') {
      throw new TriliumError('invalid', 'Trilium did not answer the new note');
    }
    return data.note;
  }

  /** @param {string} noteId @param {{ name: string, value?: string }} label */
  async addLabel(noteId, { name, value = '' }) {
    return this.#json('POST', '/attributes', { noteId, type: 'label', name, value });
  }
}
