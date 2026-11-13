"""Rise Up v2 — cinematic trap anthem built from Apple Loops (royalty-free).

Matches DanGG-BgmLobby: 136 BPM feel (68 half-time), B minor, sub-heavy.
Form: intro > verse > build > drop (Bm-Em) > brass bridge (Bm-F#m) >
build > final drop lifted to C# minor > outro.

Usage: python build_rise_up_v2.py <work_dir> <out.wav>
Needs: rubberband CLI, ffmpeg, numpy, scipy, soundfile, librosa.
"""
import os
import subprocess
import sys
from dataclasses import dataclass

import librosa
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

SR = 44100
BPM = 68.0
BAR = 4 * 60 / BPM
LOOPS = "/Library/Audio/Apple Loops/Apple"


@dataclass(frozen=True)
class Loop:
    file: str          # path under LOOPS
    bpm: float
    beats: int
    semis: int = -2    # C#m kits -> Bm


def L(sub, name, bpm, beats, semis=-2):
    return Loop(f"{sub}/{name}.caf", bpm, beats, semis)


HH, EH, DS = "01 Hip Hop", "02 Electro House", "03 Dubstep"
KIT = {
    # main theme world (C#m -> Bm): Bm Bm Em Bm, 4 bars
    "ep_piano": L(HH, "Epoch Ambient Piano", 61, 16),
    "ep_beat": L(HH, "Epoch Beat", 61, 16, 0),  # kick only, native pitch
    "ep_delay": L(HH, "Epoch Delay Synth", 61, 16),
    "ep_noise": L(HH, "Epoch Noise Synth", 61, 16),
    "ep_hits": L(HH, "Epoch Orchestra Hits", 61, 16),
    "ep_sub": L(HH, "Epoch Sub Bass", 61, 16),
    "ep_arp": L(HH, "Epoch Synth Arp", 61, 16),
    "ep_lead": L(HH, "Epoch Synth Lead", 61, 16),
    "ho_beat": L(HH, "Honor Beat", 61, 16, 0),
    "ho_piano": L(HH, "Honor Piano", 61, 16),
    "ho_sub": L(HH, "Honor Sub Bass", 61, 16),
    "ho_arp": L(HH, "Honor Synth Arp", 61, 16),
    "ho_lead": L(HH, "Honor Synth Lead", 61, 16),
    "ho_synth": L(HH, "Honor Synth", 61, 16),
    "lr_beat": L(HH, "Let's Roll Beat", 68, 32, 0),
    # brass world (native Bm): Bm Bm F#m F#m
    "bw_brass": L(HH, "Brick Wall Brass", 73, 32, 0),
    "bw_beat": L(HH, "Brick Wall Beat", 73, 32, 0),
    "es_horns": L(HH, "Empire State Horns", 88, 16, 0),
    "es_piano": L(HH, "Empire State Piano", 88, 16, 0),
    # transitions (128 BPM double-time -> 136 = 68 half-time x2)
    "roll": L(EH, "Big Snare Roll Topper", 64, 4, 0),
    "mroll": L(EH, "Military Roll Topper", 64, 4, 0),
}
LIFT = 2  # semitones for the final drop


# ---------------- loop preparation ----------------

def prep(work, key, semis_extra=0):
    loop = KIT[key]
    semis = loop.semis + semis_extra
    out = os.path.join(work, f"{key}_{semis:+d}.wav")
    if not os.path.exists(out):
        raw = os.path.join(work, f"{key}_raw.wav")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i",
                        os.path.join(LOOPS, loop.file), "-ar", str(SR),
                        "-c:a", "pcm_f32le", raw], check=True)  # float: no clipping after stretch
        cmd = ["rubberband", "-3", "-q", "-T", f"{BPM / loop.bpm:.6f}"]
        if semis:
            cmd += ["-p", str(semis)]
        subprocess.run(cmd + [raw, out], check=True)
    audio, sr = sf.read(out, always_2d=True)
    assert sr == SR, f"{key}: unexpected rate {sr}"
    target = int(round(loop.beats * 60 / BPM * SR))
    return fit(audio, target)


def fit(audio, n):
    if len(audio) >= n:
        return audio[:n]
    return np.vstack([audio, np.zeros((n - len(audio), audio.shape[1]))])


# ---------------- DSP helpers ----------------

def filt(x, kind, cutoff):
    sos = butter(2, cutoff, kind, fs=SR, output="sos")
    return sosfilt(sos, x, axis=0)


def ramp(n, a, b, curve=1.0):
    return (a + (b - a) * np.linspace(0, 1, n) ** curve)[:, None]


def sweep_lowpass(x, start_hz, end_hz, steps=24):
    out = np.zeros_like(x)
    seg = len(x) // steps
    for i in range(steps):
        hz = start_hz * (end_hz / start_hz) ** (i / (steps - 1))
        s = slice(i * seg, len(x) if i == steps - 1 else (i + 1) * seg)
        out[s] = filt(x[s], "low", min(hz, SR * 0.45))
    return out


