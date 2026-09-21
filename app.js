// The page's own code: everything that turns the controls into engine calls
// and the answers into a plot.
//
// Lifted out of index.html, where it was 697 of 1124 lines inline. A module in
// a file can be imported by a test, read in a diff without the markup around
// it, and cached by the browser separately from the page.

import { mtLabel } from './mt_names.js';
import { LIBRARIES, DEFAULT_LIBRARY, libraryLabel } from './libraries.js';
import {
    normaliseDefinition, definitionToForm, byId, customId, isCustomId,
    mergeDefinition, loadStored, saveStored, DENSITY_UNITS,
} from './custom_materials.js';
import { encodeState, decodeState } from './url_state.js';
import { TEMPERATURES, DEFAULT_TEMPERATURE, displayLabel, kelvinOf } from './temperatures.js';

// Replace direct WASM usage with Web Worker interface
const worker = new Worker('./wasmWorker.js', { type: 'module' });
let workerReady = false;
const pendingRequests = new Map();

// Busy / loading management
let busyCounter = 0;
const loadingDiv = document.getElementById('loading');
const defaultLoadingHTML = loadingDiv.innerHTML;
function showBusy(message) {
    busyCounter++;
    if (message) loadingDiv.innerHTML = `<span class="spinner"></span>${message}`;
    loadingDiv.style.display = 'block';
}
function updateBusyMessage(message) {
    if (busyCounter > 0 && message) loadingDiv.innerHTML = `<span class="spinner"></span>${message}`;
}
function hideBusy() {
    busyCounter = Math.max(0, busyCounter - 1);
    if (busyCounter === 0) {
        loadingDiv.style.display = 'none';
        loadingDiv.innerHTML = defaultLoadingHTML;
    }
}

function sendWorker(type, payload = {}) {
    return new Promise((resolve, reject) => {
        const requestId = crypto.randomUUID();
        pendingRequests.set(requestId, { resolve, reject });
        worker.postMessage({ type, requestId, ...payload });
    });
}

worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === 'ready') { workerReady = true; return; }
    const { requestId } = msg;
    if (requestId && pendingRequests.has(requestId)) {
        const { resolve, reject } = pendingRequests.get(requestId);
        pendingRequests.delete(requestId);
        if (msg.type === 'error') reject(new Error(msg.error)); else resolve(msg);
    }
};

// Material definitions will be loaded from materials.json
let materialDefinitions = {};

/// Materials the user built, in the order they were added; `c1` is the
/// first. They are kept in the browser and carried in the URL, so a
/// plot using one can be sent to someone else.
let customMaterials = [];
/// Element symbols the nuclear data knows, for checking a typed
/// composition before anything is fetched. Null until the worker answers.
let knownElements = null;

/// The definition behind a material id, custom or built in.
function definitionFor(materialId) {
    return isCustomId(materialId) ? byId(customMaterials)[materialId] : materialDefinitions[materialId];
}

/// The name to show for a material id.
function materialName(materialId) {
    return definitionFor(materialId)?.name ?? materialId;
}

// Cross section data storage, keyed by library, material and
// temperature: the same material from two libraries, or at two
// temperatures, is two entries with two grids
const materialData = {};
const materialKey = (materialId, library, temperature) => `${library}/${materialId}/${temperature}`;

const errorDiv = document.getElementById('error');
function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}
function clearError() {
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
}

// MTs whose microscopic quantity is an energy release in eV barn rather
// than a cross section in barn: ENDF reserves 301 to 450 for
// energy-release (KERMA) parameters, 444 is damage energy production
// and 901 is local heating. Their macroscopic value is energy per unit
// path length, eV cm⁻¹, so they are drawn on their own axis.
function isEnergyRelease(mt) {
    mt = Number(mt);
    return (mt >= 301 && mt <= 450) || mt === 901;
}
function energyReleaseTitle(mts) {
    const kinds = new Set(mts.map(mt => (Number(mt) === 444 ? 'Damage Energy' : 'Heating')));
    const label = kinds.size === 1 ? [...kinds][0] : 'Energy Release';
    return `${label} (eV cm⁻¹)`;
}

