// 글 목록 — 정렬(최신/오래된순) · 보기(카드/리스트) · 페이징(9개/페이지).
// 대상: .post-list 안의 post-card (카테고리·태그·전체 글 페이지). 툴바 마크업은 _includes/list-header.html.
// 페이지 상태는 #p=N 해시로 유지되어 뒤로가기/새로고침에도 남는다. 보기 방식은 localStorage에 저장.
document.addEventListener('DOMContentLoaded', function () {
  var PER_PAGE = 9;
  var VIEW_KEY = 'postlist_view';
  var list = document.querySelector('.post-list');
  if (!list) return;

  var cards = Array.prototype.filter.call(list.children, function (node) {
    return node.classList && node.classList.contains('post-card');
  });

  // ── 보기 방식 (grid ↔ list) ──
  var viewBtns = document.querySelectorAll('[data-list-view]');

  function setView(view, save) {
    list.classList.toggle('is-list', view === 'list');
    Array.prototype.forEach.call(viewBtns, function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-list-view') === view ? 'true' : 'false');
    });
    if (save) {
      try { localStorage.setItem(VIEW_KEY, view); } catch (_) {}
    }
  }

  var savedView = 'grid';
  try { if (localStorage.getItem(VIEW_KEY) === 'list') savedView = 'list'; } catch (_) {}
  setView(savedView, false);
  Array.prototype.forEach.call(viewBtns, function (btn) {
    btn.addEventListener('click', function () { setView(btn.getAttribute('data-list-view'), true); });
  });

  // ── 페이징 ──
  var totalPages = Math.ceil(cards.length / PER_PAGE);
  var current = 0;
  var prevBtn = null;
  var nextBtn = null;
  var info = null;

  if (totalPages > 1) {
    var nav = document.createElement('nav');
    nav.className = 'daily-pager post-list-pager';
    nav.setAttribute('aria-label', '글 목록 페이지');

    prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'daily-pager-btn';
    prevBtn.textContent = '◀ 이전';

    info = document.createElement('span');
    info.className = 'daily-pager-info';

    nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'daily-pager-btn';
    nextBtn.textContent = '다음 ▶';

    nav.appendChild(prevBtn);
    nav.appendChild(info);
    nav.appendChild(nextBtn);
    list.parentNode.insertBefore(nav, list.nextSibling);

    prevBtn.addEventListener('click', function () { show(current - 1, true); });
    nextBtn.addEventListener('click', function () { show(current + 1, true); });
  }

  function show(idx, scroll) {
    if (totalPages <= 1) return;
    current = Math.max(0, Math.min(idx, totalPages - 1));
    cards.forEach(function (card, i) {
      card.classList.toggle('is-paged-out', Math.floor(i / PER_PAGE) !== current);
    });
    info.textContent = (current + 1) + ' / ' + totalPages;
    prevBtn.disabled = current <= 0;
    nextBtn.disabled = current >= totalPages - 1;
    if (history.replaceState) {
      history.replaceState(null, '',
        current > 0 ? '#p=' + (current + 1) : window.location.pathname + window.location.search);
    }
    if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── 정렬 — 카드에 심어둔 data-date(유닉스 초) 기준으로 DOM 순서를 바꾼다 ──
  var sortSel = document.querySelector('[data-list-sort]');
  if (sortSel) {
    sortSel.addEventListener('change', function () {
      var dir = sortSel.value === 'asc' ? 1 : -1;
      cards.sort(function (a, b) {
        return (Number(a.getAttribute('data-date')) - Number(b.getAttribute('data-date'))) * dir;
      });
      cards.forEach(function (card) { list.appendChild(card); });
      show(0, false);
    });
  }

  var m = window.location.hash.match(/^#p=(\d+)$/);
  show(m ? parseInt(m[1], 10) - 1 : 0, false);
});
