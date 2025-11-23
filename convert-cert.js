const forge = require('node-forge');
const fs = require('fs');

// Read the PFX file
const pfxData = fs.readFileSync('cert.pfx');
const pfxAsn1 = forge.asn1.fromDer(pfxData.toString('binary'));
const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, 'securevoice');

// Extract certificate and private key
const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag });
const keyBags = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });

const cert = certBags[forge.pki.oids.certBag][0];
const key = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0];

// Convert to PEM format
const certPem = forge.pki.certificateToPem(cert.cert);
const keyPem = forge.pki.privateKeyToPem(key.key);

// Write to files
fs.writeFileSync('cert.pem', certPem);
fs.writeFileSync('key.pem', keyPem);

console.log('✅ Certificate converted successfully!');
console.log('📄 cert.pem - SSL Certificate');
console.log('🔑 key.pem - Private Key');
console.log('');
console.log('⚠️  These are self-signed certificates for development/VPN use only.');
