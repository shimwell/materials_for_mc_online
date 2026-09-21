/* tslint:disable */
/* eslint-disable */

export class WasmConfig {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    static get_cross_sections(): any;
    static set_cross_sections(js_map: any): void;
}

export class WasmElement {
    free(): void;
    [Symbol.dispose](): void;
    getNuclides(): Array<any>;
    constructor(name: string);
    readonly name: string;
}

export class WasmMaterial {
    free(): void;
    [Symbol.dispose](): void;
    add_element(element: string, fraction: number, fraction_type?: string | null, enrichment?: number | null, enrichment_target?: string | null, enrichment_type?: string | null): void;
    add_nuclide(nuclide: string, fraction: number, fraction_type?: string | null): void;
    get_atoms_per_barn_cm(): any;
    get_nuclides(): Array<any>;
    macroscopicCrossSection(reaction: number, temperature?: string | null): Array<any>;
    mean_free_path_neutron(energy: number): number | undefined;
    constructor();
    reaction_mts(): Array<any>;
    sampleInteractingNuclide(energy: number, seed?: bigint | null): string;
    sample_distance_to_collision(energy: number): number | undefined;
    set_density(unit: string, value?: number | null): void;
    set_temperature(temperature: string): void;
    set_volume(value: number): void;
    to_string(): string;
}

export class WasmNuclide {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    get_available_reactions(temperature: string): Array<any>;
    get_available_temperatures(): Array<any>;
    get_name(): string;
    static load(_name: string, _path: string): WasmNuclide;
}

export class WasmReaction {
    free(): void;
    [Symbol.dispose](): void;
    get_cross_section(): Array<any>;
    get_energy(): Array<any>;
    get_threshold_idx(): number;
    constructor(threshold_idx: number);
    set_cross_section(cross_section: Float64Array): void;
    set_energy(energy: Float64Array): void;
    to_json(): any;
}

/**
 * Browser-facing handle. Owns the in-memory `Storage` backend plus the
 * currently-loaded model (if any).
 */
