# WireGuard Client Configuration Generator for Windows
# Run this in PowerShell to generate your WireGuard client configuration

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SecureVoice WireGuard Client Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if WireGuard is installed
$wgPath = "C:\Program Files\WireGuard\wg.exe"
if (-not (Test-Path $wgPath)) {
    Write-Host "❌ WireGuard not found!" -ForegroundColor Red
    Write-Host "Download and install from: https://www.wireguard.com/install/" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Prompt for peer information
Write-Host "📋 Enter your details:" -ForegroundColor Green
Write-Host ""

$peerName = Read-Host "Enter your name (e.g., Alice, Bob)"
$peerIP = Read-Host "Enter your VPN IP (10.0.0.2 or 10.0.0.3)"
$serverIP = Read-Host "Enter AWS server public IP (default: 52.66.246.214)" 
if ([string]::IsNullOrWhiteSpace($serverIP)) {
    $serverIP = "52.66.246.214"
}

$serverPublicKey = Read-Host "Enter AWS server public key (from server setup)"

# Validate inputs
if ([string]::IsNullOrWhiteSpace($peerName) -or 
    [string]::IsNullOrWhiteSpace($peerIP) -or 
    [string]::IsNullOrWhiteSpace($serverPublicKey)) {
    Write-Host "❌ All fields are required!" -ForegroundColor Red
    exit 1
}

# Generate keys
Write-Host ""
Write-Host "🔑 Generating WireGuard keys..." -ForegroundColor Green

$tempDir = $env:TEMP
$privateKeyFile = Join-Path $tempDir "wg_private_$peerName.key"
$publicKeyFile = Join-Path $tempDir "wg_public_$peerName.key"

& $wgPath genkey | Out-File -FilePath $privateKeyFile -Encoding ASCII -NoNewline
$privateKey = Get-Content $privateKeyFile -Raw
$publicKey = $privateKey | & $wgPath pubkey
$publicKey | Out-File -FilePath $publicKeyFile -Encoding ASCII -NoNewline

Write-Host "✅ Keys generated successfully!" -ForegroundColor Green
Write-Host ""

# Display public key
Write-Host "=======================================" -ForegroundColor Yellow
Write-Host "YOUR PUBLIC KEY (send this to server admin):" -ForegroundColor Yellow
Write-Host $publicKey -ForegroundColor White
Write-Host "=======================================" -ForegroundColor Yellow
Write-Host ""

# Create configuration file
$configContent = @"
[Interface]
PrivateKey = $privateKey
Address = $peerIP/32
DNS = 8.8.8.8

[Peer]
PublicKey = $serverPublicKey
Endpoint = ${serverIP}:51820
AllowedIPs = 10.0.0.0/24
PersistentKeepalive = 25
"@

$configFileName = "SecureVoice-$peerName.conf"
$configPath = Join-Path $env:USERPROFILE "Desktop\$configFileName"
$configContent | Out-File -FilePath $configPath -Encoding UTF8

Write-Host "✅ Configuration file created: $configPath" -ForegroundColor Green
Write-Host ""

# Instructions
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "📋 NEXT STEPS:" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. SEND YOUR PUBLIC KEY to the server admin:" -ForegroundColor White
Write-Host "   $publicKey" -ForegroundColor Yellow
Write-Host ""
Write-Host "2. Wait for admin to add your public key to server" -ForegroundColor White
Write-Host ""
Write-Host "3. Open WireGuard application" -ForegroundColor White
Write-Host ""
Write-Host "4. Click 'Import tunnel(s) from file'" -ForegroundColor White
Write-Host "   Select: $configPath" -ForegroundColor Yellow
Write-Host ""
Write-Host "5. Click 'Activate' to connect to VPN" -ForegroundColor White
Write-Host ""
Write-Host "6. Test connection:" -ForegroundColor White
Write-Host "   ping 10.0.0.1" -ForegroundColor Yellow
Write-Host ""
Write-Host "7. Access SecureVoice in browser:" -ForegroundColor White
Write-Host "   https://10.0.0.1:3000" -ForegroundColor Yellow
Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# Copy public key to clipboard if possible
try {
    Set-Clipboard -Value $publicKey
    Write-Host "✅ Public key copied to clipboard!" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Could not copy to clipboard automatically" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
