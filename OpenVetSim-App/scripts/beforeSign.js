const { execSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  const { appOutDir, packager } = context;
  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`Stripping extended attributes from ${appPath}...`);
  execSync(`xattr -cr "${appPath}"`);
};