// Initialize the application
async function init_app() {
    // Load materials.json
    try {
        const response = await fetch('./materials.json');
        if (!response.ok) throw new Error('Failed to load materials.json');
        materialDefinitions = await response.json();
    } catch (err) {
        alert('Could not load materials.json: ' + err);
        return;
    }

    document.getElementById('builder-unit').innerHTML =
        DENSITY_UNITS.map((u) => `<option value="${u}">${u}</option>`).join('');

    // What the browser remembers, then anything the link carries. A
    // shared plot brings its own compositions, and one identical to a
    // material already saved is reused rather than duplicated, so
    // opening the same link twice does not grow the list.
    customMaterials = loadStored(window.localStorage);
    const fromUrl = decodeState(location.hash);
    const renamed = new Map();
    fromUrl.materials.forEach((def, i) => {
        const merged = mergeDefinition(customMaterials, def);
        customMaterials = merged.defs;
        renamed.set(customId(i), merged.id);
    });
    if (fromUrl.materials.length) saveStored(window.localStorage, customMaterials);
    renderCustomList();
    wireBuilder();

    document.getElementById('add-reaction-btn').addEventListener('click', () => addReactionRow());
    document.getElementById('download-data-btn').addEventListener('click', downloadPlotData);
    document.querySelectorAll('input[name="x-scale"], input[name="y-scale"]').forEach(radio => {
        radio.addEventListener('change', updatePlot);
    });

    // Only needed to check a typed composition, so the page does not
    // wait for it before drawing anything.
    sendWorker('elements')
        .then((msg) => { knownElements = new Set(Object.keys(msg.elements)); })
        .catch(() => {});

    const rows = fromUrl.rows.map((row) => ({ ...row, materialId: renamed.get(row.materialId) ?? row.materialId }));
    if (rows.length) {
        for (const row of rows) await addReactionRow(row);
    } else {
        await addReactionRow();
    }
}

function wireBuilder() {
    document.getElementById('new-material-btn').addEventListener('click', () => openBuilder());
    document.getElementById('clear-materials-btn').addEventListener('click', clearCustomMaterials);
    document.getElementById('builder-cancel').addEventListener('click', closeBuilder);
    document.getElementById('add-component-btn').addEventListener('click', () => {
        document.getElementById('component-rows').insertAdjacentHTML('beforeend', componentRowHtml());
    });
    document.getElementById('component-rows').addEventListener('click', (e) => {
        if (e.target.classList.contains('component-remove')) e.target.closest('tr').remove();
    });
    builder.addEventListener('submit', (e) => { e.preventDefault(); saveBuilder(); });
    document.getElementById('custom-list').addEventListener('click', (e) => {
        const { edit, remove } = e.target.dataset ?? {};
        if (edit) openBuilder(edit);
        if (remove) removeCustomMaterial(remove);
    });
}

async function ensureMaterial(materialId, library, temperature) {
    const key = materialKey(materialId, library, temperature);
    if (materialData[key]) return materialData[key];
    const def = definitionFor(materialId);
    if (!def) throw new Error(`Material def missing ${materialId}`);
    showBusy(`Creating ${def.name} from ${libraryLabel(library)} at ${displayLabel(temperature)}...`);
    try {
        const mtsMsg = await sendWorker('create_material', { materialId, materialDef: def, library, temperature });
        const mts = Array.isArray(mtsMsg.mts) ? mtsMsg.mts : [];
        console.log(`Material ${materialId} (${library}) created; MT count:`, mts.length, mts);
        materialData[key] = {
            name: def.name,
            library,
            temperature,
            energyGrid: null,
            crossSections: {},
            availableReactions: new Set(mts.map(m => m.toString()))
        };
    } catch (err) {
        console.error('ensureMaterial failed', err);
        showError(`Could not load ${def.name} from ${libraryLabel(library)} at ${displayLabel(temperature)}: ${err.message}`);
        throw err;
    } finally { hideBusy(); }
    return materialData[key];
}


