document.addEventListener('DOMContentLoaded', function() {
  var section = document.getElementById('comments');
  if (!section) return;

  var SUPABASE_URL = section.dataset.supabaseUrl;
  var SUPABASE_KEY = section.dataset.supabaseKey;
  var POST_SLUG = section.dataset.postSlug;
  if (!SUPABASE_URL || !SUPABASE_KEY || !POST_SLUG) return;
  var API = SUPABASE_URL + '/rest/v1/comments';
  var HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };

  function timeAgo(dateStr) {
    var diff = Date.now() - new Date(dateStr).getTime();
    var m = Math.floor(diff / 60000);
    if (m < 1) return '방금 전';
    if (m < 60) return m + '분 전';
    var h = Math.floor(m / 60);
    if (h < 24) return h + '시간 전';
    var d = Math.floor(h / 24);
    if (d < 30) return d + '일 전';
    return new Date(dateStr).toLocaleDateString('ko-KR');
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function loadComments() {
    var url = API + '?post_slug=eq.' + POST_SLUG + '&order=created_at.desc&select=*';
    fetch(url, { headers: HEADERS })
      .then(function(res) {
        if (!res.ok) throw new Error('댓글을 불러오지 못했습니다.');
        return res.json();
      })
      .then(function(comments) {
        var list = document.getElementById('comments-list');
        if (comments.length === 0) {
          list.innerHTML = '<p class="comments-empty">아직 댓글이 없습니다.</p>';
          return;
        }
        list.innerHTML = comments.map(function(c) {
          return '<div class="comment-item">'
            + '<div class="comment-header">'
            + '<span class="comment-author">' + escapeHtml(c.nickname) + '</span>'
            + '<span class="comment-time">' + timeAgo(c.created_at) + '</span>'
            + '</div>'
            + '<p class="comment-body">' + escapeHtml(c.content).replace(/\n/g, '<br>') + '</p>'
            + '</div>';
        }).join('');
      })
      .catch(function() {
        var list = document.getElementById('comments-list');
        list.innerHTML = '<p class="comments-empty">댓글을 불러오는 중 오류가 발생했습니다.</p>';
      });
  }

  var form = document.getElementById('comment-form');
  if (!form) return;
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var nickname = document.getElementById('comment-nickname').value.trim() || '익명';
    var content = document.getElementById('comment-content').value.trim();
    if (!content) return;

    var btn = form.querySelector('.comment-submit');
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '등록 중...';

    fetch(API, {
      method: 'POST',
      headers: Object.assign({}, HEADERS, { 'Prefer': 'return=representation' }),
      body: JSON.stringify({
        post_slug: POST_SLUG,
        nickname: nickname,
        content: content
      })
    })
    .then(function(res) {
      if (!res.ok) throw new Error('댓글 등록에 실패했습니다.');
      return res.json();
    })
    .then(function() {
      document.getElementById('comment-content').value = '';
      loadComments();
    })
    .catch(function() {
      alert('댓글 등록 중 오류가 발생했습니다. 다시 시도해주세요.');
    })
    .finally(function() {
      btn.disabled = false;
      btn.textContent = label;
    });
  });

  loadComments();
});
