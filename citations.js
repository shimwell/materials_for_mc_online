// Who made each nuclear data library the page offers, what to cite for it,
// and the terms its data is redistributed under.
//
// Every curve on the page rests on an evaluated library, and its evaluators
// ask to be cited wherever their data is used. The references are the ones
// the libraries' developers ask for, copied from the credits table of yamc
// and yani (fusion-neutronics/yamc-and-yani,
// crates/yamc-nuclide/src/storage/credits.rs), which also writes them into
// each release's NOTICE.md and each run's results. Change a reference there
// and here together. This file is the same in nuclide_cross_section_plotter.rs,
// materials_for_mc_online and xsplot-angular-energy-distribution.
//
// JEFF-4.0 is cited by its data sets until its journal paper is published.
// These pages read only its neutron data, so only the neutron data set is
// cited here; its decay, fission yield and thermal scattering data sets are
// for pages that read those.
//
// Nothing here touches the DOM or the network, so it is tested under Node.

const CC_BY_4_0 = 'Creative Commons Attribution 4.0 International (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/';

const TENDL_REFERENCES = Object.freeze([
  {
    text: 'A.J. Koning, D. Rochman, "Modern Nuclear Data Evaluation with the TALYS Code System", Nuclear Data Sheets 113 (2012) 2841-2934',
    doi: '10.1016/j.nds.2012.11.002',
  },
  {
    text: 'A.J. Koning, D. Rochman, J.-Ch. Sublet, N. Dzysiuk, M. Fleming, S. van der Marck, "TENDL: Complete Nuclear Data Library for Innovative Nuclear Science and Technology", Nuclear Data Sheets 155 (2019) 1-55',
    doi: '10.1016/j.nds.2019.01.002',
  },
]);

const TENDL_MADE_BY = 'A.J. Koning and D. Rochman, who founded TENDL in 2008 and make it with the TALYS code system, with processing and benchmarking by J.-Ch. Sublet';

const TENDL_TERMS = 'Publicly available from the TENDL project.';

const TENDL_SHORT = 'Cite: A.J. Koning, D. Rochman, Nuclear Data Sheets 113 (2012) 2841, doi:10.1016/j.nds.2012.11.002, and A.J. Koning et al., Nuclear Data Sheets 155 (2019) 1, doi:10.1016/j.nds.2019.01.002';

/// One entry per library keyword. `library` is the name its makers use,
/// `short` the one-line citation shown as hover text wherever the library is
/// named, and `references` what to cite, in the order its makers list it.
export const CREDITS = Object.freeze({
  'endf-b8.1': {
    library: 'ENDF/B-VIII.1',
    madeBy: 'the Cross Section Evaluation Working Group (CSEWG), released by the National Nuclear Data Center, Brookhaven National Laboratory',
    page: 'https://www.nndc.bnl.gov/endf-library/B-VIII.1/summary/',
    terms: 'Publicly available from the National Nuclear Data Center; the US Government disclaimer applies.',
    short: 'Cite: G.P.A. Nobre, R. Capote, M.T. Pigni et al., Nuclear Data Sheets 210 (2026) 1-224, doi:10.1016/j.nds.2026.04.001',
    references: [
      {
        text: 'G.P.A. Nobre, R. Capote, M.T. Pigni et al., "ENDF/B-VIII.1: Updated Nuclear Reaction Data Library for Science and Applications", Nuclear Data Sheets 210 (2026) 1-224',
        doi: '10.1016/j.nds.2026.04.001',
      },
      {
        text: 'ENDF/B-VIII.1, Brookhaven National Laboratory (2024), the library itself',
        doi: '10.11578/endf/2571019',
      },
    ],
  },
  'jeff-4.0': {
    library: 'JEFF-4.0',
    madeBy: 'the Joint Evaluated Fission and Fusion (JEFF) project, coordinated by the OECD Nuclear Energy Agency Data Bank',
    page: 'https://databank.io.oecd-nea.org/data/jeff/40/',
    terms: CC_BY_4_0,
    short: 'Cite the JEFF-4.0 neutron data set: Joint Evaluated Fission and Fusion Project, OECD Nuclear Energy Agency (2025), doi:10.82555/e9ajn-a3p20',
    references: [
      {
        text: 'Joint Evaluated Fission and Fusion Project, "JEFF-4.0 Evaluated Data: neutron data", OECD Nuclear Energy Agency (2025)',
        doi: '10.82555/e9ajn-a3p20',
      },
    ],
  },
  'jendl-5.0': {
    library: 'JENDL-5',
    madeBy: 'the Nuclear Data Center of the Japan Atomic Energy Agency (JAEA)',
    page: 'https://wwwndc.jaea.go.jp/jendl/j5/j5.html',
    terms: `${CC_BY_4_0}. JAEA requires its reference to be cited wherever JENDL-5 is used.`,
    short: 'Cite (required by JAEA): O. Iwamoto et al., Journal of Nuclear Science and Technology 60 (2023) 1-60, doi:10.1080/00223131.2022.2141903',
    references: [
      {
        text: 'O. Iwamoto, N. Iwamoto, S. Kunieda, F. Minato et al., "Japanese evaluated nuclear data library version 5: JENDL-5", Journal of Nuclear Science and Technology 60 (2023) 1-60',
        doi: '10.1080/00223131.2022.2141903',
      },
    ],
  },
  'tendl-2025': {
    library: 'TENDL-2025',
    madeBy: TENDL_MADE_BY,
    page: 'https://tendl.imperial.ac.uk/tendl_2025/reference.html',
    terms: TENDL_TERMS,
    short: TENDL_SHORT,
    references: TENDL_REFERENCES,
  },
  'tendl-2017': {
    library: 'TENDL-2017',
    madeBy: TENDL_MADE_BY,
    page: 'https://tendl.imperial.ac.uk/tendl_2017/reference.html',
    terms: TENDL_TERMS,
    short: TENDL_SHORT,
    references: TENDL_REFERENCES,
  },
  'fendl-3.2d': {
    library: 'FENDL-3.2d',
    madeBy: 'the IAEA Nuclear Data Section, which coordinates the Fusion Evaluated Nuclear Data Library',
    page: 'https://nds.iaea.org/fendl/',
    terms: 'Publicly available from the IAEA Nuclear Data Section.',
    short: 'Cite: G. Schnabel et al., Nuclear Data Sheets 193 (2024) 1-78, doi:10.1016/j.nds.2024.01.001',
    references: [
      {
        text: 'G. Schnabel, D.L. Aldama, T. Bohm, U. Fischer, S. Kunieda, A. Trkov et al., "FENDL: A library for fusion research and applications", Nuclear Data Sheets 193 (2024) 1-78',
        doi: '10.1016/j.nds.2024.01.001',
      },
    ],
  },
});

