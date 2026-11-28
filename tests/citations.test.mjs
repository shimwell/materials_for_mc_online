import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CREDITS, citationsFor, termsFor, citeTitle, citeLinks, citeListHtml, doiUrl } from '../citations.js';
import { LIBRARIES } from '../libraries.js';

const ids = LIBRARIES.map((l) => l.id);

test('every library the page offers has a credit, and every reference a DOI', () => {
  for (const id of ids) {
    const c = CREDITS[id];
    assert.ok(c, `${id} has no credit`);
    assert.ok(c.references.length > 0, id);
    for (const r of c.references) {
      assert.match(r.doi, /^10\.\d+\/\S+$/, `${id}: ${r.doi}`);
      assert.ok(!r.text.includes('  '), `${id}: ${r.text}`);
    }
    assert.ok(c.terms, id);
    assert.ok(c.short.includes(`doi:${c.references[0].doi}`), `${id}: hover text cites the first reference`);
  }
});

test('the BibTeX file holds exactly the DOIs the credits do', () => {
  const bib = readFileSync(new URL('../nuclear-data.bib', import.meta.url), 'utf8');
  const theirs = [...bib.matchAll(/doi = \{([^}]+)\}/g)].map((m) => m[1].toLowerCase()).sort();
  const ours = [...new Set(Object.values(CREDITS).flatMap((c) => c.references.map((r) => r.doi.toLowerCase())))].sort();
  assert.deepEqual(theirs, ours);
});

test('citations have the shape yamc gives them in data_releases', () => {
  assert.deepEqual(citationsFor('jendl-5.0'), [{
    reference: CREDITS['jendl-5.0'].references[0].text,
    doi: '10.1080/00223131.2022.2141903',
  }]);
  assert.equal(citationsFor('endf-b8.1').length, 2);
  assert.deepEqual(citationsFor('not-a-library'), []);
  assert.match(termsFor('jeff-4.0'), /CC BY 4\.0/);
  assert.match(termsFor('jendl-5.0'), /JAEA requires/);
  assert.equal(termsFor('not-a-library'), '');
});

test('hover text names the library and cites it', () => {
  assert.equal(
    citeTitle('fendl-3.2d'),
    'FENDL-3.2d. Cite: G. Schnabel et al., Nuclear Data Sheets 193 (2024) 1-78, doi:10.1016/j.nds.2024.01.001',
  );
  assert.equal(citeTitle('not-a-library'), '');
});

test('the CSV column lists every DOI as a link', () => {
  assert.equal(citeLinks('endf-b8.1'), 'https://doi.org/10.1016/j.nds.2026.04.001 https://doi.org/10.11578/endf/2571019');
  assert.equal(citeLinks('not-a-library'), '');
});

test('the citation list puts the libraries in the plot first and marks them', () => {
  const html = citeListHtml(ids, new Set(['tendl-2025', 'jeff-4.0']));
  const order = [...html.matchAll(/data-library="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['jeff-4.0', 'tendl-2025', ...ids.filter((id) => id !== 'jeff-4.0' && id !== 'tendl-2025')]);
  assert.equal((html.match(/in this plot/g) ?? []).length, 2);
  for (const c of Object.values(CREDITS)) {
    for (const r of c.references) assert.ok(html.includes(`href="${doiUrl(r.doi)}"`), r.doi);
  }
});

test('the citation list escapes its text and leaves out unknown ids', () => {
  const html = citeListHtml(['endf-b8.1', 'not-a-library']);
  assert.ok(!html.includes('not-a-library'));
  assert.ok(html.includes('&quot;ENDF/B-VIII.1: Updated'));
  assert.ok(!html.includes('in this plot'));
});