export class WasmSimulation {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Add a single virtual file at `path`. Called once per option-D
     * section object under a nuclide's `.arrow/` prefix before
     * `simulate_transport`.
     */
    add_file(path: string, bytes: Uint8Array): void;
    /**
     * Bounding box of the loaded geometry as `[cx, cy, cz, wx, wy, wz]`
     * (center + widths in cm). Used by the JS viewer to seed initial view
     * origin/width and to scale wheel-zoom step size.
     */
    boundingBox(): Float64Array;
    /**
     * Fetch the nuclear data the loaded model needs and does not yet hold
     * into the in-memory store, from `library_url` (see
     * [`default_library_url`](super::simulation_wasm::default_library_url)).
     *
     * Each required nuclide is fetched as its published section objects. Where
     * `version.json` carries the byte-range index, `reactions.arrow` and
     * `energy.arrow` come as the ranges of the temperature each material is at
     * (or the two that bracket it), which is most of the saving: on
     * ENDF/B-VIII.1 one temperature of a nuclide's reactions is about a sixth
     * of them. Per-element photon data follows when the model has photons in
     * flight. A nuclide or element whose data is already in the store (fetched
     * earlier, or embedded by the exporting Python) is skipped.
     *
     * `on_progress`, when given, is called as `(message, done, total)` as each
     * nuclide or element starts.
     *
     * Resolves to a JSON string,
     * `{"status":"ok","nuclides":[...],"ranged":[...],"elements":[...],"requests":n,"bytes":n}`,
     * where `ranged` lists the nuclides whose reactions were fetched by byte
     * range. Rejects with a message naming the URL that failed. A material
     * temperature the published data does not cover is refused before any
     * bytes are fetched for that nuclide, with the same message the loader
     * would give.
     */
    fetchNuclearData(library_url: string, on_progress?: Function | null): Promise<any>;
    /**
     * Number of files currently held in the in-memory backend.
     */
    file_count(): number;
    /**
     * CsgGeometry JSON for the *visualization* -- same shape Python's
     * `model.plot()` embeds as `GEOMETRY_JSON`. Lets the JS viewer build
     * its cell/material name maps + legend from the currently loaded
     * model. Errors if no model is loaded or the model is mesh-backed.
     */
    geometryJson(): string;
    /**
     * Load a model from its JSON representation (as produced by Python's
     * `model.save(path)` / `model.export(html)`). Replaces any previously
     * loaded model. Returns an error string on parse failure.
     */
    load_model_json(json: string): void;
    /**
     * The required photon elements whose section set is not in the store
     * yet, comma-joined. See [`Self::model_missing_nuclides`].
     */
    model_missing_elements(): string;
    /**
     * The required nuclides whose section set is not in the store yet,
     * comma-joined; empty when transport can run. What the host's
     * Simulate gate reads, so that the answer comes from the store itself
     * rather than from bookkeeping the host keeps beside it.
     */
    model_missing_nuclides(): string;
    /**
     * Element symbols the loaded model needs *photon* data for, comma-
     * joined. Empty when the model has no photons in flight (no photon
     * source and no secondary-photon production), or no model loaded.
     * Photon data is per-element (`Fe`, not `Fe56`); the JS host fetches
     * the option-D section objects under `endf-b8.1/photon/<El>.arrow/`
     * for each and registers the files under `/<El>.arrow/`, mirroring the
     * neutron convention.
     */
    model_required_elements(): string;
    /**
     * Diagnostic: list of nuclide names referenced by the loaded model's
     * materials. JS uses this to know which `<Nuclide>.arrow/` section
     * sets to fetch. Returns a comma-joined string; empty if no model is
     * loaded.
     */
    model_required_nuclides(): string;
    /**
     * Construct a new simulation. Installs a fresh in-memory `Storage`
     * backend as the process-global `yamc_nuclide` storage.
     */
    constructor();
    /**
     * Build the full interactive-viewer HTML for the currently loaded
     * model -- same shape Python's `model.plot()._repr_html_()` produces.
     * The editor mounts this in an iframe; on every Apply it re-calls
     * `plotHtml` and rewrites `iframe.srcdoc` so the viewer reflects the
     * post-edit geometry/source.
     *
     * `params_json` accepts an optional initial view spec -- same keys as
     * `sampleSlice` (`origin`, `width`, `pixels`, `basis`). Empty / "{}"
     * auto-fits to the model's bounding box.
     */
    plotHtml(params_json: string): string;
    /**
     * Sample a 2D slice through the loaded model's geometry.
     *
     * `params_json` accepts:
     * ```json
     * { "origin":  [ox, oy, oz],
     *   "width":   [wh, wv],
     *   "pixels":  [ph, pv],
     *   "basis":   "xy" | "xz" | "yz" }
     * ```
     *
     * Returns an interleaved `[cell_id, mat_id, cell_id, mat_id, ...]`
     * flat `Vec<i32>` of length `ph * pv * 2`, rows top-to-bottom. `-1`
     * for void cells / material-less cells. Matches the wire format the
     * inline `JsCsgPlotter.sampleGrid(...)` produces, so the same
     * viewer JS consumes both.
     */
    sampleSlice(params_json: string): Int32Array;
    /**
     * Sample `n` source-particle positions using the loaded model's source
     * distribution. Returns a flat `[x0,y0,z0, x1,y1,z1, ...]` of length
     * `n * 3`. Drives the JS viewer's source-overlay dot cloud -- using the
     * real Rust sampler avoids the drift the inline JS sampler warns about.
     */
    sampleSourcePoints(n: number, seed: bigint): Float64Array;
    /**
     * Run the loaded model. `particles`, `batches`, `seed` override the
     * model's defaults. Returns a JSON result string with per-tally,
     * per-score breakdown:
     *
     * ```json
     * {
     *   "status": "ok",
     *   "particles": ..., "batches": ..., "seed": ...,
     *   "tallies": [
     *     {
     *       "name": "tritium",
     *       "scores": [{ "name": "105", "mean": ..., "std": ..., "fom": ... }, ...]
     *     },
     *     ...
     *   ]
     * }
     * ```
     *
     * On failure: `{"status":"error","message":...}`.
     */
    simulate_transport(particles: number, batches: number, seed: bigint): string;
    /**
     * Build an interactive mesh-tally plot HTML from the currently
     * loaded model's *current* tally state. Used by the editor's
     * Simulate handler to refresh the tally-plot iframe after each
     * in-browser run.
     *
     * Args (all in `params_json`):
     * - `tally_index` (usize): which tally to plot (default 0)
     * - `basis` ("xy" | "xz" | "yz", default "xz")
     * - `score_index` (usize, default 0)
     * - `outline` ("cell" | "material" | "none", default "cell")
     *
     * Returns the full self-contained interactive tally viewer HTML --
     * same shape Python's `tally.plot()._repr_html_()` produces.
     * Errors if the tally has no MeshFilter or no model is loaded.
     */
    tallyPlotHtml(params_json: string): string;
}

/**
 * The published library `fetchNuclearData` reads from unless the host names
 * another: the neutron and photon section objects of ENDF/B-VIII.1 on the yamc
 * data CDN. Exposed so an exported page has one source for the URL.
 */
export function default_library_url(): string;

export function element_names(): any;

export function element_nuclides(): any;

export function natural_abundance(): any;

