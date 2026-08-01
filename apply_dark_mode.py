#!/usr/bin/env python3
"""
深色模式 CSS 变量化完整脚本
将 styles.ts 中所有硬编码颜色替换为 CSS 变量，
并在浅色/深色作用域中分别定义变量值。
"""
import re

with open("/home/asdfg2895629993/SyncData/仓库/BiliGO/Fetch/UiFix/Main/src/content/styles.ts", "r") as f:
    content = f.read()

# 提取 css 模板字符串内容
match = re.search(r'const css = `(.+?)`;\n', content, re.DOTALL)
if not match:
    raise ValueError("无法找到 css 模板字符串")

css = match.group(1)

# ============================================================
# 颜色 → 变量映射（语义化命名）
# ============================================================

# 精确颜色替换映射（按出现频率降序排列，避免部分匹配问题）
color_map = {
    # 基础背景色
    "#FFFFFF": "var(--bili-bg-white)",
    "#F4F5F7": "var(--bili-bg-soft)",
    "#FAFBFC": "var(--bili-bg-footer)",
    "#F6F7F8": "var(--bili-bg-disabled)",
    "#F8F9FA": "var(--bili-bg-think)",
    "#F1F2F3": "var(--bili-bg-step)",
    
    # 卡片/面板背景
    "#FFF5F7": "var(--bili-bg-pink-light)",
    "#FFF8FA": "var(--bili-bg-pink-lighter)",
    "#FFF0F4": "var(--bili-bg-pink-active)",
    "#FFF7E6": "var(--bili-bg-warning)",
    "#FFF1F0": "var(--bili-bg-error)",
    
    # 文字色
    "#18191C": "var(--bili-text-primary)",
    "#61666D": "var(--bili-text-secondary)",
    "#9499A0": "var(--bili-text-muted)",
    "#212121": "var(--bili-text-dark)",
    "#999": "var(--bili-text-muted)",  # 历史记录meta色与#9499A0接近，用同一变量
    "#8B6914": "var(--bili-text-system)",
    
    # 品牌色（不变，共用）
    "#FB7299": "var(--bili-pink)",
    "#F25D8E": "var(--bili-pink-dark)",
    "#00A1D6": "var(--bili-blue)",
    "#0091C2": "var(--bili-blue-dark)",
    "#FB8DA0": "var(--bili-pink-light)",
    "#F06E8A": "var(--bili-pink-mid)",
    
    # 功能色
    "#FF6B81": "var(--bili-red)",
    "#FA8C16": "var(--bili-orange)",
    "#00A65A": "var(--bili-green)",
    
    # 边框/线条
    "#E5E9EF": "var(--bili-border)",
    "#FFCCC7": "var(--bili-border-error)",
    "#FFE7BA": "var(--bili-border-warning)",
    "#FFCCD5": "var(--bili-border-red)",
    
    # 其他
    "#E3F6FF": "var(--bili-tag-bg)",
    "#C9CCD0": "var(--bili-gray-light)",
    "#B8BCC2": "var(--bili-gray-mid)",
    "#E5E9EF": "var(--bili-border)",  # 重复，同上
}

