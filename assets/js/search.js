// 통합 검색 (search.exe) — 포스트는 search.json, daily는 Supabase REST(ilike)로 검색.
// UI는 홈에만 렌더되므로 다른 페이지에서는 요소가 없어 바로 종료된다.
document.addEventListener('DOMContentLoaded', function () {
  var box = document.querySelector('.home-search');
  var input = document.getElementById('search-input');
  var results = document.getElementById('search-results');
  if (!box || !input || !results) return;

  var SUPABASE_URL = box.dataset.supabaseUrl || '';
  var SUPABASE_KEY = box.dataset.supabaseKey || '';

  var posts = null;          // search.json 인덱스
  var indexPromise = null;   // in-flight 로드 캐시 — 중복 fetch 방지
  var seq = 0;               // close()/새 검색 때 증가 — 늦은 응답 무효화
  var timer;

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch('/search.json')
        .then(function (r) { return r.json(); })
        .then(function (data) { posts = data; })
        .catch(function (err) {
          console.log('search index load failed:', err);
          indexPromise = null; // 다음 검색에서 재시도
        });
    }
    return indexPromise;
  }
  input.addEventListener('focus', function () { loadIndex(); });

  // '/' 단축키로 검색창 포커스 (다른 입력 중일 땐 무시)
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var el = document.activeElement;
    if (el === input) return;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    e.preventDefault();
    input.focus();
  });

  function makeSnippet(text, q, span) {
    var idx = text.toLowerCase().indexOf(q);
    if (idx < 0) return text.slice(0, span * 2) + (text.length > span * 2 ? '…' : '');
    var start = Math.max(0, idx - span);
    var end = Math.min(text.length, idx + q.length + span);
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  }

  function searchPosts(q) {
    if (!posts) return [];
    return posts.filter(function (p) {
      return (p.title || '').toLowerCase().indexOf(q) >= 0
        || (p.title_en || '').toLowerCase().indexOf(q) >= 0
        || (p.tags || []).some(function (t) { return t.toLowerCase().indexOf(q) >= 0; })
        || (p.excerpt || '').toLowerCase().indexOf(q) >= 0
        || (p.content || '').toLowerCase().indexOf(q) >= 0;
    }).slice(0, 5);
  }

  function searchSupabase(table, q) {
    if (!SUPABASE_URL || !SUPABASE_KEY) return Promise.resolve([]);
    // PostgREST 예약 문자는 공백으로, LIKE 와일드카드(% _ \)는 백슬래시 이스케이프
    // (공백 치환하면 스네이크케이스 검색어가 깨진다)
    var safe = q.replace(/[,()"'*]/g, ' ')
      .replace(/([\\%_])/g, '\\$1')
      .replace(/\s+/g, ' ')
      .trim();
    if (!safe) return Promise.resolve([]);
    var url = SUPABASE_URL + '/rest/v1/' + table
      + '?select=content,created_at&order=created_at.desc&limit=3'
      + '&content=ilike.' + encodeURIComponent('*' + safe + '*');
    return fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
    })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; });
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(d).replace(/-/g, '.');
  }

  function addFeedGroup(label, href, entries, q) {
    if (!entries.length) return;
    results.appendChild(el('div', 'search-group-label', label));
    entries.forEach(function (entry) {
      var a = el('a', 'search-item');
      a.href = href;
      a.appendChild(el('div', 'search-item-snippet', makeSnippet(entry.content || '', q, 40)));
      a.appendChild(el('div', 'search-item-date', formatDate(entry.created_at)));
      results.appendChild(a);
    });
  }

  function render(q, postHits, dailyHits) {
    // 재렌더 전 ↑↓로 고른 항목을 기억해뒀다가 같은 항목이 있으면 선택 복원
    var prevActive = results.querySelector('.search-item.is-active');
    var prevHref = prevActive ? prevActive.getAttribute('href') : null;

    results.innerHTML = '';
    if (postHits.length + dailyHits.length === 0) {
      results.appendChild(el('div', 'search-empty', '검색 결과가 없습니다.'));
      results.classList.add('is-open');
      return;
    }
    if (postHits.length) {
      results.appendChild(el('div', 'search-group-label', 'posts'));
      postHits.forEach(function (p) {
        var a = el('a', 'search-item');
        a.href = p.url;
        a.appendChild(el('div', 'search-item-title', p.title));
        // 제목 매치가 아닐 때만 본문 스니펫을 보여준다
        if ((p.title || '').toLowerCase().indexOf(q) < 0 && p.content) {
          a.appendChild(el('div', 'search-item-snippet', makeSnippet(p.content, q, 40)));
        }
        a.appendChild(el('div', 'search-item-date', p.date));
        results.appendChild(a);
      });
    }
    addFeedGroup('daily', '/daily/', dailyHits, q);

    if (prevHref) {
      var items = results.querySelectorAll('.search-item');
      for (var i = 0; i < items.length; i++) {
        if (items[i].getAttribute('href') === prevHref) {
          items[i].classList.add('is-active');
          break;
        }
      }
    }
    results.classList.add('is-open');
  }

  function close() {
    seq++;               // in-flight 응답 무효화
    clearTimeout(timer); // 대기 중인 디바운스 타이머 취소
    results.classList.remove('is-open');
    results.innerHTML = '';
  }

  input.addEventListener('input', function () {
    clearTimeout(timer);
    var q = input.value.trim().toLowerCase();
    if (q.length < 2) { close(); return; }
    timer = setTimeout(function () {
      var my = ++seq;
      Promise.all([
        // 인덱스 로드가 끝난 뒤 포스트를 검색해야 첫 검색에서 결과가 빠지지 않는다
        loadIndex().then(function () { return searchPosts(q); }).catch(function () { return []; }),
        searchSupabase('daily_logs', q)
      ]).then(function (r) {
        if (my !== seq) return;
        render(q, r[0], r[1]);
      });
    }, 250);
  });

  // 키보드 내비게이션 — ↑↓로 이동, Enter로 열기, Esc로 닫기
  input.addEventListener('keydown', function (e) {
    // 한글 IME 조합 확정 Enter/방향키 무시 (macOS Chrome: isComposing, Safari: keyCode 229)
    if (e.isComposing || e.keyCode === 229) return;
    var items = results.querySelectorAll('.search-item');
    if (e.key === 'Escape') { close(); input.blur(); return; }
    if (!items.length) return;
    var active = results.querySelector('.search-item.is-active');
    var idx = Array.prototype.indexOf.call(items, active);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      idx = e.key === 'ArrowDown' ? Math.min(idx + 1, items.length - 1) : Math.max(idx - 1, 0);
      if (active) active.classList.remove('is-active');
      items[idx].classList.add('is-active');
      items[idx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      var target = active || items[0];
      if (target) { e.preventDefault(); window.location.href = target.href; }
    }
  });

  document.addEventListener('click', function (e) {
    if (!box.contains(e.target)) close();
  });
});
