# WireGuard Client Setup for Windows
# Run this on your local Windows machine

# Prerequisites
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "WireGuard Client Setup for Windows" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if WireGuard is installed
$wgPath = "C:\Program Files\WireGuard\wireguard.exe"
if (-not (Test-Path $wgPath)) {
    Write-Host "❌ WireGuard is not installed!" -ForegroundColor Red
    Write-Host "📥 Please download and install from: https://www.wireguard.com/install/" -ForegroundColor Yellow
    Write-Host "   Then run this script again." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ WireGuard found!" -ForegroundColor Green
Write-Host ""

# Generate client keys
Write-Host "🔑 Generating client keys..." -ForegroundColor Yellow
$clientPrivateKey = & wg genkey
$clientPublicKey = $clientPrivateKey | wg pubkey

Write-Host "✅ Client keys generated!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Client Public Key (share with server):" -ForegroundColor Cyan
Write-Host $clientPublicKey -ForegroundColor White
Write-Host ""

# Prompt for server details
Write-Host "Please enter the following details:" -ForegroundColor Yellow
$serverPublicKey = Read-Host "Server Public Key"
$serverEndpoint = Read-Host "Server Public IP Address"

# Create WireGuard config
$configContent = @"
[Interface]
PrivateKey = $clientPrivateKey
Address = 10.0.0.2/24
DNS = 8.8.8.8

[Peer]
PublicKey = $serverPublicKey
Endpoint = ${serverEndpoint}:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
"@

# Save config file
$configPath = "$env:USERPROFILE\Desktop\securevoice-vpn.conf"
$configContent | Out-File -FilePath $configPath -Encoding UTF8

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✅ Client Configuration Created!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "📁 Config file saved to: $configPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Yellow
Write-Host "1. Add this peer to server /etc/wireguard/wg0.conf:" -ForegroundColor White
Write-Host ""
Write-Host "[Peer]" -ForegroundColor Gray
Write-Host "PublicKey = $clientPublicKey" -ForegroundColor Gray
Write-Host "AllowedIPs = 10.0.0.2/32" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Restart WireGuard on server: sudo systemctl restart wg-quick@wg0" -ForegroundColor White
Write-Host "3. Import the config file in WireGuard app on Windows" -ForegroundColor White
Write-Host "4. Activate the tunnel in WireGuard app" -ForegroundColor White
Write-Host ""

# Copy to clipboard if available
if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
    "[Peer]`nPublicKey = $clientPublicKey`nAllowedIPs = 10.0.0.2/32" | Set-Clipboard
    Write-Host "✅ Peer configuration copied to clipboard!" -ForegroundColor Green
}