# 处理 RGBA 颜色
rgba_map = {
    "rgba(251, 114, 153, 0.1)": "var(--bili-pink-alpha-10)",
    "rgba(251, 114, 153, 0.3)": "var(--bili-pink-alpha-30)",
    "rgba(251, 114, 153, 0.4)": "var(--bili-pink-alpha-40)",
    "rgba(0, 0, 0, 0.04)": "var(--bili-black-alpha-04)",
    "rgba(0, 0, 0, 0.06)": "var(--bili-black-alpha-06)",
    "rgba(0, 0, 0, 0.08)": "var(--bili-black-alpha-08)",
    "rgba(0, 0, 0, 0.12)": "var(--bili-black-alpha-12)",
    "rgba(255, 255, 255, 0.25)": "var(--bili-white-alpha-25)",
    "rgba(255, 255, 255, 0.3)": "var(--bili-white-alpha-30)",
    "rgba(255, 255, 255, 0.15)": "var(--bili-white-alpha-15)",
    "rgba(255, 255, 255, 0.5)": "var(--bili-white-alpha-50)",
    "rgba(255, 255, 255, 0.9)": "var(--bili-white-alpha-90)",
    "rgba(255, 255, 255, 0.80)": "var(--bili-white-alpha-80)",
    "rgba(251, 114, 153, 0.15)": "var(--bili-pink-alpha-15)",
    "rgba(251, 114, 153, 0.35)": "var(--bili-pink-alpha-35)",
    "rgba(251, 114, 153, 0.45)": "var(--bili-pink-alpha-45)",
    "rgba(251, 114, 153, 0.08)": "var(--bili-pink-alpha-08)",
    "rgba(251, 114, 153, 0.25)": "var(--bili-pink-alpha-25)",
    "rgba(251, 114, 153, 0.2)": "var(--bili-pink-alpha-20)",
    "rgba(251, 114, 153, 0.16)": "var(--bili-pink-alpha-16)",
    "rgba(251, 114, 153, 0.12)": "var(--bili-pink-alpha-12)",
    "rgba(251, 114, 153, 0.18)": "var(--bili-pink-alpha-18)",
    "rgba(0, 161, 214, 0.35)": "var(--bili-blue-alpha-35)",
    "rgba(0, 161, 214, 0.25)": "var(--bili-blue-alpha-25)",
    "rgba(0, 0, 0, 0.75)": "var(--bili-black-alpha-75)",
    "rgba(0, 0, 0, 0.15)": "var(--bili-black-alpha-15)",
    "rgba(0, 0, 0, 0.10)": "var(--bili-black-alpha-10)",
    "rgba(251, 114, 153, 0.06)": "var(--bili-pink-alpha-06)",
    "rgba(255, 107, 129, 0.06)": "var(--bili-red-alpha-06)",
    "rgba(251, 114, 153, 0)": "var(--bili-pink-alpha-0)",
    "rgba(0, 0, 0, 0)": "var(--bili-black-alpha-0)",
}

# 先处理 RGBA（较长的字符串优先，避免部分匹配）
for old, new in sorted(rgba_map.items(), key=lambda x: -len(x[0])):
    css = css.replace(old, new)

# 再处理 HEX（同样按长度降序，避免 #999 匹配 #999999 的情况，这里没有，但保险起见）
for old, new in sorted(color_map.items(), key=lambda x: -len(x[0])):
    css = css.replace(old, new)

# 还需要处理 linear-gradient 中的颜色
# 由于上面的 replace 已经处理了 gradient 中的 HEX，所以不需要额外处理
# 但需要确认是否有遗漏的

# 检查是否还有残留硬编码颜色
remaining_hex = re.findall(r':\s*#(?:[0-9A-Fa-f]{3}){1,2}', css)
remaining_rgba = re.findall(r':\s*rgba\(', css)

print(f"剩余 HEX 颜色（属性值中）: {len(remaining_hex)}")
for r in remaining_hex[:20]:
    print(f"  {r}")
print(f"剩余 RGBA 颜色（属性值中）: {len(remaining_rgba)}")

# ============================================================
# 构建变量定义块
# ============================================================

