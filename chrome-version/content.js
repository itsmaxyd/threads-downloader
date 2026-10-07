// Content script for extracting media from Threads pages (Media + Replies tabs)
// Refactored for robustness + memory efficiency:
// - Single incremental scan (MutationObserver + scroll container detection)
// - WeakSet seen-tracking (no repeated full-DOM rescans, no DOM mutation)
// - Per-post aggregation (media + metadata collected in one pass)
// - Replies-tab support with author attribution + foreign-media filtering
// - Hardened URL handling for current threads.com CDN delivery (srcset/currentSrc/poster)

let isExtracting = false;

// Cross-browser API shim (Firefox `browser` vs Chrome `chrome`).
// Lets firefox/chrome variants share identical logic.
const extApi = (typeof browser !== 'undefined' && browser && browser.runtime)
  ? browser
  : (typeof chrome !== 'undefined' ? chrome : null);

// ---------------------------------------------------------------------------
// Small pure helpers (exported for tests)
// ---------------------------------------------------------------------------

// Helper function to parse count strings like "1.2K", "10K", "559"
function parseCount(str) {
  if (!str) return 0;

  str = String(str).trim().toLowerCase().replace(/,/g, '').replace(/\s+/g, '');

  // Handle B (billions)
  if (str.endsWith('b')) {
    const num = parseFloat(str.slice(0, -1));
    return isNaN(num) ? 0 : Math.round(num * 1000000000);
  }

  // Handle K (thousands)
  if (str.endsWith('k')) {
    const num = parseFloat(str.slice(0, -1));
    return isNaN(num) ? 0 : Math.round(num * 1000);
  }

  // Handle M (millions)
  if (str.endsWith('m')) {
    const num = parseFloat(str.slice(0, -1));
    return isNaN(num) ? 0 : Math.round(num * 1000000);
  }

  // Handle plain numbers
  const num = parseInt(str, 10);
  return isNaN(num) ? 0 : num;
}