// --- materials the user builds ------------------------------------
//
// A custom material is the same shape as a built-in one, so once it is
// in the list every other part of the page treats it the same way.

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/// The options for a material dropdown: anything the user built first,
/// under its own heading, then the materials the page ships with.
function materialOptionsHtml() {
    const builtIn = Object.entries(materialDefinitions)
        .map(([id, def]) => `<option value="${id}">${escapeHtml(def.name)}</option>`).join('');
    if (!customMaterials.length) return builtIn;
    const mine = customMaterials
        .map((def, i) => `<option value="${customId(i)}">${escapeHtml(def.name)}</option>`).join('');
    return `<optgroup label="Your materials">${mine}</optgroup>` +
           `<optgroup label="Built in">${builtIn}</optgroup>`;
}

/// Rebuild every row's material dropdown, keeping each row on the
/// material it was showing where that material still exists.
function refreshMaterialSelects() {
    for (const select of document.querySelectorAll('.material-select')) {
        const wanted = select.value;
        select.innerHTML = materialOptionsHtml();
        if (definitionFor(wanted)) select.value = wanted;
    }
    renderCustomList();
}

function renderCustomList() {
    const list = document.getElementById('custom-list');
    // The button is only offered when there is something to remove, and
    // it says how much: someone coming back to a list they built a year
    // ago should be told what they are about to lose.
    const clearButton = document.getElementById('clear-materials-btn');
    clearButton.hidden = customMaterials.length === 0;
    clearButton.textContent = `Remove all ${customMaterials.length}`;
    list.innerHTML = customMaterials.map((def, i) => {
        const id = customId(i);
        return `<span class="custom-chip"><span>${escapeHtml(def.name)}</span>` +
            `<button type="button" data-edit="${id}" title="Edit ${escapeHtml(def.name)}">edit</button>` +
            `<button type="button" class="remove" data-remove="${id}" title="Remove ${escapeHtml(def.name)}">\u2716</button></span>`;
    }).join('');
}

// The builder form. `editing` is the id being changed, or null for a
// new material.
let editing = null;
const builder = document.getElementById('material-builder');

function componentRowHtml(component = { name: '', fraction: '' }) {
    return `<tr>
        <td><input class="component-name" placeholder="Element or isotope e.g. Li or Li6" autocomplete="off" value="${escapeHtml(component.name ?? '')}"></td>
        <td><input class="component-fraction" type="number" step="any" min="0" placeholder="1.0" value="${component.fraction ?? ''}"></td>
        <td><span class="component-remove" title="Remove this component">\u2716</span></td>
    </tr>`;
}

function openBuilder(id = null) {
    editing = id;
    const form = id ? definitionToForm(definitionFor(id)) : null;
    document.getElementById('builder-name').value = form?.name ?? '';
    document.getElementById('builder-density').value = form?.density ?? '';
    document.getElementById('builder-unit').value = form?.unit ?? DENSITY_UNITS[0];
    const type = form?.fractionType ?? 'atom';
    for (const radio of builder.querySelectorAll('input[name="fraction-type"]')) radio.checked = radio.value === type;
    // One empty row to start: most materials being tried out are a
    // single element, and Add component is right there for the rest.
    const rows = form?.components?.length ? form.components : [{}];
    document.getElementById('component-rows').innerHTML = rows.map(componentRowHtml).join('');
    document.getElementById('builder-save').textContent = id ? 'Save changes' : 'Save material';
    showBuilderErrors([]);
    builder.hidden = false;
    document.getElementById('builder-name').focus();
}

function closeBuilder() {
    editing = null;
    builder.hidden = true;
}

function showBuilderErrors(errors) {
    const box = document.getElementById('builder-errors');
    box.innerHTML = errors.length ? `<ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>` : '';
    box.hidden = !errors.length;
}