light_vars = """
  /* ===== CSS 变量定义 - 浅色模式（默认） ===== */
  [data-bili-agent-root],
  .bili-agent-theme-light {
    --bili-bg-white: #FFFFFF;
    --bili-bg-soft: #F4F5F7;
    --bili-bg-footer: #FAFBFC;
    --bili-bg-disabled: #F6F7F8;
    --bili-bg-think: #F8F9FA;
    --bili-bg-step: #F1F2F3;
    --bili-bg-pink-light: #FFF5F7;
    --bili-bg-pink-lighter: #FFF8FA;
    --bili-bg-pink-active: #FFF0F4;
    --bili-bg-warning: #FFF7E6;
    --bili-bg-error: #FFF1F0;
    --bili-text-primary: #18191C;
    --bili-text-secondary: #61666D;
    --bili-text-muted: #9499A0;
    --bili-text-dark: #212121;
    --bili-text-system: #8B6914;
    --bili-pink: #FB7299;
    --bili-pink-dark: #F25D8E;
    --bili-pink-light: #FB8DA0;
    --bili-pink-mid: #F06E8A;
    --bili-blue: #00A1D6;
    --bili-blue-dark: #0091C2;
    --bili-red: #FF6B81;
    --bili-orange: #FA8C16;
    --bili-green: #00A65A;
    --bili-border: #E5E9EF;
    --bili-border-error: #FFCCC7;
    --bili-border-warning: #FFE7BA;
    --bili-border-red: #FFCCD5;
    --bili-tag-bg: #E3F6FF;
    --bili-gray-light: #C9CCD0;
    --bili-gray-mid: #B8BCC2;
    --bili-pink-alpha-10: rgba(251, 114, 153, 0.1);
    --bili-pink-alpha-15: rgba(251, 114, 153, 0.15);
    --bili-pink-alpha-30: rgba(251, 114, 153, 0.3);
    --bili-pink-alpha-35: rgba(251, 114, 153, 0.35);
    --bili-pink-alpha-40: rgba(251, 114, 153, 0.4);
    --bili-pink-alpha-45: rgba(251, 114, 153, 0.45);
    --bili-pink-alpha-08: rgba(251, 114, 153, 0.08);
    --bili-pink-alpha-25: rgba(251, 114, 153, 0.25);
    --bili-pink-alpha-20: rgba(251, 114, 153, 0.2);
    --bili-pink-alpha-16: rgba(251, 114, 153, 0.16);
    --bili-pink-alpha-12: rgba(251, 114, 153, 0.12);
    --bili-pink-alpha-18: rgba(251, 114, 153, 0.18);
    --bili-pink-alpha-06: rgba(251, 114, 153, 0.06);
    --bili-pink-alpha-0: rgba(251, 114, 153, 0);
    --bili-blue-alpha-35: rgba(0, 161, 214, 0.35);
    --bili-blue-alpha-25: rgba(0, 161, 214, 0.25);
    --bili-black-alpha-04: rgba(0, 0, 0, 0.04);
    --bili-black-alpha-06: rgba(0, 0, 0, 0.06);
    --bili-black-alpha-08: rgba(0, 0, 0, 0.08);
    --bili-black-alpha-10: rgba(0, 0, 0, 0.10);
    --bili-black-alpha-12: rgba(0, 0, 0, 0.12);
    --bili-black-alpha-15: rgba(0, 0, 0, 0.15);
    --bili-black-alpha-75: rgba(0, 0, 0, 0.75);
    --bili-black-alpha-0: rgba(0, 0, 0, 0);
    --bili-white-alpha-15: rgba(255, 255, 255, 0.15);
    --bili-white-alpha-25: rgba(255, 255, 255, 0.25);
    --bili-white-alpha-30: rgba(255, 255, 255, 0.3);
    --bili-white-alpha-50: rgba(255, 255, 255, 0.5);
    --bili-white-alpha-80: rgba(255, 255, 255, 0.80);
    --bili-white-alpha-90: rgba(255, 255, 255, 0.9);
    --bili-red-alpha-06: rgba(255, 107, 129, 0.06);
  }
"""

