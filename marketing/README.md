# Marketing media

## `lobby-loop/` — DanGG lobby music

A 42.353 s seamless loop: 12 bars at 68 BPM in B minor, mastered to −14 LUFS. It opens on a login hit, an orchestra hit plus a crash. The structure:

- drop (4 bars)
- brass anthem (4 bars)
- bigger drop (2 bars)
- build (2 bars), which wraps back into the hit

| File | Use |
| --- | --- |
| `DanGG-Lobby-Loop.wav` | 44.1 kHz / 24-bit master |
| `DanGG-Lobby-Loop.ogg`, `.m4a` | What the app plays. These files match `app/public/assets/music/` |
| `DanGG-Lobby-Loop.mp3` | 320 kbps copy |
| `DanGG-Lobby-Loop-preview-3x.mp3` | Three cycles back to back, for listening to the loop point |
| `DanGG-RiseUp-v2.mp3` | The full-length track the loop was cut from |
| `DanGG-RiseUp.mp3` | First draft, rejected and kept for reference |

`build/` holds the scripts that made the loop. They build it from the Apple Loops library installed with GarageBand/Logic, in `/Library/Audio/Apple Loops/Apple`. The raw loops are not redistributed here.

They need Python 3 with `numpy`, `scipy`, `soundfile` and `librosa`, plus `ffmpeg` and `rubberband` on the PATH.

```bash
python make_lobby_loop.py <work_dir> <out_prefix>
```

## `dangg-spot-30s/` — 30-second spot

- `DanGG-Spot-30s.mp4`: the finished spot. 1920×1080, 30 fps, H.264 + AAC.
- `index.html`: the [HyperFrames](https://hyperframes.heygen.com) composition, with every cut on the 68 BPM grid.
- `assets/music.wav`: a 30.0 s edit of the lobby loop. It runs:
  - 0–21.2 s: the drop and the start of the brass anthem
  - 21.2–28.2 s: the 2-bar build
  - 28.2 s: the login hit as the final button
- `assets/0*.jpg`: real screens captured from the app (login, lobby, tournaments).
- `assets/logo.png`: the DanGG wordmark.

To edit and re-render:

```bash
cd marketing/dangg-spot-30s
npx hyperframes@0.9.25 preview
npx hyperframes@0.9.25 render -o DanGG-Spot-30s.mp4
```

There is no voiceover; all on-screen copy is text.
