const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Blob's browser aliases are relative to its package root; Metro otherwise
// resolves them from the importing dist file. Use the SDK's shipped shims.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (['undici', 'crypto', 'stream'].includes(moduleName) && context.originModulePath.replaceAll('\\', '/').includes('/@vercel/blob/')) {
    return { type: 'sourceFile', filePath: path.join(__dirname, 'node_modules/@vercel/blob/dist', moduleName + '-browser.js') };
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
