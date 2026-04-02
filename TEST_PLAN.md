# SecureVoice VPN Deployment - Testing Plan

## Phase 1: Local Verification (Before AWS Deployment)

### ✅ Code Changes Verification

**Check WebRTC Configuration:**
- [ ] Verified `iceServers: []` in all RTCPeerConnection instances
- [ ] No public STUN servers (stun.l.google.com removed)
- [ ] Comments indicate VPN-only mode

**Check Server Configuration:**
- [ ] Server can bind to specific IP via `BIND_IP` environment variable
- [ ] Server supports HTTPS/WSS with certificates

**Check Scripts Created:**
- [ ] `deploy-vpn-server.sh` - Complete AWS deployment
- [ ] `generate-client-config.ps1` - Windows client setup
- [ ] `add-peer.sh` - Add peers to VPN server
- [ ] `QUICK_START.md` - User-friendly guide
- [ ] `VPN_DEPLOYMENT_GUIDE.md` - Detailed documentation

---

## Phase 2: AWS Server Deployment

### Step 2.1: Connect to AWS
```bash
ssh -i AWS_key/Secure_Calling.pem ec2-user@52.66.246.214
```

**Verify:**
- [ ] SSH connection successful
- [ ] Have sudo access

### Step 2.2: Upload Deployment Script
From your Windows PC:
```powershell
scp -i AWS_key/Secure_Calling.pem deploy-vpn-server.sh ec2-user@52.66.246.214:~/
```

**Verify:**
- [ ] File uploaded successfully

### Step 2.3: Run Deployment Script
On AWS:
```bash
chmod +x deploy-vpn-server.sh
./deploy-vpn-server.sh
```

**Expected Output:**
- ✅ WireGuard installed
- ✅ Node.js installed
- ✅ Repository cloned
- ✅ npm packages installed
- ✅ SSL certificates generated
- ✅ WireGuard keys created
- ✅ Server public key displayed
- ✅ WireGuard service running
- ✅ SecureVoice service running

**Save:**
- [ ] Server public key (displayed at end)

### Step 2.4: Verify Services Running
```bash
# Check WireGuard
sudo wg show

# Check SecureVoice
sudo systemctl status securevoice

# Check listening ports
sudo netstat -tuln | grep -E '(3000|51820)'
```

**Expected:**
- [ ] WireGuard interface `wg0` active
- [ ] Server listening on `10.0.0.1:3000`
- [ ] UDP port 51820 listening

---

## Phase 3: AWS Security Group Configuration

