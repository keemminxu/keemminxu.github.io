// ---------------------------------------------------------------------------
// daily 작성/삭제 — 관리자 전용 (/daily/ 에서만 로드)
// - 인증: admin.js 의 window.blogAdmin 세션(JWT). 실제 방어선은 Supabase RLS.
// - 사진: 브라우저에서 리사이즈(JPEG 재인코딩 → EXIF 제거) 후 Storage 'daily-images' 업로드,
//         공개 URL 을 daily_logs.image_urls 에 저장. 첫 장 URL 끝의 '#r=WxH' 는 캐러셀 비율 힌트.
// - 피드 갱신은 daily.js 의 window.dailyFeed 로.
// ---------------------------------------------------------------------------

(function () {
'use strict';

const BUCKET = 'daily-images';
const MAX_IMAGES = 10;
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

function init() {
  const page = document.querySelector('.daily-page');
  const form = document.getElementById('daily-compose');
  if (!page || !form) return;

  const SUPABASE_URL = page.dataset.supabaseUrl;
  const SUPABASE_KEY = page.dataset.supabaseKey;
  if (!SUPABASE_URL || !SUPABASE_KEY) return;

  const PUBLIC_PREFIX = SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/';

  const textarea = document.getElementById('daily-compose-text');
  const fileInput = document.getElementById('daily-compose-file');
  const thumbs = document.getElementById('daily-compose-thumbs');
  const statusEl = document.getElementById('daily-compose-status');
  const submitBtn = document.getElementById('daily-compose-submit');
  const feed = document.getElementById('daily-feed');

  let attachments = [];   // { blob, width, height, previewUrl }
  let busy = false;

  function setStatus(msg, isError) {
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('is-error', !!isError);
  }

  function getSession() {
    return window.blogAdmin && window.blogAdmin.getSession();
  }

  function userIdOf(session) {
    try {
      const payload = session.accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(payload)).sub || null;
    } catch {
      return null;
    }
  }

  function authHeaders(session, extra) {
    return Object.assign({
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + session.accessToken,
    }, extra || {});
  }

  function httpError(res) {
    if (res.status === 401 || res.status === 403) {
      return new Error('로그인이 만료되었거나 권한이 없습니다. 다시 로그인하세요.');
    }
    return new Error('HTTP ' + res.status);
  }

  // ── 이미지 리사이즈 ────────────────────────────────────────────────────
  async function decode(file) {
    if (window.createImageBitmap) {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch { /* <img> 폴백 */ }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
      img.src = url;
    });
  }

  async function resizeImage(file) {
    const src = await decode(file);
    const sw = src.width || src.naturalWidth;
    const sh = src.height || src.naturalHeight;
    const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
    const width = Math.max(1, Math.round(sw * scale));
    const height = Math.max(1, Math.round(sh * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';               // 투명 PNG → JPEG 변환 시 검은 배경 방지
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(src, 0, 0, width, height);
    if (src.close) src.close();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new Error('encode failed');
    return { blob, width, height, previewUrl: URL.createObjectURL(blob) };
  }

  // ── 첨부 목록 ──────────────────────────────────────────────────────────
  function renderThumbs() {
    thumbs.innerHTML = '';
    attachments.forEach((a, i) => {
      const item = document.createElement('div');
      item.className = 'daily-compose-thumb';
      const img = document.createElement('img');
      img.src = a.previewUrl;
      img.alt = '';
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.setAttribute('aria-label', (i + 1) + '번째 사진 제거');
      del.addEventListener('click', () => {
        if (busy) return;
        URL.revokeObjectURL(a.previewUrl);
        attachments.splice(i, 1);
        renderThumbs();
      });
      item.appendChild(img);
      item.appendChild(del);
      thumbs.appendChild(item);
    });
  }

  async function addFiles(files) {
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    let skipped = 0;
    let overflow = 0;
    setStatus('사진 처리 중…');
    for (const file of images) {
      if (attachments.length >= MAX_IMAGES) { overflow += 1; continue; }
      try {
        attachments.push(await resizeImage(file));
        renderThumbs();
      } catch {
        skipped += 1;
      }
    }
    const notes = [];
    if (overflow) notes.push('최대 ' + MAX_IMAGES + '장 — ' + overflow + '장 제외');
    if (skipped) notes.push('읽을 수 없는 파일 ' + skipped + '개 건너뜀');
    setStatus(notes.join(' · '), notes.length > 0);
  }

  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = '';
  });

  textarea.addEventListener('paste', (e) => {
    const files = Array.from((e.clipboardData && e.clipboardData.files) || [])
      .filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.preventDefault();
    addFiles(files);
  });

  // ── Storage ────────────────────────────────────────────────────────────
  async function uploadOne(session, userId, blob) {
    const path = userId + '/' + crypto.randomUUID() + '.jpg';
    const res = await fetch(SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + path, {
      method: 'POST',
      headers: authHeaders(session, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=31536000' }),
      body: blob,
    });
    if (!res.ok) throw httpError(res);
    return path;
  }

  // best-effort — 롤백/삭제 공용. 실패해도 고아 파일만 남으므로 에러를 올리지 않는다.
  async function removeObjects(session, paths) {
    if (paths.length === 0) return;
    try {
      await fetch(SUPABASE_URL + '/storage/v1/object/' + BUCKET, {
        method: 'DELETE',
        headers: authHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ prefixes: paths }),
      });
    } catch { /* ignore */ }
  }

  function pathFromUrl(url) {
    const clean = String(url).split('#')[0];
    return clean.startsWith(PUBLIC_PREFIX) ? clean.slice(PUBLIC_PREFIX.length) : null;
  }

  // ── 게시 ───────────────────────────────────────────────────────────────
  async function submit() {
    if (busy) return;
    const content = textarea.value.trim();
    if (!content && attachments.length === 0) return;

    const session = getSession();
    const userId = session && userIdOf(session);
    if (!userId) {
      setStatus('로그인이 만료되었습니다. 다시 로그인하세요.', true);
      return;
    }

    busy = true;
    submitBtn.disabled = true;
    const uploaded = [];
    try {
      const urls = [];
      for (let i = 0; i < attachments.length; i++) {
        setStatus('업로드 중 ' + (i + 1) + '/' + attachments.length);
        const a = attachments[i];
        const path = await uploadOne(session, userId, a.blob);
        uploaded.push(path);
        urls.push(PUBLIC_PREFIX + path + (i === 0 ? '#r=' + a.width + 'x' + a.height : ''));
      }

      setStatus('게시 중…');
      const res = await fetch(SUPABASE_URL + '/rest/v1/daily_logs', {
        method: 'POST',
        headers: authHeaders(session, { 'Content-Type': 'application/json', 'Prefer': 'return=representation' }),
        body: JSON.stringify({ content, image_urls: urls }),
      });
      if (!res.ok) throw httpError(res);

      attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
      attachments = [];
      textarea.value = '';
      renderThumbs();
      setStatus('');
      if (window.dailyFeed) window.dailyFeed.reload();
    } catch (e) {
      await removeObjects(session, uploaded);
      setStatus('게시 실패: ' + e.message, true);
    } finally {
      busy = false;
      submitBtn.disabled = false;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });

  // ── 삭제 (피드 click 위임) ─────────────────────────────────────────────
  async function deleteEntry(id) {
    const session = getSession();
    if (!session) {
      alert('로그인이 만료되었습니다. 다시 로그인하세요.');
      return;
    }
    if (!confirm('이 일기를 삭제할까요?')) return;

    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/daily_logs?id=eq.' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: authHeaders(session, { 'Prefer': 'return=representation' }),
      });
      if (!res.ok) throw httpError(res);
      const rows = await res.json();
      // RLS 에 막히면 200 + 빈 배열이 온다
      if (rows.length === 0) throw new Error('삭제 권한이 없거나 이미 삭제된 글입니다.');

      const paths = (rows[0].image_urls || []).map(pathFromUrl).filter(Boolean);
      await removeObjects(session, paths);
      if (window.dailyFeed) window.dailyFeed.reloadCurrent();
    } catch (e) {
      alert('삭제 실패: ' + e.message);
    }
  }

  feed.addEventListener('click', (e) => {
    const btn = e.target.closest('.daily-entry-del');
    if (!btn) return;
    const entry = btn.closest('.daily-entry');
    if (entry && entry.dataset.id) deleteEntry(entry.dataset.id);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
