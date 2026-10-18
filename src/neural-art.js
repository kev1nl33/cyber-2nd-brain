// Deterministic SVG geometry keeps the brain crisp as the graph zooms.
const LEFT = "M107 24 C100 16 88 16 80 21 C70 16 57 23 54 31 C42 29 32 37 33 49 C24 54 23 66 30 75 C24 84 27 97 36 103 C33 116 43 128 54 128 C60 140 72 144 83 137 C92 143 100 137 106 128 C112 116 103 105 107 94 C111 82 103 72 108 62 C113 50 104 42 107 24 Z";
const RIGHT = "M114 23 C123 15 136 18 144 23 C154 19 167 26 169 35 C181 34 190 44 186 55 C195 62 195 75 188 82 C194 94 187 106 179 111 C181 125 169 135 157 132 C151 144 137 146 127 138 C118 143 112 134 113 123 C109 111 118 103 113 92 C108 81 118 70 112 59 C108 46 117 37 114 23 Z";
const FOLDS = [
  "M47 43 C55 38 63 39 68 47 C72 54 64 60 58 58 C52 57 50 65 56 70",
  "M77 28 C70 36 79 42 87 41 C95 41 98 50 91 56 C86 61 75 57 74 68",
  "M39 72 C47 68 53 75 50 82 C47 89 58 93 66 87 C72 82 82 85 83 93",
  "M76 70 C87 66 94 74 91 83 C88 92 77 96 78 104 C80 111 91 110 96 103",
  "M48 108 C57 101 64 108 62 115 C60 122 69 127 76 121 C83 116 91 120 90 129",
  "M102 31 C96 43 106 47 101 59 C97 67 102 73 99 81",
  "M129 32 C121 39 125 50 135 50 C143 50 145 58 139 66",
  "M157 39 C148 42 150 51 158 55 C166 59 164 68 156 72 C147 75 143 83 150 89",
  "M118 68 C126 64 135 69 134 78 C133 87 124 88 120 95",
  "M173 77 C163 72 157 81 161 89 C165 97 154 101 146 97 C137 92 129 99 133 108",
  "M170 110 C160 105 153 113 156 121 C151 127 142 125 138 119 C132 114 123 119 125 129",
  "M116 103 C125 108 117 117 122 125 C126 131 135 131 141 127",
];

const cache = new Map();

function hash(text) {
  let n = 2166136261;
  for (const ch of text) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  return n >>> 0;
}

function makeNetwork(seed, sparse) {
  let state = seed >>> 0;
  const rand = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const threads = [[], [], []];
  const points = [];
  const step = sparse ? 13 : 10;
  for (const side of [0, 1]) {
    const rows = [];
    for (let y = 30; y <= 132; y += step) {
      const row = [];
      for (let col = 0; col < (sparse ? 5 : 7); col++) {
        const x = (side ? 121 : 42) + col * step + (Math.floor(y / step) % 2) * step * .38;
        const p = { x: x + (rand() - .5) * 5, y: y + (rand() - .5) * 5 };
        row.push(p);
        points.push(p);
      }
      rows.push(row);
    }
    for (let row = 0; row < rows.length; row++) {
      for (let col = 0; col < rows[row].length; col++) {
        const p = rows[row][col];
        const neighbors = [rows[row][col + 1], rows[row + 1]?.[col], rows[row + 1]?.[col + (row % 2 ? 1 : -1)]];
        for (const q of neighbors) {
          if (!q || Math.hypot(q.x - p.x, q.y - p.y) > step * 1.85 || rand() < .13) continue;
          const mx = (p.x + q.x) / 2 + (rand() - .5) * 3;
          const my = (p.y + q.y) / 2 + (rand() - .5) * 3;
          const layer = rand() > .91 ? 2 : rand() > .42 ? 1 : 0;
          threads[layer].push(`M${p.x.toFixed(1)} ${p.y.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`);
        }
      }
    }
  }
  const synapses = points.filter(() => rand() > (sparse ? .86 : .76)).map((p) =>
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(rand() * .52 + .43).toFixed(2)}"/>`).join("");
  return `<path class="neural-thread far" d="${threads[0].join("")}"/><path class="neural-thread mid" d="${threads[1].join("")}"/><path class="neural-thread lit" d="${threads[2].join("")}"/><g class="neural-synapses">${synapses}</g>`;
}

/** @param {"full"|"sparse"} detail @param {string} variant */
export function neuralBrainMarkup(detail = "full", variant = "core") {
  const key = `${detail}:${variant}`;
  if (cache.has(key)) return cache.get(key);
  const safe = `n${hash(key).toString(36)}`;
  const sparse = detail === "sparse";
  const folds = FOLDS.filter((_, i) => !sparse || i % 2 === 0).map((d) => `<path d="${d}"/>`).join("");
  const svg = `<svg class="brain-svg ${sparse ? "is-sparse" : ""}" viewBox="0 0 220 174" aria-hidden="true">
    <defs>
      <clipPath id="${safe}-clip"><path d="${LEFT}"/><path d="${RIGHT}"/></clipPath>
      <radialGradient id="${safe}-fill"><stop offset="0" stop-color="#1f9a5b" stop-opacity=".23"/><stop offset=".62" stop-color="#0b422b" stop-opacity=".13"/><stop offset="1" stop-color="#082419" stop-opacity=".03"/></radialGradient>
    </defs>
    <ellipse class="neural-orbit outer" cx="110" cy="87" rx="105" ry="75"/>
    <ellipse class="neural-orbit inner" cx="110" cy="87" rx="94" ry="67"/>
    <g class="brain-depth"><path d="${LEFT}" fill="url(#${safe}-fill)"/><path d="${RIGHT}" fill="url(#${safe}-fill)"/></g>
    <g clip-path="url(#${safe}-clip)">${makeNetwork(hash(key), sparse)}</g>
    <g class="neural-axons"><path d="M43 102C57 84 74 81 101 65"/><path d="M57 126C72 111 87 107 99 91"/><path d="M50 54C71 47 82 34 97 31"/><path d="M122 42C140 57 155 70 182 78"/><path d="M116 81C134 99 153 101 176 116"/></g>
    <g class="neural-folds">${folds}</g>
    <path class="neural-cross" d="M92 60C102 54 113 57 125 66M88 91C101 83 117 85 132 94M91 113C103 107 115 110 129 117"/>
    <path class="brain-contour" d="${LEFT}"/><path class="brain-contour" d="${RIGHT}"/>
    <path class="brain-cleft" d="M110 24C103 39 115 51 107 64C101 75 112 85 108 96C104 107 113 119 107 133"/>
    <path class="brain-stem" d="M99 136C102 148 105 153 108 157M118 137C116 147 114 153 111 157"/>
    <circle class="neural-beacon" cx="65" cy="79" r="1.7"/><circle class="neural-beacon delay" cx="149" cy="52" r="1.6"/><circle class="neural-beacon late" cx="132" cy="115" r="1.5"/>
  </svg>`;
  cache.set(key, svg);
  return svg;
}