### Step 3.1: Open AWS Console
Go to: EC2 → Security Groups → (Your instance's security group)

### Step 3.2: Add Inbound Rules
| Type | Protocol | Port | Source | Description |
|------|----------|------|--------|-------------|
| Custom UDP | UDP | 51820 | 0.0.0.0/0 | WireGuard VPN |
| SSH | TCP | 22 | Your IP | SSH Access |

**Important:** 
- [ ] Do NOT open port 3000 to public
- [ ] Do NOT open port 8080 to public
- [ ] Only WireGuard (51820) and SSH (22) should be open

---

## Phase 4: Windows Client Setup (Peer A - You)

### Step 4.1: Install WireGuard
- [ ] Download from https://www.wireguard.com/install/
- [ ] Install WireGuard for Windows
- [ ] Launch WireGuard application

### Step 4.2: Generate Client Configuration
```powershell
cd c:\Users\sruja\Desktop\SecureVoice0.1\SecureVoice
.\generate-client-config.ps1
```

**Provide when prompted:**
- Name: `YourName`
- VPN IP: `10.0.0.2`
- Server IP: `52.66.246.214`
- Server Public Key: (from Phase 2.3)

**Verify:**
- [ ] Public key displayed
- [ ] Public key copied to clipboard
- [ ] Config file created on Desktop

### Step 4.3: Add Your Peer to AWS Server
SSH to AWS:
```bash
sudo bash add-peer.sh
```

**Enter:**
- Peer name: `YourName`
- Peer public key: (from Step 4.2)
- Peer VPN IP: `10.0.0.2`

**Verify:**
- [ ] Peer added successfully
- [ ] WireGuard restarted
- [ ] `sudo wg show` lists your peer

### Step 4.4: Connect VPN
On Windows:
- [ ] Open WireGuard application
- [ ] Click "Import tunnel(s) from file"
- [ ] Select config from Desktop
- [ ] Click "Activate"

**Verify:**
- [ ] Status shows "Active"
- [ ] Shows handshake timestamp
- [ ] Transfer shows bytes sent/received

### Step 4.5: Test VPN Connection
```powershell
ping 10.0.0.1
```

**Expected:**
- [ ] Replies from 10.0.0.1
- [ ] Low latency (< 50ms typically)

---

## Phase 5: Access SecureVoice Application

### Step 5.1: Open Browser
Navigate to: `https://10.0.0.1:3000`

**Verify:**
- [ ] Page loads (may show certificate warning)
- [ ] Accept self-signed certificate
- [ ] SecureVoice interface appears

### Step 5.2: Register Account
- [ ] Create account for Peer A (you)
- [ ] Login successful
- [ ] Dashboard loads

### Step 5.3: Check Browser Console
Press F12 → Console tab

**Look for:**
- [ ] WebSocket connected to `wss://10.0.0.1:3000`
- [ ] No STUN server errors
- [ ] No public IP exposure warnings

---

## Phase 6: Second Peer Setup (Friend/Test Device)

### Step 6.1: Generate Second Client Config
On friend's PC (or second device):
```powershell
.\generate-client-config.ps1
```

**Provide:**
- Name: `FriendName`
- VPN IP: `10.0.0.3` (different from yours!)
- Server IP: `52.66.246.214`
- Server Public Key: (same as yours)

### Step 6.2: Add Friend's Peer to AWS
```bash
sudo bash add-peer.sh
```

**Enter:**
- Peer name: `FriendName`
- Peer public key: (from friend)
- Peer VPN IP: `10.0.0.3`

### Step 6.3: Friend Connects VPN
- [ ] Friend imports config
- [ ] Friend activates tunnel
- [ ] Friend tests: `ping 10.0.0.1`
- [ ] Friend tests: `ping 10.0.0.2` (your IP)

### Step 6.4: Friend Accesses App
- [ ] Friend opens `https://10.0.0.1:3000`
- [ ] Friend registers account
- [ ] Friend logs in

---

## Phase 7: End-to-End Call Test

### Step 7.1: Add Each Other as Friends
- [ ] You send friend request to friend
- [ ] Friend accepts friend request
- [ ] Both see each other in friends list
- [ ] Both show online status

### Step 7.2: Initiate Call
You start call to friend:
- [ ] Click call button
- [ ] Ringtone plays (bell sound)
- [ ] Friend receives incoming call notification
- [ ] Friend's ringtone plays

### Step 7.3: Accept Call
Friend accepts:
- [ ] Call connects
- [ ] Audio indicators show activity
- [ ] Can hear each other clearly

### Step 7.4: Verify WebRTC Connection
**Browser Console (F12) on both sides:**

**Check ICE Candidates:**
```
✅ GOOD: candidate:... 10.0.0.2 ...
✅ GOOD: candidate:... 10.0.0.3 ...
❌ BAD: candidate:... stun:... (should NOT appear!)
❌ BAD: candidate:... <public IP> ... (should NOT appear!)
```

**Connection State:**
- [ ] Shows "checking" → "connected"
- [ ] No "failed" states
- [ ] Peer connection established

### Step 7.5: Audio Quality Test
- [ ] Clear audio both directions
- [ ] No echo or feedback
- [ ] Low latency (< 200ms)
- [ ] No dropouts or crackling

### Step 7.6: Hangup Test
- [ ] Hangup button works
- [ ] Call ends cleanly
- [ ] Can make another call immediately

---

## Phase 8: Security Verification

### Step 8.1: Network Traffic Analysis (Optional)
On Windows (requires Wireshark):
- [ ] Capture traffic while on call
- [ ] All traffic to/from 52.66.246.214:51820 is UDP
- [ ] Cannot see SIP/SDP/RTP in cleartext
- [ ] All payload is encrypted

### Step 8.2: IP Exposure Check
Visit: https://browserleaks.com/webrtc

**Before VPN:**
- Shows your real public IP

**After VPN connected:**
- [ ] Should only show VPN IP (10.0.0.x)
- [ ] No public IP leaked

### Step 8.3: Verify Server Isolation
From internet (not on VPN):
```bash
telnet 52.66.246.214 3000
```

**Expected:**
- [ ] Connection refused or timeout
- [ ] Port 3000 NOT accessible from public internet

---

## Phase 9: Stress Testing

### Test 9.1: Multiple Calls
- [ ] Make 5 consecutive calls
- [ ] Each connects successfully
- [ ] No degradation in quality

### Test 9.2: Long Duration
- [ ] Stay on call for 10+ minutes
- [ ] Connection remains stable
- [ ] No disconnections

### Test 9.3: VPN Reconnection
- [ ] Deactivate WireGuard
- [ ] Verify cannot access app
- [ ] Reactivate WireGuard
- [ ] Verify can access app again

---

## Troubleshooting Checklist

### Issue: VPN Won't Connect

**Check on Windows:**
```powershell
# Check WireGuard logs in GUI
# Look for handshake errors
```

**Check on AWS:**
```bash
sudo wg show
sudo journalctl -u wg-quick@wg0 -n 50
```

**Common fixes:**
- [ ] Verify Security Group allows UDP 51820
- [ ] Check server public key matches
- [ ] Verify endpoint IP is correct
- [ ] Restart WireGuard: `sudo systemctl restart wg-quick@wg0`

### Issue: Cannot Access https://10.0.0.1:3000

**Check server status:**
```bash
sudo systemctl status securevoice
sudo journalctl -u securevoice -n 50
```

**Check binding:**
```bash
sudo netstat -tuln | grep 3000
# Should show: 10.0.0.1:3000
```

**Common fixes:**
- [ ] Restart service: `sudo systemctl restart securevoice`
- [ ] Check BIND_IP is set to 10.0.0.1
- [ ] Verify certificates exist: `ls -l ~/Secure-Web-Calling/*.pem`

### Issue: WebRTC Connection Fails

**Browser console should show:**
- [ ] ICE candidates gathering
- [ ] Only local/VPN candidates (10.0.0.x)
- [ ] Connection state: checking → connected

**Common fixes:**
- [ ] Both peers must be on VPN
- [ ] Test: `ping 10.0.0.2` and `ping 10.0.0.3`
- [ ] Check firewall not blocking WebRTC
- [ ] Verify microphone permissions granted

### Issue: No Audio

- [ ] Check browser console for errors
- [ ] Verify microphone permission granted
- [ ] Check volume levels
- [ ] Try different browser (Chrome/Edge recommended)
- [ ] Check audio indicators are active

---

## Success Criteria

✅ **Deployment Successful When:**
- [ ] Both peers connect to VPN
- [ ] Both can ping 10.0.0.1, 10.0.0.2, 10.0.0.3
- [ ] Both can access https://10.0.0.1:3000
- [ ] Can register and login
- [ ] Can add each other as friends
- [ ] Calls connect successfully
- [ ] Audio works both directions
- [ ] ICE candidates show only VPN IPs
- [ ] No public IP exposure
- [ ] Port 3000 NOT accessible from public internet

---

## Next Steps After Testing

Once all tests pass:

1. **Document Configuration**
   - Save server public key securely
   - Backup WireGuard configs
   - Document VPN IP assignments

2. **Push to GitHub**
   ```bash
   git add -A
   git commit -m "Add WireGuard VPN deployment setup"
   git push origin main
   ```

3. **Production Hardening** (Optional)
   - Replace self-signed cert with Let's Encrypt
   - Set up monitoring (PM2, CloudWatch)
   - Configure automatic updates
   - Set up backup strategy

4. **User Onboarding**
   - Create user guide
   - Share QUICK_START.md with users
   - Provide WireGuard config templates
   - Set up support channel

---

**Ready to start testing? Begin with Phase 2! 🚀**