function readBuilderForm() {
    return {
        name: document.getElementById('builder-name').value,
        fractionType: builder.querySelector('input[name="fraction-type"]:checked')?.value,
        density: document.getElementById('builder-density').value,
        unit: document.getElementById('builder-unit').value,
        components: [...document.querySelectorAll('#component-rows tr')].map((tr) => ({
            name: tr.querySelector('.component-name').value,
            fraction: tr.querySelector('.component-fraction').value,
        })),
    };
}

async function saveBuilder() {
    const { def, errors } = normaliseDefinition(readBuilderForm(), { knownElements });
    showBuilderErrors(errors);
    if (!def) return;
    if (editing) {
        // Same id, new composition: the worker is holding a material
        // built from the old one, and the page a grid computed from it.
        const id = editing;
        customMaterials[Number(id.slice(1)) - 1] = def;
        await sendWorker('forget_material', { materialId: id }).catch(() => {});
        // The key is library/material/temperature, so the id is the
        // middle segment and every library and temperature it was
        // computed at goes with it.
        for (const key of Object.keys(materialData)) {
            if (key.split('/')[1] === id) delete materialData[key];
        }
    } else {
        customMaterials.push(def);
    }
    saveStored(window.localStorage, customMaterials);
    closeBuilder();
    refreshMaterialSelects();
    updatePlot();
}

async function removeCustomMaterial(id) {
    const index = Number(id.slice(1)) - 1;
    if (!(index >= 0 && index < customMaterials.length)) return;
    // Rows drawing it fall back to the first built-in material, since
    // the id they hold is about to mean a different material or none.
    const fallback = Object.keys(materialDefinitions)[0];
    for (const select of document.querySelectorAll('.material-select')) {
        if (select.value === id) select.value = fallback;
    }
    await sendWorker('forget_material', { materialId: id }).catch(() => {});
    for (const key of Object.keys(materialData)) {
        if (key.split('/')[1] === id) delete materialData[key];
    }
    customMaterials.splice(index, 1);
    saveStored(window.localStorage, customMaterials);
    refreshMaterialSelects();
    updatePlot();
}

/// Remove every material the user has built, here and in the browser.
///
/// Their materials outlive the visit, so this is the way back to a
/// clean page without clearing the whole site's storage by hand.
async function clearCustomMaterials() {
    if (!customMaterials.length) return;
    const count = customMaterials.length;
    const question = count === 1
        ? `Remove the material you built, ${customMaterials[0].name}? This cannot be undone.`
        : `Remove all ${count} materials you have built? This cannot be undone.`;
    if (!window.confirm(question)) return;

    const ids = customMaterials.map((_, i) => customId(i));
    const fallback = Object.keys(materialDefinitions)[0];
    for (const select of document.querySelectorAll('.material-select')) {
        if (isCustomId(select.value)) select.value = fallback;
    }
    await Promise.all(ids.map((id) => sendWorker('forget_material', { materialId: id }).catch(() => {})));
    for (const key of Object.keys(materialData)) {
        if (isCustomId(key.split('/')[1])) delete materialData[key];
    }
    customMaterials = [];
    saveStored(window.localStorage, customMaterials);
    closeBuilder();
    refreshMaterialSelects();
    updatePlot();
}

// --- the plot as a URL ---------------------------------------------

let urlTimer = null;
function syncUrl() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => {
        const rows = [...document.querySelectorAll('.reaction-row')].map((row) => ({
            library: row.querySelector('.library-select').value,
            materialId: row.querySelector('.material-select').value,
            temperature: row.querySelector('.temperature-select').value,
            mt: row.querySelector('.reaction-select').value,
        }));
        const hash = encodeState({ rows, materials: customMaterials });
        const target = `${location.pathname}${location.search}${hash}`;
        if (`${location.pathname}${location.search}${location.hash}` !== target) {
            history.replaceState(null, '', target);
        }
    }, 200);
}

