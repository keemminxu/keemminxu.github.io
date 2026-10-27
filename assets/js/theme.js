// 테마 전환 — html[data-theme] 토글 + localStorage 저장.
// 첫 페인트 전 초기값은 head.html 인라인 스크립트가 지정한다 (기본 light).
// [data-theme-set="dark|light"] 버튼은 해당 테마로, [data-theme-toggle] 버튼은 반대 테마로 바꾼다.
(function () {
  'use strict';
  var KEY = 'theme';
  var root = document.documentElement;

  function current() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function sync() {
    var theme = current();
    var buttons = document.querySelectorAll('[data-theme-set]');
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-theme-set') === theme ? 'true' : 'false');
    });
    var toggles = document.querySelectorAll('[data-theme-toggle]');
    Array.prototype.forEach.call(toggles, function (btn) {
      btn.setAttribute('aria-label', theme === 'dark' ? '라이트 테마로 전환' : '다크 테마로 전환');
    });
  }

  function set(theme) {
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY, theme); } catch (_) {}
    sync();
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-theme-set], [data-theme-toggle]');
    if (!btn) return;
    if (btn.hasAttribute('data-theme-toggle')) {
      set(current() === 'dark' ? 'light' : 'dark');
    } else {
      set(btn.getAttribute('data-theme-set') === 'dark' ? 'dark' : 'light');
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sync);
  } else {
    sync();
  }
})();