def eight_oh_eight(work, notes_per_bar, bars, beat_key, semis):
    """808 sub that follows the kick onsets of a drum loop."""
    beat = prep(work, beat_key, semis)
    low = filt(beat.mean(1), "low", 120)
    on = librosa.onset.onset_detect(y=np.abs(low).astype(np.float32), sr=SR,
                                    units="samples", backtrack=True, delta=0.2)
    total = int(bars * BAR * SR)
    out = np.zeros(total)
    loop_len = len(beat)
    for rep in range(int(np.ceil(total / loop_len))):
        for i, o in enumerate(on):
            pos = rep * loop_len + o
            if pos >= total:
                break
            nxt = on[i + 1] if i + 1 < len(on) else loop_len
            length = min(int(nxt - o), int(1.2 * SR), total - pos)
            bar_idx = int(pos / (BAR * SR)) % len(notes_per_bar)
            out[pos:pos + length] += sub_note(notes_per_bar[bar_idx], length)
    return np.stack([out, out], axis=1)


def sub_note(midi, n):
    t = np.arange(n) / SR
    f = librosa.midi_to_hz(midi)
    glide = f * (1 + 0.5 * np.exp(-t * 40))
    tone = np.sin(2 * np.pi * np.cumsum(glide) / SR)
    env = np.minimum(1, t / 0.004) * np.exp(-t * 1.2)
    env[-min(400, n):] *= np.linspace(1, 0, min(400, n))
    return np.tanh(2.2 * tone) * env * 0.8


def riser(n):
    t = np.linspace(0, 1, n)
    rng = np.random.default_rng(3)
    noise = rng.standard_normal((n, 2))
    out = np.zeros_like(noise)
    steps = 32
    seg = n // steps
    for i in range(steps):
        s = slice(i * seg, n if i == steps - 1 else (i + 1) * seg)
        lo = 300 * (40 ** (i / steps))
        out[s] = filt(noise[s], "band", [lo, min(lo * 3, SR * 0.45)])
    return out * (t ** 2.5)[:, None] * 0.35


def impact(n):
    t = np.arange(n) / SR
    rng = np.random.default_rng(5)
    boom = np.sin(2 * np.pi * (35 + 60 * np.exp(-t * 6)) * t) * np.exp(-t * 2.2)
    air = filt(rng.standard_normal(n), "high", 2000) * np.exp(-t * 3) * 0.25
    x = np.tanh(1.5 * boom) + air
    return np.stack([x, x], axis=1) * 0.9


# ---------------- arrangement ----------------

class Track:
    def __init__(self, bars):
        self.buf = np.zeros((int(bars * BAR * SR) + SR * 6, 2))
        self.sections = []

    def place(self, audio, bar, gain=1.0, bars=None, hp=None):
        start = int(round(bar * BAR * SR))
        if bars is not None:
            audio = tile(audio, int(round(bars * BAR * SR)))
        if hp:
            audio = filt(audio, "high", hp)
        end = min(start + len(audio), len(self.buf))
        self.buf[start:end] += audio[:end - start] * gain


def tile(audio, n):
    reps = int(np.ceil(n / len(audio)))
    return np.vstack([audio] * reps)[:n]


