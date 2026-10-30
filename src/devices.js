// -----------------------------------------------------------------------------
// Trilium -> Gladys device: one "Trilium" device per instance
// (`trilium:<instance>`): notes, notes changed today, open to-dos, latest
// changed note. Everything is read only: notes are written through the scene
// actions.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
} from '@gladysassistant/integration-sdk';
import { NAMES, NONE, pick } from './texts.js';

export const TRILIUM_TYPE = 'trilium';
export const COUNTERS = ['notes', 'today', 'todo'];

const MAX_COUNT = 10_000_000;

export const triliumIds = (gladys, instance) => gladys.externalIds(TRILIUM_TYPE, instance);

const counter = (name, externalId) => ({
  name,
  external_id: externalId,
  category: CAT.COUNTER_SENSOR,
  type: TYPE.SENSOR.INTEGER,
  read_only: true,
  has_feedback: false,
  min: 0,
  max: MAX_COUNT,
  keep_history: true,
});

/**
 * @param {object} gladys
 * @param {{ id: string, version: string }} instance
 * @param {string} language
 * @param {string} url Trilium base URL (a device param, shown in Gladys)
 */
export function buildTriliumDevice(gladys, instance, language, url) {
  const names = pick(NAMES, language);
  const ids = triliumIds(gladys, instance.id);
  return {
    name: 'Trilium',
    external_id: ids.device,
    model: 'Trilium Notes',
    should_poll: false,
    features: [
      ...COUNTERS.map((key) => counter(names[key], ids.feature(key))),
      {
        name: names.latest,
        external_id: ids.feature('latest'),
        category: CAT.TEXT,
        type: TYPE.TEXT.TEXT,
        read_only: true,
        has_feedback: false,
        min: 0,
        max: 0,
        keep_history: false,
      },
    ],
    params: [
      { name: 'TRILIUM_URL', value: url },
      { name: 'TRILIUM_VERSION', value: instance.version || '?' },
    ],
  };
}

/**
 * @param {object} gladys
 * @param {string} instance
 * @param {{ notes: number, today: number, todo: number }} counters
 * @param {{ title: string } | undefined} latest the note changed last
 * @param {string} language
 */
export function buildTriliumStates(gladys, instance, counters, latest, language) {
  const ids = triliumIds(gladys, instance);
  return [
    ...COUNTERS.map((key) => ({
      device_feature_external_id: ids.feature(key),
      state: counters[key],
    })),
    {
      device_feature_external_id: ids.feature('latest'),
      text: (latest?.title || pick(NONE, language)).slice(0, 200),
    },
  ];
}

/** `ext:...:trilium:<instance>` -> { instance }; null when not ours. */
export function parseExternalId(gladys, externalId) {
  if (typeof externalId !== 'string') {
    return null;
  }
  const prefix = gladys.externalId(`${TRILIUM_TYPE}:`);
  if (!externalId.startsWith(prefix)) {
    return null;
  }
  const id = externalId.slice(prefix.length).split(':')[0];
  return id === '' ? null : { instance: id };
}

/**
 * The instance id: the creation time of the root note, set once when the
 * document was created (`2026-10-30 12:00:49.898Z` -> `20261030120049898`).
 * It survives a change of address; synced copies of one document share it,
 * and they hold the same notes. Without it, the address, without its scheme.
 * @param {object | null} root the answer of GET /notes/root
 * @param {string} url
 */
export function instanceId(root, url) {
  const digits = String(root?.utcDateCreated ?? '').replace(/\D/g, '');
  const raw = digits.length >= 14 ? digits : url.replace(/^https?:\/\//i, '');
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
