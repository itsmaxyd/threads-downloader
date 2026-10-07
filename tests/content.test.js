'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runScript } = require('./harness');

const { sandbox, exports: cs } = runScript('content.js', {
  exportNames: ['parseCount', 'isProfilePage', 'getMediaUrl', 'detectSourceTab',
    'getUsernameFromPath', 'normalizeSourceOpt', 'checkPage', 'getTabUrl',
    'normalizeDedupKey', 'pickBestUrlFromSrcset', 'detectMediaType',
    'isAvatarUrl', 'isValidMediaPattern', 'isCoarsePointer', 'findScrollableAncestor']
});

const { exports: csChrome } = runScript('chrome-version/content.js', {
  exportNames: ['parseCount', 'isProfilePage', 'getMediaUrl', 'detectSourceTab',
    'getUsernameFromPath', 'normalizeDedupKey', 'detectMediaType', 'isAvatarUrl']
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
  assert.equal(csChrome.detectSourceTab('/@u/replies'), cs.detectSourceTab('/@u/replies'));
  assert.equal(csChrome.normalizeDedupKey('https://scontent.cdninstagram.com/v/x.jpg?a=1'),
    cs.normalizeDedupKey('https://scontent.cdninstagram.com/v/x.jpg?a=1'));
  assert.equal(csChrome.detectMediaType('VIDEO', 'https://x/y'), cs.detectMediaType('VIDEO', 'https://x/y'));
  assert.equal(csChrome.isAvatarUrl('https://x/avatar.png', ''), cs.isAvatarUrl('https://x/avatar.png', ''));
});

test('detectSourceTab classifies Media, Replies, profile, reposts, post', () => {
  assert.equal(cs.detectSourceTab('/@u/media'), 'media');
  assert.equal(cs.detectSourceTab('/@u/media/'), 'media');
  assert.equal(cs.detectSourceTab('/@u/replies'), 'replies');
  assert.equal(cs.detectSourceTab('/@u/replies?x=1'), 'replies');
  assert.equal(cs.detectSourceTab('/@u'), 'profile');
  assert.equal(cs.detectSourceTab('/@u/'), 'profile');
  assert.equal(cs.detectSourceTab('/@u/reposts'), 'reposts');
  assert.equal(cs.detectSourceTab('/@u/post/abc123'), 'post');
  assert.equal(cs.detectSourceTab('/'), 'other');
});

test('getUsernameFromPath decodes handles; normalizeSourceOpt clamps input', () => {
  assert.equal(cs.getUsernameFromPath('/@some.user_1/media'), 'some.user_1');
  assert.equal(cs.getUsernameFromPath('/explore'), null);
  assert.equal(cs.getUsernameFromPath('/@caf%C3%A9'), 'café');
  assert.equal(cs.normalizeSourceOpt('Replies'), 'replies');
  assert.equal(cs.normalizeSourceOpt('MEDIA'), 'media');
  assert.equal(cs.normalizeSourceOpt('bogus'), 'auto');
  assert.equal(cs.normalizeSourceOpt(undefined), 'auto');
});

test('checkPage reports kind/urls/support for tabs', () => {
  setLocation('/@someuser/replies');
  const page = cs.checkPage();
  assert.equal(page.kind, 'replies');
  assert.equal(page.username, 'someuser');
  assert.equal(page.isSupported, true);
  assert.equal(page.isProfilePage, false);
  assert.equal(page.mediaUrl, 'https://www.threads.com/@someuser/media');
  assert.equal(page.repliesUrl, 'https://www.threads.com/@someuser/replies');
  setLocation('/@someuser/media');
  assert.equal(cs.checkPage().kind, 'media');
  setLocation('/@someuser');
  const profile = cs.checkPage();
  assert.equal(profile.kind, 'profile');
  assert.equal(profile.isProfilePage, true);
  assert.equal(profile.isSupported, false);
});

test('getTabUrl builds clean per-tab URLs without stale query/hash', () => {
  setLocation('/@someuser/media', { search: '?cursor=abc', hash: '#x' });
  assert.equal(cs.getTabUrl('replies'), 'https://www.threads.com/@someuser/replies');
  assert.equal(cs.getTabUrl('media'), 'https://www.threads.com/@someuser/media');
});

