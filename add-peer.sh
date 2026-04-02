#!/bin/bash
# Add a new peer to WireGuard server
# Run this on AWS server when a new peer wants to connect

set -e

echo "========================================"
echo "Add New Peer to WireGuard VPN"
echo "========================================"
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run with sudo"
    exit 1
fi

# Prompt for peer details
read -p "Enter peer name (e.g., Alice, Bob): " PEER_NAME
read -p "Enter peer public key: " PEER_PUBLIC_KEY
read -p "Enter peer VPN IP (e.g., 10.0.0.2): " PEER_IP

# Validate inputs
if [ -z "$PEER_NAME" ] || [ -z "$PEER_PUBLIC_KEY" ] || [ -z "$PEER_IP" ]; then
    echo "❌ All fields are required!"
    exit 1
fi

# Validate IP format (basic check)
if ! [[ $PEER_IP =~ ^10\.0\.0\.[0-9]+$ ]]; then
    echo "❌ Invalid IP format! Use 10.0.0.X"
    exit 1
fi

# Backup current config
echo "💾 Backing up current configuration..."
cp /etc/wireguard/wg0.conf /etc/wireguard/wg0.conf.backup.$(date +%s)

# Add peer to configuration
echo ""
echo "📝 Adding peer to configuration..."
cat >> /etc/wireguard/wg0.conf <<EOF

# Peer: $PEER_NAME
[Peer]
PublicKey = $PEER_PUBLIC_KEY
AllowedIPs = $PEER_IP/32
EOF

echo "✅ Peer added to configuration"

# Restart WireGuard
echo "🔄 Restarting WireGuard service..."
systemctl restart wg-quick@wg0

# Display status
echo ""
echo "========================================"
echo "✅ Peer Added Successfully!"
echo "========================================"
echo ""
echo "Current WireGuard Status:"
wg show
echo ""
echo "📋 Peer Details:"
echo "   Name: $PEER_NAME"
echo "   VPN IP: $PEER_IP"
echo "   Public Key: $PEER_PUBLIC_KEY"
echo ""
echo "👉 Tell $PEER_NAME to:"
echo "   1. Import their WireGuard config"
echo "   2. Activate the connection"
echo "   3. Test with: ping 10.0.0.1"
echo "   4. Access SecureVoice: https://10.0.0.1:3000"
echo ""
