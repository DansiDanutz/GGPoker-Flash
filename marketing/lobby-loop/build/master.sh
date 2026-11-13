#!/bin/zsh
# Master a raw mix: glue compression + EQ, static gain to target LUFS, limiter, MP3 320k.
# Usage: master.sh <raw.wav> <work_dir> <out.mp3> [target_lufs]
set -euo pipefail
raw=$1; work=$2; out=$3; target=${4:--11.5}
ffmpeg -hide_banner -loglevel error -y -i "$raw" \
  -af "acompressor=threshold=-18dB:ratio=2.5:attack=15:release=200,equalizer=f=60:t=q:w=1:g=1.5,equalizer=f=3500:t=q:w=1.2:g=1" \
  -ar 48000 -c:a pcm_f32le "$work/glue.wav"
measured=$(ffmpeg -hide_banner -i "$work/glue.wav" -af ebur128=framelog=quiet -f null - 2>&1 | awk '/ I:/{v=$2} END{print v}')
gain=$(python3 -c "print(${target} - (${measured}))")
ffmpeg -hide_banner -loglevel error -y -i "$work/glue.wav" \
  -af "volume=${gain}dB,alimiter=limit=0.70:attack=3:release=60:level=false" \
  -c:a pcm_s24le "$work/master.wav"
ffmpeg -hide_banner -loglevel error -y -i "$work/master.wav" -b:a 320k "$out"
echo "mastered: measured ${measured} LUFS, gain ${gain} dB -> $out"
