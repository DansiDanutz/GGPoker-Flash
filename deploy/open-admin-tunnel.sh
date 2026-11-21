#!/bin/bash
# Open the private Mac Studio admin tunnel. Keep this terminal running.
set -euo pipefail
: "${1:?Usage: $0 <VM public IP or SSH host>}"
VM="$1"
echo "Admin tunnel: https://localhost:5197"
echo "Close this terminal or press Ctrl-C to stop."
exec ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:5197:127.0.0.1:5197 "root@${VM}"
