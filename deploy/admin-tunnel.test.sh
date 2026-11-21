#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Resolve the helper's actual arguments offline, even with a permissive SSH config.
ssh() { command ssh -G -F /dev/null -o GatewayPorts=yes "$@"; }
export -f ssh
config=$(bash <(sed 's/^exec ssh /ssh /' open-admin-tunnel.sh) example.invalid)
grep -Fxq 'localforward [127.0.0.1]:5197 [127.0.0.1]:5197' <<< "$config"
grep -Fxq 'exitonforwardfailure yes' <<< "$config"
