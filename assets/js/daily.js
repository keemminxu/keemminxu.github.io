// daily 일기 피드 — Blog Supabase의 daily_logs를 최신순으로 페이징 렌더.
// 읽기 전용(anon). 작성/삭제는 daily-compose.js(관리자 로그인) 또는 Discord #코멘트 ↔ 비서 봇.
// image_urls 가 있으면 1장은 단일 이미지, 2장 이상은 scroll-snap 캐러셀로 표시.
document.addEventListener('DOMContentLoaded', function () {
  var page = document.querySelector('.daily-page');
  if (!page) return;

  var SUPABASE_URL = page.dataset.supabaseUrl;
  var SUPABASE_KEY = page.dataset.supabaseKey;
  if (!SUPABASE_URL || !SUPABASE_KEY) return;

  var API = SUPABASE_URL + '/rest/v1/daily_logs';
  var PER_PAGE = 10;
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];

  var feed = document.getElementById('daily-feed');
  var pager = document.getElementById('daily-pager');
  var prevBtn = document.getElementById('daily-prev');
  var nextBtn = document.getElementById('daily-next');
  var pageInfo = document.getElementById('daily-pageinfo');

  var current = 0;       // 0-based page
  var totalPages = 1;

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, '&quot;');
  }

  // 첫 사진 URL 의 '#r=WxH' 프래그먼트 → 프레임 비율(4:5 ~ 16:9 로 clamp). 없으면 4:3.
  function parseRatio(url) {
    var m = /#r=(\d+)x(\d+)$/.exec(url || '');
    if (!m || !+m[1] || !+m[2]) return 4 / 3;
    return Math.min(16 / 9, Math.max(4 / 5, m[1] / m[2]));
  }

  function imgLink(url) {
    var u = escapeAttr(url);
    return '<a href="' + u + '" target="_blank" rel="noopener">'
      + '<img src="' + u + '" alt="" loading="lazy" decoding="async"></a>';
  }

  function renderMedia(urls) {
    urls = (urls || []).filter(function (u) { return /^https:\/\//.test(u); });
    if (urls.length === 0) return '';
    var ratio = parseRatio(urls[0]).toFixed(4);
    if (urls.length === 1) {
      return '<div class="daily-media" style="aspect-ratio:' + ratio + '">' + imgLink(urls[0]) + '</div>';
    }
    return '<div class="daily-carousel" style="aspect-ratio:' + ratio + '">'
      + '<div class="daily-carousel-track">'
      + urls.map(function (u) { return '<div class="daily-carousel-slide">' + imgLink(u) + '</div>'; }).join('')
      + '</div>'
      + '<button type="button" class="daily-carousel-btn is-prev" aria-label="이전 사진" disabled>◀</button>'
      + '<button type="button" class="daily-carousel-btn is-next" aria-label="다음 사진">▶</button>'
      + '<span class="daily-carousel-count">1 / ' + urls.length + '</span>'
      + '</div>';
  }

  function initCarousels() {
    Array.prototype.forEach.call(feed.querySelectorAll('.daily-carousel'), function (box) {
      var track = box.querySelector('.daily-carousel-track');
      var prev = box.querySelector('.is-prev');
      var next = box.querySelector('.is-next');
      var count = box.querySelector('.daily-carousel-count');
      var total = track.children.length;

      function sync() {
        var idx = Math.round(track.scrollLeft / (track.clientWidth || 1));
        count.textContent = (idx + 1) + ' / ' + total;
        prev.disabled = idx <= 0;
        next.disabled = idx >= total - 1;
      }
      prev.addEventListener('click', function () { track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' }); });
      next.addEventListener('click', function () { track.scrollBy({ left: track.clientWidth, behavior: 'smooth' }); });
      track.addEventListener('scroll', sync, { passive: true });
    });
  }

  // created_at(타임존 포함)을 Asia/Seoul 기준 "2026.06.19 (목) 16:48" 로
  function formatHeader(iso) {
    var d = new Date(iso);
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short'
    }).formatToParts(d);
    var p = {};
    parts.forEach(function (x) { p[x.type] = x.value; });
    // 요일은 KST 기준으로 다시 계산
    var kst = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    var dow = DOW[kst.getDay()];
    return p.year + '.' + p.month + '.' + p.day + ' (' + dow + ') ' + p.hour + ':' + p.minute;
  }

  function render(entries) {
    if (entries.length === 0) {
      feed.innerHTML = '<p class="daily-empty">아직 일기가 없습니다.</p>';
      return;
    }
    feed.innerHTML = entries.map(function (e) {
      var body = escapeHtml(e.content || '').replace(/\n/g, '<br>');
      return '<article class="daily-entry" data-id="' + escapeAttr(String(e.id)) + '">'
        + '<div class="daily-entry-head">&gt; ' + formatHeader(e.created_at) + ' <span class="daily-rule"></span>'
        + '<button type="button" class="daily-entry-del" aria-label="이 일기 삭제">del</button></div>'
        + (body ? '<div class="daily-entry-body">' + body + '</div>' : '')
        + renderMedia(e.image_urls)
        + '</article>';
    }).join('');
    initCarousels();
  }

  function updatePager() {
    if (totalPages <= 1) { pager.hidden = true; return; }
    pager.hidden = false;
    pageInfo.textContent = (current + 1) + ' / ' + totalPages;
    prevBtn.disabled = current <= 0;
    nextBtn.disabled = current >= totalPages - 1;
  }

  function load(pageIdx) {
    var from = pageIdx * PER_PAGE;
    var to = from + PER_PAGE - 1;
    feed.innerHTML = '<p class="daily-loading">불러오는 중…</p>';
    fetch(API + '?order=created_at.desc&select=*', {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Range-Unit': 'items',
        'Range': from + '-' + to,
        'Prefer': 'count=exact'
      }
    })
      .then(function (res) {
        if (!res.ok && res.status !== 206) throw new Error('load failed');
        var range = res.headers.get('Content-Range') || '';
        var total = parseInt(range.split('/')[1], 10);
        if (!isNaN(total)) totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
        return res.json();
      })
      .then(function (entries) {
        // 마지막 페이지의 유일한 글을 삭제한 경우 → 앞 페이지로
        if (entries.length === 0 && pageIdx > 0) { load(pageIdx - 1); return; }
        current = pageIdx;
        render(entries);
        updatePager();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch(function () {
        feed.innerHTML = '<p class="daily-empty">일기를 불러오지 못했습니다.</p>';
        pager.hidden = true;
      });
  }

  prevBtn.addEventListener('click', function () { if (current > 0) load(current - 1); });
  nextBtn.addEventListener('click', function () { if (current < totalPages - 1) load(current + 1); });

  // daily-compose.js 가 게시/삭제 후 피드를 갱신할 때 사용
  window.dailyFeed = {
    reload: function () { load(0); },
    reloadCurrent: function () { load(current); }
  };

  load(0);
});
