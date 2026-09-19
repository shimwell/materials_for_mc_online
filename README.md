# materials_for_mc_online

Demonstration of the [yamc](https://github.com/fusion-neutronics/yamc)
material builder compiled to WebAssembly (the crate was previously called
Materials_for_MC).

The page plots macroscopic neutron cross sections for a collection of
materials. The Rust material code runs in the browser as wasm, and the nuclear
data is fetched on demand from the published ENDF/B-VIII.1 Arrow files at
[yamc-data.xsplot.com](https://yamc-data.xsplot.com).

The online site is here: [https://shimwell.github.io/materials_for_mc_online/](https://shimwell.github.io/materials_for_mc_online/)

## How the data is loaded

Each nuclide is published as a directory of Arrow IPC files, written one
record batch per temperature (`energy.arrow`) and one per reaction and
temperature (`reactions.arrow`). The directory's `version.json` carries the
byte range of every batch. The page reads that index and issues HTTP range
requests for only the 294 K energy grid and the reactions it is asked to plot,
then splices the pieces into Arrow streams for the wasm reader. Choosing a new
reaction costs one small range request per nuclide rather than a reload, and no
cross section data is kept in this repository.

- `index.html`: the page
- `wasmWorker.js`: Web Worker that hosts the wasm, one message per request
- `engine.js`: fetching, splicing and the calls into the wasm material API
- `ranges.js`: byte-range planning and Arrow stream splicing, no DOM or network
- `materials.json`: the material definitions
- `pkg/`: the wasm package built from `core`, with `CORE_COMMIT` naming the commit

## Running locally

```bash
python -m http.server 8000
```

then open [http://localhost:8000](http://localhost:8000). The page fetches
nuclear data from the network, so it needs internet access.

## Rebuilding the wasm

From a checkout of the `core` workspace beside this repository:

```bash
cd ../core/crates/yamc
wasm-pack build --target web --features wasm
cd -
cp ../core/crates/yamc/pkg/{yamc.js,yamc.d.ts,yamc_bg.wasm,yamc_bg.wasm.d.ts,package.json} pkg/
git -C ../core rev-parse HEAD > pkg/CORE_COMMIT
```

`wasm-opt -Oz` on `pkg/yamc_bg.wasm` trims the binary a little further if it
is available.