dark_vars = """
  /* ===== CSS 变量定义 - 深色模式 ===== */
  .bili-agent-theme-dark {
    --bili-bg-white: #1F1F1F;
    --bili-bg-soft: #2A2A2A;
    --bili-bg-footer: #252525;
    --bili-bg-disabled: #2A2A2A;
    --bili-bg-think: #2A2A2A;
    --bili-bg-step: #2A2A2A;
    --bili-bg-pink-light: #2D2228;
    --bili-bg-pink-lighter: #2A2226;
    --bili-bg-pink-active: #2D2228;
    --bili-bg-warning: #3D3520;
    --bili-bg-error: #3D2020;
    --bili-text-primary: #E8E8E8;
    --bili-text-secondary: #A0A0A0;
    --bili-text-muted: #707070;
    --bili-text-dark: #E8E8E8;
    --bili-text-system: #D4A843;
    --bili-pink: #FB7299;
    --bili-pink-dark: #F25D8E;
    --bili-pink-light: #C05070;
    --bili-pink-mid: #A04060;
    --bili-blue: #00A1D6;
    --bili-blue-dark: #0091C2;
    --bili-red: #FF6B81;
    --bili-orange: #FA8C16;
    --bili-green: #00A65A;
    --bili-border: #3A3A3A;
    --bili-border-error: #5A2A2A;
    --bili-border-warning: #5A4A2A;
    --bili-border-red: #5A2A32;
    --bili-tag-bg: #1A3A4A;
    --bili-gray-light: #4A4A4A;
    --bili-gray-mid: #555555;
    --bili-pink-alpha-10: rgba(251, 114, 153, 0.15);
    --bili-pink-alpha-15: rgba(251, 114, 153, 0.2);
    --bili-pink-alpha-30: rgba(251, 114, 153, 0.35);
    --bili-pink-alpha-35: rgba(251, 114, 153, 0.4);
    --bili-pink-alpha-40: rgba(251, 114, 153, 0.45);
    --bili-pink-alpha-45: rgba(251, 114, 153, 0.5);
    --bili-pink-alpha-08: rgba(251, 114, 153, 0.12);
    --bili-pink-alpha-25: rgba(251, 114, 153, 0.3);
    --bili-pink-alpha-20: rgba(251, 114, 153, 0.25);
    --bili-pink-alpha-16: rgba(251, 114, 153, 0.2);
    --bili-pink-alpha-12: rgba(251, 114, 153, 0.18);
    --bili-pink-alpha-18: rgba(251, 114, 153, 0.22);
    --bili-pink-alpha-06: rgba(251, 114, 153, 0.1);
    --bili-pink-alpha-0: rgba(251, 114, 153, 0);
    --bili-blue-alpha-35: rgba(0, 161, 214, 0.4);
    --bili-blue-alpha-25: rgba(0, 161, 214, 0.3);
    --bili-black-alpha-04: rgba(255, 255, 255, 0.04);
    --bili-black-alpha-06: rgba(255, 255, 255, 0.06);
    --bili-black-alpha-08: rgba(255, 255, 255, 0.08);
    --bili-black-alpha-10: rgba(255, 255, 255, 0.10);
    --bili-black-alpha-12: rgba(255, 255, 255, 0.12);
    --bili-black-alpha-15: rgba(255, 255, 255, 0.15);
    --bili-black-alpha-75: rgba(0, 0, 0, 0.75);
    --bili-black-alpha-0: rgba(0, 0, 0, 0);
    --bili-white-alpha-15: rgba(255, 255, 255, 0.15);
    --bili-white-alpha-25: rgba(255, 255, 255, 0.25);
    --bili-white-alpha-30: rgba(255, 255, 255, 0.3);
    --bili-white-alpha-50: rgba(255, 255, 255, 0.5);
    --bili-white-alpha-80: rgba(40, 40, 40, 0.80);
    --bili-white-alpha-90: rgba(40, 40, 40, 0.9);
    --bili-red-alpha-06: rgba(255, 107, 129, 0.08);
  }
"""

