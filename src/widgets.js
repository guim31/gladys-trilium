// -----------------------------------------------------------------------------
// The "Trilium" dashboard widget: counters (notes, notes changed today, open
// to-dos) and the notes changed last, each one opening in Trilium. Set to a
// label (`todo`, `shopping`...), it lists the notes carrying it and not
// `#done`: a to-do list on the dashboard.
// -----------------------------------------------------------------------------

import { WIDGET_KEY } from './hub.js';
import { labelName } from './trilium/model.js';
import { NAMES, pick } from './texts.js';

// The core shows 8 items at most in a `list` card-list.
export const MAX_ITEMS = 8;

export const TEXT = {
  today: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' },
  todo: { en: 'To-dos', fr: 'Tâches', de: 'Aufgaben', es: 'Tareas' },
  open: {
    en: 'Open in Trilium',
    fr: 'Ouvrir dans Trilium',
    de: 'In Trilium öffnen',
    es: 'Abrir en Trilium',
  },
  empty: {
    en: 'No note to show yet.',
    fr: 'Aucune note à afficher pour le moment.',
    de: 'Noch keine Notiz anzuzeigen.',
    es: 'Todavía no hay ninguna nota que mostrar.',
  },
  unavailable: {
    en: 'Trilium does not answer right now.',
    fr: 'Trilium ne répond pas pour le moment.',
    de: 'Trilium antwortet gerade nicht.',
    es: 'Trilium no responde en este momento.',
  },
  waiting: {
    en: 'Waiting for Trilium: check the configuration of the integration.',
    fr: "En attente de Trilium : vérifiez la configuration de l'intégration.",
    de: 'Warte auf Trilium: Prüfe die Konfiguration der Integration.',
    es: 'Esperando a Trilium: compruebe la configuración de la integración.',
  },
};

const cut = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);
const https = (url) => typeof url === 'string' && /^https:\/\//i.test(url);

function shortDate(iso, language) {
  const date = new Date(String(iso ?? '').replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString(
    { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' }[language] ?? 'en-GB',
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
  );
}

/** One row of the list. */
export function noteItem(note, language) {
  const item = { title: cut(note.title, 60), subtitle: shortDate(note.updated, language) };
  // The links of a card must be https: a Trilium on plain http is left out.
  if (https(note.url)) {
    item.links = [{ url: note.url.slice(0, 2000), label: pick(TEXT.open, language) }];
  }
  return item;
}

const truthy = (value) => value === true || value === 'true';

export async function buildContent(hub, { language = 'en', settings = {} } = {}) {
  if (!hub.loaded) {
    return {
      ttl_seconds: 60,
      components: [{ type: 'text', variant: 'body', text: pick(TEXT.waiting, language) }],
    };
  }
  const label = labelName(settings?.label);
  const names = pick(NAMES, language);
  const notes = await hub.widgetNotes(label, MAX_ITEMS);
  const components = [];
  if (!truthy(settings?.hide_counters)) {
    components.push(
      { type: 'value', label: names.notes, value: hub.counters.notes, icon: 'file-text' },
      {
        type: 'value',
        label: pick(TEXT.today, language),
        value: hub.counters.today,
        icon: 'edit-3',
      },
    );
    // The to-do tile counts the to-do label of the configuration: shown
    // beside the latest notes or that label's list, not another label's.
    if (!label || label === hub.config.todoLabel) {
      components.push({
        type: 'value',
        label: pick(TEXT.todo, language),
        value: hub.counters.todo,
        icon: 'check-square',
      });
    }
  }
  if (notes === null) {
    components.push({ type: 'text', variant: 'caption', text: pick(TEXT.unavailable, language) });
  } else if (notes.length === 0) {
    components.push({ type: 'text', variant: 'caption', text: pick(TEXT.empty, language) });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: notes.map((n) => noteItem(n, language)),
    });
  }
  // The hub nudges the widget after every read and every write.
  return { ttl_seconds: 300, components };
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    get: (hub, request) => buildContent(hub, request),
  },
};
