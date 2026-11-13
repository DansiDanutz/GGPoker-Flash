"""Rise Up — motivational lobby track in the style of DanGG-BgmLobby.

Source traits matched: ~136 BPM, B minor, descending D-C#-A-F# arpeggio hook,
sub-heavy low end, steady loudness. Added for motivation: i-VI-III-VII
progression, build-up with riser and snare roll, anthem lead in the drop.

Usage: python compose_rise_up.py <out.wav>
"""
import sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
BPM = 136
BEAT = 60 / BPM
BAR = 4 * BEAT
RNG = np.random.default_rng(7)

# Chords: Bm  G  D  A  (i VI III VII)
CHORDS = [
    {"bass": 35, "pad": [59, 62, 66, 71], "arp": [74, 73, 69, 66]},  # Bm: hook D C# A F#
    {"bass": 31, "pad": [55, 59, 62, 67], "arp": [74, 71, 67, 62]},  # G
    {"bass": 38, "pad": [57, 62, 66, 69], "arp": [78, 74, 69, 66]},  # D
    {"bass": 33, "pad": [57, 61, 64, 69], "arp": [76, 73, 69, 64]},  # A
]

# Lead phrases over 4 bars: (beat, length_beats, midi)
LEAD_A = [(0, .5, 78), (.5, .5, 78), (1, 1, 81), (2, 2, 83),
          (4, 1, 81), (5, 1, 78), (6, 2, 79),
          (8, .5, 78), (8.5, .5, 81), (9, 1, 86), (10, 2, 85),
          (12, 1, 83), (13, 1, 81), (14, 2, 85)]
LEAD_B = [(0, .5, 78), (.5, .5, 81), (1, 1, 83), (2, 2, 86),
          (4, 1, 85), (5, 1, 83), (6, 2, 79),
          (8, 1, 81), (9, 1, 85), (10, 2, 86),
          (12, 4, 85)]

# Song form: (name, bars)
FORM = [("intro", 8), ("verse", 8), ("build", 4), ("drop", 16),
        ("break", 4), ("build2", 2), ("drop2", 8), ("outro", 4)]


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def lowpass(x, cutoff, order=2):
    cutoff = min(cutoff, SR * 0.45)
    return sosfilt(butter(order, cutoff, "low", fs=SR, output="sos"), x)


def highpass(x, cutoff, order=2):
    return sosfilt(butter(order, cutoff, "high", fs=SR, output="sos"), x)


def bandpass(x, lo, hi):
    return sosfilt(butter(2, [lo, min(hi, SR * 0.45)], "band", fs=SR, output="sos"), x)


