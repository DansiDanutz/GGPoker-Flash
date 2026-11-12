// Simple, original sea-creature emblems drawn in a 200x200 box centred on (100,100).
// Used by the rewards rank crests and the rewards banner/tile. Flat shapes, bold read at 46px.

const OUTLINE = 'stroke="#1a1410" stroke-width="3" stroke-linejoin="round"';

const eye = (x, y, r = 4.5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/><circle cx="${x + r * 0.25}" cy="${y}" r="${r * 0.55}" fill="#14100c"/>`;

function clownfish() {
  return `<clipPath id="cf-body"><ellipse cx="104" cy="100" rx="44" ry="27"/></clipPath>
    <path d="M64 100L36 78Q42 100 36 122Z" fill="#f08a3a" ${OUTLINE}/>
    <path d="M90 76Q104 54 122 76Z" fill="#f08a3a" ${OUTLINE}/>
    <ellipse cx="104" cy="100" rx="44" ry="27" fill="#f08a3a"/>
    <g clip-path="url(#cf-body)"><rect x="80" y="60" width="11" height="80" fill="#fff8ee" stroke="#1a1410" stroke-width="2.5"/>
      <rect x="110" y="60" width="10" height="80" fill="#fff8ee" stroke="#1a1410" stroke-width="2.5"/></g>
    <ellipse cx="104" cy="100" rx="44" ry="27" fill="none" ${OUTLINE}/>
    <path d="M100 118Q108 132 116 118" fill="#f08a3a" ${OUTLINE}/>
    ${eye(132, 94, 5)}`;
}

function shrimp() {
  const segs = [];
  for (let i = 0; i < 7; i += 1) {
    const a = (-150 + i * 30) * (Math.PI / 180);
    const x = 100 + 34 * Math.cos(a);
    const y = 104 + 34 * Math.sin(a);
    const s = 1 - i * 0.08;
    segs.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(16 * s).toFixed(1)}" ry="${(12 * s).toFixed(1)}" transform="rotate(${-150 + i * 30 + 90} ${x.toFixed(1)} ${y.toFixed(1)})" fill="#f6a48c" ${OUTLINE}/>`);
  }
  return `<path d="M60 86Q30 40 76 30M64 82Q48 34 98 40" fill="none" stroke="#1a1410" stroke-width="3" stroke-linecap="round"/>
    ${segs.reverse().join('')}
    <path d="M128 128L148 150L124 146L120 158L110 140Z" fill="#f6a48c" ${OUTLINE}/>
    ${[0, 1, 2].map((k) => `<path d="M${82 + k * 12} ${128 + k * 2}l-4 14" stroke="#1a1410" stroke-width="3" stroke-linecap="round"/>`).join('')}
    ${eye(62, 98, 4.5)}`;
}

function crab() {
  const legs = [0, 1, 2].map((k) => `<path d="M${72 - k * 2} ${108 + k * 8}L${46 - k * 4} ${116 + k * 12}" stroke="#1a1410" stroke-width="9" stroke-linecap="round"/>
      <path d="M${72 - k * 2} ${108 + k * 8}L${46 - k * 4} ${116 + k * 12}" stroke="#e0533d" stroke-width="4" stroke-linecap="round"/>
      <path d="M${128 + k * 2} ${108 + k * 8}L${154 + k * 4} ${116 + k * 12}" stroke="#1a1410" stroke-width="9" stroke-linecap="round"/>
      <path d="M${128 + k * 2} ${108 + k * 8}L${154 + k * 4} ${116 + k * 12}" stroke="#e0533d" stroke-width="4" stroke-linecap="round"/>`).join('');
  const claw = (x, flip) => `<g transform="translate(${x} 64) scale(${flip} 1)"><path d="M0 22A20 20 0 1 1 18 6L4 12L16 18A20 20 0 0 1 0 22Z" fill="#e0533d" ${OUTLINE}/></g>`;
  return `${legs}<path d="M80 98L62 80M120 98L138 80" stroke="#1a1410" stroke-width="10" stroke-linecap="round"/>
    <path d="M80 98L62 80M120 98L138 80" stroke="#e0533d" stroke-width="5" stroke-linecap="round"/>
    ${claw(52, 1)}${claw(148, -1)}
    <ellipse cx="100" cy="110" rx="38" ry="25" fill="#e0533d" ${OUTLINE}/>
    <path d="M90 88V76M110 88V76" stroke="#1a1410" stroke-width="3"/>${eye(90, 74, 5)}${eye(110, 74, 5)}
    <path d="M90 116Q100 124 110 116" fill="none" stroke="#1a1410" stroke-width="3" stroke-linecap="round"/>`;
}

