#!/bin/bash
# Complete WireGuard + SecureVoice Deployment Script for AWS
# Run this on your AWS EC2 instance

set -e

echo "========================================"
echo "SecureVoice VPN Server Setup"
echo "========================================"
echo ""

# Step 1: Update system
echo "📦 Updating system packages..."
sudo yum update -y

# Step 2: Install WireGuard
echo "🔧 Installing WireGuard..."
sudo yum install -y wireguard-tools

# Step 3: Install Node.js
echo "📦 Installing Node.js..."
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs git

# Step 4: Create WireGuard directory
echo "📁 Creating WireGuard configuration directory..."
sudo mkdir -p /etc/wireguard
cd /etc/wireguard

# Step 5: Generate server keys
echo "🔑 Generating WireGuard server keys..."
wg genkey | sudo tee server_private.key | wg pubkey | sudo tee server_public.key
sudo chmod 600 server_private.key

# Read the keys
SERVER_PRIVATE=$(sudo cat server_private.key)
SERVER_PUBLIC=$(sudo cat server_public.key)

echo ""
echo "✅ Server Public Key: $SERVER_PUBLIC"
echo "   (Share this with your peers for their configs)"
echo ""

# Step 6: Create WireGuard configuration
echo "📝 Creating WireGuard server configuration..."
sudo tee /etc/wireguard/wg0.conf > /dev/null <<EOF
[Interface]
Address = 10.0.0.1/24
ListenPort = 51820
PrivateKey = $SERVER_PRIVATE

# Enable IP forwarding for peer-to-peer communication
PostUp = sysctl -w net.ipv4.ip_forward=1
PostDown = sysctl -w net.ipv4.ip_forward=0

# Peers will be added below after they generate their keys
# Use: sudo nano /etc/wireguard/wg0.conf to add peers

# Example Peer Configuration:
# [Peer]
# PublicKey = <PEER_PUBLIC_KEY>
# AllowedIPs = 10.0.0.2/32
EOF

echo "✅ WireGuard configuration created"

# Step 7: Enable IP forwarding permanently
echo "🔀 Enabling IP forwarding..."
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Step 8: Start WireGuard
echo "🚀 Starting WireGuard service..."
sudo systemctl enable wg-quick@wg0
sudo systemctl start wg-quick@wg0

# Step 9: Clone SecureVoice repository
echo "📥 Cloning SecureVoice repository..."
cd ~
if [ -d "Secure-Web-Calling" ]; then
    echo "⚠️  Repository already exists, pulling latest changes..."
    cd Secure-Web-Calling
    git pull
else
    git clone https://github.com/Secure-Calling-EPICS/Secure-Web-Calling.git
    cd Secure-Web-Calling
fi

# Step 10: Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Step 11: Generate SSL certificates
echo "🔒 Generating SSL certificates..."
if [ ! -f "key.pem" ] || [ ! -f "cert.pem" ]; then
    node generate-cert.js
else
    echo "✅ Certificates already exist"
fi

# Step 12: Create systemd service for SecureVoice
echo "🔧 Creating systemd service..."
sudo tee /etc/systemd/system/securevoice.service > /dev/null <<EOF
[Unit]
Description=SecureVoice Signaling Server
After=network.target wg-quick@wg0.service

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/Secure-Web-Calling
Environment="BIND_IP=10.0.0.1"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Step 13: Enable and start SecureVoice service
echo "🚀 Starting SecureVoice service..."
sudo systemctl daemon-reload
sudo systemctl enable securevoice
sudo systemctl start securevoice

# Step 14: Display status
echo ""
echo "========================================"
echo "✅ Installation Complete!"
echo "========================================"
echo ""
echo "WireGuard Status:"
sudo wg show
echo ""
echo "SecureVoice Service Status:"
sudo systemctl status securevoice --no-pager
echo ""
echo "📋 Next Steps:"
echo "1. Share this server public key with peers:"
echo "   $SERVER_PUBLIC"
echo ""
echo "2. Have each peer generate their keys and send you their PUBLIC key"
echo ""
echo "3. Add each peer to /etc/wireguard/wg0.conf:"
echo "   sudo nano /etc/wireguard/wg0.conf"
echo "   Add:"
echo "   [Peer]"
echo "   PublicKey = <PEER_PUBLIC_KEY>"
echo "   AllowedIPs = 10.0.0.2/32  # (or 10.0.0.3 for second peer)"
echo ""
echo "4. Restart WireGuard:"
echo "   sudo systemctl restart wg-quick@wg0"
echo ""
echo "5. Configure AWS Security Group to allow UDP 51820"
echo ""
echo "6. Peers connect to VPN, then access: https://10.0.0.1:3000"
echo ""
echo "========================================"
