/* tslint:disable */
/* eslint-disable */
export function natural_abundance(): any;
export function element_nuclides(): any;
export function sum_rules(): any;
export function element_names(): any;
export function atomic_masses(): any;
export function wasm_get_all_mt_descendants(mt_num: number): Array<any>;
export function wasm_read_nuclide_from_json(name: string, json_path: string): WasmNuclide;
export function wasm_read_nuclide_from_json_str(name: string, json_content: string): WasmNuclide;
export function wasm_set_nuclide_data(name: string, json_content: string): void;
export function wasm_start(): void;
export class WasmConfig {
  private constructor();
  free(): void;
  static set_cross_sections(js_map: any): void;
  static get_cross_sections(): any;
  static set_nuclide_data(nuclide_name: string, json_content: string): void;
}
export class WasmMaterial {
  free(): void;
  constructor();
  add_nuclide(nuclide: string, fraction: number): void;
  add_element(element: string, fraction: number): void;
  set_density(unit: string, value: number): void;
  set_volume(value: number): void;
  set_temperature(temperature: string): void;
  get_nuclides(): Array<any>;
  get_atoms_per_cc(): any;
  calculate_macroscopic_xs_neutron(mt_filter?: Array<any> | null, by_nuclide?: boolean | null): any;
  reaction_mts(): Array<any>;
  mean_free_path_neutron(energy: number): number | undefined;
  sample_distance_to_collision(energy: number): number | undefined;
  load_nuclide_data(nuclide_name: string, json_content: string): void;
  to_string(): string;
  /**
   * Sample which nuclide a neutron interacts with at a given energy, using per-nuclide macroscopic total xs
   * Returns the nuclide name as a String. If seed is provided, uses it for reproducibility.
   */
  sampleInteractingNuclide(energy: number, seed?: bigint | null): string;
}
export class WasmNuclide {
  private constructor();
  free(): void;
  static load_from_json(name: string, json_path: string): WasmNuclide;
  static load_from_json_str(name: string, json_content: string): WasmNuclide;
  get_name(): string;
  get_available_temperatures(): Array<any>;
  get_available_reactions(temperature: string): Array<any>;
}
export class WasmReaction {
  free(): void;
  constructor(threshold_idx: number);
  set_cross_section(cross_section: Float64Array): void;
  set_interpolation(interpolation: Int32Array): void;
  set_energy(energy: Float64Array): void;
  get_threshold_idx(): number;
  get_cross_section(): Array<any>;
  get_interpolation(): Array<any>;
  get_energy(): Array<any>;
  to_json(): any;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly natural_abundance: () => any;
  readonly element_nuclides: () => any;
  readonly sum_rules: () => any;
  readonly element_names: () => any;
  readonly atomic_masses: () => any;
  readonly wasm_get_all_mt_descendants: (a: number) => any;
  readonly __wbg_wasmreaction_free: (a: number, b: number) => void;
  readonly wasmreaction_new: (a: number) => number;
  readonly wasmreaction_set_cross_section: (a: number, b: number, c: number) => void;
  readonly wasmreaction_set_interpolation: (a: number, b: number, c: number) => void;
  readonly wasmreaction_set_energy: (a: number, b: number, c: number) => void;
  readonly wasmreaction_get_threshold_idx: (a: number) => number;
  readonly wasmreaction_get_cross_section: (a: number) => any;
  readonly wasmreaction_get_interpolation: (a: number) => any;
  readonly wasmreaction_get_energy: (a: number) => any;
  readonly wasmreaction_to_json: (a: number) => [number, number, number];
  readonly __wbg_wasmnuclide_free: (a: number, b: number) => void;
  readonly wasmnuclide_get_name: (a: number) => [number, number];
  readonly wasmnuclide_get_available_temperatures: (a: number) => any;
  readonly wasmnuclide_get_available_reactions: (a: number, b: number, c: number) => [number, number, number];
  readonly wasm_read_nuclide_from_json: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly wasm_read_nuclide_from_json_str: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly wasm_set_nuclide_data: (a: number, b: number, c: number, d: number) => [number, number];
  readonly wasmnuclide_load_from_json: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly wasmnuclide_load_from_json_str: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly __wbg_wasmmaterial_free: (a: number, b: number) => void;
  readonly wasmmaterial_new: () => number;
  readonly wasmmaterial_add_nuclide: (a: number, b: number, c: number, d: number) => [number, number];
  readonly wasmmaterial_add_element: (a: number, b: number, c: number, d: number) => [number, number];
  readonly wasmmaterial_set_density: (a: number, b: number, c: number, d: number) => [number, number];
  readonly wasmmaterial_set_volume: (a: number, b: number) => [number, number];
  readonly wasmmaterial_set_temperature: (a: number, b: number, c: number) => void;
  readonly wasmmaterial_get_nuclides: (a: number) => any;
  readonly wasmmaterial_get_atoms_per_cc: (a: number) => [number, number, number];
  readonly wasmmaterial_calculate_macroscopic_xs_neutron: (a: number, b: number, c: number) => [number, number, number];
  readonly wasmmaterial_reaction_mts: (a: number) => [number, number, number];
  readonly wasmmaterial_mean_free_path_neutron: (a: number, b: number) => [number, number];
  readonly wasmmaterial_sample_distance_to_collision: (a: number, b: number) => [number, number];
  readonly wasmmaterial_load_nuclide_data: (a: number, b: number, c: number, d: number, e: number) => [number, number];
  readonly wasmmaterial_to_string: (a: number) => [number, number];
  readonly wasmmaterial_sampleInteractingNuclide: (a: number, b: number, c: number, d: bigint) => [number, number];
  readonly __wbg_wasmconfig_free: (a: number, b: number) => void;
  readonly wasmconfig_set_cross_sections: (a: any) => [number, number];
  readonly wasmconfig_get_cross_sections: () => [number, number, number];
  readonly wasmconfig_set_nuclide_data: (a: number, b: number, c: number, d: number) => [number, number];
  readonly wasm_start: () => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
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
