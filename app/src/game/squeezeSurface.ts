export const CARD_WIDTH = 145;
export const CARD_HEIGHT = 203;
const angle = 25 * Math.PI / 180;
const nx = -Math.sin(angle), ny = Math.cos(angle);
/** Inextensible cylindrical bend: the material's arc length is preserved. */
export function bendCardPoint(x: number, y: number, pressure: number, layer = 0) {
    const lift = 92 * Math.max(0, Math.min(1, pressure));
    const distance = x * nx + (y - CARD_HEIGHT + lift) * ny;
    const radius = 15;
    const turn = distance > 0 && lift > 0 ? Math.min(distance / radius, 2.65) : 0;
    const tail = turn ? Math.max(0, distance - radius * turn) : 0;
    const along = radius * Math.sin(turn) + tail * Math.cos(turn);
    const shift = turn ? along - distance : 0;
    return { x: x + nx * shift - layer * nx * Math.sin(turn),
        y: y + ny * shift - layer * ny * Math.sin(turn),
        z: radius * (1 - Math.cos(turn)) + tail * Math.sin(turn) + layer * Math.cos(turn) };
}
export function squeezePose(frame: number) {
    const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
    return { pressure: smooth((frame - 12) / 23), spread: smooth((frame - 35) / 25) };
}
