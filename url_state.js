// The plot as a URL: which rows are drawn, and any materials the user built.
//
//   #r=endf-b8.1:pure_li6:1;jeff-4.0:c1:205&m=<the custom materials>
//
// A row is library, material and MT. A material id of `c1` names the first
// custom material in `m`, so a link carries everything it needs: someone
// opening it gets the composition as well as the plot.
//
// The materials travel as base64url of their JSON. That is longer than a
// hand-rolled format would be, but it is the same JSON the page already holds
// and the same shape as materials.json, so there is one definition of a
// material rather than two.
//
// Nothing here touches the DOM, so the round trip can be checked under Node.

const toBase64Url = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (text) => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
};

/// `state`: {rows: [{library, materialId, mt}], materials: [def]}.
/// A row without a reaction chosen yet is left out; an empty plot is an empty
/// hash rather than a hash saying nothing.
export function encodeState({ rows = [], materials = [] } = {}) {
  const parts = [];
  const drawn = rows.filter((r) => r.library && r.materialId && r.mt);
  if (drawn.length) {
    parts.push(`r=${drawn.map((r) => `${r.library}:${r.materialId}:${r.mt}`).join(';')}`);
  }
  // Only the custom materials a row actually uses: a link should carry the
  // plot, not the whole of someone's saved list.
  const used = new Set(drawn.map((r) => r.materialId));
  const carried = materials.filter((_, i) => used.has(`c${i + 1}`));
  if (carried.length) parts.push(`m=${toBase64Url(JSON.stringify(materials))}`);
  return parts.length ? `#${parts.join('&')}` : '';
}

/// The inverse. Anything unparseable is dropped rather than failing the page.
export function decodeState(hash) {
  const state = { rows: [], materials: [] };
  const text = (hash ?? '').replace(/^#/, '');
  if (!text) return state;
  const fields = new Map();
  for (const part of text.split('&')) {
    const eq = part.indexOf('=');
    if (eq > 0) fields.set(part.slice(0, eq), decodeURIComponent(part.slice(eq + 1)));
  }
  if (fields.has('m')) {
    try {
      const parsed = JSON.parse(fromBase64Url(fields.get('m')));
      if (Array.isArray(parsed)) {
        state.materials = parsed.filter((d) => d && typeof d === 'object' && d.name && d.density);
      }
    } catch {
      // A truncated or edited link: the rows may still be usable.
    }
  }
  if (fields.has('r')) {
    for (const row of fields.get('r').split(';')) {
      const m = /^([A-Za-z0-9.-]+):([A-Za-z0-9_]+):(\d+)$/.exec(row);
      if (m) state.rows.push({ library: m[1], materialId: m[2], mt: Number(m[3]) });
    }
  }
  return state;
}
