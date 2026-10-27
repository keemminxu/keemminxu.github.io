#!/usr/bin/env python3
"""블로그 웹폰트 서브셋 생성 — 제목(차이 활짝체 Bold), 본문 도트 폰트(Terrarum Sans Bitmap), 화면 틀 보조 기호.

제목·본문 원본 폰트는 저장소에 넣지 않는다(수 MB). 원본 경로를 인자로 받아 woff2 서브셋을 assets/fonts 에 쓴다.
글리프 디자인은 건드리지 않고 쓰는 글자만 남긴다.

  python scripts/subset_fonts.py --title <ChaiHwaljjak-Bold.otf> --content <TerrarumSansBitmap.otf> --symbols

글자 범위
  제목: KS X 1001 한글 2350자 + 라틴·구두점·기호 + 사이트(글·페이지)에 실제 쓰인 모든 글자
        → 새 글 제목에 2350자 밖의 글자가 생기면 이 스크립트를 다시 돌린다 (안 돌리면 그 글자만 시스템 폰트)
  본문: 위 글자 + 현대 한글 11172자 전부 (도트 외곽선이라 전부 넣어도 100KB 남짓)
  보조 기호(--symbols): 위 글자 중 화면 틀 폰트(Neo둥근모 Pro)에 없고 HBIOS-SYS 에 있는 것 (← ↑ → ※ ✓ 등)
        → 저장소의 HBIOS-SYS.ttf 에서 떼어 온다 (CC BY-SA 4.0 / OFL 1.1, 예약 이름 없음)

본문 폰트는 SIL OFL 1.1 의 예약 폰트 이름(TERRARUM) 조항 때문에 서브셋(=수정본)의 이름을 'Blog Pixel Sans'로 바꾼다.
저작권·라이선스 문구(name 0/13/14)는 그대로 남긴다.
"""

import argparse
import sys
from pathlib import Path

# Windows 콘솔(cp949)에서 한글 출력이 UnicodeEncodeError로 죽지 않도록 stdout을 UTF-8로 강제
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from fontTools import subset
from fontTools.ttLib import TTFont

BLOG_ROOT = Path(__file__).parent.parent
FONT_DIR = BLOG_ROOT / "assets" / "fonts"
TITLE_OUT = FONT_DIR / "ChaiHwaljjak" / "ChaiHwaljjak-Bold.woff2"
CONTENT_OUT = FONT_DIR / "BlogPixelSans" / "BlogPixelSans.woff2"
UI_FONT = FONT_DIR / "NeoDunggeunmo" / "NeoDunggeunmoPro-Regular.woff2"
SYMBOLS_SRC = FONT_DIR / "HBIOS-SYS" / "HBIOS-SYS.ttf"  # 홈 OG 이미지 생성(generate_home_og.py)과 같은 원본
SYMBOLS_OUT = FONT_DIR / "HBIOS-SYS" / "HBIOS-SYS-symbols.woff2"

# 사이트 글자를 모을 원본 파일 (_site 빌드 결과는 제외)
SITE_GLOBS = [
    "_posts/**/*.md", "_drafts/**/*.md", "*.md", "*.html",
    "_includes/**/*.html", "_layouts/**/*.html", "_data/**/*",
    "category/**/*.html", "_config.yml",
]

EXTRA_SYMBOLS = "←↑→↓↔↗↘⇒⇔∙√∞≈≠≤≥①②③④⑤⑥⑦⑧⑨⑩■□▲△▶▷▼▽◆◇○●★☆✓✔✕✗×÷±°™©®€₩"


def ks_x_1001_hangul():
    """EUC-KR 완성형 한글 2350자."""
    chars = set()
    for hi in range(0xB0, 0xC9):
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(bytes([hi, lo]).decode("euc-kr"))
            except UnicodeDecodeError:
                pass
    return {c for c in chars if 0xAC00 <= ord(c) <= 0xD7A3}


def site_chars():
    chars = set()
    for pattern in SITE_GLOBS:
        for path in BLOG_ROOT.glob(pattern):
            if path.is_file():
                try:
                    chars |= set(path.read_text(encoding="utf-8"))
                except (UnicodeDecodeError, OSError):
                    pass
    return {c for c in chars if ord(c) >= 0x20}


def base_charset():
    chars = ks_x_1001_hangul()
    chars |= {chr(c) for c in range(0x20, 0x7F)}       # ASCII
    chars |= {chr(c) for c in range(0xA0, 0x100)}      # Latin-1
    chars |= {chr(c) for c in range(0x2010, 0x2070)}   # 일반 구두점 (— … “” ‘’ ·)
    chars |= {chr(c) for c in range(0x3131, 0x3164)}   # 한글 호환 자모 (ㅋㅋ, ㅠ)
    chars |= set(EXTRA_SYMBOLS)
    chars |= site_chars()
    return chars


def make_subset(src, out, text, rename=None):
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]

    font = TTFont(src)
    subsetter = subset.Subsetter(options)
    subsetter.populate(text="".join(sorted(text)))
    subsetter.subset(font)
    if rename:
        rename(font)
    out.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff2"
    font.save(out)
    print(f"{out.relative_to(BLOG_ROOT)}  {len(font.getBestCmap())}자  {out.stat().st_size / 1024:.1f}KB")


def rename_content_font(font):
    # CFF 이름 길이에 따라 woff2(brotli) 크기가 최대 40KB 출렁인다 — 'BlogPixelSans-Regular'(21자)는 143KB,
    # 아래 이름은 104KB 로 실측. 이름을 바꾸면 크기를 다시 확인할 것
    family, ps_name = "Blog Pixel Sans", "BlogPixelSansBitmap-Regular"
    version = font["name"].getDebugName(5) or ""
    names = {
        1: family,
        2: "Regular",
        3: f"{version};{ps_name}",
        4: f"{family} Regular",
        6: ps_name,
        10: f"Subset of Terrarum Sans Bitmap {version} by CuriousTorvald, renamed for SIL OFL 1.1 Reserved Font Name.",
    }
    table = font["name"]
    for name_id in (16, 17, 21, 22):
        table.removeNames(nameID=name_id)
    for name_id, value in names.items():
        table.removeNames(nameID=name_id)
        table.setName(value, name_id, 3, 1, 0x409)
        table.setName(value, name_id, 1, 0, 0)
    if "CFF " in font:
        font["CFF "].cff.fontNames = [ps_name]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--title", type=Path, help="ChaiHwaljjak-Bold.otf 경로")
    parser.add_argument("--content", type=Path, help="TerrarumSansBitmap.otf 경로")
    parser.add_argument("--symbols", action="store_true", help="화면 틀 폰트에 없는 기호를 HBIOS-SYS 에서 떼어 온다")
    args = parser.parse_args()
    if not (args.title or args.content or args.symbols):
        parser.error("--title, --content, --symbols 중 하나 이상 필요")

    chars = base_charset()
    if args.title:
        make_subset(args.title, TITLE_OUT, chars)
    if args.content:
        hangul = {chr(c) for c in range(0xAC00, 0xD7A4)}
        make_subset(args.content, CONTENT_OUT, chars | hangul, rename=rename_content_font)
    if args.symbols:
        ui_cmap = TTFont(UI_FONT).getBestCmap()
        src_cmap = TTFont(SYMBOLS_SRC).getBestCmap()
        missing = {c for c in chars if ord(c) > 0x20 and ord(c) not in ui_cmap and ord(c) in src_cmap}
        print("보조 기호:", "".join(sorted(missing)))
        make_subset(SYMBOLS_SRC, SYMBOLS_OUT, missing)


if __name__ == "__main__":
    main()
