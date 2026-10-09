"""Generate FolderMark large promo tile (1400x560).

Same visual system as the small promo: top orange strip, left logo + copy +
pill cards, and a layered popup composition (two popups + a floating
"数据统计" card). All blocks are laid out to stay inside the canvas with a
safe bottom margin (>= 12px).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "store-assets-real-cn-en" / "promo-marquee-1400x560-cn-en.png"
ICON = Image.open(ROOT / "icons" / "icon128.png").convert("RGBA")

COLORS = {
    "bg": "#FFF9E6",
    "bg_right": "#FDEEB8",
    "orange": "#E07700",
    "brown": "#743112",
    "brown_soft": "#A0521D",
    "amber": "#F6CF5B",
    "green": "#109A60",
    "blue": "#3B82F6",
    "gray": "#9CA3AF",
    "white": "#FFFFFF",
    "border": "#E6CFA0",
    "stat_bg": "#FFF4C8",
    "card": "#FFFDF2",
    "card_border": "#EFC983",
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


def tw(draw, value, f):
    return draw.textbbox((0, 0), value, font=f)[2]


def fit_font(draw, value, max_size, max_w, bold=False, min_size=8):
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


def paste_icon(img, x, y, size):
    ic = ICON.resize((size, size), Image.LANCZOS)
    img.paste(ic, (int(x), int(y)), ic)


def popup_card(img, draw, x, y, w, h, rows):
    """Popup mockup: header, search bar, 2x2 stats grid, folder rows."""
    draw.rounded_rectangle((x + 6, y + 6, x + w + 6, y + h + 6), radius=14, fill=COLORS["shadow"])
    draw.rounded_rectangle((x, y, x + w, y + h), radius=14,
                           fill=COLORS["card"], outline=COLORS["card_border"], width=3)

    pad = 18
    # header
    paste_icon(img, x + pad, y + pad, 40)
    draw.text((x + pad + 50, y + pad - 2), "FolderMark", fill=COLORS["orange"], font=font(24, bold=True))
    draw.text((x + pad + 50, y + pad + 30), "更快整理书签", fill=COLORS["orange"], font=font(14))

    # search bar
    sy = y + pad + 60
    draw.rounded_rectangle((x + pad, sy, x + w - pad, sy + 40), radius=8,
                           fill=COLORS["white"], outline=COLORS["border"], width=2)
    draw.text((x + pad + 16, sy + 10), "搜索文件夹...", fill=COLORS["brown_soft"], font=font(15))

    # 2x2 stats grid
    st_y = sy + 54
    gap = 10
    card_w = (w - pad * 2 - gap) // 2
    card_h = 70
    stats = [("13", "文件夹"), ("90", "书签"), ("0", "空文件夹"), ("0", "重复")]
    for i, (num, label) in enumerate(stats):
        cx = x + pad + (i % 2) * (card_w + gap)
        cy = st_y + (i // 2) * (card_h + gap)
        draw.rounded_rectangle((cx, cy, cx + card_w, cy + card_h), radius=9,
                               fill=COLORS["stat_bg"], outline=COLORS["border"], width=2)
        nf = font(26, bold=True)
        draw.text((cx + card_w / 2 - tw(draw, num, nf) / 2, cy + 8), num,
                  fill=COLORS["orange"], font=nf)
        lf = font(14)
        draw.text((cx + card_w / 2 - tw(draw, label, lf) / 2, cy + 42), label,
                  fill=COLORS["brown_soft"], font=lf)

    # folder rows: colored dot + mini icon + name + count
    ry = st_y + 2 * card_h + gap + 16
    for name, count, dot in rows:
        draw.rounded_rectangle((x + pad, ry, x + w - pad, ry + 36), radius=8,
                               fill=COLORS["white"], outline=COLORS["border"], width=2)
        draw.ellipse((x + pad + 12, ry + 12, x + pad + 24, ry + 24), fill=dot)
        paste_icon(img, x + pad + 32, ry + 8, 20)
        draw.text((x + pad + 60, ry + 9), name, fill=COLORS["brown"], font=font(16))
        cf = font(16, bold=True)
        draw.text((x + w - pad - 14 - tw(draw, count, cf), ry + 9), count,
                  fill=COLORS["orange"], font=cf)
        ry += 42


def stats_card(draw, x, y, w, h):
    """Floating 数据统计 card."""
    draw.rounded_rectangle((x + 6, y + 6, x + w + 6, y + h + 6), radius=14, fill=COLORS["shadow"])
    draw.rounded_rectangle((x, y, x + w, y + h), radius=14,
                           fill=COLORS["white"], outline=COLORS["card_border"], width=3)
    draw.text((x + 26, y + 22), "数据统计", fill=COLORS["brown"], font=font(28, bold=True))

    box_x, box_w, box_h, gap = x + 26, w - 52, 68, 14
    by = y + 80
    for num, label, color in [("13", "文件夹", COLORS["orange"]),
                              ("90", "书签", COLORS["orange"]),
                              ("77%", "已着色", COLORS["green"])]:
        draw.rounded_rectangle((box_x, by, box_x + box_w, by + box_h), radius=10,
                               fill=COLORS["stat_bg"], outline=COLORS["border"], width=2)
        draw.text((box_x + 26, by + box_h / 2), num, fill=color,
                  font=font(24, bold=True), anchor="lm")
        draw.text((box_x + box_w * 0.45, by + box_h / 2), label, fill=COLORS["brown"],
                  font=font(16), anchor="lm")
        by += box_h + gap


def large_promo():
    W, H = 1400, 560
    img = Image.new("RGB", (W, H), COLORS["bg"])
    draw = ImageDraw.Draw(img)
    draw.rectangle((600, 0, W, H), fill=COLORS["bg_right"])
    draw.rectangle((0, 0, W, 8), fill=COLORS["orange"])

    # ── Left column ──────────────────────────────────────────
    lx = 64
    paste_icon(img, lx, 26, 60)
    draw.text((lx + 76, 30), "FolderMark", fill=COLORS["orange"], font=font(48, bold=True))

    draw.text((lx, 118), "更快整理你的书签", fill=COLORS["brown"], font=font(30, bold=True))
    draw.text((lx, 162), "Organize bookmarks faster", fill=COLORS["orange"], font=font(22, bold=True))

    feat_zh = "颜色标记、数据统计、重复清理、失效检测"
    draw.text((lx, 212), feat_zh, fill=COLORS["brown"],
              font=fit_font(draw, feat_zh, 18, 540, bold=True))

    feat_en = "Color labels, statistics, duplicate cleanup, and broken-link checks."
    ef = font(16)
    ey = 244
    for line in wrap(draw, feat_en, ef, 430):
        draw.text((lx, ey), line, fill=COLORS["brown_soft"], font=ef)
        ey += 24

    # pill cards
    pills = [("一屏管理", "One popup"), ("删除前备份", "Backup before delete"), ("本地处理", "Local-first")]
    px = lx
    for zh, en in pills:
        zh_f, en_f = font(20, bold=True), font(13)
        pw = max(tw(draw, zh, zh_f), tw(draw, en, en_f)) + 52
        draw.rounded_rectangle((px, 318, px + pw, 394), radius=12,
                               fill=COLORS["white"], outline=COLORS["brown"], width=2)
        draw.text((px + 26, 332), zh, fill=COLORS["brown"], font=zh_f)
        draw.text((px + 26, 360), en, fill=COLORS["brown_soft"], font=en_f)
        px += pw + 28

    # ── Right: layered popups ────────────────────────────────
    rows = [("导航", "3", COLORS["blue"]), ("工具", "12", COLORS["orange"]),
            ("临时", "8", COLORS["gray"]), ("AI", "15", COLORS["amber"])]
    # back popup first
    popup_card(img, draw, 932, 44, 306, 488, rows)
    # front popup
    popup_card(img, draw, 636, 36, 306, 496, rows)
    # floating stats card on top
    stats_card(draw, 1020, 116, 304, 330)

    img.save(OUT)
    print(f"Saved {OUT}")


if __name__ == "__main__":
    large_promo()
