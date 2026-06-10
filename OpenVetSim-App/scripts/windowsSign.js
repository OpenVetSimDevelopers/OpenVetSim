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
