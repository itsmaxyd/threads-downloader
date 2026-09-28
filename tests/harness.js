'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function createBrowserStub() {
  const listeners = {};
  const withCallback = (promise, args) => {
    const cb = Array.from(args).find((a) => typeof a === 'function');
    if (cb) promise.then((r) => cb(r), () => cb(undefined));
    return promise;
  };
  const browser = {
    storage: {
      local: {
        get: (...args) => withCallback(Promise.resolve({}), args),
        set: (...args) => withCallback(Promise.resolve(undefined), args),
        remove: (...args) => withCallback(Promise.resolve(undefined), args)
      },
      onChanged: { addListener: () => undefined }
    },
    runtime: {
      onMessage: { addListener: (fn) => { listeners.onMessage = fn; } },
      onInstalled: { addListener: () => undefined },
      sendMessage: (...args) => withCallback(Promise.resolve({}), args),
      getPlatformInfo: async () => ({ os: 'linux' })
    },
    downloads: {
      search: async () => [],
      download: (...args) => withCallback(Promise.resolve(1), args),
      onChanged: { addListener: (fn) => { listeners.onDownloadChanged = fn; } }
    },
    tabs: {
      query: async () => [],
      sendMessage: async () => ({})
    }
  };
  return { browser, listeners };
}

function runScript(relativePath, options = {}) {
  const { globals = {}, exportNames = [] } = options;
  const file = path.join(ROOT, relativePath);
  const code = fs.readFileSync(file, 'utf8');
  const { browser, listeners } = createBrowserStub();

  const sandbox = {
    browser,
    chrome: browser,
    console,
    URL,
    Blob,
    setTimeout,
    clearTimeout
  };
  sandbox.window = {
    location: { href: '', pathname: '/', origin: '', search: '', hash: '' }
  };
  sandbox.document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    body: {}
  };
  sandbox.globalThis = sandbox;
  Object.assign(sandbox, globals);

  vm.createContext(sandbox);
  const exportLine = exportNames.length > 0
    ? `\n;globalThis.__testExports__ = { ${exportNames.join(', ')} };`
    : '';
  vm.runInContext(code + exportLine, sandbox, { filename: file });
  return { sandbox, browser, listeners, exports: sandbox.__testExports__ };
}

module.exports = { runScript, createBrowserStub, ROOT };