export function wasm_load_nuclide(name: string, path: string): WasmNuclide;

export function wasm_start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmconfig_free: (a: number, b: number) => void;
    readonly __wbg_wasmelement_free: (a: number, b: number) => void;
    readonly __wbg_wasmmaterial_free: (a: number, b: number) => void;
    readonly __wbg_wasmnuclide_free: (a: number, b: number) => void;
    readonly __wbg_wasmreaction_free: (a: number, b: number) => void;
    readonly __wbg_wasmsimulation_free: (a: number, b: number) => void;
    readonly default_library_url: () => [number, number];
    readonly element_names: () => any;
    readonly element_nuclides: () => any;
    readonly natural_abundance: () => any;
    readonly wasm_load_nuclide: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasm_start: () => void;
    readonly wasmconfig_get_cross_sections: () => [number, number, number];
    readonly wasmconfig_set_cross_sections: (a: any) => [number, number];
    readonly wasmelement_getNuclides: (a: number) => any;
    readonly wasmelement_name: (a: number) => [number, number];
    readonly wasmelement_new: (a: number, b: number) => number;
    readonly wasmmaterial_add_element: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number];
    readonly wasmmaterial_add_nuclide: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly wasmmaterial_get_atoms_per_barn_cm: (a: number) => [number, number, number];
    readonly wasmmaterial_get_nuclides: (a: number) => any;
    readonly wasmmaterial_macroscopicCrossSection: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmmaterial_mean_free_path_neutron: (a: number, b: number) => [number, number];
    readonly wasmmaterial_new: () => number;
    readonly wasmmaterial_reaction_mts: (a: number) => [number, number, number];
    readonly wasmmaterial_sampleInteractingNuclide: (a: number, b: number, c: number, d: bigint) => [number, number, number, number];
    readonly wasmmaterial_sample_distance_to_collision: (a: number, b: number) => [number, number];
    readonly wasmmaterial_set_density: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmmaterial_set_temperature: (a: number, b: number, c: number) => void;
    readonly wasmmaterial_set_volume: (a: number, b: number) => [number, number];
    readonly wasmmaterial_to_string: (a: number) => [number, number];
    readonly wasmnuclide_get_available_reactions: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmnuclide_get_available_temperatures: (a: number) => any;
    readonly wasmnuclide_get_name: (a: number) => [number, number];
    readonly wasmnuclide_load: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmreaction_get_cross_section: (a: number) => any;
    readonly wasmreaction_get_energy: (a: number) => any;
    readonly wasmreaction_get_threshold_idx: (a: number) => number;
    readonly wasmreaction_new: (a: number) => number;
    readonly wasmreaction_set_cross_section: (a: number, b: number, c: number) => void;
    readonly wasmreaction_set_energy: (a: number, b: number, c: number) => void;
    readonly wasmreaction_to_json: (a: number) => [number, number, number];
    readonly wasmsimulation_add_file: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly wasmsimulation_boundingBox: (a: number) => [number, number, number, number];
    readonly wasmsimulation_fetchNuclearData: (a: number, b: number, c: number, d: number) => any;
    readonly wasmsimulation_file_count: (a: number) => number;
    readonly wasmsimulation_geometryJson: (a: number) => [number, number, number, number];
    readonly wasmsimulation_load_model_json: (a: number, b: number, c: number) => [number, number];
    readonly wasmsimulation_model_missing_elements: (a: number) => [number, number];
    readonly wasmsimulation_model_missing_nuclides: (a: number) => [number, number];
    readonly wasmsimulation_model_required_elements: (a: number) => [number, number];
    readonly wasmsimulation_model_required_nuclides: (a: number) => [number, number];
    readonly wasmsimulation_new: () => number;
    readonly wasmsimulation_plotHtml: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmsimulation_sampleSlice: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmsimulation_sampleSourcePoints: (a: number, b: number, c: bigint) => [number, number, number, number];
    readonly wasmsimulation_simulate_transport: (a: number, b: number, c: number, d: bigint) => [number, number];
    readonly wasmsimulation_tallyPlotHtml: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasm_bindgen_889ceef3cf823535___convert__closures_____invoke___js_sys_937819f340de9a46___Function_fn_wasm_bindgen_889ceef3cf823535___JsValue_____wasm_bindgen_889ceef3cf823535___sys__Undefined___js_sys_937819f340de9a46___Function_fn_wasm_bindgen_889ceef3cf823535___JsValue_____wasm_bindgen_889ceef3cf823535___sys__Undefined_______true_: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_889ceef3cf823535___convert__closures_____invoke___wasm_bindgen_889ceef3cf823535___JsValue__core_f0fd674eaa06beef___result__Result_____wasm_bindgen_889ceef3cf823535___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
