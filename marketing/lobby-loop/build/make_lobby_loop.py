"""Seamless lobby loop for login: opens on the drop with an impact.

Loop body (12 bars at 68 BPM = 42.4 s, B minor), full energy throughout:
  drop (4) > brass anthem (4) > bigger drop (2) > short build (2)
  -> wraps back into the opening impact.

Seamless method: render one cycle and fold its tails (impact, riser, loop
tails past the end) back onto the start so it is exactly periodic. Repeat it
three times, master as one piece so the compressor/limiter settle, then cut
the middle cycle. End -> start is identical to continuous playback.

Login impact: the downbeat orchestra hit + crash are added after mastering,
into reserved headroom, so the bus compressor/limiter cannot flatten them.

Usage: python make_lobby_loop.py <work_dir> <out_prefix>
Writes <out_prefix>.wav (44.1k/24-bit master) and .ogg/.m4a/.mp3 encodes.
"""
import os
import subprocess
import sys

import numpy as np
import soundfile as sf

import build_rise_up_v2 as B

CYCLE = [("drop", 4), ("brass", 4), ("drop_big", 2), ("build", 2)]
CYCLES = 3
TARGET_LUFS = -14.0  # headroom so the login impact punches through
BODY_CEILING = 0.60   # music limiter ceiling: reserves headroom for the login hit
FINAL_CEILING = 0.82  # safety limiter after the hit is added (~-1.7 dBFS, AAC-safe)
HIT_PEAK = 0.75       # post-master peak of the login hit layer
HIT_SECONDS = 1.6
CRASH_GAIN = 0.8
BUILD_TAIL_GAIN = 0.7  # last bar of the build stays below the login hit
CRASH_SECONDS = 2.5
GAP_SECONDS = 0.12    # near-silence right before the downbeat


def cycle_bars():
    return sum(b for _, b in CYCLE)


def cycle_samples():
    return int(round(cycle_bars() * B.BAR * B.SR))


def render(work):
    """Render one cycle, then fold everything that rings past the loop end
    (next-downbeat impact, riser and loop tails) back onto the start, so the
    cycle is exactly periodic. Returns CYCLES identical copies back to back."""
    tr = B.Track(cycle_bars())
    bar = 0
    for name, bars in CYCLE:
        if name == "drop":
            B.section_theme(tr, work, bar, bars, 2)
        elif name == "drop_big":
            drop_big(tr, work, bar, bars)
        elif name == "brass":
            B.section_brass(tr, work, bar, bars, full=True)
        elif name == "build":
            B.section_build(tr, work, bar, bars)  # impact lands on the loop start
        bar += bars
    n = cycle_samples()
    music = tr.buf.copy()
    last_bar = int(B.BAR * B.SR)
    music[n - last_bar:n] *= np.linspace(1.0, BUILD_TAIL_GAIN, last_bar)[:, None]
    gap = int(GAP_SECONDS * B.SR)  # pre-impact cut for contrast
    music[n - gap:n] *= np.linspace(1.0, 0.08, gap)[:, None]
    hit = B.Track(cycle_bars())  # login hit layer, kept out of the bus processing
    hit.place(downbeat_hit(work), cycle_bars())
    hit.place(crash(int(CRASH_SECONDS * B.SR)), cycle_bars(), CRASH_GAIN)
    return np.vstack([fold(music, n)] * CYCLES), np.vstack([fold(hit.buf, n)] * CYCLES)


def fold(buf, n):
    """Wrap everything past the loop end back onto the start (exact period)."""
    cycle = buf[:n].copy()
    tail = buf[n:]
    cycle[:len(tail)] += tail
    return cycle


def crash(n):
    """Bright decorrelated noise burst: crash-cymbal snap on the downbeat."""
    t = np.arange(n) / B.SR
    noise = np.random.default_rng(11).standard_normal((n, 2))
    bright = B.filt(B.filt(noise, "high", 3500), "low", 14000)
    env = np.minimum(1.0, t / 0.002) * (0.6 * np.exp(-t * 18) + 0.4 * np.exp(-t * 1.6))
    return bright * env[:, None]


