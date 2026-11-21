#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")"
d=$(mktemp -d)
trap 'rm -rf "$d"' EXIT
for f in server.key server.pem operator.pem; do printf 'fixture' > "$d/$f"; done
bash operator-tls-preflight.sh "$d"
for f in server.key server.pem operator.pem; do
  mv "$d/$f" "$d/saved"
  if bash operator-tls-preflight.sh "$d"; then exit 1; fi
  : > "$d/$f"
  if bash operator-tls-preflight.sh "$d"; then exit 1; fi
  mv "$d/saved" "$d/$f"
done
