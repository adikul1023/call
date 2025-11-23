#!/bin/bash
# SecureVoice - Google Cloud Setup Script
# Run this on your GCP e2-micro instance

set -e

echo "🚀 SecureVoice Google Cloud Setup"
echo "=================================="
echo ""

# Check if running on GCP
if ! curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/id &> /dev/null; then
    echo "⚠️  Warning: Not running on Google Cloud instance"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Docker
if ! command -v docker &> /dev/null; then
    echo "🐋 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
else
    echo "✅ Docker already installed"
fi

# Install Docker Compose
if ! docker compose version &> /dev/null; then
    echo "🔧 Installing Docker Compose..."
    sudo apt install docker-compose-plugin -y
else
    echo "✅ Docker Compose already installed"
fi

# Install git if not present
if ! command -v git &> /dev/null; then
    echo "📥 Installing git..."
    sudo apt install git -y
fi

# Setup firewall (ufw)
echo "🔥 Configuring firewall..."
sudo ufw --force enable
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 51820/udp comment 'WireGuard'
sudo ufw allow 3000/tcp comment 'SecureVoice (remove after VPN setup)'
sudo ufw reload

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Logout and login again: exit"
echo "2. Clone/upload SecureVoice: git clone <your-repo> or gcloud compute scp"
echo "3. Start container: cd SecureVoice && docker compose up -d"
echo "4. Get keys: docker compose logs | grep 'Public Key'"
echo ""
echo "📖 Full guide: See GOOGLE_CLOUD_DEPLOYMENT.md"
