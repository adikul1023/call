# SecureVoice Docker Deployment Guide

## 🚀 Quick Start

### Local Testing (Without VPN)
```bash
# Start the container
docker compose up -d

# View logs
docker compose logs -f

# Access the application
# Open https://localhost:3000 in your browser
```

### Production Deployment on AWS t3.micro

#### 1. Prerequisites
- AWS EC2 t3.micro instance with Ubuntu 22.04
- Docker and Docker Compose installed
- Port 51820/udp open in security group (for WireGuard)
- Optional: Port 3000/tcp open for initial testing (remove after VPN setup)

#### 2. Installation on AWS

```bash
# SSH into your EC2 instance
ssh -i your-key.pem ubuntu@your-ec2-ip

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo apt update
sudo apt install docker-compose-plugin -y

# Clone/upload your SecureVoice project
git clone <your-repo> securevoice
cd securevoice

# Start the container
docker compose up -d
```

#### 3. WireGuard Key Exchange

After first run, the container generates WireGuard keys:

```bash
# View the generated keys
docker compose logs | grep "Generated WireGuard keys"

# Example output:
# 🔑 Generated WireGuard keys:
#    Private Key: aBcD1234...
#    Public Key: XyZ9876...
```

**Save these keys!** Add them to `docker-compose.yml`:

```yaml
environment:
  - WG_PRIVATE_KEY=aBcD1234...
```

#### 4. Client Configuration

Each peer (caller) needs a WireGuard client config:

**Generate keys on client machine:**
```bash
# Linux/Mac
wg genkey | tee privatekey | wg pubkey > publickey

# Windows (PowerShell with WireGuard installed)
wg genkey | Out-File -Encoding ASCII privatekey
Get-Content privatekey | wg pubkey | Out-File -Encoding ASCII publickey
```

**Client config file (`peer1.conf`):**
```ini
[Interface]
PrivateKey = <client_private_key>
Address = 10.0.0.2/24
DNS = 1.1.1.1

[Peer]
PublicKey = <server_public_key>
Endpoint = <your-aws-public-ip>:51820
AllowedIPs = 10.0.0.0/24
PersistentKeepalive = 25
```

#### 5. Add Client to Server

Edit the WireGuard config on the server:

```bash
# Access the container
docker exec -it securevoice-vpn sh

# Edit WireGuard config
vi /config/wg0.conf
```

Add peer section:
```ini
[Peer]
PublicKey = <client_public_key>
AllowedIPs = 10.0.0.2/32
```

Restart WireGuard:
```bash
wg-quick down wg0
wg-quick up wg0
exit
```

#### 6. Connect and Test

**On client machine:**
1. Install WireGuard client
2. Import `peer1.conf`
3. Connect to VPN
4. Test connection: `ping 10.0.0.1`
5. Access SecureVoice: `https://10.0.0.1:3000`

---

## 🔧 Configuration

### Environment Variables

Edit `docker-compose.yml` to customize:

```yaml
environment:
  # Server binds to this IP (VPN interface)
  - BIND_IP=10.0.0.1
  
  # HTTPS port for signaling server
  - PORT=3000
  
  # WireGuard VPN port
  - SERVERPORT=51820
  
  # VPN subnet
  - INTERNAL_SUBNET=10.0.0.0/24
  
  # Persistent keys (add after first run)
  - WG_PRIVATE_KEY=<your_server_private_key>
```

### Port Mappings

```yaml
ports:
  # WireGuard - MUST be exposed to internet
  - "51820:51820/udp"
  
  # Signaling server - REMOVE in production for VPN-only access
  - "3000:3000"  # <-- Delete this line after VPN is working
```

---

## 🔐 Security Hardening

### Production Checklist

- [ ] Remove port 3000 mapping from `docker-compose.yml`
- [ ] Configure AWS Security Group to ONLY allow:
  - 51820/udp from anywhere (WireGuard handshake)
  - 22/tcp from your IP (SSH management)
- [ ] Set strong passwords for all user accounts
- [ ] Enable AWS CloudWatch logging
- [ ] Use AWS Secrets Manager for WireGuard private key
- [ ] Enable automatic security updates on EC2

### Verify VPN-Only Access

```bash
# From outside VPN (should FAIL)
curl https://<aws-public-ip>:3000

# From inside VPN (should WORK)
curl https://10.0.0.1:3000
```

---

## 📊 Monitoring

### View Logs
```bash
# All logs
docker compose logs -f

# WireGuard status
docker exec securevoice-vpn wg show

# Node.js logs only
docker compose logs -f | grep "🌐"
```

### Check VPN Connections
```bash
docker exec securevoice-vpn wg show wg0
```

Output shows connected peers:
```
interface: wg0
  public key: XyZ9876...
  private key: (hidden)
  listening port: 51820

peer: AbC123...
  endpoint: 203.0.113.45:51820
  allowed ips: 10.0.0.2/32
  latest handshake: 1 minute, 23 seconds ago
  transfer: 1.52 MiB received, 892 KiB sent
```

---

## 🔄 Updates and Maintenance

### Update Application
```bash
# Pull latest changes
git pull

# Rebuild and restart
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Backup Critical Data
```bash
# Backup WireGuard configs and database
tar -czf securevoice-backup.tar.gz \
  wireguard-config/ \
  data/
```

### Add New Peer

1. Generate keys on new client
2. Add peer to server config:
```bash
docker exec -it securevoice-vpn vi /config/wg0.conf
```
3. Restart WireGuard:
```bash
docker exec securevoice-vpn wg-quick down wg0
docker exec securevoice-vpn wg-quick up wg0
```

---

## 🐛 Troubleshooting

### Container won't start
```bash
# Check logs
docker compose logs

# Verify capabilities
docker compose config
```

### VPN connection fails
```bash
# Check WireGuard status
docker exec securevoice-vpn wg show

# Check firewall on AWS
# Security Group must allow 51820/udp

# Verify kernel module
docker exec securevoice-vpn modprobe wireguard
```

### Can't access signaling server
```bash
# From inside container
docker exec securevoice-vpn wget -O- https://localhost:3000

# Check if Node.js is running
docker exec securevoice-vpn ps aux | grep node
```

---

## 💰 AWS t3.micro Cost Estimate

- **Instance**: ~$7.50/month
- **Storage (8GB)**: ~$0.80/month
- **Data Transfer**: First 100GB free
- **Total**: ~$8-10/month

To minimize costs:
- Use AWS Free Tier (750 hours/month for 12 months)
- Stop instance when not in use
- Use Elastic IP to avoid address changes

---

## 📚 Additional Resources

- [WireGuard Quick Start](https://www.wireguard.com/quickstart/)
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [AWS EC2 Security Groups](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-security-groups.html)

---

## 🆘 Support

If you encounter issues:
1. Check logs: `docker compose logs -f`
2. Verify WireGuard: `docker exec securevoice-vpn wg show`
3. Test connectivity: `ping 10.0.0.1` from client
4. Ensure AWS security group allows 51820/udp
