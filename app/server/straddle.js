// Native straddle round (REA straddle-sitout.json). The ask window is not in the client
// (server-driven OnTimeBank Straddle); 5 s is the observed TIME badge on a live $1/$2 table.
export const STRADDLE_ASK_MS = 5000;

/** Seats a straddle round may ask, clockwise from the seat left of the big blind. */
export function straddleCandidates(seats, bbIndex, sbIndex, straddled) {
  const n = seats.length;
  const out = [];
  for (let k = 1; k < n; k++) {
    const s = seats[(bbIndex + k) % n];
    const p = s?.player;
    if (!p || !p.inHand || p.folded || p.allIn || p.stack <= 0) continue;
    if (s.index === bbIndex || s.index === sbIndex || straddled.has(p.id)) continue;
    out.push(s);
  }
  return out;
}
