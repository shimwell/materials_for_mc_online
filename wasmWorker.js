// Web Worker hosting the WebAssembly material engine.
//
// The page never touches wasm directly. It posts a request with a requestId and
// waits for a reply carrying the same id, so every call site on the main thread
// stays a plain promise and the network and compute work never block
// rendering. The engine itself lives in engine.js so it can also be driven from
// Node for testing.
//
// Protocol, all messages tagged with the caller's requestId:
//   in  {type: 'create_material', materialId, materialDef, library}
//   out {type: 'created', requestId, mts: [int]}
//   in  {type: 'calc_xs', materialId, mts: [int], library}
//   out {type: 'xs', requestId, energy_grid: Float64Array, cross_sections: {mt: Float64Array}}
//   out {type: 'error', requestId, error: string}   on any failure
// A single {type: 'ready'} with no requestId is posted once init finishes.

import init from './pkg/yamc.js';
import { createEngine } from './engine.js';

let engine = null;

const ready = init().then(() => {
  engine = createEngine();
  self.postMessage({ type: 'ready' });
});

self.onmessage = async (event) => {
  const { type, requestId } = event.data ?? {};
  try {
    // Requests posted before init resolves are held here rather than rejected;
    // the page starts fetching materials.json immediately and can reach
    // `create_material` before the wasm module has finished instantiating.
    await ready;
    switch (type) {
      case 'create_material': {
        const { materialId, materialDef, library } = event.data;
        const mts = await engine.createMaterial(materialId, materialDef, library);
        self.postMessage({ type: 'created', requestId, mts });
        break;
      }
      case 'calc_xs': {
        const { materialId, mts, library } = event.data;
        const { energyGrid, crossSections } = await engine.calculateXs(materialId, mts, library);
        // The arrays are copies made by the wasm binding, so their buffers can
        // be handed to the page rather than cloned a second time.
        const transfer = [energyGrid.buffer, ...Object.values(crossSections).map((a) => a.buffer)];
        self.postMessage(
          { type: 'xs', requestId, energy_grid: energyGrid, cross_sections: crossSections },
          transfer,
        );
        break;
      }
      default:
        throw new Error(`unknown request type ${type}`);
    }
  } catch (err) {
    self.postMessage({ type: 'error', requestId, error: String(err?.message ?? err) });
  }
};