test('normalizeDedupKey strips CDN auth/size params', () => {
  assert.equal(
    cs.normalizeDedupKey('https://scontent.cdninstagram.com/v/t51.1/a.jpg?stp=dst&token=abc'),
    'https://scontent.cdninstagram.com/v/t51.1/a.jpg'
  );
  assert.equal(
    cs.normalizeDedupKey('https://scontent.cdninstagram.com/v/t51.1/a.jpg?stp=other'),
    cs.normalizeDedupKey('https://scontent.cdninstagram.com/v/t51.1/a.jpg?stp=dst')
  );
  assert.equal(cs.normalizeDedupKey('not a url?x=1'), 'not a url');
  assert.equal(cs.normalizeDedupKey(null), '');
});

test('pickBestUrlFromSrcset prefers widest/densest candidate', () => {
  assert.equal(
    cs.pickBestUrlFromSrcset('https://x/a.jpg 320w, https://x/b.jpg 1080w'),
    'https://x/b.jpg'
  );
  assert.equal(
    cs.pickBestUrlFromSrcset('https://x/a.jpg 1x, https://x/b.jpg 2x'),
    'https://x/b.jpg'
  );
  assert.equal(cs.pickBestUrlFromSrcset(null), null);
  assert.equal(cs.pickBestUrlFromSrcset(''), null);
});

test('detectMediaType types VIDEO/IMG by tag, SOURCE by URL', () => {
  assert.equal(cs.detectMediaType('VIDEO', 'https://x/poster.jpg'), 'video');
  assert.equal(cs.detectMediaType('IMG', 'https://x/video-poster.jpg'), 'image');
  assert.equal(cs.detectMediaType('SOURCE', 'https://scontent.cdninstagram.com/v/x.mp4?a=1'), 'video');
  assert.equal(cs.detectMediaType('SOURCE', 'https://scontent.cdninstagram.com/v/x.jpg?a=1'), 'image');
  assert.equal(cs.detectMediaType('DIV', 'https://x/videoplayback?a=1'), 'video');
});

test('isAvatarUrl filters avatars/UI icons but keeps post media + stickers', () => {
  assert.equal(cs.isAvatarUrl('https://x/avatar_small.png', ''), true);
  assert.equal(cs.isAvatarUrl('https://scontent.cdninstagram.com/v/t51.2885-19/pic.jpg', ''), true);
  assert.equal(cs.isAvatarUrl('https://x/photo.jpg', 'Profile picture'), true);
  assert.equal(cs.isAvatarUrl('https://x/icon-settings.png', ''), true);
  // CDN-hosted icons are served through the media CDN — must not be dropped.
  assert.equal(cs.isAvatarUrl('https://scontent.cdninstagram.com/icon-like.png', ''), false);
  assert.equal(cs.isAvatarUrl('https://scontent.cdninstagram.com/v/t51.1/post.jpg', ''), false);
  assert.equal(cs.isAvatarUrl('', ''), true);
});

test('isValidMediaPattern mirrors background allowlist (incl lookaside/heic/hls)', () => {
  assert.equal(cs.isValidMediaPattern('https://scontent.cdninstagram.com/v/t51.1/a.jpg?stp=1'), true);
  assert.equal(cs.isValidMediaPattern('https://lookaside.threads.com/a.jpg?x=1'), true);
  assert.equal(cs.isValidMediaPattern('https://scontent.cdninstagram.com/v/t51.1/a.heic?x=1'), true);
  assert.equal(cs.isValidMediaPattern('data:image/png;base64,xx'), false);
  assert.equal(cs.isValidMediaPattern('https://example.com/photo.jpg'), false);
  assert.equal(cs.isValidMediaPattern(null), false);
});

test('isCoarsePointer/mobile scroll helpers degrade safely in harness', () => {
  // Harness has no matchMedia/touch: must return false, never throw.
  assert.equal(cs.isCoarsePointer(), false);
  assert.equal(cs.findScrollableAncestor(null), null);
});
