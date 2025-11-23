# SecureVoice - Google Cloud Free Tier Deployment

## 🎯 Overview

Deploy SecureVoice on Google Cloud's **permanent free tier** e2-micro instance (1 vCPU, 1GB RAM).

**Cost**: $0/month forever (within free tier limits)

---

## 📋 Prerequisites

- Google account
- Visa/Mastercard debit card (for verification only, won't be charged)
- Basic command line knowledge

---

## 🚀 Step-by-Step Deployment

### Step 1: Setup Google Cloud Account

1. Go to https://cloud.google.com/free
2. Click "Get started for free"
3. Sign in with Google account
4. Add your debit card (verification only)
5. Accept terms and create account

**Free Tier Includes:**
- ✅ 1 e2-micro instance (US regions only)
- ✅ 30GB standard persistent disk
- ✅ 1GB egress/month (US → worldwide, excluding China/Australia)
- ✅ Forever free (no expiration)

---

### Step 2: Create VM Instance

#### Via Console (Easy)

1. Go to **Compute Engine** → **VM Instances**
2. Click "**Create Instance**"
3. Configure:
   ```
   Name: securevoice-server
   Region: us-west1 (Oregon) ← Must be US region for free tier
   Zone: us-west1-b
   Machine type: e2-micro (2 vCPU, 1GB RAM) ← Free tier eligible
   Boot disk: Ubuntu 22.04 LTS, 30GB
   Firewall: ✓ Allow HTTP, ✓ Allow HTTPS
   ```
4. Click "**Create**"

#### Via gcloud CLI (Advanced)

```bash
# Install gcloud CLI
# https://cloud.google.com/sdk/docs/install

# Login
gcloud auth login

# Create instance
gcloud compute instances create securevoice-server \
  --zone=us-west1-b \
  --machine-type=e2-micro \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-standard \
  --tags=http-server,https-server
```

---

### Step 3: Configure Firewall Rules

```bash
# Allow WireGuard (UDP 51820)
gcloud compute firewall-rules create allow-wireguard \
  --allow=udp:51820 \
  --source-ranges=0.0.0.0/0 \
  --description="Allow WireGuard VPN"

# Allow HTTPS signaling server (optional for testing)
gcloud compute firewall-rules create allow-securevoice \
  --allow=tcp:3000 \
  --source-ranges=0.0.0.0/0 \
  --description="Allow SecureVoice signaling server"
```

**Or via Console:**
1. Go to **VPC Network** → **Firewall**
2. Click "**Create Firewall Rule**"
3. Create rule for WireGuard:
   ```
   Name: allow-wireguard
   Direction: Ingress
   Targets: All instances in network
   Source IP ranges: 0.0.0.0/0
   Protocols: udp:51820
   ```

---

### Step 4: SSH to Instance and Install Docker

```bash
# SSH to your instance (via browser or gcloud)
gcloud compute ssh securevoice-server --zone=us-west1-b

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Verify installation
docker --version
docker compose version

# Logout and login again for group changes
exit
gcloud compute ssh securevoice-server --zone=us-west1-b
```

---

### Step 5: Deploy SecureVoice

```bash
# Upload your project (from local machine)
gcloud compute scp --recurse ./SecureVoice securevoice-server:~/ --zone=us-west1-b

# Or clone from git
cd ~
git clone https://github.com/your-username/SecureVoice.git
cd SecureVoice

# Start the container
docker compose up -d

# View logs
docker compose logs -f
```

---

### Step 6: Get WireGuard Keys

```bash
# Check logs for generated keys
docker compose logs | grep "Generated WireGuard keys"

# Example output:
# 🔑 Generated WireGuard keys:
#    Private Key: yAnz5TF+lXXJte14tR9ipRuXSz0pT5WXLugnSGY3yUI=
#    Public Key: HIgo9xNzJMWLKASKHiTJ3+ABxBzH5er2QUaUWz3eugg=
```

**⚠️ IMPORTANT**: Save these keys! Add them to `docker-compose.yml`:

```bash
# Edit docker-compose.yml on the server
nano docker-compose.yml

# Add under environment:
- WG_PRIVATE_KEY=yAnz5TF+lXXJte14tR9ipRuXSz0pT5WXLugnSGY3yUI=

# Restart
docker compose down
docker compose up -d
```

---

### Step 7: Configure Client (Your Computer)

#### Get Your Instance IP
```bash
gcloud compute instances list

# Or from VM:
curl ifconfig.me
```

#### Generate Client Keys

**Windows (PowerShell with WireGuard installed):**
```powershell
wg genkey | Out-File -Encoding ASCII privatekey
Get-Content privatekey | wg pubkey | Out-File -Encoding ASCII publickey

# View keys
Get-Content privatekey
Get-Content publickey
```

**Linux/Mac:**
```bash
wg genkey | tee privatekey | wg pubkey > publickey

# View keys
cat privatekey
cat publickey
```

#### Create Client Config

Create file: `securevoice-client.conf`

```ini
[Interface]
PrivateKey = <YOUR_CLIENT_PRIVATE_KEY>
Address = 10.0.0.2/24
DNS = 1.1.1.1

[Peer]
PublicKey = <SERVER_PUBLIC_KEY_FROM_STEP_6>
Endpoint = <YOUR_GCP_INSTANCE_IP>:51820
AllowedIPs = 10.0.0.0/24
PersistentKeepalive = 25
```

#### Install WireGuard Client

- **Windows**: https://www.wireguard.com/install/
- **Mac**: `brew install wireguard-tools` or App Store
- **Linux**: `sudo apt install wireguard`

#### Import Config
1. Open WireGuard app
2. Click "Import tunnel(s) from file"
3. Select `securevoice-client.conf`

---

### Step 8: Add Client to Server

```bash
# SSH to GCP instance
gcloud compute ssh securevoice-server --zone=us-west1-b

# Edit WireGuard config
docker exec -it securevoice-vpn vi /config/wg0.conf

# Add peer section:
[Peer]
PublicKey = <YOUR_CLIENT_PUBLIC_KEY>
AllowedIPs = 10.0.0.2/32

# Save and exit (ESC, :wq, ENTER)

# Restart WireGuard
docker exec securevoice-vpn wg-quick down wg0
docker exec securevoice-vpn wg-quick up wg0

# Verify peer is added
docker exec securevoice-vpn wg show
```

---

### Step 9: Connect and Test

1. **Start WireGuard on your computer**
   - Open WireGuard app
   - Click "Activate" on your tunnel

2. **Test VPN connection**
   ```bash
   ping 10.0.0.1
   ```
   Should get replies!

3. **Access SecureVoice**
   - Open browser: `https://10.0.0.1:3000`
   - Accept self-signed certificate warning
   - Create account and start calling!

---

## 🔐 Production Security (Remove Public Access)

Once VPN is working, make signaling server VPN-only:

```bash
# Edit docker-compose.yml
nano docker-compose.yml

# Remove or comment out:
# ports:
#   - "3000:3000"  ← DELETE THIS LINE

# Restart
docker compose down
docker compose up -d
```

Now server is ONLY accessible via VPN at `https://10.0.0.1:3000`

Also delete the firewall rule:
```bash
gcloud compute firewall-rules delete allow-securevoice
```

---

## 📊 Monitoring & Maintenance

### Check Status
```bash
# VM status
gcloud compute instances list

# SSH to server
gcloud compute ssh securevoice-server --zone=us-west1-b

# Check containers
docker compose ps

# View logs
docker compose logs -f

# WireGuard status
docker exec securevoice-vpn wg show
```

### Check Free Tier Usage
1. Go to **Billing** → **Reports**
2. Verify you're within free tier limits
3. Set up billing alerts (optional)

### Backup Data
```bash
# From local machine, backup database and configs
gcloud compute scp --recurse securevoice-server:~/SecureVoice/data ./backup/ --zone=us-west1-b
gcloud compute scp --recurse securevoice-server:~/SecureVoice/wireguard-config ./backup/ --zone=us-west1-b
```

### Stop/Start VM
```bash
# Stop (to save hours if needed)
gcloud compute instances stop securevoice-server --zone=us-west1-b

# Start
gcloud compute instances start securevoice-server --zone=us-west1-b
```

---

## 🐛 Troubleshooting

### Can't connect to VPN
```bash
# Check WireGuard is running
docker exec securevoice-vpn wg show

# Check firewall allows UDP 51820
gcloud compute firewall-rules list | grep wireguard

# Check server logs
docker compose logs | grep WireGuard
```

### Can't access signaling server
```bash
# From inside VPN, test connection
curl -k https://10.0.0.1:3000

# Check Node.js is running
docker exec securevoice-vpn ps aux | grep node
```

### High bandwidth usage
```bash
# Check billing report
# Free tier: 1GB egress/month
# WebRTC data goes through VPN (counts as egress)
# Limit call duration or upgrade if needed
```

---

## 💰 Cost Breakdown

**Free Tier Limits:**
- ✅ 1 e2-micro instance: **Always free** in US regions
- ✅ 30GB disk: **Always free**
- ✅ 1GB network egress/month: **Free**
- ⚠️ Additional egress: **$0.12/GB** (after free 1GB)

**For typical usage (2-3 hours of calls/month):**
- Signaling traffic: ~10MB
- WebRTC media: ~100-500MB (depending on quality)
- **Total**: Well within 1GB free tier = **$0/month**

**If you exceed 1GB:**
- 2GB total = ~$0.12/month
- 5GB total = ~$0.48/month

Still very cheap!

---

## 🔄 Updates

```bash
# SSH to server
gcloud compute ssh securevoice-server --zone=us-west1-b

# Pull latest code
cd ~/SecureVoice
git pull

# Rebuild and restart
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

## 🆘 Support Resources

- [Google Cloud Free Tier](https://cloud.google.com/free)
- [WireGuard Quick Start](https://www.wireguard.com/quickstart/)
- [Docker Documentation](https://docs.docker.com/)
- [gcloud CLI Reference](https://cloud.google.com/sdk/gcloud/reference)

---

## ✅ Deployment Checklist

- [ ] Google Cloud account created
- [ ] e2-micro instance created in US region
- [ ] Firewall rules configured (UDP 51820)
- [ ] Docker installed on VM
- [ ] SecureVoice deployed via Docker Compose
- [ ] WireGuard keys saved
- [ ] Client configured with WireGuard
- [ ] VPN connection tested (ping 10.0.0.1)
- [ ] SecureVoice accessible at https://10.0.0.1:3000
- [ ] Public access to port 3000 removed (production)
- [ ] Firewall rule for port 3000 deleted (production)

---

**🎉 You're done! Your secure calling system is live on Google Cloud's free tier!**
