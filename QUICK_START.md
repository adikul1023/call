# SecureVoice - Quick Start Guide

## 🎯 What You're Building

A **ultra-secure peer-to-peer calling system** where:
- All communication flows through an **encrypted WireGuard VPN tunnel**
- Signaling server runs on AWS but is **only accessible via VPN** (not public internet)
- WebRTC media flows **peer-to-peer inside the VPN tunnel**
- **Zero public IP exposure** - complete metadata protection

---

## 🚀 Quick Deployment (3 Steps)

### **STEP 1: Deploy Server on AWS** (5 minutes)

```bash
# SSH to your AWS instance
ssh -i AWS_key/Secure_Calling.pem ec2-user@52.66.246.214

# Download and run deployment script
curl -o deploy.sh https://raw.githubusercontent.com/Secure-Calling-EPICS/Secure-Web-Calling/main/deploy-vpn-server.sh
chmod +x deploy.sh
./deploy.sh
```

**Save the Server Public Key** shown at the end - you'll need it for clients!

### **STEP 2: Configure AWS Security Group**

Go to AWS Console → EC2 → Security Groups → Add Inbound Rule:
- **Type**: Custom UDP
- **Port**: 51820
- **Source**: 0.0.0.0/0
- **Description**: WireGuard VPN

### **STEP 3: Setup Clients** (2 minutes per peer)

**On Your Windows PC:**

1. Download WireGuard: https://www.wireguard.com/install/

2. Open PowerShell and run:
```powershell
cd c:\Users\sruja\Desktop\SecureVoice0.1\SecureVoice
.\generate-client-config.ps1
```

3. Follow prompts:
   - Name: `Alice` (or your name)
   - VPN IP: `10.0.0.2`
   - Server IP: `52.66.246.214`
   - Server Public Key: *(paste from Step 1)*

4. **Send your PUBLIC KEY** to server admin (shown on screen)

5. **Server admin adds you**:
```bash
ssh -i AWS_key/Secure_Calling.pem ec2-user@52.66.246.214
sudo bash add-peer.sh
```
   Enter your name, public key, and IP (10.0.0.2)

6. **Connect VPN**:
   - Open WireGuard app
   - Import config from Desktop
   - Click **Activate**

7. **Test**: `ping 10.0.0.1`

8. **Access SecureVoice**: Open browser → `https://10.0.0.1:3000`

---

## 👥 Adding Second Peer (Friend)

Repeat Step 3 with:
- Name: `Bob` (friend's name)
- VPN IP: `10.0.0.3` (different from yours!)
- Same server IP and public key

---

## 🔒 Security Features

✅ **Triple Encryption Layers**:
1. WireGuard tunnel (ChaCha20-Poly1305)
2. HTTPS/WSS (TLS)
3. WebRTC media (DTLS-SRTP)

✅ **Zero Public Exposure**:
- Signaling server bound to VPN IP only
- WebRTC uses only local/VPN candidates
- No STUN servers = no IP leaks

✅ **Metadata Protection**:
- ISP sees only encrypted VPN traffic
- Call duration, participants, content all hidden

---

## 🧪 Testing Checklist

After setup, verify:

- [ ] VPN connected: `ping 10.0.0.1` succeeds
- [ ] Can access: `https://10.0.0.1:3000` in browser
- [ ] Both peers can register/login
- [ ] Can add each other as friends
- [ ] Call connects and audio works
- [ ] Check browser console - ICE candidates show `10.0.0.x` only

---

## 🐛 Troubleshooting

### Can't Connect VPN

**On Windows:**
```powershell
# Check WireGuard status in GUI
# Should show "Active" with handshake time
```

**On AWS:**
```bash
sudo wg show
# Should list connected peers with recent handshake
```

### Can't Access https://10.0.0.1:3000

**Check server is running:**
```bash
sudo systemctl status securevoice
sudo netstat -tuln | grep 3000
```

**Should show:**
```
tcp  0  0  10.0.0.1:3000  0.0.0.0:*  LISTEN
```

### WebRTC Not Connecting

1. Open browser console (F12)
2. Look for errors
3. Check ICE candidates - should be `10.0.0.x` only, NO `stun:` candidates
4. Verify both peers are on VPN: `ping 10.0.0.2` and `ping 10.0.0.3`

---

## 📊 Network Flow Diagram

```
Your PC (10.0.0.2)              AWS Server (10.0.0.1)         Friend PC (10.0.0.3)
┌─────────────────┐             ┌──────────────────┐          ┌─────────────────┐
│ Browser         │             │ Node.js Server   │          │ Browser         │
│ WebRTC Client   │             │ Signaling Only   │          │ WebRTC Client   │
└────────┬────────┘             └────────┬─────────┘          └────────┬────────┘
         │                               │                             │
         │◄──────────────────────────────┤                             │
         │    WireGuard Encrypted VPN    │                             │
         │              Tunnel           │                             │
         │                               │◄────────────────────────────┤
         │                               │    WireGuard Encrypted VPN  │
         │                                                              │
         │◄─────────────────────────────────────────────────────────────┤
                Direct WebRTC P2P (DTLS-SRTP) inside VPN tunnel
```

**Key Points:**
- Signaling (SDP/ICE) flows through server via VPN
- Voice/video flows **directly peer-to-peer** inside VPN tunnel
- Server never sees media, only helps establish connection

---

## 🎓 Understanding the Security

### What Traffic Looks Like to ISP/Network Admin:

**Without VPN (normal WebRTC):**
```
❌ IP: 203.0.113.42 → 198.51.100.88 (real IPs visible)
❌ Port: 50234 → 61923 (RTP media streams)
❌ Protocol: SRTP (identified as call)
❌ Metadata: Call duration, packet sizes visible
```

**With WireGuard VPN:**
```
✅ IP: Your.IP → 52.66.246.214 (only see AWS server)
✅ Port: Random → 51820 (WireGuard port)
✅ Protocol: UDP (encrypted blob)
✅ Metadata: Completely hidden, looks like any VPN traffic
```

---

## 📁 File Reference

| File | Purpose |
|------|---------|
| `deploy-vpn-server.sh` | One-command AWS setup script |
| `generate-client-config.ps1` | Generate Windows client config |
| `add-peer.sh` | Add new peer to VPN (run on server) |
| `VPN_DEPLOYMENT_GUIDE.md` | Detailed manual steps |
| `server.js` | Node.js signaling server |
| `public/index.html` | WebRTC client (modified for VPN-only) |

---

## 🆘 Support

**Check logs on AWS:**
```bash
# WireGuard logs
sudo journalctl -u wg-quick@wg0 -n 50

# SecureVoice logs
sudo journalctl -u securevoice -n 50

# Real-time logs
sudo journalctl -u securevoice -f
```

**Common Issues:**
- **Certificate warning**: Normal for self-signed cert, click "Advanced" → "Proceed"
- **VPN won't connect**: Check AWS Security Group allows UDP 51820
- **No audio**: Check browser mic permissions, verify both on VPN

---

## 🔐 Best Practices

1. **Exchange public keys securely** (Signal, in person, never email)
2. **Keep private keys secure** (never share, backup safely)
3. **Use strong passwords** for SecureVoice accounts
4. **Verify VPN active** before sensitive calls
5. **Update regularly**: `git pull` on AWS + restart service

---

**Ready to deploy? Start with Step 1! 🚀**
