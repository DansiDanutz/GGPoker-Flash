# Voice takes

Source recordings for the table voice lines (`VoiceRaise`, `VoiceAllIn`, `VoiceCheck`, `VoiceFold`,
`VoiceCall`, `VoiceBet`). `sounds.mjs` trims, levels and encodes them into
`app/public/assets/sounds/`.

They are Dan's cloned voice, generated with the local VoiceStudio app
(`POST http://127.0.0.1:3900/generate`, profile `9acfcf1b`, language English,
emotion "confident, energetic"), 24 kHz mono WAV.

| File | Text | Seed |
|---|---|---|
| `VoiceRaise.wav` | `Raise.` | 7 |
| `VoiceAllIn.wav` | `All in!` | 7 |
| `VoiceCheck.wav` | `Check.` | 7 |
| `VoiceCall.wav` | `Call.` | 7 |
| `VoiceFold.wav` | `Fold!` | 7 |
| `VoiceBet.wav` | `Bet!` | 7 |

Each take was checked by transcribing it back with VoiceStudio (`POST /transcribe`); all six
return the intended word. Single words are unstable in the engine ("Fold." repeats the word,
"Bet." is heard as "bat"), which is why those two use "!".

Never replace these with a system text-to-speech voice (macOS `say` or similar). If VoiceStudio
is unavailable, leave the existing takes in place.