function octopus() {
  const arms = [-50, -30, -10, 10, 30, 50].map((dx, i) => {
    const x = 100 + dx * 0.6;
    const ex = 100 + dx * 1.15;
    const curl = i % 2 ? 1 : -1;
    return `<path d="M${x} 104Q${x + dx * 0.3} 134 ${ex} 146q${8 * curl} 8 ${-2 * curl} 14" fill="none" stroke="#1a1410" stroke-width="13" stroke-linecap="round"/>
      <path d="M${x} 104Q${x + dx * 0.3} 134 ${ex} 146q${8 * curl} 8 ${-2 * curl} 14" fill="none" stroke="#9a6ad0" stroke-width="7.5" stroke-linecap="round"/>`;
  }).join('');
  return `${arms}<path d="M66 104Q60 44 100 42Q140 44 134 104Q100 116 66 104Z" fill="#9a6ad0" ${OUTLINE}/>
    <ellipse cx="88" cy="62" rx="9" ry="6" fill="#fff" opacity=".35"/>
    ${eye(88, 86, 6)}${eye(112, 86, 6)}<path d="M94 100Q100 105 106 100" fill="none" stroke="#1a1410" stroke-width="3" stroke-linecap="round"/>`;
}

function turtle() {
  const hex = [[100, 84], [86, 104], [114, 104], [100, 122]].map(([x, y]) =>
    `<path d="M${x - 9} ${y}L${x - 4.5} ${y - 8}H${x + 4.5}L${x + 9} ${y}L${x + 4.5} ${y + 8}H${x - 4.5}Z" fill="#7cc48a" stroke="#1d4d2a" stroke-width="2"/>`).join('');
  const flip = (x, y, r) => `<ellipse cx="${x}" cy="${y}" rx="18" ry="9" transform="rotate(${r} ${x} ${y})" fill="#b9d98a" ${OUTLINE}/>`;
  return `${flip(64, 72, -35)}${flip(136, 72, 35)}${flip(68, 132, 30)}${flip(132, 132, -30)}
    <path d="M100 140l-6 12h12z" fill="#b9d98a" ${OUTLINE}/>
    <circle cx="100" cy="50" r="15" fill="#b9d98a" ${OUTLINE}/>${eye(94, 46, 3.5)}${eye(106, 46, 3.5)}
    <ellipse cx="100" cy="103" rx="38" ry="42" fill="#3f9a5a" ${OUTLINE}/>${hex}`;
}

function dolphin() {
  return `<path d="M34 128Q52 74 112 66Q148 62 166 82L184 84L168 94Q150 104 124 100Q88 100 62 134Z" fill="#6aa8d8" ${OUTLINE}/>
    <path d="M110 68L118 40L134 66Z" fill="#4f8fc2" ${OUTLINE}/>
    <path d="M44 116L22 104L30 126L18 146L46 132Z" fill="#4f8fc2" ${OUTLINE}/>
    <path d="M98 98L92 118L110 100Z" fill="#4f8fc2" ${OUTLINE}/>
    <path d="M70 108Q110 92 160 92" fill="none" stroke="#eaf6ff" stroke-width="4" stroke-linecap="round" opacity=".8"/>
    ${eye(146, 78, 4.5)}`;
}

function shark() {
  return `<path d="M28 80L50 102L28 126L56 112Q100 128 150 116Q178 110 184 100Q172 86 140 82Q96 76 56 92Z" fill="#7d93a8" ${OUTLINE}/>
    <path d="M90 82L112 44L124 82Z" fill="#6a7f94" ${OUTLINE}/>
    <path d="M110 114L98 140L128 116Z" fill="#6a7f94" ${OUTLINE}/>
    <path d="M70 108Q120 118 176 102" fill="none" stroke="#f1f5f8" stroke-width="5" stroke-linecap="round"/>
    ${[0, 1, 2].map((k) => `<path d="M${132 + k * 6} 90q-3 8 0 14" fill="none" stroke="#1a1410" stroke-width="2.5"/>`).join('')}
    <path d="M160 106l12 -2" stroke="#1a1410" stroke-width="2.5" stroke-linecap="round"/>${eye(162, 92, 4)}`;
}

function whale() {
  return `<path d="M72 50q-2 -16 -12 -24M74 48q4 -16 14 -22M73 48v-26" fill="none" stroke="#bfe8ff" stroke-width="4" stroke-linecap="round"/>
    <path d="M44 112Q40 62 98 60Q160 60 170 104Q170 140 112 142Q74 142 56 128L30 140L36 116L18 100Z" fill="#2f63a3" ${OUTLINE}/>
    <path d="M58 124Q110 148 168 110Q162 136 112 140Q78 140 58 124Z" fill="#a9d3f2"/>
    ${[0, 1, 2, 3].map((k) => `<path d="M${84 + k * 16} ${132 - k * 2}q6 -6 12 -4" fill="none" stroke="#1d3f6b" stroke-width="2.5"/>`).join('')}
    <path d="M100 118L86 138L116 124Z" fill="#285790" ${OUTLINE}/>
    ${eye(140, 98, 5)}`;
}

export const CREATURES = Object.freeze({ clownfish, shrimp, crab, octopus, turtle, dolphin, shark, whale });
export const RANK_CREATURES = Object.freeze(['clownfish', 'shrimp', 'crab', 'octopus', 'turtle', 'dolphin', 'shark', 'whale']);