/// The resolvable link for a DOI.
export const doiUrl = (doi) => `https://doi.org/${doi}`;

/// What to cite for library `id`, as `[{reference, doi}]`: the shape yamc
/// and yani give `citations` in a run's `data_releases`. Empty for an id this
/// table does not know.
export function citationsFor(id) {
  return (CREDITS[id]?.references ?? []).map((r) => ({ reference: r.text, doi: r.doi }));
}

/// The terms library `id` is redistributed under, or '' if unknown.
export function termsFor(id) {
  return CREDITS[id]?.terms ?? '';
}

/// Hover text for wherever library `id` is named: its name and the one-line
/// citation.
export function citeTitle(id) {
  const c = CREDITS[id];
  return c ? `${c.library}. ${c.short}` : '';
}

/// The DOIs of library `id` as links, space separated, for a CSV column.
export function citeLinks(id) {
  return (CREDITS[id]?.references ?? []).map((r) => doiUrl(r.doi)).join(' ');
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

/// The citation list as HTML: one entry per library in `ids` (the page's
/// order), those in `used` first and marked as in the plot. Unknown ids are
/// left out.
export function citeListHtml(ids, used = new Set()) {
  const known = ids.filter((id) => CREDITS[id]);
  const ordered = [...known.filter((id) => used.has(id)), ...known.filter((id) => !used.has(id))];
  const entries = ordered.map((id) => {
    const c = CREDITS[id];
    const inPlot = used.has(id);
    const refs = c.references.map((r) => (
      `<li>${escapeHtml(r.text)}, <a href="${escapeHtml(doiUrl(r.doi))}" target="_blank" rel="noopener">doi:${escapeHtml(r.doi)}</a></li>`
    )).join('');
    return `<li class="cite-entry${inPlot ? ' in-plot' : ''}" data-library="${escapeHtml(id)}">`
      + `<span class="cite-library">${escapeHtml(c.library)}</span>`
      + (inPlot ? ' <span class="badge cite-badge">in this plot</span>' : '')
      + `<span class="cite-made-by">, made by ${escapeHtml(c.madeBy)} (<a href="${escapeHtml(c.page)}" target="_blank" rel="noopener">library page</a>).</span>`
      + `<ul class="cite-references">${refs}</ul>`
      + `<div class="cite-terms">Terms: ${escapeHtml(c.terms)}</div>`
      + '</li>';
  });
  return `<ul class="cite-list">${entries.join('')}</ul>`;
}
