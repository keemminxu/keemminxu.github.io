#!/usr/bin/env python3
"""홈 페이지용 OG 이미지 생성 (1200×630)
왼쪽: 콘솔 일러스트(GameMode.png)의 TV 부분 + 화면 안에 「몽구랑 산책가자」 대기화면 프레임 합성
오른쪽: keem's blog.

입력: assets/images/crt/GameMode.png, scripts/og-assets/home-screen.png (게임 대기화면 캡처, 비율 1.386)
출력: assets/og/home-og.png
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

BLOG_ROOT = Path(__file__).parent.parent
FONT_PATH = BLOG_ROOT / "assets" / "fonts" / "HBIOS-SYS" / "HBIOS-SYS.ttf"
CONSOLE = BLOG_ROOT / "assets" / "images" / "crt" / "GameMode.png"
SCREEN_FRAME = BLOG_ROOT / "scripts" / "og-assets" / "home-screen.png"
OUTPUT = BLOG_ROOT / "assets" / "og" / "home-og.png"

WIDTH, HEIGHT = 1200, 630

# 블로그 다크 테마 토큰과 같은 차가운 톤 (모니터 일러스트도 블루그레이)
BG = (28, 29, 32)           # #1c1d20 (--bg)
SCANLINE = (34, 35, 39)
SHADOW = (11, 12, 14)       # #0b0c0e (--shadow)
PRIMARY = (228, 228, 234)   # #e4e4ea (--text)
ACCENT = (203, 160, 64)     # #cba040 (사이트 앰버)
MUTED = (138, 129, 119)

# GameMode.png(1856×2304) 기준 좌표 — .console-screen CSS 비율(left 23.98% / top 20.27% / w 52.26% / h 30.38%)
SRC_W, SRC_H = 1856, 2304
SCREEN = (int(SRC_W * 0.2398), int(SRC_H * 0.2027), int(SRC_W * 0.5226), int(SRC_H * 0.3038))  # x, y, w, h
TV_CROP = (215, 30, 1640, 1320)   # TV 본체 + 여백

img = Image.new("RGB", (WIDTH, HEIGHT), BG)
draw = ImageDraw.Draw(img)

# 배경 스캔라인
for y in range(0, HEIGHT, 4):
    draw.line([(0, y), (WIDTH, y)], fill=SCANLINE, width=1)

# --- 콘솔 TV + 화면 합성 (원본 해상도에서 합성 후 축소) ---
console = Image.open(CONSOLE).convert("RGBA")
frame = Image.open(SCREEN_FRAME).convert("RGB")
sx, sy, sw, sh = SCREEN
frame = frame.resize((sw, sh), Image.LANCZOS)

# CRT 스캔라인 (CSS 오버레이 느낌)
fd = ImageDraw.Draw(frame)
for y in range(0, sh, 6):
    fd.line([(0, y), (sw, y)], fill=(0, 0, 0), width=2)
frame = Image.blend(frame, Image.open(SCREEN_FRAME).convert("RGB").resize((sw, sh), Image.LANCZOS), 0.55)

# 둥근 모서리 마스크 (border-radius 7% / 11%)
mask = Image.new("L", (sw, sh), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, sw - 1, sh - 1], radius=int(sh * 0.11), fill=255)
console.paste(frame, (sx, sy), mask)

tv = console.crop(TV_CROP)
tv_h = 540
tv_w = int(tv.width * tv_h / tv.height)
tv = tv.resize((tv_w, tv_h), Image.LANCZOS)
tv_x, tv_y = 36, (HEIGHT - tv_h) // 2
img.paste(tv, (tv_x, tv_y), tv)

# --- 오른쪽 텍스트: keem's blog. 만 ---
font_title = ImageFont.truetype(str(FONT_PATH), 72)

text_x = tv_x + tv_w + 24
right_w = WIDTH - text_x - 36

title = "keem's blog."
tb = draw.textbbox((0, 0), title, font=font_title)
tw, th = tb[2] - tb[0], tb[3] - tb[1]
tx = text_x + (right_w - tw) // 2 - tb[0]
ty = (HEIGHT - th) // 2 - tb[1]
draw.text((tx + 4, ty + 4), title, font=font_title, fill=SHADOW)   # shadow
draw.text((tx, ty), title, font=font_title, fill=PRIMARY)

# 외곽 CRT 프레임 라인
draw.rectangle([18, 18, WIDTH - 18, HEIGHT - 18], outline=PRIMARY, width=3)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
img.save(OUTPUT, optimize=True)
print(f"saved {OUTPUT} ({OUTPUT.stat().st_size // 1024} KB)")