function getUsernameFromPath(pathname) {
  try {
    const path = (pathname !== undefined) ? pathname : window.location.pathname;
    const m = String(path || '').match(/\/@([^/ ?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch (e) {
    return null;
  }
}

// Detect which profile tab the current (or given) pathname represents.
// Tabs observed on threads.com profiles: Threads (bare /@user), Replies,
// Media, Reposts. Post pages contain /post/.
function detectSourceTab(pathname) {
  try {
    const raw = (pathname !== undefined)
      ? String(pathname)
      : (window.location ? window.location.pathname : '/');
    const clean = raw.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    if (/^\/@[^/]+$/.test(clean)) return 'profile';
    if (/^\/@[^/]+\/media$/.test(clean)) return 'media';
    if (/^\/@[^/]+\/replies$/.test(clean)) return 'replies';
    if (/^\/@[^/]+\/reposts$/.test(clean)) return 'reposts';
    if (clean.includes('/post/')) return 'post';
    return 'other';
  } catch (e) {
    return 'other';
  }
}

function normalizeSourceOpt(v) {
  const s = String(v || 'auto').toLowerCase();
  if (s === 'media' || s === 'replies') return s;
  return 'auto';
}

// Check if current page is a profile page (not media page)
// Kept for backward compatibility with popup/background + tests.
function isProfilePage() {
  // Match /@username but NOT /@username/media or /@username/post/...
  // Handle query parameters and fragments by checking pathname only
  const pathname = window.location.pathname;
  // Allow optional trailing slash
  const profilePattern = /^\/@[^/]+\/?$/;
  return profilePattern.test(pathname);
}

// Get the media URL for current profile (legacy: preserves query/hash)
function getMediaUrl() {
  // Convert /@username to /@username/media
  // Preserve query parameters and fragments
  const origin = window.location.origin;
  let pathname = window.location.pathname;
  // Remove trailing slash if present to avoid double slash
  if (pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  const search = window.location.search;
  const hash = window.location.hash;
  return `${origin}${pathname}/media${search}${hash}`;
}

// Build a clean URL for a given profile tab (drops stale query/hash so
// pagination cursors never leak across tab switches).
function getTabUrl(tab) {
  const origin = window.location.origin;
  const userPart = getUsernameFromPath();
  if (!userPart) return `${origin}/`;
  return `${origin}/@${userPart}/${tab}`;
}

function getRepliesUrl() {
  return getTabUrl('replies');
}

// Redirect to media page (legacy wrapper)
function redirectToMedia() {
  redirectToTab('media');
}

function redirectToTab(tab) {
  try {
    window.location.href = getTabUrl(tab);
  } catch (e) { /* ignore */ }
}

function checkPage() {
  const kind = detectSourceTab();
  const username = getUsernameFromPath();
  return {
    kind,
    username,
    isProfilePage: kind === 'profile',
    isSupported: kind === 'media' || kind === 'replies',
    mediaUrl: getTabUrl('media'),
    repliesUrl: getTabUrl('replies')
  };
}

// Dedup key: CDN URLs for the same bytes differ only by auth/size query
// params (?stp=..., ?_nc_cat=..., ?token=...), so key on origin+pathname.
function normalizeDedupKey(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch (e) {
    return url.split(/[?#]/)[0];
  }
}

// Pick the highest-resolution candidate from a srcset string.
// Handles both `w` (width) and `x` (density) descriptors.
function pickBestUrlFromSrcset(srcset) {
  if (!srcset || typeof srcset !== 'string') return null;
  const parts = srcset.split(',').map(s => s.trim()).filter(Boolean);
  let best = null;
  let bestW = -1;
  for (const part of parts) {
    const tokens = part.split(/\s+/);
    const url = tokens[0];
    if (!url) continue;
    let w = 0;
    const desc = tokens[1] || '';
    if (/^\d+w$/i.test(desc)) {
      w = parseInt(desc, 10);
    } else if (/^[\d.]+x$/i.test(desc)) {
      w = Math.round(parseFloat(desc) * 1000);
    }
    if (w >= bestW) {
      bestW = w;
      best = url;
    }
  }
  return best;
}

// Classify a media URL. IMG/picture content is always an image (even video
// posters whose CDN path mentions video); VIDEO tags are video; SOURCE
// depends on the URL.
function detectMediaType(tagName, url) {
  const tag = String(tagName || '').toUpperCase();
  if (tag === 'VIDEO') return 'video';
  if (tag === 'IMG' || tag === 'IMAGE' || tag === 'PICTURE') return 'image';
  const u = String(url || '').toLowerCase();
  const isVideoUrl = /\.(mp4|m4v|mov|webm|m3u8|mpd)(\?|#|$)/i.test(u) ||
    u.includes('/video/') ||
    u.includes('videoplayback');
  if (tag === 'SOURCE') return isVideoUrl ? 'video' : 'image';
  return isVideoUrl ? 'video' : 'image';
}

// Pure avatar/UI check (testable). Post stickers are NOT filtered — Threads
// now supports stickers in posts.
function isAvatarUrl(url, alt) {
  const u = String(url || '').toLowerCase();
  const a = String(alt || '').toLowerCase();
  if (!u) return true;
  if (a.includes('profile picture') || a.includes('profile photo')) return true;
  if (u.includes('avatar') || u.includes('placeholder') || u.includes('emoji')) return true;
  if (u.includes('/t51.2885-19/')) return true; // Instagram profile-pic shard
  // Bare UI icons outside the CDN are never post media.
  if (u.includes('icon') && !u.includes('fbcdn') && !u.includes('scontent') && !u.includes('cdninstagram')) return true;
  return false;
}

// Content-side quick validity check (mirrors background allowlist).
function isValidMediaPattern(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return false;
  const l = url.toLowerCase();
  if (l.includes('avatar') || l.includes('placeholder')) return false;
  const knownHost = l.includes('fbcdn') || l.includes('scontent') ||
    l.includes('cdninstagram') || l.includes('instagram') ||
    l.includes('threads') || l.includes('lookaside');
  const hasExt = /\.(jpg|jpeg|png|webp|gif|heic|heif|avif|mp4|m4v|mov|webm)(\?|#|$)/i.test(l);
  const hasMediaPath = l.includes('/v/t51.') || l.includes('/image/') ||
    l.includes('/video/') || l.includes('/media/') || l.includes('videoplayback');
  const hasQuery = url.includes('?');
  return Boolean(knownHost && (hasExt || hasMediaPath || hasQuery));
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

// Check if an image element is a post image (not profile pic, icon, etc.)
// Kept as legacy wrapper around the pure isAvatarUrl helper.
function isPostImage(img) {
  try {
    if (!img) return false;
    const url = img.currentSrc || img.src || (img.dataset && (img.dataset.src || img.dataset.url)) || '';
    if (isAvatarUrl(url, img.alt)) return false;

    // Check image dimensions (profile pics are usually small and square)
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      // Skip small images (likely icons)
      if (img.naturalWidth < 50 || img.naturalHeight < 50) return false;
    }

    // Accept images from known CDN domains
    if (url.includes('fbcdn')) return true;
    if (url.includes('scontent')) return true;
    if (url.includes('cdninstagram')) return true;
    if (url.includes('lookaside')) return true;
    if (url.includes('threads')) return true;

    // Accept images with common media extensions
    if (url.match(/\.(jpg|jpeg|png|webp|gif|heic|heif|avif)(\?|$)/i)) return true;

    return false;
  } catch (e) {
    return false;
  }
}

function extractHighResUrl(element) {
  try {
    if (!element) return null;
    const tag = element.tagName;

    // For img elements, prioritize srcset/currentSrc for highest quality
    if (tag === 'IMG') {
      if (element.srcset) {
        const best = pickBestUrlFromSrcset(element.srcset);
        if (best) return best;
      }
      if (element.currentSrc && String(element.currentSrc).startsWith('http')) {
        return element.currentSrc;
      }
      if (element.dataset && element.dataset.srcset) {
        const best = pickBestUrlFromSrcset(element.dataset.srcset);
        if (best) return best;
      }
    }

    if (tag === 'SOURCE') {
      const ss = element.srcset || (element.dataset && element.dataset.srcset);
      if (ss) {
        const best = pickBestUrlFromSrcset(ss);
        if (best) return best;
      }
      return element.src || (element.dataset && element.dataset.src) || null;
    }

    if (tag === 'VIDEO') {
      if (element.currentSrc && String(element.currentSrc).startsWith('http')) {
        return element.currentSrc;
      }
      if (element.src && String(element.src).startsWith('http')) {
        return element.src;
      }
      // Check for source elements inside video
      if (element.querySelector) {
        const source = element.querySelector('source[src], source[srcset]');
        if (source) return extractHighResUrl(source);
      }
      return null;
    }

    // Try multiple data attributes for lazy-loaded images
    const url = (element.dataset && (
      element.dataset.src ||
      element.dataset.url ||
      element.dataset.image ||
      element.dataset.lazySrc ||
      element.dataset.original ||
      element.dataset.srcset)) ||
      element.src || element.href || null;

    return url || null;
  } catch (e) {
    return null;
  }
}

function findFeedContainer(sourceTab) {
  try {
    const tab = sourceTab || detectSourceTab();

    // Media tab: prefer the grid when present.
    if (tab === 'media') {
      const grid = document.querySelector('[data-testid="media-grid"]') ||
        document.querySelector('div[role="grid"]') ||
        document.querySelector('[data-testid="user-profile-media-grid"]') ||
        document.querySelector('.media-grid') ||
        document.querySelector('.user-profile-media-grid');
      if (grid) return grid;
    }

    // Replies / profile / feed pages render as a feed — prefer <main>.
    const main = document.querySelector('main') ||
      document.querySelector('[role="main"]');
    if (main) return main;

    // Fallback: common ancestor of time elements (posts always carry one).
    const timeElements = document.querySelectorAll('time[datetime]');
    if (timeElements.length > 0) {
      let commonAncestor = timeElements[0];
      for (const time of timeElements) {
        while (commonAncestor && !commonAncestor.contains(time)) {
          commonAncestor = commonAncestor.parentElement;
        }
        if (!commonAncestor) break;
      }
      if (commonAncestor && commonAncestor !== document.body &&
        commonAncestor !== document.documentElement) {
        return commonAncestor;
      }
    }

    // Fallback: common ancestor of CDN images.
    const cdnImages = document.querySelectorAll('img[src*="fbcdn"], img[src*="scontent"]');
    if (cdnImages.length > 3) {
      let commonAncestor = cdnImages[0];
      for (const img of cdnImages) {
        while (commonAncestor && !commonAncestor.contains(img)) {
          commonAncestor = commonAncestor.parentElement;
        }
        if (!commonAncestor) break;
      }
      if (commonAncestor && commonAncestor !== document.body &&
        commonAncestor !== document.documentElement) {
        return commonAncestor;
      }
    }

    return document.querySelector('.main') ||
      document.querySelector('#main') ||
      document.body;
  } catch (e) {
    return document.body;
  }
}

// Legacy alias.
function findMediaContainer() {
  return findFeedContainer(detectSourceTab());
}

function hasLoginWall(root) {
  try {
    const text = (root && root.textContent ? root.textContent : document.body.textContent) || '';
    return /log in to see more/i.test(text);
  } catch (e) {
    return false;
  }
}

// Walk up a bounded number of levels to find the post scope for an element.
// Returns datetime/permalink/author without retaining DOM references.
function findPostContext(element, profileUsername) {
  const empty = { postRoot: null, datetime: null, datetimeDisplay: null, permalink: null, author: null };
  try {
    if (!element) return empty;
    let node = element.parentElement;
    for (let depth = 0; depth < 8 && node && node !== document.body; depth++) {
      // Never treat a huge feed container as a single post.
      if (node.childElementCount > 250) break;
      let time = null;
      try {
        time = node.querySelector ? node.querySelector('time[datetime]') : null;
      } catch (e) { time = null; }
      if (time) {
        const datetime = time.getAttribute('datetime');
        const datetimeDisplay = time.getAttribute('title');
        let permalink = null;
        try {
          const link = time.closest ? time.closest('a[href*="/post/"]') : null;
          const pl = link || (node.querySelector ? node.querySelector('a[href*="/post/"]') : null);
          if (pl) {
            permalink = pl.href || (pl.getAttribute ? pl.getAttribute('href') : null);
            if (permalink) {
              const m = String(permalink).match(/\/(@[^/]+)\/post\/([^/?#]+)/);
              if (m) {
                const origin = window.location.origin.replace('threads.net', 'threads.com');
                permalink = `${origin}/${m[1]}/post/${m[2]}`;
              }
            }
          }
        } catch (e) { /* ignore */ }
        let author = null;
        try {
          const candidates = node.querySelectorAll ? node.querySelectorAll('a[href*="/@"]') : [];
          for (const a of candidates) {
            const href = (a.getAttribute ? a.getAttribute('href') : a.href) || '';
            const am = String(href).match(/\/@([^/ ?#]+)/);
            if (am) { author = decodeURIComponent(am[1]); break; }
          }
        } catch (e) { /* ignore */ }
        return {
          postRoot: node,
          datetime: datetime || null,
          datetimeDisplay: datetimeDisplay || null,
          permalink: permalink || null,
          author: author || null
        };
      }
      node = node.parentElement;
    }
    // Prefer an explicit article ancestor when the bounded walk missed.
    try {
      const article = element.closest ? element.closest('article, [role="article"]') : null;
      if (article) {
        const time = article.querySelector ? article.querySelector('time[datetime]') : null;
        if (time) {
          return {
            postRoot: article,
            datetime: time.getAttribute('datetime'),
            datetimeDisplay: time.getAttribute('title'),
            permalink: null,
            author: null
          };
        }
      }
    } catch (e) { /* ignore */ }
    return empty;
  } catch (e) {
    return empty;
  }
}

// Single-pass engagement extraction for one post root. Guarded against
// feed-level roots (which would make this O(feed)).
function extractEngagement(postRoot) {
  let likeCount = 0;
  let replyCount = 0;
  try {
    if (!postRoot || !postRoot.querySelectorAll) return { likeCount, replyCount };
    if (postRoot.querySelectorAll('time[datetime]').length > 3) return { likeCount, replyCount };

    const likeSvg = postRoot.querySelector('svg[aria-label="Like"], svg[aria-label="Liked"]');
    if (likeSvg) {
      const parentDiv = likeSvg.closest ? likeSvg.closest('div') : null;
      const scope = parentDiv || postRoot;
      const spans = scope.querySelectorAll('span');
      for (const span of spans) {
        const text = (span.textContent || '').trim();
        if (text && (/^\d+$/.test(text) || /^\d+\.\d+[KkMm]$/.test(text) || /^\d+[KkMm]$/.test(text))) {
          likeCount = parseCount(text);
          break;
        }
      }
    }

    const replySvg = postRoot.querySelector('svg[aria-label="Reply"]');
    if (replySvg) {
      const parentDiv = replySvg.closest ? replySvg.closest('div') : null;
      const scope = parentDiv || postRoot;
      const spans = scope.querySelectorAll('span');
      for (const span of spans) {
        const text = (span.textContent || '').trim();
        if (text && (/^\d+$/.test(text) || /^\d+\.\d+[KkMm]$/.test(text) || /^\d+[KkMm]$/.test(text))) {
          replyCount = parseCount(text);
          break;
        }
      }
    }
  } catch (e) { /* ignore */ }
  return { likeCount, replyCount };
}

function extractPostContentFromRoot(postRoot) {
  try {
    if (!postRoot || !postRoot.querySelectorAll) return null;
    const spans = postRoot.querySelectorAll('span[dir="auto"]');
    const parts = [];
    let scanned = 0;
    for (const span of spans) {
      if (scanned++ > 20) break;
      const text = (span.textContent || '').trim();
      if (text && text.length > 3 && !text.match(/^\d+$/) && !text.startsWith('@')) {
        parts.push(text);
        if (parts.join(' ').length > 500) break;
      }
    }
    if (parts.length === 0) return null;
    return parts.join(' ').substring(0, 500);
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Incremental scanning core (memory-efficient: WeakSet + per-post aggregate)
// ---------------------------------------------------------------------------

function createScanContext(profileUsername, sourceTab, includeForeign) {
  return {
    profileUsername,
    sourceTab,
    includeForeign: !!includeForeign,
    mediaMap: new Map(), // dedupKey -> {url,type,datetime,permalink,author,source_tab,width}
    postMap: new Map(),  // postKey -> {username,author,datetime_iso,...,mediaSet:Set,...}
    seen: new WeakSet(),
    postSeq: 0,
    stats: { scanned: 0, kept: 0, skippedAvatar: 0, skippedForeign: 0, skippedInvalid: 0, errors: 0 }
  };
}

function estimateWidth(url, fallbackWidth) {
  if (fallbackWidth > 0) return fallbackWidth;
  try {
    const m = String(url).match(/[?&](?:w|width)=(\d{3,4})/i);
    if (m) return parseInt(m[1], 10);
    const s = String(url).match(/\/s(\d+)x\d+\//);
    if (s) return parseInt(s[1], 10);
  } catch (e) { /* ignore */ }
  return 0;
}

function upsertMedia(ctx, url, tagName, element, widthHint) {
  try {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      ctx.stats.skippedInvalid++;
      return;
    }
    if (!isValidMediaPattern(url)) {
      ctx.stats.skippedInvalid++;
      return;
    }
    const type = detectMediaType(tagName, url);
    const ctxPost = findPostContext(element, ctx.profileUsername);

    // Replies-tab ownership filter: skip other users' parent-post media
    // unless the user explicitly opted in.
    if (ctx.sourceTab === 'replies' && !ctx.includeForeign && ctxPost.author &&
      ctx.profileUsername && ctx.profileUsername !== 'threads-user' &&
      ctxPost.author.toLowerCase() !== String(ctx.profileUsername).toLowerCase()) {
      ctx.stats.skippedForeign++;
      return;
    }

    const key = normalizeDedupKey(url);
    const width = estimateWidth(url, widthHint || 0);
    const existing = ctx.mediaMap.get(key);
    if (existing) {
      if (width > (existing.width || 0)) {
        existing.url = url;
        existing.width = width;
        if (!existing.datetime && ctxPost.datetime) existing.datetime = ctxPost.datetime;
        if (!existing.permalink && ctxPost.permalink) existing.permalink = ctxPost.permalink;
      }
    } else {
      ctx.mediaMap.set(key, {
        url,
        type,
        datetime: ctxPost.datetime,
        permalink: ctxPost.permalink,
        author: ctxPost.author,
        source_tab: ctx.sourceTab,
        width
      });
      ctx.stats.kept++;
    }

    // Per-post aggregate (engagement/content extracted once per post).
    const postKey = ctxPost.permalink ||
      (ctxPost.datetime ? `${ctxPost.datetime}|${ctxPost.author || ''}` : null) ||
      `orphan:${key}`;
    let post = ctx.postMap.get(postKey);
    if (!post) {
      let likeCount = 0;
      let replyCount = 0;
      let postContent = null;
      if (ctxPost.postRoot) {
        const eng = extractEngagement(ctxPost.postRoot);
        likeCount = eng.likeCount;
        replyCount = eng.replyCount;
        postContent = extractPostContentFromRoot(ctxPost.postRoot);
      }
      post = {
        username: ctx.profileUsername,
        author: ctxPost.author,
        datetime_iso: ctxPost.datetime,
        datetime_display: ctxPost.datetimeDisplay,
        post_permalink: ctxPost.permalink,
        mediaSet: new Set(),
        post_content: postContent,
        like_count: likeCount,
        reply_count: replyCount,
        source_tab: ctx.sourceTab,
        is_reply: ctx.sourceTab === 'replies'
      };
      ctx.postMap.set(postKey, post);
      // Cap post map to bound memory on pathological pages.
      if (ctx.postMap.size > 10000) return;
    }
    post.mediaSet.add(url);
    if (!post.datetime_iso && ctxPost.datetime) post.datetime_iso = ctxPost.datetime;
    if (!post.post_permalink && ctxPost.permalink) post.post_permalink = ctxPost.permalink;
  } catch (e) {
    ctx.stats.errors++;
  }
}

function scanMediaElement(ctx, element) {
  try {
    if (!element || ctx.seen.has(element)) return;
    ctx.seen.add(element);
    const tag = element.tagName;
    if (tag !== 'IMG' && tag !== 'VIDEO' && tag !== 'SOURCE') return;
    ctx.stats.scanned++;

    if (tag === 'IMG') {
      const url = extractHighResUrl(element);
      if (!url) { ctx.stats.skippedInvalid++; return; }
      if (isAvatarUrl(url, element.alt)) { ctx.stats.skippedAvatar++; return; }
      if (element.naturalWidth > 0 && element.naturalHeight > 0 &&
        (element.naturalWidth < 50 || element.naturalHeight < 50)) {
        ctx.stats.skippedAvatar++;
        return;
      }
      // Width hint from srcset when available.
      let wHint = 0;
      try {
        if (element.srcset) {
          const best = pickBestUrlFromSrcset(element.srcset);
          if (best === url) {
            const m = element.srcset.match(/(\d+)w\s*$/);
            if (m) wHint = parseInt(m[1], 10);
          }
        }
      } catch (e) { /* ignore */ }
      upsertMedia(ctx, url, tag, element, wHint);
      return;
    }

    if (tag === 'VIDEO') {
      const vurl = extractHighResUrl(element);
      if (vurl) upsertMedia(ctx, vurl, tag, element, 0);
      // Poster is a separate image asset worth keeping.
      try {
        const poster = element.poster;
        if (poster && typeof poster === 'string' && poster.startsWith('http') &&
          !isAvatarUrl(poster, '') && isValidMediaPattern(poster)) {
          upsertMedia(ctx, poster, 'IMG', element, 0);
        }
      } catch (e) { /* ignore */ }
      if (!vurl) ctx.stats.skippedInvalid++;
      return;
    }

    // SOURCE: parent determines default, detectMediaType refines via URL.
    if (tag === 'SOURCE') {
      const url = extractHighResUrl(element);
      if (!url) { ctx.stats.skippedInvalid++; return; }
      const parentTag = element.parentElement ? element.parentElement.tagName : '';
      // Skip <source> inside <picture> that duplicates an already-seen <img>?
      // Dedup map handles it, just insert.
      upsertMedia(ctx, url, parentTag === 'VIDEO' ? 'VIDEO' : 'SOURCE', element, 0);
      return;
    }
  } catch (e) {
    ctx.stats.errors++;
  }
}

function scanSubtree(ctx, root) {
  try {
    if (!root || !root.querySelectorAll) return;
    const els = root.querySelectorAll('img, video, source');
    for (const el of els) {
      scanMediaElement(ctx, el);
    }
  } catch (e) {
    ctx.stats.errors++;
  }
}

function buildMetadataArray(ctx) {
  const out = [];
  for (const post of ctx.postMap.values()) {
    const mediaUrls = Array.from(post.mediaSet || []);
    if (mediaUrls.length === 0 && !post.post_content) continue;
    out.push({
      username: post.username,
      author: post.author || null,
      datetime_iso: post.datetime_iso,
      datetime_display: post.datetime_display,
      post_permalink: post.post_permalink,
      media_urls: mediaUrls,
      post_content: post.post_content,
      like_count: post.like_count,
      reply_count: post.reply_count,
      source_tab: post.source_tab,
      is_reply: post.is_reply
    });
    if (out.length >= 10000) break;
  }
  return out;
}

// Legacy full-subtree extraction (kept for compatibility).
function extractMediaUrls(container, mediaMap, metadataMap = null) {
  try {
    const ctx = createScanContext(getUsernameFromPath() || 'threads-user', detectSourceTab(), true);
    ctx.mediaMap = mediaMap;
    scanSubtree(ctx, container);
    // Backfill legacy permalink/datetime shape (no-ops for new fields).
  } catch (e) { /* ignore */ }
}

// Legacy metadata extraction (kept; new path builds metadata incrementally).
function extractAllMetadata(container, username) {
  try {
    const ctx = createScanContext(username, detectSourceTab(), true);
    scanSubtree(ctx, container);
    return buildMetadataArray(ctx);
  } catch (e) {
    return [];
  }
}

// Legacy per-article helpers retained for compatibility.
function extractPostDatetime(articleElement) {
  if (!articleElement) return null;
  try {
    const timeElement = articleElement.querySelector('time[datetime]');
    if (timeElement) return timeElement.getAttribute('datetime');
  } catch (e) { /* ignore */ }
  return null;
}

function extractDatetimeDisplay(articleElement) {
  if (!articleElement) return null;
  try {
    const timeElement = articleElement.querySelector('time[title]');
    if (timeElement) return timeElement.getAttribute('title');
  } catch (e) { /* ignore */ }
  return null;
}

function extractPermalink(articleElement, username) {
  if (!articleElement) return null;
  try {
    const link = articleElement.querySelector('a[href*="/post/"]');
    if (link) {
      const href = link.getAttribute('href');
      const match = String(href || '').match(/\/(@[^/]+)\/post\/([^/]+)/);
      if (match) return `https://www.threads.com/${match[1]}/post/${match[2]}`;
    }
  } catch (e) { /* ignore */ }
  return null;
}

function extractArticleMediaUrls(articleElement) {
  if (!articleElement) return [];
  const mediaUrls = [];
  try {
    const mediaElements = articleElement.querySelectorAll('img, video, video source, picture source');
    mediaElements.forEach(element => {
      const url = extractHighResUrl(element);
      if (url && url.startsWith('http') && !isAvatarUrl(url, element.alt)) {
        mediaUrls.push(url);
      }
    });
  } catch (e) { /* ignore */ }
  return mediaUrls;
}

function extractPostContent(articleElement) {
  return extractPostContentFromRoot(articleElement);
}

function extractLikeCount(articleElement) {
  try {
    if (!articleElement) return 0;
    return extractEngagement(articleElement).likeCount;
  } catch (e) { return 0; }
}

function extractReplyCount(articleElement) {
  try {
    if (!articleElement) return 0;
    return extractEngagement(articleElement).replyCount;
  } catch (e) { return 0; }
}

function extractPostMetadata(articleElement, username) {
  return {
    username,
    datetime_iso: extractPostDatetime(articleElement),
    datetime_display: extractDatetimeDisplay(articleElement),
    post_permalink: extractPermalink(articleElement, username),
    media_urls: extractArticleMediaUrls(articleElement),
    post_content: null,
    like_count: extractLikeCount(articleElement),
    reply_count: extractReplyCount(articleElement)
  };
}

function findParentArticle(element) {
  let current = element;
  try {
    while (current && current !== document.body) {
      if (current.tagName === 'ARTICLE' || (current.getAttribute && current.getAttribute('role') === 'article')) {
        return current;
      }
      current = current.parentElement;
    }
  } catch (e) { /* ignore */ }
  return null;
}

// ---------------------------------------------------------------------------
// Scrolling / pagination
// ---------------------------------------------------------------------------

// Touch/coarse-pointer devices (phones, tablets) paginate slower and settle
// slower than desktop: used to adapt scroll timing in handleInfiniteScroll.
// Pure capability probe — safe to call in any context.
function isCoarsePointer() {
  try {
    if (typeof window !== 'undefined' && window.matchMedia &&
      window.matchMedia('(pointer: coarse)').matches) return true;
    if (typeof window !== 'undefined' && 'ontouchstart' in window) return true;
  } catch (e) { /* ignore */ }
  return false;
}

function findScrollableAncestor(el) {
  try {
    let n = el ? el.parentElement : null;
    while (n && n !== document.body && n !== document.documentElement) {
      try {
        const st = window.getComputedStyle ? window.getComputedStyle(n) : null;
        const oy = st ? st.overflowY : '';
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 50) {
          return n;
        }
      } catch (e) { /* ignore */ }
      n = n.parentElement;
    }
  } catch (e) { /* ignore */ }
  return null; // window scrolling
}

function scrollOnce(scroller, container) {
  try {
    if (scroller) {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  } catch (e) {
    try {
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      else window.scrollTo(0, document.body.scrollHeight);
    } catch (e2) { /* ignore */ }
  }
}

async function handleInfiniteScroll(container, mediaMap, limit = null, opts = null) {
  const options = opts || {};
  const ctx = options.ctx || null;
  // Legacy signature support: (container, mediaMap, limit) with a throwaway
  // context is preserved, but the preferred path passes { ctx } so the
  // scroll loop feeds the same incremental aggregates.
  // Mobile web Threads loads fewer items per cursor page and the in-app
  // timing is flakier — allow more, gentler scroll iterations on touch.
  const coarse = isCoarsePointer();
  const maxScrolls = coarse ? 60 : 30;
  const settleSteps = coarse ? 12 : 7;
  const settleWait = coarse ? 700 : 500;
  const scroller = findScrollableAncestor(container);
  let noNewMediaCount = 0;
  let lastHeight = 0;
  try {
    lastHeight = scroller ? scroller.scrollHeight : document.body.scrollHeight;
  } catch (e) { lastHeight = 0; }

  // Observe only newly added subtrees — avoids rescanning the whole feed.
  let pending = [];
  let observer = null;
  try {
    if (typeof MutationObserver !== 'undefined' && ctx) {
      observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) pending.push(node);
          }
        }
      });
      observer.observe(container, { childList: true, subtree: true });
    }
  } catch (e) { observer = null; }

  const stats = { scrolls: 0, loginWall: false };
  try {
    for (let i = 0; i < maxScrolls; i++) {
      const before = ctx ? ctx.mediaMap.size : mediaMap.size;
      stats.scrolls = i + 1;

      scrollOnce(scroller, container);
      // Adaptive settle: poll for DOM growth instead of fixed long sleeps.
      let settled = false;
      for (let w = 0; w < settleSteps; w++) {
        await new Promise(resolve => setTimeout(resolve, settleWait));
        let h = 0;
        try {
          h = scroller ? scroller.scrollHeight : document.body.scrollHeight;
        } catch (e) { h = lastHeight; }
        if (pending.length > 0 || h > lastHeight) { settled = true; break; }
      }
      // Small nudge to trigger IntersectionObserver-lazy media.
      try {
        if (scroller) scroller.scrollBy(0, -240);
        else window.scrollBy(0, -240);
      } catch (e) { /* ignore */ }
      await new Promise(resolve => setTimeout(resolve, 600));
      try {
        lastHeight = scroller ? scroller.scrollHeight : document.body.scrollHeight;
      } catch (e) { /* ignore */ }

      if (ctx) {
        // Drain observer buffer (plus their descendants).
        const batch = pending;
        pending = [];
        for (const node of batch) {
          if (node.querySelectorAll) scanSubtree(ctx, node);
          if (node.tagName === 'IMG' || node.tagName === 'VIDEO' || node.tagName === 'SOURCE') {
            scanMediaElement(ctx, node);
          }
        }
        // Fallback: if the observer saw nothing (virtualized list that
        // recycles nodes, or observer unsupported), do one bounded full
        // scan — WeakSet keeps it cheap since seen nodes are skipped.
        if (batch.length === 0) scanSubtree(ctx, container);
        // Cooperative yield so large feeds don't block the page.
        await new Promise(resolve => setTimeout(resolve, 0));
      } else {
        extractMediaUrls(container, mediaMap);
      }

      const after = ctx ? ctx.mediaMap.size : mediaMap.size;
      if (hasLoginWall(container)) {
        stats.loginWall = true;
        break;
      }
      if (after === before) {
        noNewMediaCount++;
        if (noNewMediaCount >= 5) break;
      } else {
        noNewMediaCount = 0;
      }
      const sized = ctx ? ctx.mediaMap.size : mediaMap.size;
      if (limit && sized >= limit) break;
      if (!settled && noNewMediaCount >= 2) {
        // No DOM growth twice in a row — likely end of cursor pagination.
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }
  } finally {
    try { if (observer) observer.disconnect(); } catch (e) { /* ignore */ }
    pending = [];
  }
  return stats;
}

// ---------------------------------------------------------------------------
// Main extraction
// ---------------------------------------------------------------------------

async function extractAllMedia(limit = null, prepareOnly = false, usernameOverride = null, options = null) {
  isExtracting = true;
  const opts = options || {};
  const requestedSource = normalizeSourceOpt(opts.sourceTab || opts.source_tab);
  const includeForeign = !!opts.includeForeign;

  try {
    const username = usernameOverride || getUsernameFromPath() || 'threads-user';
    const actualTab = detectSourceTab();

    // If the caller asked for a specific tab but we are on another
    // supported tab, don't silently scrape the wrong feed — tell the popup
    // to redirect instead.
    if (requestedSource !== 'auto' && requestedSource !== actualTab &&
      (actualTab === 'media' || actualTab === 'replies' || actualTab === 'profile')) {
      isExtracting = false;
      return {
        success: false,
        needsRedirect: true,
        targetTab: requestedSource,
        targetUrl: getTabUrl(requestedSource),
        actualTab,
        error: `You are on the ${actualTab} tab. Switch to ${requestedSource} to download from there.`
      };
    }

    const effectiveTab = requestedSource !== 'auto'
      ? requestedSource
      : (actualTab === 'media' || actualTab === 'replies' ? actualTab : actualTab);

    const mediaContainer = findFeedContainer(effectiveTab === 'media' || effectiveTab === 'replies' ? effectiveTab : undefined);
    if (!mediaContainer) {
      isExtracting = false;
      return { success: false, error: 'No media container found on this page' };
    }

    const ctx = createScanContext(username, effectiveTab, includeForeign);

    // Initial (above-the-fold) extraction.
    scanSubtree(ctx, mediaContainer);

    // Cursor/virtualized pagination via incremental scroll.
    const scrollStats = await handleInfiniteScroll(mediaContainer, ctx.mediaMap, limit, { ctx });

    const postMetadata = buildMetadataArray(ctx);
    const mediaArray = Array.from(ctx.mediaMap.values());

    // Filter out invalid URLs.
    const validMedia = mediaArray.filter(item => {
      const url = item.url;
      if (!url || !url.startsWith('http')) return false;
      if (url.startsWith('data:') || url.startsWith('blob:')) return false;
      return isValidMediaPattern(url);
    });

    // Already deduped by origin+pathname in upsertMedia (keeping the
    // highest-resolution variant); re-key defensively.
    const seen = new Set();
    const deduplicatedMedia = [];
    for (const item of validMedia) {
      const key = normalizeDedupKey(item.url);
      if (seen.has(key)) continue;
      seen.add(key);
      deduplicatedMedia.push(item);
    }

    // Apply limit if specified.
    let finalMedia = deduplicatedMedia;
    if (limit && deduplicatedMedia.length > limit) {
      finalMedia = deduplicatedMedia.slice(0, limit);
    }

    const truncated = !!scrollStats.loginWall;
    const baseResult = {
      success: true,
      count: finalMedia.length,
      username,
      urls: finalMedia,
      mediaItems: finalMedia,
      metadata: postMetadata,
      limit,
      source_tab: effectiveTab,
      actualTab,
      stats: {
        scanned: ctx.stats.scanned,
        kept: ctx.stats.kept,
        skippedAvatar: ctx.stats.skippedAvatar,
        skippedForeign: ctx.stats.skippedForeign,
        skippedInvalid: ctx.stats.skippedInvalid,
        scrolls: scrollStats.scrolls,
        loginWall: scrollStats.loginWall
      },
      truncated,
      truncatedMessage: truncated
        ? 'Threads asked to log in before showing more posts — only visible media was collected.'
        : null
    };

    // Release heavy aggregates early (memory efficiency).
    ctx.postMap.clear();

    if (prepareOnly) {
      isExtracting = false;
      return baseResult;
    }

    // Send to background script for downloading (legacy direct path).
    if (finalMedia.length > 0 && extApi && extApi.runtime) {
      try {
        await extApi.runtime.sendMessage({
          action: 'downloadMedia',
          mediaItems: finalMedia,
          username,
          metadata: postMetadata,
          source_tab: effectiveTab
        });
      } catch (err) { /* popup may handle queueing instead */ }
    }

    isExtracting = false;
    return baseResult;
  } catch (error) {
    isExtracting = false;
    return { success: false, error: error.message };
  }
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

if (extApi && extApi.runtime && extApi.runtime.onMessage) {
  extApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'extractMedia') {
      if (isExtracting) {
        sendResponse({ success: false, error: 'Already extracting' });
        return;
      }

      const limit = message.limit || null; // null means all, otherwise number
      const prepareOnly = !!message.prepareOnly;
      const usernameOverride = message.usernameOverride || null;
      const sourceTab = message.sourceTab || message.source_tab || 'auto';
      const includeForeign = !!message.includeForeign;
      extractAllMedia(limit, prepareOnly, usernameOverride, { sourceTab, includeForeign }).then(result => {
        sendResponse(result);
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });

      return true; // Keep message channel open
    } else if (message.action === 'checkPage' || message.action === 'getPageInfo') {
      sendResponse(checkPage());
      return true;
    } else if (message.action === 'checkProfilePage') {
      const page = checkPage();
      sendResponse({
        isProfilePage: page.isProfilePage,
        mediaUrl: page.mediaUrl,
        repliesUrl: page.repliesUrl,
        kind: page.kind,
        username: page.username
      });
      return true;
    } else if (message.action === 'redirectToTab') {
      redirectToTab(message.tab || 'media');
      sendResponse({ success: true });
      return true;
    } else if (message.action === 'redirectToMedia') {
      redirectToMedia();
      sendResponse({ success: true });
      return true;
    }

    return false;
  });
}

// Auto-detect if we're on a media page and show indicator
// Keep the message channel alive when the tab sleeps/hibernates mid-scan:
// the extraction result is posted back asynchronously.
function keepAliveDuringExtraction() { /* channel is held by `return true` below */ }

if (typeof window !== 'undefined' && window.location && window.location.pathname.includes('/media')) {
  // Could add a visual indicator here if needed
}

// Check for auto-redirect on page load
(async () => {
  try {
    if (isProfilePage() && extApi && extApi.storage) {
      const result = await extApi.storage.local.get(['redirectSetting']);
      if (result.redirectSetting === 'auto') {
        redirectToMedia();
      }
    }
  } catch (e) {
    // Ignore storage errors
  }
})();
