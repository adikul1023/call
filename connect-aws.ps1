# Quick SSH Connection Script for AWS
# Usage: .\connect-aws.ps1 <AWS_PUBLIC_IP> [username]

param(
    [Parameter(Mandatory=$false)]
    [string]$AwsIP,
    
    [Parameter(Mandatory=$false)]
    [string]$Username = "ubuntu"
)

$KeyPath = "c:\Users\sruja\Desktop\SecureVoice0.1\SecureVoice\AWS_key\Secure_Calling.pem"

# Validate key file exists
if (-not (Test-Path $KeyPath)) {
    Write-Host "❌ PEM key not found at: $KeyPath" -ForegroundColor Red
    exit 1
}

# Fix key permissions (important for SSH)
Write-Host "🔐 Setting correct permissions on PEM key..." -ForegroundColor Yellow
icacls $KeyPath /inheritance:r
icacls $KeyPath /grant:r "$($env:USERNAME):(R)"

if (-not $AwsIP) {
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "AWS EC2 SSH Connection Script" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    $AwsIP = Read-Host "Enter AWS Instance Public IP"
    Write-Host ""
}

Write-Host "🔌 Connecting to AWS EC2 instance..." -ForegroundColor Green
Write-Host "   IP: $AwsIP" -ForegroundColor White
Write-Host "   User: $Username" -ForegroundColor White
Write-Host ""

# Connect via SSH
ssh -i $KeyPath ${Username}@${AwsIP}
