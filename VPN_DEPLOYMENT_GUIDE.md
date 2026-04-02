# SecureVoice - WireGuard VPN Deployment Guide

## Architecture Overview

```
Peer A (10.0.0.2)                AWS Server (10.0.0.1)               Peer B (10.0.0.3)
┌──────────────┐                 ┌──────────────────┐                ┌──────────────┐
│  Browser     │                 │  Node.js Server  │                │  Browser     │
│  WebRTC      │◄────VPN────────►│  Signaling       │◄────VPN────────►│  WebRTC      │
│              │   Encrypted     │  (Socket.io)     │   Encrypted    │              │
└──────────────┘                 └──────────────────┘                └──────────────┘
       │                                  │                                  │
       └──────────────────────────────────┴──────────────────────────────────┘
                    WebRTC Media Flow (DTLS-SRTP) inside VPN tunnel
```

## Security Layers

1. **WireGuard Tunnel**: All traffic encrypted with ChaCha20-Poly1305
2. **HTTPS/WSS**: Signaling encrypted with TLS
3. **WebRTC DTLS-SRTP**: End-to-end media encryption

## IP Assignment

| Device | Public IP | VPN IP | Role |
|--------|-----------|--------|------|
| AWS EC2 | 52.66.246.214 | 10.0.0.1 | Signaling Server + VPN Hub |
| Your PC | (Your IP) | 10.0.0.2 | Peer A |
| Friend PC | (Friend IP) | 10.0.0.3 | Peer B |

---

## STEP 1: Setup WireGuard Server on AWS

### 1.1 Connect to AWS
```bash
ssh -i AWS_key/Secure_Calling.pem ec2-user@52.66.246.214
```

### 1.2 Install WireGuard
```bash
sudo yum update -y
sudo yum install -y wireguard-tools
```

### 1.3 Generate Server Keys
```bash
sudo mkdir -p /etc/wireguard
cd /etc/wireguard
wg genkey | sudo tee server_private.key | wg pubkey | sudo tee server_public.key
sudo chmod 600 server_private.key
```

### 1.4 Create Server Configuration
```bash
sudo nano /etc/wireguard/wg0.conf
```

Paste this configuration:
```ini
[Interface]
Address = 10.0.0.1/24
ListenPort = 51820
PrivateKey = <SERVER_PRIVATE_KEY>

# Enable IP forwarding for peer-to-peer communication
PostUp = sysctl -w net.ipv4.ip_forward=1
PostDown = sysctl -w net.ipv4.ip_forward=0

# Peer A (Your PC)
[Peer]
PublicKey = <PEER_A_PUBLIC_KEY>
AllowedIPs = 10.0.0.2/32

# Peer B (Friend PC)
[Peer]
PublicKey = <PEER_B_PUBLIC_KEY>
AllowedIPs = 10.0.0.3/32
```

Replace `<SERVER_PRIVATE_KEY>` with content of `server_private.key`

### 1.5 Start WireGuard
```bash
sudo systemctl enable wg-quick@wg0
sudo systemctl start wg-quick@wg0
sudo wg show
```

---

## STEP 2: Deploy SecureVoice on AWS

### 2.1 Install Node.js
```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs git
```

### 2.2 Clone Repository
```bash
cd ~
git clone https://github.com/Secure-Calling-EPICS/Secure-Web-Calling.git
cd Secure-Web-Calling
```

### 2.3 Install Dependencies
```bash
npm install
```

### 2.4 Generate SSL Certificates
```bash
node generate-cert.js
```

### 2.5 Start Server (Bound to VPN Interface)
```bash
BIND_IP=10.0.0.1 npm start
```

**Important**: Server will ONLY be accessible via VPN at `https://10.0.0.1:3000`

### 2.6 Keep Running with PM2
```bash
sudo npm install -g pm2
pm2 start server.js --name securevoice -- --node-args="BIND_IP=10.0.0.1"
pm2 save
pm2 startup
```

---

## STEP 3: Configure AWS Security Group

