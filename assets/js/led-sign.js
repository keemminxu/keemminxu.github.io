// 사이드바 LED 전광판 — 이미지(LED_SIGN.png)의 화면 칸 위 캔버스에 도트를 직접 그린다
// 윗줄: OPEN 24 HOURS (5×7 픽셀 글꼴, 네온 점멸 — OPEN 초록 · 24 HOURS 빨강)
// 아랫줄: 강아지 몽구가 잔디 위를 왔다 갔다 산책 (가끔 냄새 맡기 · 헥헥 · 점프)
(function () {
  'use strict';

  var canvas = document.querySelector('.led-sign-screen');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  // 도트 격자 — 캔버스 칸(원본 1841×679px) 비율에 맞춘 92×34칸, 바깥 1칸은 검은 테두리
  var GRID_X = 92, GRID_Y = 34, MARGIN = 1;
  var COLS = GRID_X - MARGIN * 2, ROWS = GRID_Y - MARGIN * 2;
  var LINE1_TOP = 2;

  var BG = '#060606', UNLIT = '#262626';
  var UNLIT_RGB = [38, 38, 38], SPARK_RGB = [255, 232, 224];
  var GREEN_RGB = [60, 255, 106], RED_RGB = [255, 59, 48];

  function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  function mix(a, b, t) {
    return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
  }

  // ── 윗줄 네온 — 예전 네온 간판과 같은 3.6초 박자 (치직 스터터 → 켜짐 → 소등) 이되,
  //    꺼질 때도 어둑하게 남기고 켜진 동안은 숨 쉬듯 밝기가 오르내리며 도트가 반짝인다
  var BLINK_MS = 3600, DIM = 0.3;
  var SPARK_MS = 320, SPARK_PER_SEC = 6; // 켜진 동안 초당 반짝임 수 — 동시에 2개 안팎

  function neonLevel(t) {
    var p = (t % BLINK_MS) / BLINK_MS;
    if (p < 0.04) return DIM;
    if (p < 0.06) return 1;
    if (p < 0.09) return DIM;
    if (p < 0.52) return 0.9 + 0.1 * Math.cos((p - 0.09) / 0.43 * Math.PI * 4);
    if (p < 0.62) return 1 - (1 - DIM) * (p - 0.52) / 0.1;
    return DIM;
  }

  var FONT5x7 = {
    'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'N': ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    ' ': ['.', '.', '.', '.', '.', '.', '.']
  };
  // 윗줄 점등 도트 [row, col, rgb] — 앞 4글자(OPEN)는 초록, 나머지는 빨강
  var line1Dots = [];
  var line1Map = {};
  (function buildLine1() {
    var text = 'OPEN 24 HOURS';
    var width = 0;
    for (var i = 0; i < text.length; i++) width += FONT5x7[text.charAt(i)][0].length + (i < text.length - 1 ? 1 : 0);
    var x = Math.floor((COLS - width) / 2);
    for (var j = 0; j < text.length; j++) {
      var glyph = FONT5x7[text.charAt(j)];
      var color = j < 4 ? GREEN_RGB : RED_RGB;
      for (var r = 0; r < 7; r++) {
        for (var c = 0; c < glyph[r].length; c++) {
          if (glyph[r].charAt(c) !== '#') continue;
          var dot = [LINE1_TOP + r, x + c, color];
          line1Dots.push(dot);
          line1Map[(LINE1_TOP + r) * GRID_X + x + c] = dot;
        }
      }
      x += glyph[0].length + 1;
    }
  })();

  // ── 아랫줄: 몽구 (셸티) — 오른쪽을 보는 원본, 왼쪽으로 걸을 땐 좌우 반전 ──
  // o 세이블 · d 진한 세이블(귀·등) · w 흰 털 · p 혀 · h 하트
  var DOG_RGB = { o: [255, 178, 30], d: [255, 110, 20], w: [255, 240, 218], p: [255, 100, 140], h: [255, 80, 130] };
  var BODY = [
    '.............d..d.....',
    '............dd.dd.....',
    '...........oooooo.....',
    'ww.........ooooooo....',
    'ooo........oooo.ooo...',
    '.ooo.......oooooooww..',
    '..oo.....wwwooooww....',
    '..oddddddwwwwwwww.....',
    '..ooooooowwwwwww......',
    '..oooooooowwwww.......',
    '...ooooooowwww........'
  ];
  var BODY_WAG = BODY.slice();       // 꼬리 내린 프레임 — 걸을 때 번갈아 흔든다
  BODY_WAG[3] = '...........ooooooo....';
  BODY_WAG[4] = '...........oooo.ooo...';
  BODY_WAG[5] = 'ww.........oooooooww..';
  BODY_WAG[6] = 'oooo.....wwwooooww....';
  var SNIFF = [                       // 고개 숙여 냄새 맡기
    '......................',
    '......................',
    '..............d..d....',
    'ww...........dd.dd....',
    'ooo.........oooooo....',
    '.ooo........ooooooo...',
    '..oo.....wwwoooo.ooo..',
    '..oddddddwwwwooooooww.',
    '..ooooooowwwwwwwww....',
    '..oooooooowwwww.......',
    '...ooooooowwww........'
  ];
  var SNIFF2 = SNIFF.slice();        // 코끝 킁킁
  SNIFF2[7] = '..oddddddwwwwoooooow..';
  var PANT = BODY.slice();           // 혀 내밀고 헥헥
  PANT[6] = '..oo.....wwwoooowwp...';
  var PANT2 = BODY_WAG.slice();
  PANT2[6] = 'oooo.....wwwoooowwp...';
  var LEGS = {
    stride: ['...oo......ww.........', '..oo........ww........', '..ww.........ww.......'],
    pass:   ['....oo....ww..........', '....oo....ww..........', '....ww....ww..........'],
    stand:  ['...oo.oo..ww.ww.......', '...oo.oo..ww.ww.......', '...ww.ww..ww.ww.......'],
    tuck:   ['..oo.......ww.........', '.ww.........ww........', '......................']
  };
  var HEART = ['hh.hh', 'hhhhh', '.hhh.', '..h..'];
  var DOG_W = 22, DOG_H = 14;
  var GROUND = 29;                   // 잔디 줄 (격자 행)
  var DOG_TOP = GROUND - DOG_H;      // 발이 잔디 바로 위에 닿는 위치

  function mirror(rows) { return rows.map(function (r) { return r.split('').reverse().join(''); }); }
  var FRAMES = {};
  [['walk0', BODY, 'stride'], ['walk1', BODY_WAG, 'pass'], ['sniff0', SNIFF, 'stand'], ['sniff1', SNIFF2, 'stand'],
   ['pant0', PANT, 'stand'], ['pant1', PANT2, 'stand'], ['jump', BODY, 'tuck']].forEach(function (f) {
    var rows = f[1].concat(LEGS[f[2]]);
    FRAMES[f[0]] = { 1: rows, '-1': mirror(rows) };
  });

  // 잔디 — 바닥 한 줄은 옅게, 그 위에 듬성듬성 풀잎과 작은 꽃
  var GRASS_RGB = mix(UNLIT_RGB, GREEN_RGB, 0.32), TUFT_RGB = mix(UNLIT_RGB, GREEN_RGB, 0.5);
  var groundMap = {};
  for (var gc = 0; gc < COLS; gc++) {
    groundMap[GROUND * GRID_X + gc] = GRASS_RGB;
    var k = (gc * 37 + 11) % 23;     // 고정된 듬성듬성 배치
    if (k < 3) groundMap[(GROUND - 1) * GRID_X + gc] = TUFT_RGB;
    else if (k === 7) groundMap[(GROUND - 1) * GRID_X + gc] = mix(UNLIT_RGB, [255, 226, 80], 0.55);
    else if (k === 15) groundMap[(GROUND - 1) * GRID_X + gc] = mix(UNLIT_RGB, [255, 120, 170], 0.55);
  }

  // ── 몽구 상태 — walk(걷기) · sniff · pant · jump · away(화면 밖에서 잠깐 쉬었다 방향 바꿔 돌아옴) ──
  var WALK_MS = 130, JUMP_STEP_MS = 70;
  var dog = { x: -DOG_W, dir: 1, state: 'walk', since: 0, until: 0, acc: 0, step: 0, nextEvent: 2500 };
  function setState(s, t, dur) { dog.state = s; dog.since = t; dog.until = t + dur; dog.acc = 0; }

  function updateDog(t, dt) {
    if (dog.state === 'away') {
      if (t >= dog.until) {
        dog.dir = -dog.dir;
        dog.x = dog.dir > 0 ? -DOG_W : COLS;
        setState('walk', t, 0);
        dog.nextEvent = t + 1500 + Math.random() * 2500;
      }
      return;
    }
    if (dog.state === 'walk' || dog.state === 'jump') {
      var stepMs = dog.state === 'jump' ? JUMP_STEP_MS : WALK_MS;
      dog.acc += dt;
      while (dog.acc >= stepMs) { dog.acc -= stepMs; dog.x += dog.dir; dog.step++; }
      if (dog.state === 'jump' && t >= dog.until) setState('walk', t, 0);
      if (dog.x > COLS || dog.x < -DOG_W) { setState('away', t, 1200 + Math.random() * 1800); return; }
      var inside = dog.x >= 2 && dog.x <= COLS - DOG_W - 2;
      if (dog.state === 'walk' && inside && t >= dog.nextEvent) {
        var r = Math.random();
        if (r < 0.4) setState('sniff', t, 1800);
        else if (r < 0.7) setState('pant', t, 1700);
        else setState('jump', t, 700);
        dog.nextEvent = t + 3500 + Math.random() * 4000;
      }
    } else if (t >= dog.until) {
      setState('walk', t, 0);
    }
  }

  // 현재 프레임의 아랫줄 도트 — { 칸: rgb }
  function dogDots(t) {
    var map = {};
    var name, lift = 0;
    switch (dog.state) {
      case 'away': return map;
      case 'jump':
        name = 'jump';
        lift = Math.round(3 * Math.sin(Math.PI * Math.min(1, (t - dog.since) / (dog.until - dog.since))));
        break;
      case 'sniff': name = Math.floor((t - dog.since) / 220) % 2 ? 'sniff1' : 'sniff0'; break;
      case 'pant': name = Math.floor((t - dog.since) / 180) % 2 ? 'pant1' : 'pant0'; break;
      default: name = dog.step % 2 ? 'walk1' : 'walk0';
    }
    var rows = FRAMES[name][dog.dir];
    var top = DOG_TOP - lift;
    for (var r = 0; r < rows.length; r++) {
      for (var c = 0; c < rows[r].length; c++) {
        var ch = rows[r].charAt(c), col = dog.x + c;
        if (ch === '.' || col < 0 || col >= COLS) continue;
        map[(top + r) * GRID_X + col] = DOG_RGB[ch];
      }
    }
    // 헥헥할 때 머리 위로 하트가 한 칸 떠오른다
    if (dog.state === 'pant' && t - dog.since > 300) {
      var hx = dog.x + (dog.dir > 0 ? 12 : DOG_W - 12 - HEART[0].length);
      var hy = top - HEART.length - 1 - (t - dog.since > 900 ? 1 : 0);
      for (var hr = 0; hr < HEART.length; hr++) {
        for (var hc = 0; hc < HEART[hr].length; hc++) {
          if (HEART[hr].charAt(hc) === 'h' && hx + hc >= 0 && hx + hc < COLS) map[(hy + hr) * GRID_X + hx + hc] = DOG_RGB.h;
        }
      }
    }
    return map;
  }

  // ── 그리기 ──
  var px = 1, py = 1;
  function resize() {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    px = canvas.width / GRID_X;
    py = canvas.height / GRID_Y;
    draw();
  }

  var now = 0, sparkles = [];
  function draw() {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    var dw = Math.max(1, Math.round(px * 0.62)), dh = Math.max(1, Math.round(py * 0.62));
    var gw = Math.round(px), gh = Math.round(py);

    var level = still ? 1 : neonLevel(now);
    var spark = {};
    sparkles.forEach(function (s) {
      spark[s.row * GRID_X + s.col] = Math.sin(Math.PI * Math.min(1, (now - s.born) / SPARK_MS));
    });
    var bottom = dogDots(now);

    // 윗줄 번짐 — 칸보다 넓게 옅게 겹쳐 칠해 글자 주변이 은은하게 빛난다
    ctx.globalAlpha = 0.07 * level * level;
    line1Dots.forEach(function (d) {
      ctx.fillStyle = rgb(d[2]);
      ctx.fillRect(Math.round((d[1] + MARGIN - 0.6) * px), Math.round((d[0] + MARGIN - 0.6) * py), Math.round(px * 2.2), Math.round(py * 2.2));
    });
    ctx.globalAlpha = 1;

    for (var row = 0; row < ROWS; row++) {
      var y = Math.round((row + MARGIN) * py + (py - dh) / 2);
      for (var col = 0; col < COLS; col++) {
        var x = Math.round((col + MARGIN) * px + (px - dw) / 2);
        var key = row * GRID_X + col, base = null, dot = null, glow = 0.28;
        var neon = line1Map[key];
        if (neon) {
          var s = spark[key] || 0;
          base = neon[2];
          dot = s ? mix(base, SPARK_RGB, s * 0.85) : mix(UNLIT_RGB, base, level);
          glow = 0.28 * level + 0.3 * s;
        } else if (bottom[key] || groundMap[key]) {
          base = dot = bottom[key] || groundMap[key];
          if (!bottom[key]) glow = 0.12; // 잔디는 번짐도 약하게
        }
        if (base) {
          // 번짐 — 칸 전체를 옅게 칠한 뒤 점을 또렷하게
          ctx.globalAlpha = glow;
          ctx.fillStyle = rgb(base);
          ctx.fillRect(Math.round((col + MARGIN) * px), Math.round((row + MARGIN) * py), gw, gh);
          ctx.globalAlpha = 1;
          ctx.fillStyle = rgb(dot);
        } else {
          ctx.fillStyle = UNLIT;
        }
        ctx.fillRect(x, y, dw, dh);
      }
    }
  }

  // ── 애니메이션 — 25fps. 화면 밖이거나 동작 줄이기 설정이면 멈춤 (멈춤 화면: 가운데 선 몽구 + 켜진 네온) ──
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still) { dog.x = Math.floor((COLS - DOG_W) / 2); dog.state = 'sniff'; dog.since = 0; dog.until = Infinity; }
  var visible = true, lastDraw = 0, sparkDebt = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!visible || ts - lastDraw < 40) return;
    var dt = Math.min(ts - lastDraw, 200); // 탭 복귀처럼 크게 비면 순간이동하지 않게
    lastDraw = ts;
    now = ts;
    updateDog(ts, dt);
    sparkles = sparkles.filter(function (s) { return ts - s.born < SPARK_MS; });
    // 프레임 수와 무관하게 초당 SPARK_PER_SEC 개 (간격은 들쭉날쭉하게)
    if (neonLevel(ts) > 0.85) {
      sparkDebt += dt / 1000 * SPARK_PER_SEC * (0.4 + Math.random() * 1.2);
      while (sparkDebt >= 1) {
        var d = line1Dots[Math.floor(Math.random() * line1Dots.length)];
        sparkles.push({ row: d[0], col: d[1], born: ts });
        sparkDebt -= 1;
      }
    }
    draw();
  }

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; }).observe(canvas);
  }

  resize();
  if (!still) requestAnimationFrame(loop);
})();
