#!/usr/bin/env node
// Original geometric avatar drawings. No reference images, fonts, network calls or raster inputs.
// Run from any directory: node tools/original-assets/avatars.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = path.join(ROOT, 'app/public/assets/avatars');
export const AVATAR_NAMES = [
  'Fox', 'Owl', 'Cat', 'Bear', 'Robot', 'Astronaut', 'Alien', 'Penguin',
  'Jellyfish', 'Octopus', 'Fish', 'Turtle', 'Lion', 'Panda', 'Rabbit', 'Frog',
  'Eagle', 'Raccoon', 'Hedgehog', 'Dog',
];
const COLORS = ['#ec9853', '#a891d1', '#d0ae76', '#b58c69', '#68b8c3', '#c8cfe0', '#8ec99b', '#7f9faf',
  '#b79bdf', '#d88eac', '#e2aa61', '#8fb8a0', '#dbb56b', '#dce1dc', '#d5b7bd', '#a8c47e',
  '#d6b38d', '#aeb6c8', '#bc967c', '#c79d75'];
const ellipse = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const circle = (x, y, r, fill, extra = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
const line = (d, stroke = '#25302f', width = 5) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const eyes = (y = 124, gap = 30) => [128 - gap, 128 + gap].map((x) =>
  ellipse(x, y, 8, 11, '#162523') + circle(x - 2, y - 4, 2.5, '#fff6de')).join('');
const smile = (y = 158) => line(`M112 ${y} Q128 ${y + 13} 144 ${y}`);
const cheeks = (y = 150) => ellipse(84, y, 12, 6, '#f4b4a0', 'opacity=".4"') + ellipse(172, y, 12, 6, '#f4b4a0', 'opacity=".4"');
const head = () => ellipse(128, 133, 73, 77, 'url(#face)');
const nose = (y = 146) => `<path d="M120 ${y} Q128 ${y - 5} 136 ${y} L128 ${y + 8} Z" fill="#25302f"/>`;

function character(i) {
  switch (i) {
    case 0: return `<path d="M65 105L58 43 104 77M152 77L198 43 191 105" fill="url(#face)"/>`
      + `<path d="M70 82L67 58 89 77M167 77L189 58 186 82" fill="#4f3733"/>` + head()
      + `<path d="M58 128Q84 122 128 155Q172 122 198 128Q190 199 128 209Q66 199 58 128" fill="#fff0d8"/>` + eyes() + nose(153) + smile(172);
    case 1: return `<path d="M58 105L67 45 111 70Q128 63 145 70L189 45 198 105Z" fill="url(#face)"/>` + head()
      + ellipse(98, 125, 31, 39, '#eee7d7') + ellipse(158, 125, 31, 39, '#eee7d7') + eyes(123)
      + `<path d="M117 151L128 174 139 151Z" fill="#d4a653"/>` + line('M101 188Q128 204 155 188', '#6c5c85', 4);
    case 2: return `<path d="M57 108L63 42 107 76M149 76L193 42 199 108" fill="url(#face)"/>`
      + `<path d="M70 81L73 58 91 80M165 80L183 58 186 81" fill="#bd7b79"/>` + head() + eyes() + nose()
      + line('M128 154Q119 167 109 158M128 154Q137 167 147 158')
      + line('M76 145L45 139M77 157L45 162M180 145L211 139M179 157L211 162', '#6f5944', 3);
    case 3: return circle(75, 76, 29, 'url(#face)') + circle(181, 76, 29, 'url(#face)')
      + circle(75, 76, 15, '#725947') + circle(181, 76, 15, '#725947') + head()
      + ellipse(128, 159, 37, 30, '#e7c9a4') + eyes() + nose(147) + smile(165);
    case 4: return line('M128 68V43', '#cdb572', 6) + circle(128, 38, 9, '#e7c574')
      + `<rect x="44" y="108" width="17" height="48" rx="8" fill="#497e88"/><rect x="195" y="108" width="17" height="48" rx="8" fill="#497e88"/>
      <rect x="57" y="68" width="142" height="137" rx="38" fill="url(#face)"/>
      <rect x="73" y="95" width="110" height="59" rx="23" fill="#1c363c"/>`
      + circle(100, 124, 11, '#e8d490') + circle(156, 124, 11, '#e8d490') + line('M107 174H149', '#24444a', 7)
      + circle(83, 181, 5, '#e4b4a0') + circle(173, 181, 5, '#e4b4a0');
    case 5: return circle(128, 126, 83, '#d4d9df') + `<rect x="43" y="111" width="20" height="39" rx="9" fill="#a8b9c5"/><rect x="193" y="111" width="20" height="39" rx="9" fill="#a8b9c5"/>`
      + ellipse(128, 129, 65, 66, '#223b43') + ellipse(128, 140, 43, 47, '#d7ad88') + eyes(135, 22) + smile(158)
      + line('M84 111Q94 81 126 80', '#8db9bc', 7) + `<rect x="93" y="198" width="70" height="15" rx="7" fill="#c2b079"/>`;
    case 6: return line('M91 84L77 49M165 84L179 49', '#8fbfa2', 7) + circle(75, 44, 11, '#d9c781') + circle(181, 44, 11, '#d9c781')
      + head() + ellipse(99, 126, 17, 23, '#263b32', 'transform="rotate(-18 99 126)"')
      + ellipse(157, 126, 17, 23, '#263b32', 'transform="rotate(18 157 126)"')
      + circle(95, 119, 4, '#eef7d8') + circle(153, 119, 4, '#eef7d8') + smile(165);
    case 7: return ellipse(128, 138, 73, 80, '#34505c')
      + `<path d="M128 104Q99 67 77 117Q60 168 95 196Q128 216 161 196Q196 168 179 117Q157 67 128 104" fill="#e9ede4"/>`
      + eyes(129, 27) + `<path d="M116 149Q128 139 140 149L128 162Z" fill="#dfad59"/>`
      + ellipse(91, 207, 23, 9, '#dfad59') + ellipse(165, 207, 23, 9, '#dfad59');
    case 8: return [75, 102, 128, 154, 181].map((x, n) => line(`M${x} 149Q${x - 15} 174 ${x} 191Q${x + 14} 208 ${x - 2} 219`, n % 2 ? '#b49bcd' : '#83739e', 10)).join('')
      + `<path d="M52 145Q52 58 128 57Q204 58 204 145Q192 159 179 146Q166 160 153 147Q140 161 127 148Q114 160 101 147Q88 159 75 146Q63 158 52 145Z" fill="url(#face)"/>`
      + eyes(114, 26) + smile(136) + ellipse(102, 84, 21, 9, '#eadbfa', 'opacity=".4"');
    case 9: return [68, 98, 158, 188].map((x, n) => `<path d="M${x} 152Q${x + (n < 2 ? -23 : 23)} 185 ${x} 201" fill="none" stroke="${n % 2 ? '#b96d94' : '#d88eac'}" stroke-width="22" stroke-linecap="round"/>`).join('')
      + ellipse(128, 122, 68, 68, 'url(#face)') + eyes(121, 26) + cheeks(145) + smile(151);
    case 10: return `<path d="M179 113L222 80V184L179 158Z" fill="#c78943"/><path d="M108 78L129 46 154 85" fill="#d89d54"/>`
      + ellipse(123, 134, 77, 58, 'url(#face)') + line('M150 97Q169 132 150 171', '#bf813d', 4)
      + circle(86, 121, 10, '#273330') + circle(83, 118, 3, '#fff6df') + line('M51 140Q64 148 73 140')
      + `<path d="M120 139L142 126 140 154Z" fill="#c68640"/>` + circle(45, 83, 7, 'none', 'stroke="#96bcc0" stroke-width="3"');
    case 11: return ellipse(75, 177, 27, 18, '#769c7a') + ellipse(181, 177, 27, 18, '#769c7a')
      + ellipse(128, 162, 74, 52, '#386558') + `<path d="M128 122L156 140V173L128 191 100 173V140Z" fill="#769c7a" stroke="#aac69d" stroke-width="3"/>`
      + ellipse(128, 104, 46, 52, 'url(#face)') + eyes(103, 22) + smile(126);
    case 12: return circle(128, 133, 84, '#906446')
      + [0, 1, 2, 3, 4, 5, 6, 7].map((n) => { const a = n * Math.PI / 4; return circle(Math.round(128 + 61 * Math.cos(a)), Math.round(133 + 61 * Math.sin(a)), 25, '#a97748'); }).join('')
      + ellipse(128, 134, 61, 66, 'url(#face)') + ellipse(128, 164, 35, 24, '#f1dba9') + eyes(125, 26) + nose(148) + smile(168);
    case 13: return circle(76, 72, 27, '#2a3837') + circle(180, 72, 27, '#2a3837') + head()
      + ellipse(98, 124, 22, 29, '#31413f', 'transform="rotate(20 98 124)"')
      + ellipse(158, 124, 22, 29, '#31413f', 'transform="rotate(-20 158 124)"')
      + circle(99, 121, 7, '#edf0df') + circle(157, 121, 7, '#edf0df') + circle(100, 123, 4, '#162523') + circle(156, 123, 4, '#162523') + nose(154) + smile(171);
    case 14: return ellipse(91, 64, 21, 46, 'url(#face)', 'transform="rotate(-13 91 64)"') + ellipse(165, 64, 21, 46, 'url(#face)', 'transform="rotate(13 165 64)"')
      + ellipse(91, 63, 9, 31, '#b68092', 'transform="rotate(-13 91 63)"') + ellipse(165, 63, 9, 31, '#b68092', 'transform="rotate(13 165 63)"') + head() + eyes(131, 29) + cheeks(154) + nose(151) + smile(171);
    case 15: return ellipse(128, 147, 75, 61, 'url(#face)') + circle(84, 94, 30, 'url(#face)') + circle(172, 94, 30, 'url(#face)')
      + circle(84, 94, 17, '#f3edce') + circle(172, 94, 17, '#f3edce') + circle(85, 96, 8, '#233b2b') + circle(171, 96, 8, '#233b2b')
      + line('M88 151Q128 178 168 151') + circle(91, 175, 5, '#789852') + circle(164, 176, 4, '#789852');
    case 16: return `<path d="M65 108L53 82 85 83Q128 37 176 87L205 83 190 110V160Q172 210 128 214Q84 210 66 160Z" fill="url(#face)"/>`
      + `<path d="M73 94Q128 67 183 94L163 124 128 137 93 124Z" fill="#f0e7d3"/>` + eyes(122, 27)
      + `<path d="M116 142Q128 129 140 142L128 173Z" fill="#bd8d47"/>` + line('M110 188Q128 196 146 188', '#90714f', 4);
    case 17: return `<path d="M65 108L58 58Q75 43 105 80M151 80Q181 43 198 58L191 108" fill="#6d7789"/>` + head()
      + `<path d="M62 117Q90 103 128 126Q166 103 194 117L185 151Q157 156 128 140Q99 156 71 151Z" fill="#3c4659"/>`
      + circle(98, 128, 7, '#eddfbe') + circle(158, 128, 7, '#eddfbe') + ellipse(128, 167, 30, 26, '#e0dfd1') + nose(155) + smile(175);
    case 18: return `<path d="M48 139L39 116 61 109 50 83 77 85 78 57 100 71 115 43 132 65 155 49 163 76 191 67 187 97 211 101 196 125 211 146 189 160Q128 217 66 169Z" fill="#725747"/>`
      + ellipse(128, 148, 65, 61, 'url(#face)') + eyes(143, 26) + ellipse(128, 174, 26, 21, '#e0c09b') + nose(164) + smile(184);
    case 19: return ellipse(66, 124, 24, 65, '#7f5c45', 'transform="rotate(13 66 124)"') + ellipse(190, 124, 24, 65, '#7f5c45', 'transform="rotate(-13 190 124)"')
      + head() + `<path d="M119 60H139L145 143H110Z" fill="#edd8ba"/>` + eyes(125, 28) + ellipse(128, 165, 37, 29, '#e9cfac') + nose(151) + smile(171);
    default: throw new RangeError('Avatar index must be 0–19');
  }
}

export function avatarSvg(index) {
  if (!Number.isInteger(index) || index < 0 || index >= AVATAR_NAMES.length) throw new RangeError('Avatar index must be 0–19');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <title>OpenPoker ${AVATAR_NAMES[index]} avatar</title>
  <defs>
    <radialGradient id="bg" cx=".38" cy=".26" r=".85"><stop offset="0" stop-color="#30423f"/><stop offset="1" stop-color="#101b1b"/></radialGradient>
    <linearGradient id="face" x1="0" y1="0" x2=".2" y2="1"><stop offset="0" stop-color="${COLORS[index]}"/><stop offset="1" stop-color="${COLORS[index]}" stop-opacity=".86"/></linearGradient>
    <clipPath id="crop"><circle cx="128" cy="128" r="120"/></clipPath>
  </defs>
  <circle cx="128" cy="128" r="123" fill="#0b1415"/>
  <circle cx="128" cy="128" r="120" fill="url(#bg)" stroke="#bd9b60" stroke-width="2"/>
  <g clip-path="url(#crop)">
    <circle cx="198" cy="50" r="64" fill="#d8b56c" opacity=".055"/>
    <ellipse cx="128" cy="224" rx="80" ry="15" fill="#071011" opacity=".5"/>
    ${character(index)}
  </g>
</svg>
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  if (process.argv.slice(2).some((arg) => arg !== '--check')) throw new Error('Usage: node avatars.mjs [--check]');
  if (!check) fs.mkdirSync(OUT, { recursive: true });
  for (let i = 0; i < AVATAR_NAMES.length; i += 1) {
    const file = path.join(OUT, `openpoker-${String(i + 1).padStart(2, '0')}.svg`);
    const expected = avatarSvg(i);
    if (check) {
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== expected) throw new Error(`Avatar differs from source: ${path.relative(ROOT, file)}`);
    } else fs.writeFileSync(file, expected);
  }
  console.log(`${check ? 'Verified' : 'Wrote'} ${AVATAR_NAMES.length} original SVG avatars.`);
}
