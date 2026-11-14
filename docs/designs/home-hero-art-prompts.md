# Step 2: home hero carousel art (generate in ChatGPT)

The home hero carousel is the first thing a player sees after logging in. Today its six banners are
flat SVG drawings. Each prompt below makes one photo-real banner; the page adds the title, the
button and live effects on top, so **no text, no logos, no brand names** in the image.

**Size for all six: landscape 1536×1024.** The carousel shows on the phone home (186 px tall card,
about 1.9:1). Each image is recropped so its subject fills the right ~60% of the card, padding the
dark left edge, so the prompts keep the key objects in the middle band and the right half with the
left 45% dark and calm for the headline.

Shared ending (paste at the end of every prompt):

> Keep every key object inside the central horizontal band (between 30% and 70% of the image
> height) and in the right 55% of the frame; the left 45% stays dark and calm with only faint bokeh
> for headline text. Saturated, vibrant, premium game-promo look, octane-style 3D render, rim light,
> volumetric light, shallow depth of field, ultra detailed. No text, no letters, no numbers, no
> logos, no watermark, no people.

## 2a. Quick Flip → save as `hero-flip.png`

Cinematic 3D key art for a fast poker game where the whole hand flips at once: a heavy polished-gold
coin with a ruby spade inlay spinning mid-air on its edge, trailing amber light streaks, with five
playing cards bursting outward from behind it like a fan caught by a gust of wind. Molten orange and
amber palette on a near-black background, embers and golden sparks, warm key light.

## 2b. All-in or Fold → save as `hero-aof.png`

Cinematic 3D key art: a huge avalanche of glossy crimson and black casino chips being shoved forward
across dark red felt, chips tumbling and flying toward the camera with motion blur, two face-down
cards with a deep red back resting at the edge of the pile. Deep crimson and blood-red palette,
dramatic red rim light, hot sparks, tension and power.

## 2c. Fast Fold → save as `hero-fastfold.png`

Cinematic 3D key art for a speed poker game: a stream of playing cards rushing past at high speed in
a curved trail, motion-blurred, with one sharp ace of spades in focus at the front, surrounded by
electric cyan light streaks and speed lines. Deep teal and cyan palette on near-black, neon cyan rim
light, glowing particles, sense of velocity.

## 2d. PLO (Pot-Limit Omaha) → save as `hero-plo.png`

Cinematic 3D key art: four glossy playing cards fanned upright in a tight arc (aces and kings, red and
black suits), floating above a dark sapphire felt table with a neat stack of royal-blue and silver
chips, crisp reflections. Deep sapphire and electric blue palette, cool blue rim light with a warm
gold highlight on the card edges, floating light particles.

## 2e. Jackpot SNG → save as `hero-jackpot.png`

Cinematic 3D key art: a glowing golden prize wheel with glossy segments in gold, ruby and white,
tilted toward the camera and spinning, with a burst of gold coins and glossy gold chips exploding
out of its centre, golden confetti and sparkles. Rich gold and warm amber palette with magenta
accents, bright golden god rays, jackpot energy.

## 2f. Battle Royale → save as `hero-battle.png`

Cinematic 3D key art: a regal gold crown with purple gems resting on top of a tall stack of glossy
purple and black chips, in the middle of a dark circular arena lit by a ring of purple spotlights,
smaller chip stacks around it like defeated rivals, purple lightning crackling in the air. Royal
purple and violet palette with gold highlights, epic and competitive.

---

Delivered 2026-11-14 and shipped as `app/public/assets/hero/<key>.webp` (the 2a image serves the
Daily Chip Flipout slide). Live layer: a slow push-in on the active banner and sparks in each slide's
colours (`sparkHues` in `app/src/lib/homeContent.ts`).

## Coming next

- **Step 3:** the connecting screen (logo on flat grey today) and the empty-state art.
- **Step 4:** home "For You" cards and the promotion/discover tiles.
- **Step 5:** tournament series banners and casino tiles.
