# Original DanGG asset set — shared brief

dangg.live currently serves art, fonts and sounds extracted from the GGPoker client. Every
such file must be replaced with an ORIGINAL DanGG asset at the SAME relative path and the
SAME pixel size (images) so no app code changes are needed (except where a brief says so).

Rules
- Originality: you may open the extracted file only to understand its ROLE and LAYOUT
  (sprite grid, which part is transparent, roughly what it depicts). Never copy, trace,
  recolour, crop or filter it. Draw new art from scratch.
- No third-party names or marks in any image or sound: no "GG", "GGPoker", "WSOP",
  "Spin & Gold", "Rush & Cash", "Flip & Go", "Mystery Battle Royale", "Fish Buffet",
  "Honeymoon", "Ocean Rewards", "GGcare", "AoF" logos, etc. Use neutral words
  (e.g. "Weekly Freeroll", "Leaderboard", "Fast Fold", "Jackpot Sit & Go", "Rewards") or
  no text. The DanGG name/wordmark may be used.
- Look: one premium product. Palette in tools/original-assets/render.mjs (PALETTE): deep
  green-black felt, gold (#d8b15f / #f5dda2) accents, red #b32635, text #e9e5db.
  Fonts: system fonts only (Helvetica Neue, Avenir Next, Georgia, Menlo) — no web fonts.
- Tools: local only. Images: tools/original-assets/render.mjs `renderPng(relPath, html, w, h)`
  (headless Chrome, transparent background unless you paint one). Sounds: ffmpeg (lavfi
  synthesis) and macOS `say` for voices. No network, no paid or cloud generation.
- Reproducible: put your generator in tools/original-assets/<your-category>.mjs (Node ESM,
  run from the repo root with `node tools/original-assets/<file>.mjs`). Keep it deterministic
  (seeded randomness only). Files under ~400 lines each; split into modules if needed.
- Output: write into app/public/assets/<same relative path> in THIS worktree.
- Verify: every file you own exists with the exact width/height from
  tools/original-assets/manifest.json (sips -g pixelWidth -g pixelHeight), and open a
  sample of outputs (Read tool on PNGs) to check quality. Fix what looks broken.
- Do not touch app code, other categories' files, or anything outside this worktree.
  Do not commit. The extracted originals (reference only, never edit) are in
  /Users/davidai/Desktop/DavidAi/GGPoker-flash/app/public/assets.

Worktree: /Users/davidai/Desktop/DavidAi/GGPoker-flash/.claude/worktrees/g2-assets
