#!/usr/bin/env python3
"""
深色模式 CSS 变量化脚本
分析 styles.ts 中的所有硬编码颜色，生成变量映射并替换
"""
import re
from collections import Counter

with open("/home/asdfg2895629993/SyncData/仓库/BiliGO/Fetch/UiFix/Main/src/content/styles.ts", "r") as f:
    content = f.read()

# 提取所有颜色值
hex_colors = re.findall(r'#(?:[0-9A-Fa-f]{3}){1,2}(?:[0-9A-Fa-f]{2})?', content)
rgba_colors = re.findall(r'rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)', content)

print("=== HEX 颜色统计 ===")
for color, count in Counter(hex_colors).most_common():
    print(f"  {color}: {count}次")

print("\n=== RGBA 颜色统计 ===")
for color, count in Counter(rgba_colors).most_common():
    print(f"  {color}: {count}次")

print(f"\n总计: {len(hex_colors)} 个 HEX, {len(rgba_colors)} 个 RGBA")
