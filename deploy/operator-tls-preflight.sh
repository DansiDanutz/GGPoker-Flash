#!/usr/bin/env bash
set -eu
for file in server.key server.pem operator.pem; do
  path=${1:?expected operator TLS directory}/$file
  if [[ ! -f "$path" || ! -s "$path" ]]; then
    echo "deploy: missing or empty operator TLS file: $path" >&2
    exit 1
  fi
done
