#!/usr/bin/env bash
# Setup coturn TURN relay on Ubuntu EC2 for SecureVoice WebRTC audio.
# Usage:
#   sudo bash setup-turn-aws.sh
# Optional env overrides:
#   TURN_USERNAME=securevoice TURN_PASSWORD='strongpass' TURN_REALM=13.127.66.106 \
#   RELAY_MIN_PORT=49160 RELAY_MAX_PORT=49200 sudo -E bash setup-turn-aws.sh

set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Please run as root: sudo bash setup-turn-aws.sh"
  exit 1
fi

TURN_USERNAME="${TURN_USERNAME:-securevoice}"
TURN_PASSWORD="${TURN_PASSWORD:-}"
TURN_REALM="${TURN_REALM:-}"
RELAY_MIN_PORT="${RELAY_MIN_PORT:-49160}"
RELAY_MAX_PORT="${RELAY_MAX_PORT:-49200}"

if [ -z "$TURN_PASSWORD" ]; then
  # 24-char alnum password if none supplied.
  TURN_PASSWORD="$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 24)"
fi

if [ -z "$TURN_REALM" ]; then
  TURN_REALM="$(curl -fsS http://169.254.169.254/latest/meta-data/public-ipv4 || true)"
fi
if [ -z "$TURN_REALM" ]; then
  TURN_REALM="$(hostname -I | awk '{print $1}')"
fi
if [ -z "$TURN_REALM" ]; then
  echo "Could not determine public IP/realm. Set TURN_REALM and rerun."
  exit 1
fi

echo "========================================"
echo "SecureVoice TURN Setup (coturn)"
echo "========================================"
echo "Realm/IP: $TURN_REALM"
echo "Relay range: $RELAY_MIN_PORT-$RELAY_MAX_PORT"
echo ""

echo "[1/5] Installing coturn and firewall tools..."
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y coturn ufw curl

echo "[2/5] Enabling coturn service..."
if grep -q '^#\?TURNSERVER_ENABLED=' /etc/default/coturn 2>/dev/null; then
  sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
else
  echo 'TURNSERVER_ENABLED=1' >> /etc/default/coturn
fi

echo "[3/5] Writing /etc/turnserver.conf..."
cat > /etc/turnserver.conf <<EOF
# SecureVoice coturn config
listening-port=3478
fingerprint
use-auth-secret
static-auth-secret=${TURN_PASSWORD}
realm=${TURN_REALM}
server-name=${TURN_REALM}

# Better NAT behavior and dual transport support
listening-ip=0.0.0.0
external-ip=${TURN_REALM}
no-multicast-peers

# Relay ports for media
min-port=${RELAY_MIN_PORT}
max-port=${RELAY_MAX_PORT}

# Logging
log-file=/var/log/turnserver/turn.log
simple-log
verbose

# Keep defaults secure
no-cli
EOF

mkdir -p /var/log/turnserver
chown turnserver:turnserver /var/log/turnserver

# Create a long-term test user as well (helpful for manual validation).
turnadmin -a -u "$TURN_USERNAME" -p "$TURN_PASSWORD" -r "$TURN_REALM"

echo "[4/5] Restarting coturn..."
systemctl enable coturn
systemctl restart coturn
systemctl --no-pager --full status coturn | head -n 20

echo "[5/5] Opening local firewall rules (if UFW active)..."
if ufw status | grep -qi 'Status: active'; then
  ufw allow 3478/tcp
  ufw allow 3478/udp
  ufw allow "$RELAY_MIN_PORT:$RELAY_MAX_PORT"/udp
  ufw reload
  echo "UFW rules updated."
else
  echo "UFW is not active. Skipping local firewall updates."
fi

cat <<EOT

========================================
TURN is configured.
========================================
Use these env vars for SecureVoice server:

TURN_URLS=turn:${TURN_REALM}:3478?transport=udp,turn:${TURN_REALM}:3478?transport=tcp
TURN_USERNAME=${TURN_USERNAME}
TURN_CREDENTIAL=${TURN_PASSWORD}
WEBRTC_FORCE_RELAY=1

If using systemd service, add in an override:
  sudo systemctl edit securevoice
Then add:
  [Service]
  Environment="TURN_URLS=turn:${TURN_REALM}:3478?transport=udp,turn:${TURN_REALM}:3478?transport=tcp"
  Environment="TURN_USERNAME=${TURN_USERNAME}"
  Environment="TURN_CREDENTIAL=${TURN_PASSWORD}"
  Environment="WEBRTC_FORCE_RELAY=1"

Then reload/restart app:
  sudo systemctl daemon-reload
  sudo systemctl restart securevoice

IMPORTANT: In AWS Security Group, allow:
  - TCP 3478 from 0.0.0.0/0
  - UDP 3478 from 0.0.0.0/0
  - UDP ${RELAY_MIN_PORT}-${RELAY_MAX_PORT} from 0.0.0.0/0

Quick test from browser console (should show relay candidates):
  pc.getStats().then(r => r.forEach(x => { if (x.type === 'candidate-pair') console.log(x); }))

EOT
