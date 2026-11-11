#!/bin/bash
# Provision the isolated DanGG.ro production droplet once doctl is authenticated.
# Usage:
#   DO_SSH_KEY=<fingerprint> ./deploy/provision-digitalocean.sh [size]
# Default size: s-8vcpu-16gb (8 vCPU / 16 GB) in fra1.
set -euo pipefail

: "${DO_SSH_KEY:?Set DO_SSH_KEY to the fingerprint from: doctl compute ssh-key list}"
SIZE="${1:-s-8vcpu-16gb}"
NAME="${DROPLET_NAME:-dangro-prod}"
REGION="${DROPLET_REGION:-fra1}"
IMAGE="${DROPLET_IMAGE:-ubuntu-24-04-x64}"

echo "Checking doctl authentication…"
doctl account get >/dev/null

echo "Creating $NAME ($SIZE, $REGION)…"
doctl compute droplet create "$NAME" \
  --region "$REGION" \
  --size "$SIZE" \
  --image "$IMAGE" \
  --ssh-keys "$DO_SSH_KEY" \
  --tag-name dangro-prod \
  --wait

IP="$(doctl compute droplet list --tag-name dangro-prod --format PublicIPv4 --no-header | head -1)"
[ -n "$IP" ] || { echo "No public IPv4 returned" >&2; exit 1; }
echo "Droplet IP: $IP"

echo "Creating cloud firewall (SSH restricted to current source is configured separately)…"
doctl compute firewall create \
  --name dangro-prod-web \
  --tag-names dangro-prod \
  --inbound-rules "protocol:tcp,ports:80,address:0.0.0.0/0,address:::/0 protocol:tcp,ports:443,address:0.0.0.0/0,address:::/0 protocol:tcp,ports:22,address:0.0.0.0/0,address:::/0" \
  --outbound-rules "protocol:tcp,ports:all,address:0.0.0.0/0,address:::/0 protocol:udp,ports:all,address:0.0.0.0/0,address:::/0 protocol:icmp,address:0.0.0.0/0,address:::/0" \
  >/dev/null || true

cat <<NEXT

Next steps:
  1. Set DNS in Namecheap:
       A @                 $IP   TTL 300
       A admin             $IP   TTL 300
       CNAME www           dangg.live.  TTL 300
  2. Install Docker on the VM and deploy:
       ssh root@$IP
       curl -fsSL https://get.docker.com | sh
       git clone <repo> /opt/dangro
       cd /opt/dangro/deploy
       cp .env.example .env
       docker compose up -d --build
  3. Verify:
       curl -I https://dangg.live
       curl -I https://admin.dangg.live

Security: restrict port 22 in the DO firewall to the Mac Studio/Tailscale
source addresses after provisioning.
NEXT
