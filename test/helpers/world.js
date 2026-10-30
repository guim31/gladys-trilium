// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys (a real GladysIntegration on an
// in-memory transport), the integration wired on it by registerHandlers, and
// a fake Trilium.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { MemoryStore } from '../../src/store.js';
import { HOST, INSTANCE, NOW, TOKEN, createTrilium, settle } from './fakeTrilium.js';

export const FAST_TIMINGS = { widgetGap: 0, requestTimeout: 200 };
export const CONFIG = { url: HOST, token: TOKEN };

export async function createWorld({
  server = createTrilium(),
  config = CONFIG,
  devices = [],
  connect = true,
  store = new MemoryStore(),
  clock = { now: NOW },
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    fetch: server.fetch,
    timings: FAST_TIMINGS,
    now: () => clock.now,
    store,
  });
  if (connect) {
    await gladys.connect();
    await settle(20);
  }
  return { gladys, app, hub: app.hub, server, store, clock, fake: gladys.fake };
}

export const mainDevice = `ext:test-integration:trilium:${INSTANCE}`;
export const mainFeature = (key) => `${mainDevice}:${key}`;

/** Add every discovered device to Gladys, as the user would. */
export async function createAll(fake) {
  for (const device of fake.discoveredDevices) {
    await fake.deviceCreated(device);
  }
  await settle();
}
