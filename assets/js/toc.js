// 글 페이지 도구 — 플로팅 TOC(h2 중심) · 읽기 진행률(상단 바 + TOC) · 링크 복사/맨 위로 · 코드 블록 copy 버튼
document.addEventListener('DOMContentLoaded', function () {
  var content = document.querySelector('.post-content');
  if (!content) return;

  // ── TOC — h2가 3개 미만인 짧은 글은 h3까지 포함해야 목차 구실을 한다 ──
  var tocList = document.getElementById('toc-list');
  var h2s = content.querySelectorAll('h2');
  var headings = Array.prototype.slice.call(h2s.length >= 3 ? h2s : content.querySelectorAll('h2, h3'));
  var tocLinks = [];

  if (tocList) {
    headings.forEach(function (heading, index) {
      var id = heading.id || 'heading-' + index;
      heading.id = id;

      var li = document.createElement('li');
      li.className = 'toc-' + heading.tagName.toLowerCase();

      var a = document.createElement('a');
      a.href = '#' + id;
      a.textContent = heading.textContent;
      a.addEventListener('click', function (e) {
        e.preventDefault();
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (history.replaceState) history.replaceState(null, '', '#' + id);
      });

      li.appendChild(a);
      tocList.appendChild(li);
      tocLinks.push(a);
    });
  }

  // ── 읽기 진행률 + 현재 섹션 하이라이트 ──
  var barFill = document.getElementById('read-progress-fill');
  var tocFill = document.getElementById('toc-progress-fill');
  var tocText = document.getElementById('toc-progress-text');
  var ticking = false;

  function update() {
    ticking = false;
    var rect = content.getBoundingClientRect();
    var range = rect.height - window.innerHeight;
    var pct = range > 0 ? (-rect.top / range) * 100 : (rect.top < window.innerHeight ? 100 : 0);
    pct = Math.round(Math.min(100, Math.max(0, pct)));
    if (barFill) barFill.style.width = pct + '%';
    if (tocFill) tocFill.style.width = pct + '%';
    if (tocText) tocText.textContent = pct + '%';

    var current = -1;
    headings.forEach(function (heading, i) {
      if (heading.getBoundingClientRect().top <= 100) current = i;
    });
    tocLinks.forEach(function (link, i) {
      var on = i === current;
      link.classList.toggle('active', on);
      if (on) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  window.addEventListener('resize', update);
  update();

  // ── 짧은 알림 — 푸터 이메일 토스트와 문구가 섞이지 않게 별도 요소 사용 ──
  var note = null;
  var noteTimer = null;
  function notify(msg) {
    if (!note) {
      note = document.createElement('div');
      note.className = 'toast';
      note.setAttribute('role', 'status');
      document.body.appendChild(note);
    }
    note.textContent = msg;
    note.classList.add('show');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { note.classList.remove('show'); }, 2000);
  }

  function copyText(text, onDone) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onDone, function () { notify('복사에 실패했습니다'); });
    } else {
      notify('이 브라우저에서는 복사를 지원하지 않습니다');
    }
  }

  var copyLinkBtn = document.querySelector('[data-copy-link]');
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', function () {
      copyText(window.location.href.split('#')[0], function () { notify('링크를 복사했습니다'); });
    });
  }

  var topBtn = document.querySelector('[data-scroll-top]');
  if (topBtn) {
    topBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ── 하이라이터가 모르는 언어(<pre><code class="language-x">)도 같은 코드 창 구조로 감싼다 ──
  Array.prototype.forEach.call(content.querySelectorAll('pre > code[class*="language-"]'), function (code) {
    var pre = code.parentNode;
    if (pre.closest('.highlighter-rouge')) return;
    var lang = (code.className.match(/language-([\w+-]+)/) || [])[1] || 'text';
    var outer = document.createElement('div');
    outer.className = 'language-' + lang + ' highlighter-rouge';
    var inner = document.createElement('div');
    inner.className = 'highlight';
    pre.parentNode.insertBefore(outer, pre);
    inner.appendChild(pre);
    outer.appendChild(inner);
  });

  // ── 코드 블록 copy 버튼 — 타이틀바 오른쪽에 붙는다 ──
  Array.prototype.forEach.call(content.querySelectorAll('div.highlighter-rouge'), function (block) {
    var pre = block.querySelector('pre');
    if (!pre) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'window-btn code-copy';
    btn.textContent = 'copy';
    btn.setAttribute('aria-label', '코드 복사');
    btn.addEventListener('click', function () {
      copyText(pre.innerText, function () {
        btn.textContent = 'copied';
        setTimeout(function () { btn.textContent = 'copy'; }, 1500);
      });
    });
    block.appendChild(btn);
  });
});
