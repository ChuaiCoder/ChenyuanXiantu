# -*- coding: utf-8 -*-
"""生成桌面版应用图标：墨夜底色 + 鎏金「仙」字 + 朱砂印。
用法：python build/make-icon.py  →  输出 build/icon.ico"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FONT = os.path.join(ROOT, "public", "fonts", "MaShanZheng-Regular.ttf")
OUT = os.path.join(HERE, "icon.ico")

S = 512  # 超采样后缩小，边缘更干净

# ---- 背景：墨夜垂直渐变 ----
top, bot = (20, 29, 42), (8, 11, 16)
grad = Image.new("RGB", (S, S))
gd = ImageDraw.Draw(grad)
for y in range(S):
    t = y / (S - 1)
    gd.line([(0, y), (S, y)],
            fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))

# ---- 圆角遮罩 ----
radius = int(S * 0.22)
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=radius, fill=255)

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
img.paste(grad, (0, 0), mask)
d = ImageDraw.Draw(img)

# ---- 鎏金细边 ----
d.rounded_rectangle([4, 4, S - 5, S - 5], radius=radius - 3,
                    outline=(150, 122, 62, 210), width=4)

# ---- 主字「仙」 ----
font = ImageFont.truetype(FONT, int(S * 0.60))
box = d.textbbox((0, 0), "仙", font=font)
w, h = box[2] - box[0], box[3] - box[1]
d.text(((S - w) // 2 - box[0], (S - h) // 2 - box[1] - int(S * 0.03)),
       "仙", font=font, fill=(242, 215, 149, 255))

# ---- 底部朱砂印记 ----
seal = int(S * 0.11)
sx = (S - seal) // 2
sy = int(S * 0.775)
d.rounded_rectangle([sx, sy, sx + seal, sy + seal], radius=int(seal * 0.22),
                    fill=(194, 69, 45, 235))

img.resize((256, 256), Image.LANCZOS).save(
    OUT, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("已生成：", OUT)