Add these **Inbound Rules** in AWS Console:

| Type | Protocol | Port | Source | Description |
|------|----------|------|--------|-------------|
| Custom UDP | UDP | 51820 | 0.0.0.0/0 | WireGuard VPN |
| SSH | TCP | 22 | Your IP | SSH Access |

**Note**: Do NOT open ports 3000 or 8080 to public - they should only be accessible via VPN!

---

## STEP 4: Setup Peer A (Your Windows PC)

### 4.1 Download WireGuard
Download from: https://www.wireguard.com/install/

### 4.2 Generate Keys
Open PowerShell:
```powershell
cd "C:\Program Files\WireGuard"
./wg.exe genkey | Tee-Object -FilePath peer_a_private.key | ./wg.exe pubkey | Tee-Object -FilePath peer_a_public.key
```

### 4.3 Create Configuration
Create file: `C:\Program Files\WireGuard\tunnel-securevoice.conf`

```ini
[Interface]
PrivateKey = <PEER_A_PRIVATE_KEY>
Address = 10.0.0.2/32
DNS = 8.8.8.8

[Peer]
PublicKey = <SERVER_PUBLIC_KEY>
Endpoint = 52.66.246.214:51820
AllowedIPs = 10.0.0.0/24
PersistentKeepalive = 25
```

Replace:
- `<PEER_A_PRIVATE_KEY>` with content of `peer_a_private.key`
- `<SERVER_PUBLIC_KEY>` with content from AWS `/etc/wireguard/server_public.key`

### 4.4 Add Peer A Public Key to AWS Server
SSH to AWS and edit `/etc/wireguard/wg0.conf`, add Peer A's public key, then:
```bash
sudo systemctl restart wg-quick@wg0
```

### 4.5 Connect
Open WireGuard GUI → Import `tunnel-securevoice.conf` → Activate

### 4.6 Test Connection
```powershell
ping 10.0.0.1
```

---

## STEP 5: Setup Peer B (Friend's PC)

Repeat Step 4 with these changes:
- Address: `10.0.0.3/32`
- File names: `peer_b_private.key`, `peer_b_public.key`
- Add Peer B's public key to AWS `/etc/wireguard/wg0.conf`

---

## STEP 6: Access SecureVoice

### 6.1 Connect VPN
Both peers activate WireGuard connection

### 6.2 Open Browser
Navigate to: `https://10.0.0.1:3000`

Accept self-signed certificate warning

### 6.3 Register/Login
Each user creates account

### 6.4 Make Secure Call
Add each other as friends → Start call

**All traffic flows inside encrypted VPN tunnel!**

---

## Verification Checklist

- [ ] WireGuard running on AWS: `sudo wg show`
- [ ] Both peers can ping `10.0.0.1`
- [ ] Peers can ping each other: `ping 10.0.0.2` / `ping 10.0.0.3`
- [ ] Browser can access `https://10.0.0.1:3000`
- [ ] WebSocket connects (check browser console)
- [ ] Call establishes with audio

---

## Troubleshooting

### VPN Won't Connect
```bash
# On AWS
sudo wg show
sudo journalctl -u wg-quick@wg0 -n 50
```

### Can't Access Server
```bash
# Check if server is listening on VPN IP
netstat -tuln | grep 3000
```

### WebRTC Not Connecting
- Open browser console (F12)
- Check for STUN server errors
- Verify ICE candidates show `10.0.0.x` addresses only

---

## Security Notes

✅ **What's Protected:**
- All signaling traffic encrypted by WireGuard
- Media flows peer-to-peer inside VPN tunnel
- No public exposure of application server
- Metadata hidden from ISP

⚠️ **Manual Steps Required:**
- Exchange WireGuard public keys securely (Signal, in person, etc.)
- Keep private keys secure
- Use strong passwords for user accounts

🔒 **Threat Model:**
This design protects against:
- ISP surveillance
- MITM attacks
- Packet sniffing
- Metadata analysis

Does NOT protect against:
- Device compromise
- Insecure key exchange
- OS-level malware
