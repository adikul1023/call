#!/bin/bash
# WireGuard Setup Script for AWS EC2
# This script sets up WireGuard VPN tunnel on AWS instance

set -e

echo "=========================================="
echo "WireGuard VPN Setup for SecureVoice"
echo "=========================================="

# Update system
echo "📦 Updating system packages..."
sudo apt update
sudo apt upgrade -y

# Install WireGuard
echo "🔧 Installing WireGuard..."
sudo apt install -y wireguard wireguard-tools

# Install additional tools
sudo apt install -y ufw nginx certbot python3-certbot-nginx

# Generate WireGuard keys for server
echo "🔑 Generating WireGuard keys..."
cd /etc/wireguard
sudo wg genkey | sudo tee server_private.key | wg pubkey | sudo tee server_public.key
sudo chmod 600 server_private.key

# Get server private key
SERVER_PRIVATE_KEY=$(sudo cat server_private.key)
SERVER_PUBLIC_KEY=$(sudo cat server_public.key)

echo "✅ Server Public Key: $SERVER_PUBLIC_KEY"

# Create WireGuard configuration
echo "📝 Creating WireGuard server configuration..."
sudo tee /etc/wireguard/wg0.conf > /dev/null <<EOF
[Interface]
PrivateKey = $SERVER_PRIVATE_KEY
Address = 10.0.0.1/24
ListenPort = 51820
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Client peer will be added here
# [Peer]
# PublicKey = CLIENT_PUBLIC_KEY_HERE
# AllowedIPs = 10.0.0.2/32
EOF

sudo chmod 600 /etc/wireguard/wg0.conf

# Enable IP forwarding
echo "🌐 Enabling IP forwarding..."
sudo sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf

# Configure firewall
echo "🔥 Configuring firewall..."
sudo ufw --force enable
sudo ufw allow 22/tcp          # SSH
sudo ufw allow 51820/udp       # WireGuard
sudo ufw allow 80/tcp          # HTTP
sudo ufw allow 443/tcp         # HTTPS
sudo ufw allow 3000/tcp        # SecureVoice HTTP
sudo ufw allow 8080/tcp        # SecureVoice WebSocket
sudo ufw reload

# Start WireGuard
echo "🚀 Starting WireGuard..."
sudo systemctl enable wg-quick@wg0
sudo systemctl start wg-quick@wg0

# Check status
echo "✅ WireGuard Status:"
sudo wg show

echo ""
echo "=========================================="
echo "✅ WireGuard Server Setup Complete!"
echo "=========================================="
echo ""
echo "📋 Next Steps:"
echo "1. Copy this server public key: $SERVER_PUBLIC_KEY"
echo "2. Run the client setup script on your local machine"
echo "3. Add the client peer configuration to /etc/wireguard/wg0.conf"
echo "4. Restart WireGuard: sudo systemctl restart wg-quick@wg0"
echo ""
echo "🔧 Useful Commands:"
echo "  - Check WireGuard status: sudo wg show"
echo "  - View logs: sudo journalctl -u wg-quick@wg0"
echo "  - Restart WireGuard: sudo systemctl restart wg-quick@wg0"
echo ""
