#!/bin/bash
# Read-only production preflight. Run from the repository root.
set -uo pipefail

fail=0
step() { printf '\n== %s ==\n' "$1"; }

step "DigitalOcean authentication"
if doctl account get >/tmp/dangro_do_account 2>/tmp/dangro_do_err; then
  sed -n '1,5p' /tmp/dangro_do_account
else
  echo "FAIL: $(cat /tmp/dangro_do_err)"
  fail=1
fi

step "dangg.live DNS"
A="$(dig @1.1.1.1 dangg.live A +short | head -1)"
echo "A = ${A:-<none>}"
if [ "$A" = "162.255.119.244" ] || [ -z "$A" ]; then
  echo "FAIL: domain still points at the Namecheap parking page (or has no A record)"
  fail=1
fi
if [ -z "$(dig @1.1.1.1 dangg.live NS +short)" ]; then
  echo "FAIL: no NS records"
  fail=1
fi

step "Deployment configuration"
if [ -f deploy/.env ]; then
  if grep -q 'replace-with-a-long-unique-admin-password' deploy/.env; then
    echo "FAIL: admin password is still the example placeholder"
    fail=1
  else
    echo "OK: deploy/.env exists"
  fi
else
  echo "WARN: deploy/.env not created yet"
fi
if command -v docker >/dev/null 2>&1; then
  (cd deploy && DOMAIN=dangg.live docker compose -f compose.yml config >/dev/null 2>&1) && echo "OK: compose config" || { echo "FAIL: compose config"; fail=1; }
else
  echo "WARN: docker not installed on this host"
fi

step "Result"
if [ "$fail" -eq 0 ]; then echo "READY"; else echo "BLOCKED — fix the FAIL items above"; fi
exit "$fail"