// Add a new reaction row
function addReactionRow(preset = null) {
    const reactionsContainer = document.getElementById('reactions-container');
    const rowId = Date.now(); // Unique ID for the row

    const row = document.createElement('div');
    row.className = 'reaction-row';
    row.id = `reaction-row-${rowId}`;

    // Create material select with labels
    const materialLabel = document.createElement('div');
    materialLabel.className = 'reaction-label';
    materialLabel.textContent = 'Material:';

    const materialSelect = document.createElement('select');
    materialSelect.className = 'material-select';
    materialSelect.dataset.rowId = rowId;
    materialSelect.innerHTML = materialOptionsHtml();

    // Create library select with labels
    const libraryLabelDiv = document.createElement('div');
    libraryLabelDiv.className = 'reaction-label';
    libraryLabelDiv.textContent = 'Library:';

    const librarySelect = document.createElement('select');
    librarySelect.className = 'library-select';
    librarySelect.dataset.rowId = rowId;
    librarySelect.innerHTML = LIBRARIES
        .map(lib => `<option value="${lib.id}">${lib.label}</option>`)
        .join('');
    librarySelect.value = DEFAULT_LIBRARY;

    // Create temperature select with labels
    const temperatureLabelDiv = document.createElement('div');
    temperatureLabelDiv.className = 'reaction-label';
    temperatureLabelDiv.textContent = 'Temperature:';

    const temperatureSelect = document.createElement('select');
    temperatureSelect.className = 'temperature-select';
    temperatureSelect.dataset.rowId = rowId;
    temperatureSelect.innerHTML = TEMPERATURES
        .map(t => `<option value="${t}">${displayLabel(t)}</option>`)
        .join('');
    temperatureSelect.value = DEFAULT_TEMPERATURE;

    // Create reaction select with labels
    const reactionLabel = document.createElement('div');
    reactionLabel.className = 'reaction-label';
    reactionLabel.textContent = 'Reaction:';

    const reactionSelect = document.createElement('select');
    reactionSelect.className = 'reaction-select';
    reactionSelect.dataset.rowId = rowId;

    // Create delete button
    const deleteBtn = document.createElement('span');
    deleteBtn.className = 'reaction-delete';
    deleteBtn.textContent = '✖';
    deleteBtn.dataset.rowId = rowId;
    deleteBtn.addEventListener('click', () => {
        document.getElementById(`reaction-row-${rowId}`).remove();
        updatePlot();
    });

    // Create material container
    const materialContainer = document.createElement('div');
    materialContainer.appendChild(materialLabel);
    materialContainer.appendChild(materialSelect);

    // Create library container
    const libraryContainer = document.createElement('div');
    libraryContainer.appendChild(libraryLabelDiv);
    libraryContainer.appendChild(librarySelect);

    // Create reaction container
    const temperatureContainer = document.createElement('div');
    temperatureContainer.appendChild(temperatureLabelDiv);
    temperatureContainer.appendChild(temperatureSelect);

    const reactionContainer = document.createElement('div');
    reactionContainer.appendChild(reactionLabel);
    reactionContainer.appendChild(reactionSelect);

    // Combine elements
    row.appendChild(materialContainer);
    row.appendChild(libraryContainer);
    row.appendChild(temperatureContainer);
    row.appendChild(reactionContainer);
    row.appendChild(deleteBtn);

    reactionsContainer.appendChild(row);

    // Update the available reactions for the selected material and
    // library; the libraries do not all publish the same reactions
    async function updateAvailableReactions() {
        const materialId = materialSelect.value;
        const library = librarySelect.value;
        const temperature = temperatureSelect.value;
        showBusy('Loading material reactions...');
        try {
            const material = await ensureMaterial(materialId, library, temperature);
            const currentSelection = reactionSelect.value;
            reactionSelect.innerHTML = '';
            const blankOption = document.createElement('option');
            blankOption.value = '';
            blankOption.textContent = '-- Select Reaction --';
            reactionSelect.appendChild(blankOption);
            const availableArray = Array.from(material.availableReactions);
            console.log('Populating reactions for', materialId, availableArray);
            if (availableArray.length === 0) {
                const none = document.createElement('option');
                none.disabled = true;
                none.textContent = '[No MT reactions found]';
                reactionSelect.appendChild(none);
            } else {
                availableArray.sort((a,b)=>parseInt(a)-parseInt(b)).forEach(rx => {
                    const opt = document.createElement('option');
                    opt.value = rx; opt.textContent = mtLabel(rx); reactionSelect.appendChild(opt);
                });
            }
            if (currentSelection && material.availableReactions.has(currentSelection)) reactionSelect.value = currentSelection; else reactionSelect.value='';
        } catch (err) {
            console.error('updateAvailableReactions error', err);
        } finally { hideBusy(); }
        updatePlot();
    }

    // Add event listeners for selects
    for (const select of [materialSelect, librarySelect, temperatureSelect]) {
        select.addEventListener('change', () => {
            updateAvailableReactions().catch(error => {
                console.error('Error updating available reactions:', error);
            });
        });
    }
    reactionSelect.addEventListener('change', updatePlot);

    // A row restored from the URL starts on what the link named;
    // otherwise the first row opens on pure Li-6, as it always has.
    if (preset?.library && LIBRARIES.some((l) => l.id === preset.library)) librarySelect.value = preset.library;
    if (preset?.temperature && TEMPERATURES.includes(preset.temperature)) temperatureSelect.value = preset.temperature;
    materialSelect.value = definitionFor(preset?.materialId) ? preset.materialId : 'pure_li6';

    // Initialize the reaction select based on the default material
    return updateAvailableReactions().then(() => {
        if (preset?.mt && [...reactionSelect.options].some((o) => o.value === String(preset.mt))) {
            reactionSelect.value = String(preset.mt);
            return updatePlot();
        }
    }).catch(error => {
        console.error('Error initializing available reactions:', error);
    });
}

