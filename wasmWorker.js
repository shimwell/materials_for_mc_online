// Web Worker hosting the WebAssembly material engine.
//
// The page never touches wasm directly. It posts a request with a requestId and
// waits for a reply carrying the same id, so every call site on the main thread
// stays a plain promise and the network and compute work never block
// rendering. The engine itself lives in engine.js so it can also be driven from
// Node for testing.
//
// Protocol, all messages tagged with the caller's requestId:
//   in  {type: 'create_material', materialId, materialDef, library, temperature}
//   out {type: 'created', requestId, mts: [int]}
//   in  {type: 'calc_xs', materialId, mts: [int], library, temperature}
//   in  {type: 'forget_material', materialId}
//   out {type: 'forgotten', requestId}
//   in  {type: 'elements'}
//   out {type: 'elements', requestId, elements: {symbol: [nuclide]}}
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
        const { materialId, materialDef, library, temperature } = event.data;
        const mts = await engine.createMaterial(materialId, materialDef, library, temperature);
        self.postMessage({ type: 'created', requestId, mts });
        break;
      }
      case 'calc_xs': {
        const { materialId, mts, library, temperature } = event.data;
        const { energyGrid, crossSections } = await engine.calculateXs(materialId, mts, library, temperature);
        // The arrays are copies made by the wasm binding, so their buffers can
        // be handed to the page rather than cloned a second time.
        const transfer = [energyGrid.buffer, ...Object.values(crossSections).map((a) => a.buffer)];
        self.postMessage(
          { type: 'xs', requestId, energy_grid: energyGrid, cross_sections: crossSections },
          transfer,
        );
        break;
      }
      case 'forget_material': {
        engine.forgetMaterial(event.data.materialId);
        self.postMessage({ type: 'forgotten', requestId });
        break;
      }
      case 'elements': {
        self.postMessage({ type: 'elements', requestId, elements: engine.elements() });
        break;
      }
      default:
        throw new Error(`unknown request type ${type}`);
    }
  } catch (err) {
    self.postMessage({ type: 'error', requestId, error: String(err?.message ?? err) });
  }
};
