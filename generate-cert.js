const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Check if certificates already exist
const certPath = path.join(__dirname, 'cert.pem');
const keyPath = path.join(__dirname, 'key.pem');

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  console.log('✅ SSL certificates already exist');
  process.exit(0);
}

console.log('🔐 Generating self-signed SSL certificate...');
console.log('');
console.log('For Windows without OpenSSL, please install OpenSSL or use one of these options:');
console.log('');
console.log('Option 1: Install OpenSSL via Chocolatey');
console.log('  choco install openssl');
console.log('');
console.log('Option 2: Use Git Bash (if Git is installed)');
console.log('  "C:\\Program Files\\Git\\usr\\bin\\openssl.exe" req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=SecureVoice"');
console.log('');
console.log('Option 3: Download OpenSSL from: https://slproweb.com/products/Win32OpenSSL.html');
console.log('');
console.log('Option 4: Run this PowerShell command to create a basic cert:');
console.log(`
$cert = New-SelfSignedCertificate -DnsName "localhost" -CertStoreLocation "cert:\\CurrentUser\\My" -NotAfter (Get-Date).AddYears(1)
$pwd = ConvertTo-SecureString -String "password" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "cert.pfx" -Password $pwd
`);
console.log('');
console.log('After generating, place cert.pem and key.pem in this directory.');
