# WireGuard VPN Setup Guide for AWS

This guide will help you set up a WireGuard VPN tunnel between your local machine and AWS EC2 instance for secure SecureVoice deployment.

## Prerequisites

### On Your Local Machine (Windows):
1. **WireGuard for Windows**: Download from https://www.wireguard.com/install/
2. **SSH Client**: Built into Windows 10/11 or install Git Bash
3. **AWS PEM Key**: Already located at `AWS_key/Secure_Calling.pem`

### On AWS EC2 Instance:
1. **Ubuntu Server** (t2.micro or larger)
2. **Security Group Rules** configured (see below)

## AWS Security Group Configuration

In your AWS Console, configure these inbound rules:

| Type | Protocol | Port | Source | Description |
|------|----------|------|--------|-------------|
| SSH | TCP | 22 | Your IP | SSH access |
| Custom UDP | UDP | 51820 | 0.0.0.0/0 | WireGuard VPN |
| HTTP | TCP | 80 | 0.0.0.0/0 | HTTP |
| HTTPS | TCP | 443 | 0.0.0.0/0 | HTTPS |
| Custom TCP | TCP | 3000 | 10.0.0.0/24 | SecureVoice (VPN only) |
| Custom TCP | TCP | 8080 | 10.0.0.0/24 | WebSocket (VPN only) |

## Step-by-Step Setup

### Step 1: Connect to AWS Instance

```powershell
# Run from SecureVoice directory
.\connect-aws.ps1
# Enter your AWS instance public IP when prompted
```

Or manually:
```powershell
ssh -i "AWS_key\Secure_Calling.pem" ubuntu@<YOUR_AWS_IP>
```

### Step 2: Setup WireGuard on AWS Server

Once connected to AWS:

```bash
# Copy the setup script content or upload it
# Then run:
chmod +x setup-wireguard-aws.sh
./setup-wireguard-aws.sh
```

**Important**: Save the Server Public Key shown at the end!

### Step 3: Setup WireGuard Client on Windows

On your local machine:

```powershell
# Run from SecureVoice directory
.\setup-wireguard-client.ps1
```

This will:
- Generate client keys
- Create a WireGuard config file
- Show the client public key to add to server

### Step 4: Add Client Peer to AWS Server

Back on your AWS instance:

```bash
sudo nano /etc/wireguard/wg0.conf
```

Add this at the end (replace with your actual client public key):

```ini
[Peer]
PublicKey = <YOUR_CLIENT_PUBLIC_KEY>
AllowedIPs = 10.0.0.2/32
```

Save and restart WireGuard:

```bash
sudo systemctl restart wg-quick@wg0
sudo wg show
```

### Step 5: Connect VPN on Windows

1. Open **WireGuard** app on Windows
2. Click **Import tunnel(s) from file**
3. Select `securevoice-vpn.conf` from your Desktop
4. Click **Activate**

You should see "Active" status and data transfer!

### Step 6: Deploy SecureVoice to AWS

```bash
# On AWS instance
cd ~
git clone https://github.com/Secure-Calling-EPICS/Secure-Web-Calling.git
cd Secure-Web-Calling

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install dependencies
npm install

# Generate SSL certificates
node generate-cert.js

# Start the server
npm start
```

### Step 7: Setup Nginx Reverse Proxy (Optional but Recommended)

```bash
sudo nano /etc/nginx/sites-available/securevoice
```

Add:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # or AWS public IP

    location / {
        proxy_pass https://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass https://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

Enable and restart:

```bash
sudo ln -s /etc/nginx/sites-available/securevoice /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Testing the Setup

### Test VPN Connection:

```powershell
# On your local machine, with VPN active
ping 10.0.0.1
```

### Test SecureVoice Access:

Via VPN tunnel:
```
https://10.0.0.1:3000
```

Via public internet (if using Nginx):
```
http://<AWS_PUBLIC_IP>
```

## Troubleshooting

### VPN Not Connecting:

1. Check AWS Security Group allows UDP port 51820
2. Verify keys match on both client and server
3. Check server logs: `sudo journalctl -u wg-quick@wg0`

### Can't Access SecureVoice:

1. Ensure SecureVoice is running: `pm2 list` or check process
2. Check firewall: `sudo ufw status`
3. Verify VPN is active on client

### Permission Issues with PEM Key:

```powershell
icacls "AWS_key\Secure_Calling.pem" /inheritance:r
icacls "AWS_key\Secure_Calling.pem" /grant:r "${env:USERNAME}:(R)"
```

## Useful Commands

### On AWS Server:

```bash
# Check WireGuard status
sudo wg show

# View WireGuard logs
sudo journalctl -u wg-quick@wg0 -f

# Restart WireGuard
sudo systemctl restart wg-quick@wg0

# Check SecureVoice process
pm2 status
pm2 logs
```

### On Windows Client:

```powershell
# Check VPN connection
Get-NetAdapter | Where-Object {$_.InterfaceDescription -like "*WireGuard*"}

# Test connectivity
ping 10.0.0.1
```

## Architecture Overview

```
Your PC (10.0.0.2)
    |
    | WireGuard VPN Tunnel (encrypted)
    | Port 51820 UDP
    |
AWS EC2 (10.0.0.1)
    |
    |-- SecureVoice Server (3000, 8080)
    |-- Nginx (80, 443)
    |-- WireGuard Server
```

## Next Steps

1. Set up PM2 for process management
2. Configure SSL with Let's Encrypt
3. Set up domain name
4. Configure automatic backups
5. Monitor server performance

## Support

For issues, check:
- AWS Security Groups
- WireGuard logs
- SecureVoice logs
- Server resources (disk, memory)
