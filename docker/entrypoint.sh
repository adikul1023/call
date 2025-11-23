#!/bin/sh
set -e

echo "🚀 Starting SecureVoice with WireGuard..."

# Initialize WireGuard configuration if not exists
if [ ! -f /config/wg0.conf ]; then
    echo "📝 Generating WireGuard configuration..."
    
    # Generate server keys if not provided
    if [ -z "$WG_PRIVATE_KEY" ]; then
        WG_PRIVATE_KEY=$(wg genkey)
        WG_PUBLIC_KEY=$(echo "$WG_PRIVATE_KEY" | wg pubkey)
        echo "🔑 Generated WireGuard keys:"
        echo "   Private Key: $WG_PRIVATE_KEY"
        echo "   Public Key: $WG_PUBLIC_KEY"
        echo ""
        echo "⚠️  SAVE THESE KEYS! Add them to docker-compose.yml for persistence."
    fi
    
    # Create WireGuard config
    cat > /config/wg0.conf <<EOF
[Interface]
PrivateKey = $WG_PRIVATE_KEY
Address = ${BIND_IP:-10.0.0.1}/24
ListenPort = ${SERVERPORT:-51820}
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Peer 1 (Add public key after key exchange)
#[Peer]
#PublicKey = <peer1_public_key>
#AllowedIPs = 10.0.0.2/32

# Peer 2 (Add public key after key exchange)
#[Peer]
#PublicKey = <peer2_public_key>
#AllowedIPs = 10.0.0.3/32
EOF
    
    chmod 600 /config/wg0.conf
fi

# Start WireGuard
echo "🔐 Starting WireGuard interface..."
wg-quick up wg0 || true

# Show WireGuard status
echo "📊 WireGuard Status:"
wg show

# Update server.js to bind to VPN IP
BIND_IP=${BIND_IP:-10.0.0.1}
export BIND_IP

# Start Node.js application
echo "🌐 Starting SecureVoice server on https://$BIND_IP:${PORT:-3000}"
cd /app

# Create data directory if it doesn't exist
mkdir -p /app/data

# Move database to persistent volume
if [ -f /app/securevoice.db ] && [ ! -f /app/data/securevoice.db ]; then
    mv /app/securevoice.db /app/data/securevoice.db
fi
ln -sf /app/data/securevoice.db /app/securevoice.db 2>/dev/null || true

# Start the Node.js server
exec node server.js