# auto 模式媒体查询
auto_media = """
  /* auto 模式：跟随系统深色主题 */
  @media (prefers-color-scheme: dark) {
    .bili-agent-theme-auto {
      --bili-bg-white: #1F1F1F;
      --bili-bg-soft: #2A2A2A;
      --bili-bg-footer: #252525;
      --bili-bg-disabled: #2A2A2A;
      --bili-bg-think: #2A2A2A;
      --bili-bg-step: #2A2A2A;
      --bili-bg-pink-light: #2D2228;
      --bili-bg-pink-lighter: #2A2226;
      --bili-bg-pink-active: #2D2228;
      --bili-bg-warning: #3D3520;
      --bili-bg-error: #3D2020;
      --bili-text-primary: #E8E8E8;
      --bili-text-secondary: #A0A0A0;
      --bili-text-muted: #707070;
      --bili-text-dark: #E8E8E8;
      --bili-text-system: #D4A843;
      --bili-pink: #FB7299;
      --bili-pink-dark: #F25D8E;
      --bili-pink-light: #C05070;
      --bili-pink-mid: #A04060;
      --bili-blue: #00A1D6;
      --bili-blue-dark: #0091C2;
      --bili-red: #FF6B81;
      --bili-orange: #FA8C16;
      --bili-green: #00A65A;
      --bili-border: #3A3A3A;
      --bili-border-error: #5A2A2A;
      --bili-border-warning: #5A4A2A;
      --bili-border-red: #5A2A32;
      --bili-tag-bg: #1A3A4A;
      --bili-gray-light: #4A4A4A;
      --bili-gray-mid: #555555;
      --bili-pink-alpha-10: rgba(251, 114, 153, 0.15);
      --bili-pink-alpha-15: rgba(251, 114, 153, 0.2);
      --bili-pink-alpha-30: rgba(251, 114, 153, 0.35);
      --bili-pink-alpha-35: rgba(251, 114, 153, 0.4);
      --bili-pink-alpha-40: rgba(251, 114, 153, 0.45);
      --bili-pink-alpha-45: rgba(251, 114, 153, 0.5);
      --bili-pink-alpha-08: rgba(251, 114, 153, 0.12);
      --bili-pink-alpha-25: rgba(251, 114, 153, 0.3);
      --bili-pink-alpha-20: rgba(251, 114, 153, 0.25);
      --bili-pink-alpha-16: rgba(251, 114, 153, 0.2);
      --bili-pink-alpha-12: rgba(251, 114, 153, 0.18);
      --bili-pink-alpha-18: rgba(251, 114, 153, 0.22);
      --bili-pink-alpha-06: rgba(251, 114, 153, 0.1);
      --bili-pink-alpha-0: rgba(251, 114, 153, 0);
      --bili-blue-alpha-35: rgba(0, 161, 214, 0.4);
      --bili-blue-alpha-25: rgba(0, 161, 214, 0.3);
      --bili-black-alpha-04: rgba(255, 255, 255, 0.04);
      --bili-black-alpha-06: rgba(255, 255, 255, 0.06);
      --bili-black-alpha-08: rgba(255, 255, 255, 0.08);
      --bili-black-alpha-10: rgba(255, 255, 255, 0.10);
      --bili-black-alpha-12: rgba(255, 255, 255, 0.12);
      --bili-black-alpha-15: rgba(255, 255, 255, 0.15);
      --bili-black-alpha-75: rgba(0, 0, 0, 0.75);
      --bili-black-alpha-0: rgba(0, 0, 0, 0);
      --bili-white-alpha-15: rgba(255, 255, 255, 0.15);
      --bili-white-alpha-25: rgba(255, 255, 255, 0.25);
      --bili-white-alpha-30: rgba(255, 255, 255, 0.3);
      --bili-white-alpha-50: rgba(255, 255, 255, 0.5);
      --bili-white-alpha-80: rgba(40, 40, 40, 0.80);
      --bili-white-alpha-90: rgba(40, 40, 40, 0.9);
      --bili-red-alpha-06: rgba(255, 107, 129, 0.08);
    }
  }
"""

# 将变量定义插入到 :host 之后
# 找到 :host { ... } 的结束位置
host_end = css.find("  }\n\n  /* Toggle Button")
if host_end == -1:
    # 尝试其他模式
    host_end = css.find("  }\n\n  .bili-agent-toggle")

if host_end == -1:
    raise ValueError("无法找到 :host 块的结束位置")

# 在 :host 结束位置插入变量定义
insertion_point = host_end + 3  # 在 "  }" 之后
new_css = css[:insertion_point] + light_vars + dark_vars + auto_media + css[insertion_point:]

# ============================================================
# 检查是否还有残留的硬编码颜色（在CSS值中）
# ============================================================
remaining = re.findall(r':\s*#(?:[0-9A-Fa-f]{3}){1,2}', new_css)
print(f"\n最终剩余 HEX 颜色: {len(remaining)}")
for r in set(remaining):
    print(f"  {r}")

remaining_rgba = re.findall(r':\s*rgba\(', new_css)
print(f"最终剩余 RGBA 颜色: {len(remaining_rgba)}")

# 写回文件
new_content = content[:match.start(1)] + new_css + content[match.end(1):]

with open("/home/asdfg2895629993/SyncData/仓库/BiliGO/Fetch/UiFix/Main/src/content/styles.ts", "w") as f:
    f.write(new_content)

print("\n✅ styles.ts 已成功变量化！")
print(f"新增行数约: {light_vars.count(chr(10)) + dark_vars.count(chr(10)) + auto_media.count(chr(10))}")