// Update the plot based on selected reactions
async function updatePlot() {
    const rows = document.querySelectorAll('.reaction-row');
    if (rows.length === 0) return;
    // Determine which MTs need computing first for progress display
    const tasks = [];
    for (const row of rows) {
        const materialId = row.querySelector('.material-select').value;
        const library = row.querySelector('.library-select').value;
        const temperature = row.querySelector('.temperature-select').value;
        const mt = row.querySelector('.reaction-select').value;
        if (!materialId || !mt) continue;
        const mat = materialData[materialKey(materialId, library, temperature)];
        if (!mat || !mat.crossSections[mt]) tasks.push({ materialId, library, temperature, mt });
    }
    let completed = 0;
    if (tasks.length) showBusy(`Computing cross sections 0/${tasks.length}...`);
    const plotData = [];
    const traceMts = [];
    for (const row of rows) {
        const materialSelect = row.querySelector('.material-select');
        const librarySelect = row.querySelector('.library-select');
        const temperatureSelect = row.querySelector('.temperature-select');
        const reactionSelect = row.querySelector('.reaction-select');
        const materialId = materialSelect.value; const library = librarySelect.value;
        const temperature = temperatureSelect.value; const mt = reactionSelect.value;
        if (!materialId || !mt) continue;
        try {
            const mat = await ensureMaterial(materialId, library, temperature);
            if (!mat.crossSections[mt]) {
                const mtInt = parseInt(mt); if (isNaN(mtInt)) continue;
                const res = await sendWorker('calc_xs', { materialId, mts: [mtInt], library, temperature });
                if (!mat.energyGrid && res.energy_grid) mat.energyGrid = res.energy_grid;
                Object.entries(res.cross_sections || {}).forEach(([k,v])=>{ if(!mat.crossSections[k]) mat.crossSections[k]=v; });
                completed++; if (tasks.length) updateBusyMessage(`Computing cross sections ${completed}/${tasks.length}...`);
                clearError();
            }
            if (!mat.crossSections[mt]) continue;
            plotData.push({ x: mat.energyGrid, y: mat.crossSections[mt], type:'scatter', mode:'lines', name: `${mat.name} - MT ${mt} - ${libraryLabel(library)} - ${displayLabel(temperature)}` });
            traceMts.push(Number(mt));
        } catch(err) {
            console.error('Plot update XS error', err);
            showError(`Could not compute MT ${mt} for ${materialId} from ${libraryLabel(library)} at ${displayLabel(temperature)}: ${err.message}`);
        }
    }
    if (tasks.length) hideBusy();
    syncUrl();
    const xScaleType = document.querySelector('input[name="x-scale"]:checked').value;
    const yScaleType = document.querySelector('input[name="y-scale"]:checked').value;
    // Cross sections in cm⁻¹ and energy releases in eV cm⁻¹ never share
    // an axis: alone, either takes the left axis with its own title;
    // together, the energy releases move to a right-hand axis.
    const energyReleaseMts = traceMts.filter(isEnergyRelease);
    const mixed = energyReleaseMts.length > 0 && energyReleaseMts.length < traceMts.length;
    if (mixed) traceMts.forEach((mt, i) => { if (isEnergyRelease(mt)) plotData[i].yaxis = 'y2'; });
    const layout = { xaxis:{ title:'Energy (eV)', type:xScaleType }, hovermode:'closest', legend:{x:0,y:1} };
    if (traceMts.length && energyReleaseMts.length === traceMts.length) {
        layout.yaxis = { title: energyReleaseTitle(energyReleaseMts), type: yScaleType };
    } else {
        layout.yaxis = { title: 'Cross Section (cm⁻¹)', type: yScaleType };
        if (mixed) layout.yaxis2 = { title: energyReleaseTitle(energyReleaseMts), type: yScaleType, overlaying: 'y', side: 'right' };
    }
    Plotly.newPlot('plot', plotData, layout);
}

