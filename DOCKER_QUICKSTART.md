# SecureVoice - Docker Quick Reference

## 🎯 Local Development (No VPN)

```bash
# Start server
docker compose up -d

# View logs
docker compose logs -f

# Stop server
docker compose down

# Access app: https://localhost:3000
```

## 🚀 AWS Deployment Steps

### 1. Setup EC2 Instance
```bash
# Launch t3.micro with Ubuntu 22.04
# Security Group: Allow 51820/udp, 22/tcp

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
```

### 2. Deploy Application
```bash
# Upload files to EC2
scp -r SecureVoice ubuntu@<AWS-IP>:~/

# Start container
cd SecureVoice
docker compose up -d

# Get server public key
docker compose logs | grep "Public Key"
```

### 3. Setup Client
```bash
# Generate client keys
wg genkey | tee private.key | wg pubkey > public.key

# Edit docker/peer-template.conf
# - Add your private key
# - Add server public key
# - Add AWS public IP

# Import to WireGuard client
```

### 4. Add Client to Server
```bash
# SSH to EC2
docker exec -it securevoice-vpn vi /config/wg0.conf

# Add:
[Peer]
PublicKey = <client_public_key>
AllowedIPs = 10.0.0.2/32

# Restart WireGuard
docker exec securevoice-vpn wg-quick down wg0
docker exec securevoice-vpn wg-quick up wg0
```

### 5. Connect
```bash
# Start WireGuard on client
# Test: ping 10.0.0.1
# Access: https://10.0.0.1:3000
```

## 🔐 Production Security

Edit `docker-compose.yml` and remove:
```yaml
ports:
  - "3000:3000"  # DELETE THIS LINE
```

This makes the signaling server accessible ONLY via VPN.

## 🐛 Troubleshooting

```bash
# Check WireGuard
docker exec securevoice-vpn wg show

# Check Node.js
docker compose logs | grep "🌐"

# Restart everything
docker compose restart
```

## 💡 Key Files

- `Dockerfile` - Container image
- `docker-compose.yml` - Service configuration
- `docker/entrypoint.sh` - Startup script
- `docker/peer-template.conf` - Client VPN config template
- `DOCKER_DEPLOYMENT.md` - Full documentation