def saw(freq, n, max_harm=40):
    t = np.arange(n) / SR
    harmonics = int(min(max_harm, (SR / 2) // freq))
    phase = RNG.uniform(0, 2 * np.pi)
    out = np.zeros(n)
    for k in range(1, harmonics + 1):
        out += np.sin(2 * np.pi * k * freq * t + k * phase) / k
    return out * 0.6


def adsr(n, a=0.01, d=0.1, s=0.7, r=0.1):
    env = np.full(n, s)
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na, nd = min(na, n), min(nd, max(n - na, 0))
    env[:na] = np.linspace(0, 1, na)
    env[na:na + nd] = np.linspace(1, s, nd)
    if nr and n > nr:
        env[-nr:] *= np.linspace(1, 0, nr)
    return env


def add(buf, start, sig):
    i = int(start * SR)
    end = min(i + len(sig), len(buf))
    if end > i:
        buf[i:end] += sig[:end - i]


# ---------- instruments ----------

def kick():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    freq = 45 + 110 * np.exp(-t * 28)
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t * 7)
    click = highpass(RNG.standard_normal(n), 2000) * np.exp(-t * 300) * 0.3
    return np.tanh(1.6 * (body + click))


def clap():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    noise = bandpass(RNG.standard_normal(n), 900, 5000)
    bursts = sum(np.exp(-np.clip(t - d, 0, None) * 60) * (t >= d) for d in (0, .01, .022))
    tail = np.exp(-t * 14)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.4
    return 0.6 * noise * np.maximum(bursts / 3, tail * 0.5) + tone


def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    return highpass(RNG.standard_normal(n), 7000) * np.exp(-t * (12 if open_ else 70)) * 0.35


def pad_chord(notes, dur, cutoff):
    n = int(dur * SR)
    out = np.zeros(n)
    for m in notes:
        for det in (-0.12, 0.0, 0.12):
            out += saw(mtof(m + det), n, max_harm=25)
    out = lowpass(out / (len(notes) * 3), cutoff)
    return out * adsr(n, a=0.25, d=0.3, s=0.85, r=0.3)


def pluck(midi, dur, cutoff):
    n = int(dur * SR)
    t = np.arange(n) / SR
    tone = saw(mtof(midi), n, 30) + 0.5 * saw(mtof(midi + 0.08), n, 30)
    tone = lowpass(tone, cutoff)
    return tone * np.exp(-t * 9) * adsr(n, 0.003, 0.0, 1.0, 0.02)


def sub_bass(midi, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = mtof(midi)
    tone = np.sin(2 * np.pi * f * t) + 0.25 * lowpass(saw(f, n, 12), 400)
    return np.tanh(1.3 * tone) * adsr(n, 0.005, 0.1, 0.9, 0.04)


def lead(midi, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t * 3, 0, 1)
    f = mtof(midi)
    phase = 2 * np.pi * np.cumsum(f * vib) / SR
    tone = sum(np.sin(k * phase) / k for k in range(1, 14))
    tone += 0.6 * sum(np.sin(k * phase * 1.003) / k for k in range(1, 14))
    return lowpass(tone * 0.4, 5500) * adsr(n, 0.015, 0.15, 0.75, 0.08)


def riser(dur):
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    noise = RNG.standard_normal(n)
    out = np.zeros(n)
    seg = n // 16
    for i in range(16):
        part = noise[i * seg:(i + 1) * seg]
        out[i * seg:(i + 1) * seg] = bandpass(part, 400 + 500 * i, 1500 + 900 * i)
    return out * t ** 2 * 0.5


# ---------- arrangement ----------

def section_layers(name):
    """Which parts play, plus filter openness (0-1)."""
    table = {
        "intro":  dict(pad=1, arp=0.25, bass=0, kick=0, clap=0, hat=0, lead=0),
        "verse":  dict(pad=1, arp=0.5, bass=0.45, kick=0.7, clap=0, hat=1, lead=0),
        "build":  dict(pad=1, arp=0.7, bass=0.6, kick=0.8, clap=0, hat=2, lead=0),
        "build2": dict(pad=1, arp=0.7, bass=0, kick=0, clap=0, hat=2, lead=0),
        "drop":   dict(pad=1, arp=1.0, bass=1, kick=1, clap=1, hat=2, lead=1),
        "break":  dict(pad=1, arp=0.35, bass=0, kick=0, clap=0, hat=0, lead=2),
        "drop2":  dict(pad=1, arp=1.0, bass=1, kick=1, clap=1, hat=2, lead=3),
        "outro":  dict(pad=1, arp=0.3, bass=0, kick=0, clap=0, hat=0, lead=0),
    }
    return table[name]


def render_bar(tracks, t0, chord, layers, bar_in_sec, sec_bars, name):
    progress = bar_in_sec / max(sec_bars - 1, 1)
    openness = layers["arp"]
    if name.startswith("build") or name == "intro":
        openness = layers["arp"] + (1 - layers["arp"]) * progress * 0.8
    add(tracks["pad"], t0, pad_chord(chord["pad"], BAR, 900 + 3000 * openness))
    for i in range(16):  # 16th-note arpeggio from the hook shape
        note = chord["arp"][i % 4] + (12 if (i // 4) % 4 == 3 and openness > 0.9 else 0)
        add(tracks["arp"], t0 + i * BEAT / 4, pluck(note, BEAT / 4 * 1.6, 700 + 5500 * openness))
    if layers["bass"]:
        for b in range(8):  # driving 8th-note bass
            add(tracks["bass"], t0 + b * BEAT / 2, sub_bass(chord["bass"], BEAT / 2 * 0.92) * layers["bass"])
    if layers["kick"]:
        for b in range(4):
            add(tracks["kick"], t0 + b * BEAT, kick() * layers["kick"])
    if layers["clap"]:
        for b in (1, 3):
            add(tracks["clap"], t0 + b * BEAT, clap())
    render_hats(tracks, t0, layers["hat"])
    if name.startswith("build"):
        render_roll(tracks, t0, bar_in_sec, sec_bars)


def render_hats(tracks, t0, level):
    if level == 0:
        return
    for i in range(8):
        is_off = i % 2 == 1
        if level == 1 and not is_off:
            continue
        add(tracks["hat"], t0 + i * BEAT / 2, hat(open_=is_off and level == 2))


def render_roll(tracks, t0, bar_in_sec, sec_bars):
    remaining = sec_bars - bar_in_sec
    hits = 8 if remaining > 2 else (16 if remaining == 2 else 32)
    if remaining > 3:
        hits = 4
    for i in range(hits):
        gain = 0.35 + 0.65 * ((bar_in_sec * hits + i) / (sec_bars * hits))
        add(tracks["clap"], t0 + i * BAR / hits, clap() * gain * 0.7)


def render_lead(tracks, t0, mode, bar_in_sec):
    if mode == 0 or bar_in_sec % 4:
        return
    phrase = LEAD_A if (bar_in_sec // 4) % 2 == 0 else LEAD_B
    shift = 12 if mode == 3 and bar_in_sec >= 4 else 0
    for beat, length, midi in phrase:
        sig = lead(midi, length * BEAT * 0.95)
        if mode == 2:
            sig = lowpass(sig, 1800) * 0.6
        add(tracks["lead"], t0 + beat * BEAT, sig)
        if shift:
            add(tracks["lead"], t0 + beat * BEAT, lead(midi - 12, length * BEAT * 0.95) * 0.5)


def arrange():
    total_bars = sum(b for _, b in FORM)
    length = total_bars * BAR + 4.0
    names = ["pad", "arp", "bass", "kick", "clap", "hat", "lead", "fx"]
    tracks = {k: np.zeros(int(length * SR)) for k in names}
    bar = 0
    for name, sec_bars in FORM:
        layers = section_layers(name)
        for i in range(sec_bars):
            t0 = bar * BAR
            chord = CHORDS[bar % 4]
            render_bar(tracks, t0, chord, layers, i, sec_bars, name)
            render_lead(tracks, t0, layers["lead"], i)
            bar += 1
        if name.startswith("build"):
            start = (bar - sec_bars) * BAR
            add(tracks["fx"], start, riser(sec_bars * BAR))
    return tracks, total_bars


# ---------- mixing ----------

def sidechain(n, kick_track):
    env = np.ones(n)
    hits = np.flatnonzero(np.diff((np.abs(kick_track) > 0.3).astype(int)) == 1)
    duck = 1 - 0.7 * np.exp(-np.arange(int(0.25 * SR)) / (0.06 * SR))
    for h in hits:
        seg = env[h:h + len(duck)]
        env[h:h + len(duck)] = np.minimum(seg, duck[:len(seg)])
    return env


def reverb(x, seconds=2.2, seed=1):
    n = int(seconds * SR)
    ir = np.random.default_rng(seed).standard_normal(n) * np.exp(-np.arange(n) / (0.35 * SR))
    ir = lowpass(ir, 6000)
    wet = fftconvolve(x, ir)[:len(x)]
    return wet / (np.max(np.abs(wet)) + 1e-9)


def delay(x, time, fb=0.35, taps=4):
    out = np.zeros_like(x)
    d = int(time * SR)
    for k in range(1, taps + 1):
        out[d * k:] += x[:len(x) - d * k] * fb ** k
    return out


def mix(tracks, total_bars):
    n = len(tracks["pad"])
    sc = sidechain(n, tracks["kick"])
    gains = {"pad": 0.22, "arp": 0.16, "bass": 0.42, "kick": 0.75,
             "clap": 0.32, "hat": 0.18, "lead": 0.2, "fx": 0.22}
    pans = {"pad": 0, "arp": 0.25, "bass": 0, "kick": 0, "clap": 0, "hat": -0.3, "lead": 0, "fx": 0}
    left, right = np.zeros(n), np.zeros(n)
    for k, sig in tracks.items():
        s = sig * gains[k] * (sc if k in ("pad", "bass", "arp") else 1)
        left += s * (1 - pans[k]) if pans[k] > 0 else s
        right += s * (1 + pans[k]) if pans[k] < 0 else s
    lead_echo = delay(tracks["lead"] * gains["lead"], BEAT * 0.75)
    left += lead_echo * 0.5
    right += np.roll(lead_echo, int(BEAT * 0.375 * SR)) * 0.5
    send = tracks["pad"] * 0.1 + tracks["arp"] * 0.08 + tracks["lead"] * 0.1 + tracks["clap"] * 0.06
    left += reverb(send, seed=1) * 0.25 * sc
    right += reverb(send, seed=2) * 0.25 * sc
    stereo = np.stack([left, right], axis=1)
    fade_n = int(4 * SR)
    end = int(total_bars * BAR * SR) + int(2 * SR)
    stereo = stereo[:end]
    stereo[-fade_n:] *= np.linspace(1, 0, fade_n)[:, None]
    stereo = highpass_stereo(stereo, 28)
    stereo = np.tanh(stereo * 1.4) / np.tanh(1.4)
    return stereo / np.max(np.abs(stereo)) * 0.95


def highpass_stereo(x, cutoff):
    return np.stack([highpass(x[:, c], cutoff) for c in range(2)], axis=1)


def write_wav(path, stereo):
    from scipy.io import wavfile
    wavfile.write(path, SR, (stereo * 32767).astype(np.int16))


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: python compose_rise_up.py <out.wav>")
    tracks, total_bars = arrange()
    write_wav(sys.argv[1], mix(tracks, total_bars))
    print(f"rendered {total_bars} bars ({total_bars * BAR:.1f}s) at {BPM} BPM -> {sys.argv[1]}")


if __name__ == "__main__":
    main()
