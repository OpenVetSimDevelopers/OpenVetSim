const { execSync } = require('child_process');
const path = require('path');

// Path to signtool.exe
const SIGNTOOL = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\\x64\\signtool.exe';

// Certificate thumbprint for Cornell University EV cert (YubiKey slot 9A)
const CERT_THUMBPRINT = 'e444aa88291629b6e931b518f42e0b2ce48ea7cb';

// Timestamp server
const TIMESTAMP_URL = 'http://timestamp.sectigo.com';

exports.default = async function sign(configuration) {
  const filePath = configuration.path;

  // Only sign .exe files. electron-builder calls this hook for every bundled
  // file including .dll libraries, which would require a YubiKey PIN prompt
  // for each one. Signing only .exe files covers the main app, the C++ binary,
  // and the final installer — the files that matter for SmartScreen trust.
  if (!filePath.endsWith('.exe')) {
    console.log(`Skipping (not .exe): ${path.basename(filePath)}`);
    return;
  }

  console.log(`Signing ${path.basename(filePath)}...`);

  const cmd = [
    `"${SIGNTOOL}"`,
    'sign',
    `/sha1 ${CERT_THUMBPRINT}`,
    '/fd sha256',
    `/tr ${TIMESTAMP_URL}`,
    '/td sha256',
    `"${filePath}"`,
  ].join(' ');

  execSync(cmd, { stdio: 'inherit' });
};
