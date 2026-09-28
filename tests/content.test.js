'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runScript } = require('./harness');

const { sandbox, exports: cs } = runScript('content.js', {
  exportNames: ['parseCount', 'isProfilePage', 'getMediaUrl']
});

const { exports: csChrome } = runScript('chrome-version/content.js', {
  exportNames: ['parseCount', 'isProfilePage', 'getMediaUrl']
});

function setLocation(pathname, extra = {}) {
  sandbox.window.location = {
    href: `https://www.threads.com${pathname}`,
    pathname,
    origin: 'https://www.threads.com',
    search: '',
    hash: '',
    ...extra
  };
}

test('parseCount handles plain, K, and M suffixes', () => {
  assert.equal(cs.parseCount('559'), 559);
  assert.equal(cs.parseCount('1.2K'), 1200);
  assert.equal(cs.parseCount('10K'), 10000);
  assert.equal(cs.parseCount('2.5M'), 2500000);
  assert.equal(cs.parseCount(''), 0);
  assert.equal(cs.parseCount(null), 0);
  assert.equal(cs.parseCount('abc'), 0);
});

test('isProfilePage matches only bare profile paths', () => {
  setLocation('/@someuser');
  assert.equal(cs.isProfilePage(), true);
  setLocation('/@someuser/');
  assert.equal(cs.isProfilePage(), true);
  setLocation('/@someuser/media');
  assert.equal(cs.isProfilePage(), false);
  setLocation('/@someuser/post/123');
  assert.equal(cs.isProfilePage(), false);
});

test('getMediaUrl appends /media and preserves query and hash', () => {
  setLocation('/@someuser/', { search: '?x=1', hash: '#top' });
  assert.equal(
    cs.getMediaUrl(),
    'https://www.threads.com/@someuser/media?x=1#top'
  );
});

test('chrome content script keeps extraction helpers in parity', () => {
  assert.equal(csChrome.parseCount('1.2K'), cs.parseCount('1.2K'));
  assert.equal(csChrome.parseCount('2.5M'), cs.parseCount('2.5M'));
  assert.equal(csChrome.parseCount('559'), 559);
});
