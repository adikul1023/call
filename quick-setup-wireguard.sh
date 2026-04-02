#!/bin/bash
# Quick WireGuard Setup for AWS EC2
# Run this script on your AWS instance

echo "========================================"
echo "WireGuard VPN Setup for SecureVoice"
echo "========================================"

# Update and install WireGuard
echo "📦 Installing WireGuard..."
sudo yum update -y
sudo yum install -y wireguard-tools

# Install other useful tools
sudo yum install -y nginx git

# Enable IP forwarding
echo "🌐 Enabling IP forwarding..."
echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Generate server keys
echo "🔑 Generating WireGuard keys..."
sudo mkdir -p /etc/wireguard
cd /etc/wireguard
sudo sh -c 'wg genkey | tee server_private.key | wg pubkey > server_public.key'
sudo chmod 600 server_private.key

# Read keys
SERVER_PRIVATE_KEY=$(sudo cat server_private.key)
SERVER_PUBLIC_KEY=$(sudo cat server_public.key)

# Create WireGuard config
echo "📝 Creating WireGuard configuration..."
sudo tee /etc/wireguard/wg0.conf > /dev/null <<EOF
[Interface]
PrivateKey = $SERVER_PRIVATE_KEY
Address = 10.0.0.1/24
ListenPort = 51820
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Client peers will be added below
EOF

sudo chmod 600 /etc/wireguard/wg0.conf

# Enable and start WireGuard
echo "🚀 Starting WireGuard..."
sudo systemctl enable wg-quick@wg0
sudo systemctl start wg-quick@wg0

# Check status
echo ""
echo "✅ WireGuard Status:"
sudo wg show

echo ""
echo "========================================"
echo "✅ Setup Complete!"
echo "========================================"
echo ""
echo "📋 IMPORTANT - Save these details:"
echo ""
echo "Server Public Key:"
echo "$SERVER_PUBLIC_KEY"
echo ""
echo "Server VPN IP: 10.0.0.1"
echo "Client VPN IP: 10.0.0.2"
echo ""
echo "⚠️  NEXT STEP: Configure AWS Security Group to allow UDP port 51820"
echo ""
