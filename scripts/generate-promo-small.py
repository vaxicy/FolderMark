"""Generate FolderMark small promo tile (440x280).

Visual style mirrors the large promo (promo-marquee-1400x560-cn-en.png):
top orange strip, folder-icon + wordmark, brown/orange typography,
pill feature cards, popup mock with 2x2 stats grid and colored folder rows,
plus an overlapping "77% colored" badge.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "store-assets-real-cn-en" / "promo-small-440x280-cn-en.png"
OUT.parent.mkdir(parents=True, exist_ok=True)

# the real extension icon (two-tone amber folder, transparent background)
ICON = Image.open(ROOT / "icons" / "icon128.png").convert("RGBA")


def paste_icon(img, x, y, size):
    """Paste the real FolderMark icon so the logo matches the large promo."""
    ic = ICON.resize((size, size), Image.LANCZOS)
    img.paste(ic, (int(x), int(y)), ic)

# palette sampled from the existing store assets
COLORS = {
    "bg": "#FFF9E6",
    "bg_right": "#FDEEB8",
    "orange": "#E07700",
    "orange_soft": "#FFB84D",
    "brown": "#743112",
    "brown_soft": "#A0521D",
    "amber": "#F6CF5B",
    "green": "#109A60",
    "blue": "#3B82F6",
    "gray": "#9CA3AF",
    "white": "#FFFFFF",
    "border": "#E6CFA0",
    "search_bg": "#FFF7DC",
    "stat_bg": "#FFF4C8",
    "shadow": "#EAD9A8",
}


def font(size, bold=False):
    candidates = []
    if bold:
        candidates += [
            Path("C:/Windows/Fonts/msyhbd.ttc"),
            Path("C:/Windows/Fonts/simhei.ttf"),
        ]
    candidates += [
        Path("C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/simhei.ttf"),
        Path("C:/Windows/Fonts/simsun.ttc"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


F = {
    "logo": font(24, bold=True),
    "heading": font(18, bold=True),
    "en_sub": font(11, bold=True),
    "feat_zh": font(11, bold=True),
    "feat_en": font(9),
    "pill": font(11, bold=True),
    "pill_en": font(8),
    "mock_title": font(13, bold=True),
    "mock_sub": font(8),
    "search": font(8),
    "stat_num": font(13, bold=True),
    "stat_label": font(8),
    "row_name": font(9),
    "row_count": font(9, bold=True),
    "badge_num": font(13, bold=True),
    "badge_label": font(9),
}


def text_center(draw, cx, y, value, f, fill):
    w = draw.textbbox((0, 0), value, font=f)[2]
    draw.text((cx - w / 2, y), value, fill=fill, font=f)


def tw(draw, value, f):
    return draw.textbbox((0, 0), value, font=f)[2]


def fit_font(draw, value, max_size, max_w, bold=False, min_size=7):
    """Largest font size that keeps `value` inside max_w — prevents overflow."""
    for size in range(max_size, min_size - 1, -1):
        f = font(size, bold=bold)
        if tw(draw, value, f) <= max_w:
            return f
    return font(min_size, bold=bold)


def wrap(draw, value, f, max_w):
    lines, cur = [], ""
    for word in value.split():
        candidate = (cur + " " + word).strip()
        if tw(draw, candidate, f) <= max_w:
            cur = candidate
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def draw_folder_icon(draw, x, y, size, color):
    """Flat folder glyph like the large promo logo."""
    s = size
    tab_w, tab_h = s * 0.52, s * 0.24
    body_h = s * 0.68
    draw.rounded_rectangle((x, y, x + tab_w, y + tab_h + 3), radius=3, fill=color)
    draw.rounded_rectangle((x, y + tab_h - 1, x + s, y + tab_h + body_h), radius=4, fill=color)


def small_promo():
    W, H = 440, 280
    img = Image.new("RGB", (W, H), COLORS["bg"])
    draw = ImageDraw.Draw(img)
    draw.rectangle((210, 0, W, H), fill=COLORS["bg_right"])
    # top orange strip (like large promo)
    draw.rectangle((0, 0, W, 10), fill=COLORS["orange"])

    # ── Left column (copy aligned with the large promo) ──────
    lx = 18
    paste_icon(img, lx, 32, 36)
    draw.text((lx + 46, 38), "FolderMark", fill=COLORS["orange"], font=F["logo"])

    heading = "更快整理你的书签"
    draw.text((lx, 82), heading, fill=COLORS["brown"],
              font=fit_font(draw, heading, 18, 198, bold=True))
    draw.text((lx, 106), "Organize bookmarks faster", fill=COLORS["orange"], font=F["en_sub"])

    feat_zh = "颜色标记、数据统计、重复清理、失效检测"
    draw.text((lx, 128), feat_zh, fill=COLORS["brown"],
              font=fit_font(draw, feat_zh, 10, 198, bold=True))

    feat_en = "Color labels, statistics, duplicate cleanup, and broken-link checks."
    ef = font(8)
    ey = 145
    for line in wrap(draw, feat_en, ef, 198):
        draw.text((lx, ey), line, fill=COLORS["brown_soft"], font=ef)
        ey += 11

    # pill cards (same three as the large promo)
    px = lx
    for zh in ["一屏管理", "删除前备份", "本地处理"]:
        pf = fit_font(draw, zh, 10, 60, bold=True)
        pw = tw(draw, zh, pf) + 18
        draw.rounded_rectangle((px, 176, px + pw, 202), radius=7,
                               fill=COLORS["white"], outline=COLORS["brown"], width=1)
        draw.text((px + 9, 182), zh, fill=COLORS["brown"], font=pf)
        px += pw + 6

    # ── Right popup mockup (mirrors large promo: light card, orange logo) ──
    mx, my, mw, mh = 222, 30, 198, 232
    draw.rounded_rectangle((mx + 4, my + 4, mx + mw + 4, my + mh + 4), radius=10, fill=COLORS["shadow"])
    draw.rounded_rectangle((mx, my, mx + mw, my + mh), radius=10,
                           fill="#FFFDF2", outline="#EFC983", width=2)

    # header: real FolderMark icon + orange wordmark (same as large promo)
    paste_icon(img, mx + 13, my + 7, 24)
    draw.text((mx + 44, my + 8), "FolderMark", fill=COLORS["orange"], font=F["mock_title"])
    draw.text((mx + 44, my + 26), "更快整理书签", fill=COLORS["orange"], font=F["mock_sub"])

    # search bar
    sy = my + 46
    draw.rounded_rectangle((mx + 12, sy, mx + mw - 12, sy + 17), radius=5,
                           fill=COLORS["white"], outline=COLORS["border"], width=1)
    draw.text((mx + 20, sy + 4), "搜索文件夹...", fill=COLORS["brown_soft"], font=F["search"])

    # 2x2 stats grid (same four stats as large promo)
    st_y = sy + 25
    card_w = (mw - 24 - 8) // 2
    card_h = 29
    stats = [("13", "文件夹"), ("90", "书签"), ("0", "空文件夹"), ("0", "重复")]
    for i, (num, label) in enumerate(stats):
        cx = mx + 12 + (i % 2) * (card_w + 8)
        cy = st_y + (i // 2) * (card_h + 5)
        draw.rounded_rectangle((cx, cy, cx + card_w, cy + card_h), radius=6,
                               fill=COLORS["stat_bg"], outline=COLORS["border"], width=1)
        text_center(draw, cx + card_w / 2, cy + 3, num, F["stat_num"], COLORS["orange"])
        text_center(draw, cx + card_w / 2, cy + 17, label, F["stat_label"], COLORS["brown_soft"])

    # folder rows: colored dot + mini icon + name + count (4 rows like large promo)
    rows = [("导航", "3", COLORS["blue"]), ("工具", "12", COLORS["orange"]),
            ("临时", "8", COLORS["gray"]), ("AI", "15", COLORS["amber"])]
    ry = st_y + 2 * card_h + 5 + 6
    for name, count, dot in rows:
        draw.rounded_rectangle((mx + 12, ry, mx + mw - 12, ry + 17), radius=4,
                               fill=COLORS["white"], outline=COLORS["border"], width=1)
        draw.ellipse((mx + 17, ry + 6, mx + 24, ry + 13), fill=dot)
        paste_icon(img, mx + 28, ry + 3, 11)
        draw.text((mx + 43, ry + 3), name, fill=COLORS["brown"], font=F["row_name"])
        cw = tw(draw, count, F["row_count"])
        draw.text((mx + mw - 17 - cw, ry + 3), count, fill=COLORS["orange"], font=F["row_count"])
        ry += 20

    # floating "77% 已着色" chip (echoes the large promo stats card)
    bx, by, bw, bh = 306, 244, 92, 26
    draw.rounded_rectangle((bx + 3, by + 3, bx + bw + 3, by + bh + 3), radius=7, fill=COLORS["shadow"])
    draw.rounded_rectangle((bx, by, bx + bw, by + bh), radius=7,
                           fill=COLORS["white"], outline=COLORS["border"], width=2)
    draw.text((bx + 10, by + bh / 2), "77%", fill=COLORS["green"], font=F["badge_num"], anchor="lm")
    draw.text((bx + 50, by + bh / 2), "已着色", fill=COLORS["brown"], font=F["badge_label"], anchor="lm")

    img.save(OUT)
    print(f"Saved {OUT}")


if __name__ == "__main__":
    small_promo()
