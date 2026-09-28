'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runScript } = require('./harness');

const { exports: bg } = runScript('background.js', {
  exportNames: [
    'formatDatetime',
    'sanitizeFilename',
    'isValidMediaUrl',
    'convertToCSV',
    'parseDatetimeFromFilename',
    'findLatestDatetime',
    'filterNewerMedia',
    'detectExtensionFromUrl',
    'buildQueueFilename'
  ]
});

test('formatDatetime formats ISO datetime to local filename stamp', () => {
  const out = bg.formatDatetime('2026-02-21T16:41:32.000Z');
  assert.match(out, /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
});

test('formatDatetime rejects missing or invalid input', () => {
  assert.equal(bg.formatDatetime(null), null);
  assert.equal(bg.formatDatetime(''), null);
  assert.equal(bg.formatDatetime('not-a-date'), null);
});

test('sanitizeFilename strips traversal and stays within limits', () => {
  const traversal = bg.sanitizeFilename('../../etc/passwd');
  assert.ok(!traversal.includes('..') && !traversal.includes('/'));
  assert.equal(bg.sanitizeFilename('normal_user-123'), 'normal_user-123');
  assert.ok(bg.sanitizeFilename('a'.repeat(500)).length <= 100);
  assert.ok(!bg.sanitizeFilename('a/b\\c:d"e').match(/[/\\:"]/));
});

test('isValidMediaUrl accepts CDN https URLs and rejects the rest', () => {
  assert.equal(bg.isValidMediaUrl('https://scontent.cdninstagram.com/v/t51.123/image.jpg?stp=dst&x=1'), true);
  assert.equal(bg.isValidMediaUrl('https://fbcdn.net/video.mp4?token=abc'), true);
  assert.equal(bg.isValidMediaUrl('http://scontent.cdninstagram.com/x.jpg'), false);
  assert.equal(bg.isValidMediaUrl('https://example.com/photo.jpg'), false);
  assert.equal(bg.isValidMediaUrl(null), false);
  assert.equal(bg.isValidMediaUrl(''), false);
});

test('convertToCSV emits headers, joins arrays, escapes commas', () => {
  const csv = bg.convertToCSV([{
    username: 'u',
    datetime_iso: '2026-01-01T00:00:00.000Z',
    datetime_display: 'Jan 1',
    post_permalink: 'https://x/post/1',
    media_urls: ['https://a/1.jpg', 'https://a/2.jpg'],
    post_content: 'hello, "world"',
    like_count: 5,
    reply_count: 0
  }]);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'username,datetime_iso,datetime_display,post_permalink,media_urls,post_content,like_count,reply_count');
  assert.ok(lines[1].includes('https://a/1.jpg; https://a/2.jpg'));
  assert.ok(lines[1].includes('"hello, ""world"""'));
});

test('parseDatetimeFromFilename reads new format and ignores legacy', () => {
  const dt = bg.parseDatetimeFromFilename('threads-downloads/u/u_2026-02-21_16-41-32.jpg');
  assert.equal(typeof dt.getTime(), 'number');
  assert.ok(!isNaN(dt.getTime()));
  assert.equal(dt.getFullYear(), 2026);
  assert.equal(dt.getMonth(), 1);
  assert.equal(dt.getDate(), 21);
  assert.equal(bg.parseDatetimeFromFilename('u_001_of_100.jpg'), null);
  assert.equal(bg.parseDatetimeFromFilename(null), null);
});

test('findLatestDatetime picks the newest file datetime', () => {
  const latest = bg.findLatestDatetime([
    { filename: 'u/u_2026-01-01_00-00-00.jpg' },
    { filename: 'u/u_2026-03-01_00-00-00.jpg' },
    { filename: 'u/u_001_of_100.jpg' }
  ]);
  assert.equal(latest.getMonth(), 2);
  assert.equal(bg.findLatestDatetime([]), null);
});

test('filterNewerMedia keeps newer and undated items', () => {
  const items = [
    { url: 'a', datetime: '2026-01-01T00:00:00.000Z' },
    { url: 'b', datetime: '2026-05-01T00:00:00.000Z' },
    { url: 'c', datetime: null }
  ];
  assert.equal(bg.filterNewerMedia(items, null).length, 3);
  const filtered = bg.filterNewerMedia(items, new Date('2026-03-01T00:00:00.000Z'));
  assert.deepEqual(filtered.map((i) => i.url), ['b', 'c']);
});

test('detectExtensionFromUrl maps CDN paths to extensions', () => {
  assert.equal(bg.detectExtensionFromUrl('https://scontent.cdninstagram.com/v/x.mp4?token=1'), 'mp4');
  assert.equal(bg.detectExtensionFromUrl('https://fbcdn.net/photo.webp'), 'webp');
  assert.equal(bg.detectExtensionFromUrl('not a url'), 'jpg');
});

test('buildQueueFilename prefers datetime and dedupes collisions', () => {
  const first = bg.buildQueueFilename({ username: 'u', datetime: '2026-02-21T16:41:32.000Z', index: 1, total: 10 }, 'jpg');
  const second = bg.buildQueueFilename({ username: 'u', datetime: '2026-02-21T16:41:32.000Z', index: 2, total: 10 }, 'jpg');
  assert.notEqual(first, second);
  assert.ok(second.endsWith('_1.jpg'));
  const fallback = bg.buildQueueFilename({ username: 'u2', datetime: null, index: 3, total: 10 }, 'jpg');
  assert.ok(fallback.includes('_03_of_10.jpg'));
});