def section_theme(tr, w, bar, bars, level, lift=0):
    """Main Bm-Em world. level: 0 intro, 1 verse, 2 drop, 3 final."""
    g = lambda k: prep(w, k, lift)
    n = int(bars * BAR * SR)
    tr.place(filt(tile(g("ep_noise"), n), "low", 2500), bar, 0.25 + 0.08 * level, hp=150)
    if level == 0:
        tr.place(g("ep_piano"), bar, 1.4, bars, hp=120)
        tr.place(sweep_lowpass(tile(g("ep_noise"), int(bars * BAR * SR)), 600, 8000), bar, 0.9)
        return
    if level == 1:  # verse: Honor kit only (C#m C#m A E -> Bm Bm G D)
        for key, gain, hp in (("ho_piano", 0.55, 150), ("ho_sub", 0.85, None),
                              ("ho_beat", 0.8, "drums"), ("ho_arp", 0.30, 200)):
            audio = prep(w, key) if hp == "drums" else g(key)
            tr.place(audio, bar, gain, bars, hp=None if hp == "drums" else hp)
        tr.place(g("ho_synth"), bar + bars // 2, 0.25, bars // 2, hp=200)
        return
    tr.place(g("ep_piano"), bar, 0.35, bars, hp=120)
    tr.place(g("ep_sub"), bar, 0.85, bars)
    tr.place(prep(w, "ep_beat"), bar, 0.8, bars)
    tr.place(g("ep_arp"), bar, 0.30, bars, hp=200)
    tr.place(prep(w, "lr_beat"), bar, 0.35, bars, hp=300)
    tr.place(g("ep_hits"), bar, 0.55, bars, hp=120)
    tr.place(g("ep_lead"), bar, 0.42, bars, hp=200)
    tr.place(g("ep_delay"), bar, 0.22, bars, hp=250)
    if level == 3:
        tr.place(g("ho_lead"), bar + 4, 0.30, bars - 4, hp=250)
        tr.place(g("ho_synth"), bar, 0.28, bars, hp=200)
        tr.place(g("ho_arp"), bar, 0.20, bars, hp=300)


def section_build(tr, w, bar, bars, lift=0):
    g = lambda k: prep(w, k, lift)
    n = int(bars * BAR * SR)
    drive = n - int(BAR * SR)  # drums and sub drive all but the last bar
    beat = tile(prep(w, "ep_beat"), drive)
    tr.place(beat * ramp(drive, 0.55, 0.85), bar)
    tr.place(tile(g("ep_sub"), drive) * ramp(drive, 0.6, 0.85), bar)
    tr.place(sweep_lowpass(tile(g("ep_hits"), n), 1200, 12000), bar, 1.0, hp=120)
    tr.place(sweep_lowpass(tile(g("ep_noise"), n), 1500, 12000), bar, 0.7, hp=150)
    tr.place(sweep_lowpass(tile(g("ho_synth"), n), 1000, 10000), bar, 0.6, hp=150)
    tr.place(g("ep_piano"), bar, 0.6, bars, hp=120)
    roll = tile(prep(w, "roll"), int((bars - 1) * BAR * SR))
    tr.place(roll * ramp(len(roll), 0.15, 0.7, 1.5), bar)
    fast = tile(prep(w, "mroll"), int(BAR * SR))
    tr.place(fast * ramp(len(fast), 0.6, 1.0), bar + bars - 1)
    tr.place(riser(n), bar, 1.0)
    tr.place(impact(int(3 * SR)), bar + bars, 1.0)


def section_brass(tr, w, bar, bars, full):
    """Native B minor brass world: Bm Bm F#m F#m."""
    tr.place(prep(w, "es_piano"), bar, 0.45 if full else 1.2, bars, hp=120)
    tr.place(prep(w, "bw_brass"), bar, 0.55 if full else 1.0, bars, hp=120)
    if not full:
        tr.place(prep(w, "es_horns"), bar + bars // 2, 0.35, bars // 2, hp=150)
        return
    tr.place(prep(w, "es_horns"), bar, 0.45, bars, hp=150)
    tr.place(prep(w, "bw_beat"), bar, 0.8, bars)
    tr.place(eight_oh_eight(w, [35, 35, 30, 30], bars, "bw_beat", 0), bar, 0.75)


def section_outro(tr, w, bar, bars, lift):
    n = int(bars * BAR * SR)
    fade = ramp(n, 1.0, 0.0, 0.7)
    tr.place(tile(prep(w, "ep_piano", lift), n) * fade, bar, 1.0, hp=120)
    tr.place(tile(prep(w, "ep_noise", lift), n) * fade, bar, 0.6, hp=150)
    hit = prep(w, "ep_hits", lift)[: int(BAR * SR)]
    tr.place(hit * ramp(len(hit), 1, 0, 2), bar, 0.6, hp=120)
    tr.place(impact(int(4 * SR)) * 0.6, bar)


FORM = [("intro", 4), ("verse", 8), ("build", 4), ("drop", 8),
        ("bridge", 4), ("brass", 8), ("build2", 4), ("final", 8), ("outro", 4)]


def arrange(work):
    total = sum(b for _, b in FORM)
    tr = Track(total)
    bar = 0
    for name, bars in FORM:
        if name == "intro":
            section_theme(tr, work, bar, bars, 0)
        elif name == "verse":
            section_theme(tr, work, bar, bars, 1)
        elif name == "build":
            section_build(tr, work, bar, bars)
        elif name == "drop":
            section_theme(tr, work, bar, bars, 2)
        elif name == "bridge":
            section_brass(tr, work, bar, bars, full=False)
        elif name == "brass":
            section_brass(tr, work, bar, bars, full=True)
        elif name == "build2":
            section_build(tr, work, bar, bars, lift=LIFT)
        elif name == "final":
            section_theme(tr, work, bar, bars, 3, lift=LIFT)
        elif name == "outro":
            section_outro(tr, work, bar, bars, LIFT)
        tr.sections.append((name, bar * BAR, (bar + bars) * BAR))
        bar += bars
    end = int((total * BAR + 5) * SR)
    return tr.buf[:end], tr.sections


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: python build_rise_up_v2.py <work_dir> <out.wav>")
    work, out = sys.argv[1], sys.argv[2]
    os.makedirs(work, exist_ok=True)
    mixbuf, sections = arrange(work)
    peak = np.max(np.abs(mixbuf))
    sf.write(out, mixbuf / peak * 0.5, SR, subtype="FLOAT")
    for name, a, b in sections:
        print(f"{name:7s} {a:6.1f}s - {b:6.1f}s")


if __name__ == "__main__":
    main()