def downbeat_hit(work):
    """Strongest real orchestra hit from the Epoch kit, cut to a one-shot."""
    hits = B.prep(work, "ep_hits")
    env = np.abs(B.filt(hits.mean(1), "high", 150))
    win = int(0.01 * B.SR)
    energy = np.convolve(env, np.ones(win) / win, mode="same")
    length = int(HIT_SECONDS * B.SR)
    usable = energy[: len(energy) - length]  # a full one-shot must fit after the onset
    onset = max(int(np.argmax(usable)) - int(0.02 * B.SR), 0)
    shot = hits[onset:onset + length].copy()
    assert len(shot) == length, "orchestra hit one-shot was truncated"
    shot *= np.linspace(1.0, 0.0, len(shot))[:, None] ** 1.5
    return shot


def drop_big(tr, work, bar, bars):
    """Drop plus the Honor lead, synth and arp on top."""
    B.section_theme(tr, work, bar, bars, 2)
    for key, gain, hp in (("ho_lead", 0.32, 250), ("ho_synth", 0.28, 200), ("ho_arp", 0.2, 300)):
        tr.place(B.prep(work, key), bar, gain, bars, hp=hp)


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def integrated_lufs(path):
    res = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", "ebur128=framelog=quiet",
                          "-f", "null", "-"], capture_output=True, text=True)
    lines = [ln for ln in res.stderr.splitlines() if ln.strip().startswith("I:")]
    if not lines:
        raise RuntimeError(f"could not measure loudness of {path}")
    return float(lines[-1].split()[1])


def master(raw_path, work):
    glue = os.path.join(work, "loop_glue.wav")
    ffmpeg("-i", raw_path, "-af",
           "acompressor=threshold=-18dB:ratio=2.5:attack=15:release=200,"
           "equalizer=f=60:t=q:w=1:g=1.5,equalizer=f=3500:t=q:w=1.2:g=1",
           "-c:a", "pcm_f32le", glue)
    gain = TARGET_LUFS - integrated_lufs(glue)
    out = os.path.join(work, "loop_body3.wav")
    ffmpeg("-i", glue, "-af", f"volume={gain:.2f}dB,alimiter=limit={BODY_CEILING}:attack=3:release=60:level=false",
           "-c:a", "pcm_f32le", out)
    return out


def add_hit(body_path, hit, work):
    """Lay the login hit over the mastered music, then a light safety limiter."""
    body, sr = sf.read(body_path, always_2d=True)
    n = min(len(body), len(hit))
    summed = body[:n] + hit[:n] / np.max(np.abs(hit)) * HIT_PEAK
    pre = os.path.join(work, "loop_sum3.wav")
    sf.write(pre, summed, sr, subtype="FLOAT")
    out = os.path.join(work, "loop_master3.wav")
    ffmpeg("-i", pre, "-af", f"alimiter=limit={FINAL_CEILING}:attack=1:release=40:level=false",
           "-c:a", "pcm_f32le", out)
    return out


def cut_middle(master_path):
    audio, sr = sf.read(master_path, always_2d=True)
    assert sr == B.SR, f"unexpected sample rate {sr}"
    n = cycle_samples()
    # cycles are identical, so the middle one (compressor/limiter settled) is
    # one exact period; constant processing latency shifts all cycles equally
    return audio[n:2 * n], n


def encode(wav, prefix):
    audio, sr = sf.read(wav, always_2d=True)
    sf.write(f"{prefix}.ogg", audio, sr, format="OGG", subtype="VORBIS")
    ffmpeg("-i", wav, "-c:a", "aac", "-b:a", "256k", f"{prefix}.m4a")
    ffmpeg("-i", wav, "-c:a", "libmp3lame", "-b:a", "320k", f"{prefix}.mp3")


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: python make_lobby_loop.py <work_dir> <out_prefix>")
    work, prefix = sys.argv[1], sys.argv[2]
    os.makedirs(work, exist_ok=True)
    raw = os.path.join(work, "loop_raw3.wav")
    music, hit = render(work)
    sf.write(raw, music / np.max(np.abs(music)) * 0.5, B.SR, subtype="FLOAT")
    loop, n = cut_middle(add_hit(master(raw, work), hit, work))
    sf.write(f"{prefix}.wav", loop, B.SR, subtype="PCM_24")
    encode(f"{prefix}.wav", prefix)
    print(f"loop: {n} samples @ {B.SR} Hz = {n / B.SR:.3f} s ({cycle_bars()} bars at {B.BPM:g} BPM)")


if __name__ == "__main__":
    main()