// Function to download plot data as JSON
function downloadPlotData() {
    // Get all reaction rows
    const rows = document.querySelectorAll('.reaction-row');
    if (rows.length === 0) {
        alert('No data to download. Please add at least one reaction first.');
        return;
    }

    const exportData = [];

    // Create data objects for each selected reaction
    for (const row of rows) {
        const materialSelect = row.querySelector('.material-select');
        const librarySelect = row.querySelector('.library-select');
        const temperatureSelect = row.querySelector('.temperature-select');
        const reactionSelect = row.querySelector('.reaction-select');

        const materialId = materialSelect.value;
        const library = librarySelect.value;
        const temperature = temperatureSelect.value;
        const mt = reactionSelect.value;

        // Skip if material data isn't loaded
        const key = materialKey(materialId, library, temperature);
        if (!materialData[key]) {
            continue;
        }

        const material = materialData[key];

        // Skip if material doesn't have the selected reaction
        if (!material.crossSections[mt]) {
            continue;
        }

        // Create name for the dataset
        const mtName = mt === 'total' ? 'Total' : `MT ${mt}`;

        // Typed arrays serialise as objects, so convert to plain arrays
        const energyValues = Array.from(material.energyGrid);
        const xsValues = Array.from(material.crossSections[mt]);

        // Add to export data with separate energy and value arrays,
        // naming the value array by its unit
        const energyRelease = isEnergyRelease(mt);
        exportData.push({
            material: material.name,
            library,
            temperature_K: kelvinOf(temperature),
            reaction: mtName,
            reactionId: mt,
            units: energyRelease ? 'eV/cm' : '1/cm',
            energy_eV: energyValues,
            [energyRelease ? 'eV_per_cm' : 'xs_per_cm']: xsValues
        });
    }

    // Create a JSON string
    const jsonData = JSON.stringify(exportData, null, 2);

    // Create a blob and download link
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Create a temporary link element and trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reaction_plot_data.json';
    document.body.appendChild(link);
    link.click();

    // Clean up
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
}

// Start the application
init_app().catch(console.error);
