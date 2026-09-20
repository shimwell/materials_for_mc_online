# materials_for_mc_online

Demonstration of the [yamc](https://github.com/fusion-neutronics/yamc)
material builder compiled to WebAssembly (the crate was previously called
Materials_for_MC).

The page plots macroscopic neutron cross sections for a collection of
materials. The Rust material code runs in the browser as wasm, and the nuclear
data is fetched on demand from the published Arrow files at
[yamc-data.xsplot.com](https://yamc-data.xsplot.com). Each row of the plot
picks its own library (ENDF/B-VIII.1, JEFF-4.0, JENDL-5.0, TENDL-2025,
TENDL-2017 or FENDL-3.2d), so one material can be compared across libraries.

The online site is here: [https://shimwell.github.io/materials_for_mc_online/](https://shimwell.github.io/materials_for_mc_online/)

## Temperature

Each row picks a temperature as well as a library, so a material can be drawn
against itself at another temperature. The six the libraries publish are
offered, 250, 294, 600, 900, 1200 and 2500 K, all Doppler broadened from the
same evaluation; a row starts at 294 K. Plot U238 capture at 294 K and again
at 2500 K to watch the 6.67 eV resonance flatten from 345 to 138 per cm.

The 0 K grid the libraries also publish is not offered: only elastic
scattering has a 0 K table, and a macroscopic cross section always needs the
total as well.

## Building your own material

The materials the page ships with are a starting point, not the limit. **New
material** opens a builder: give it a name, list what it is made of and its
density, and it appears at the top of every material dropdown, to plot beside
the built-in ones.

A component is either an element symbol, which expands over natural abundance,
or a nuclide name, which is taken literally. Mixing them is allowed, and it is
how an enriched material is written:

| Component | Fraction |
| --- | --- |
| `Li6` | 0.6 |
| `Li7` | 0.4 |
| `Be` | 0.1 |

Fractions are relative and may be atom or weight fractions; the density can be
given in g/cm3, kg/m3 or atom/barn-cm. A material you build is saved in your
browser and is also carried in the page URL, so a plot that uses one can be
sent to someone else and will open with the composition included. Opening the
same link twice does not add it twice.

A definition is exactly the shape `materials.json` uses, so one can be pasted
into that file to make it a built-in material, or copied out of it.

## How the data is loaded

Each nuclide is published as a directory of Arrow IPC files, written one
record batch per temperature (`energy.arrow`) and one per reaction and
temperature (`reactions.arrow`). The directory's `version.json` carries the
byte range of every batch. The page reads that index and issues HTTP range
requests for only the energy grid of the temperature a row asks for and the
reactions it is asked to plot,
then splices the pieces into Arrow streams for the wasm reader. Choosing a new
reaction costs one small range request per nuclide rather than a reload, and no
cross section data is kept in this repository.

- `index.html`: the page
- `wasmWorker.js`: Web Worker that hosts the wasm, one message per request
- `engine.js`: fetching, splicing and the calls into the wasm material API
- `ranges.js`: byte-range planning and Arrow stream splicing, no DOM or network
- `mt_names.js`: ENDF reaction names by MT number, generated from the `endf` crate in `core`
- `libraries.js`: the libraries on offer, shared by the page and the engine
- `temperatures.js`: the temperatures on offer, and how a label is spelled
- `custom_materials.js`: materials the user builds, with their validation and storage
- `url_state.js`: the plot and any custom materials as a URL hash
- `materials.json`: the material definitions the page ships with
- `pkg/`: the wasm package built from `core`, with `CORE_COMMIT` naming the commit

## Running locally

```bash
python -m http.server 8000
```

then open [http://localhost:8000](http://localhost:8000). The page fetches
nuclear data from the network, so it needs internet access.

## Tests

```bash
npm ci
npm test                          # the rules behind the builder and the URL
npx playwright install chromium
python3 -m http.server 8000 &
node tests/e2e.mjs                # drives the page against the live data
```

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
