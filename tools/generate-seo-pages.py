#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SEO個別ページ生成スクリプト（TOPIK STUDY）

既存データ源だけから静的HTMLを生成する（内容の新規作成・捏造はしない）:
  - vocab.js / vocab-extra.js / vocab-level2.js
      → 単語2000をサイト本体と同じ手順で再構築し、100語ごとの
        チャプターページ topik1-vocabulary-chapter-NN.html（20ページ）を生成
  - topik1-grammar-list.html の文法カード（id=g01..g30）
      → 文法個別ページ topik1-grammar-gNN.html（30ページ）を生成

あわせて冪等に:
  - topik1-grammar-list.html / topik1-vocabulary-list.html へ
    個別ページへのリンク集セクションを挿入（マーカーコメントで囲む）
  - sitemap.xml へ新規URLを追加
  - 個別ページの練習導線は直行リンク（単語 ?chapter=N／文法 ?item=gNN）にする

使い方: リポジトリ直下で `python3 tools/generate-seo-pages.py`
sw.js の CACHE_NAME はリリースごとに手動で上げること（このスクリプトは触らない）。
"""
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://topik-study.pages.dev"
LASTMOD = "2026-11-23"
OG_IMAGE = ("https://images.pexels.com/videos/32531981/downtown-seoul-"
            "gyeongbokgung-gyeongbokgung-palace-korea-32531981.jpeg"
            "?auto=compress&cs=tinysrgb&w=1600")


def read(name):
    with open(os.path.join(ROOT, name), encoding="utf-8") as f:
        return f.read()


def write(name, text):
    with open(os.path.join(ROOT, name), "w", encoding="utf-8") as f:
        f.write(text)


def esc(s):
    return html.escape(s, quote=True)


def strip_tags(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


# ---------------------------------------------------------------- vocab data
def parse_vocab_js(text):
    """window.V = { 'cat': [ ['ko','kana','jp'], ... ], ... } を順序付きで読む"""
    cats = {}
    token = re.compile(
        r"'((?:[^'\\]|\\.)*)':\s*\["
        r"|\['((?:[^'\\]|\\.)*)','((?:[^'\\]|\\.)*)','((?:[^'\\]|\\.)*)'\]")
    current = None
    for m in token.finditer(text):
        if m.group(1) is not None:
            current = m.group(1)
            cats.setdefault(current, [])
        elif current is not None:
            cats[current].append([m.group(2), m.group(3), m.group(4)])
    return cats


def parse_js_string_list(segment):
    return re.findall(r"'((?:[^'\\]|\\.)*)'", segment)


def build_kana(extra_text):
    """vocab-extra.js 内の KoreanKana テーブルを読み、同じ変換を再現する"""
    seg = extra_text[extra_text.index("const initial="):]
    initial = parse_js_string_list(seg[:seg.index("];")])
    seg_f = seg[seg.index("const finals="):]
    finals = parse_js_string_list(seg_f[:seg_f.index("];")])
    seg_b = seg[seg.index("const bases="):]
    seg_b = seg_b[:seg_b.index("\n  };")]
    bases = {}
    for m in re.finditer(r"(?:'([^']*)'|(\w+)):\s*\[([^\]]*)\]", seg_b):
        key = m.group(1) if m.group(1) is not None else m.group(2)
        bases[key] = parse_js_string_list(m.group(3))
    remap = {"kk": "k", "tt": "t", "pp": "p", "ss": "s", "jj": "ch"}

    def kana(text):
        out = []
        for ch in text:
            code = ord(ch) - 44032
            if code < 0 or code > 11171:
                out.append(" " if ch == " " else ch)
                continue
            l = code // 588
            v = (code % 588) // 28
            t = code % 28
            key = initial[l]
            if key in remap:
                key = remap[key]
            out.append((bases.get(key) or bases[""])[v] + finals[t])
        return "".join(out)

    return kana


def parse_template_groups(text, start_marker, end_marker=None):
    """'cat':`ko|jp\\n...` 形式のグループを順序付きで読む"""
    seg = text[text.index(start_marker):]
    if end_marker:
        seg = seg[:seg.index(end_marker)]
    groups = {}
    for m in re.finditer(r"'([^']+)':\s*`([^`]*)`", seg):
        rows = []
        for line in m.group(2).strip().split("\n"):
            parts = line.split("|")
            if len(parts) == 2:
                rows.append((parts[0], parts[1]))
        groups[m.group(1)] = rows
    return groups


def parse_parse_blocks(text):
    """vocab-level2.js の const xxx=parse(`...`) を変数名つきで読む"""
    blocks = {}
    for m in re.finditer(r"const (\w+)=parse\(`([^`]*)`\)", text):
        rows = []
        for line in m.group(2).strip().split("\n"):
            parts = line.split("|")
            if len(parts) == 2:
                rows.append((parts[0], parts[1]))
        blocks[m.group(1)] = rows
    return blocks


def has_final(s):
    s = s.strip()
    if not s:
        return False
    c = ord(s[-1]) - 44032
    return 0 <= c <= 11171 and c % 28 != 0


def particle(s, a, b):
    return s + (a if has_final(s) else b)


def build_vocab():
    V = parse_vocab_js(read("vocab.js"))
    extra = read("vocab-extra.js")
    kana = build_kana(extra)
    groups = parse_template_groups(extra, "const groups={", "const initial=")
    existing = {w[0] for words in V.values() for w in words}
    needed = 800 - len(existing)
    for cat, rows in groups.items():
        new_rows = []
        for ko, jp in rows:
            if not ko or not jp or ko in existing or needed <= 0:
                continue
            existing.add(ko)
            new_rows.append([ko, kana(ko), jp])
            needed -= 1
        if new_rows:
            V[cat] = V.get(cat, []) + new_rows

    level2 = read("vocab-level2.js")
    blocks = parse_parse_blocks(level2)
    drinks = set(re.findall(r"'([^']+)'",
                 level2[level2.index("const drinks="):level2.index("]);", level2.index("const drinks=")) + 3]))
    special = {}
    seg_sp = level2[level2.index("specialFoodPatterns={"):]
    seg_sp = seg_sp[:seg_sp.index("\n  };")]
    for m in re.finditer(r"'([^']+)':\s*(\[\[.*?\]\])", seg_sp, re.S):
        special[m.group(1)] = re.findall(
            r"\['((?:[^'\\]|\\.)*)','((?:[^'\\]|\\.)*)'\]", m.group(2))

    def add(cat, ko, jp):
        if ko in existing:
            return
        existing.add(ko)
        V.setdefault(cat, []).append([ko, kana(ko), jp])

    place_p = [("에", "에", " 가요", "へ行きます"), ("에서", "에서", " 만나요", "で会います"),
               ("에서", "에서", " 출발해요", "から出発します"), ("까지", "까지", " 걸어가요", "まで歩いて行きます"),
               ("이", "가", " 어디예요?", "はどこですか"), ("이", "가", " 가까워요", "は近いです")]
    object_p = [("이", "가", " 있어요", "があります"), ("이", "가", " 없어요", "がありません"),
                ("을", "를", " 찾고 있어요", "を探しています"), ("이", "가", " 필요해요", "が必要です"),
                ("을", "를", " 어디에 둬요?", "をどこに置きますか"), ("을", "를", " 준비해 주세요", "を準備してください")]
    topic_p = [("에 대해", "에 대해", " 생각해요", "について考えます"), ("에 대해", "에 대해", " 이야기해요", "について話します"),
               ("에 관한", "에 관한", " 글을 읽었어요", "に関する文章を読みました"),
               ("에 대한", "에 대한", " 정보가 필요해요", "についての情報が必要です"),
               ("에 관심이", "에 관심이", " 있어요", "に関心があります"),
               ("에 대해", "에 대해", " 더 알고 싶어요", "についてもっと知りたいです")]

    def apply(rows, patterns, cat):
        for k, j in rows:
            for a, b, sko, sjp in patterns:
                add(cat, particle(k, a, b) + sko, j + sjp)

    apply(blocks["places"], place_p, "2級・場所表現")
    apply(blocks["objects"], object_p, "2級・物と生活表現")
    for k, j in blocks["foods"]:
        if k in special:
            for ko, jp in special[k]:
                add("2級・食事表現", ko, jp)
        else:
            first = ("을", "를", " 마셔요", "を飲みます") if k in drinks else ("을", "를", " 먹어요", "を食べます")
            rest = [("을", "를", " 좋아해요", "が好きです"), ("을", "를", " 주문할게요", "を注文します"),
                    ("을", "를", " 더 주세요", "をもっとください"), ("을", "를", " 사러 가요", "を買いに行きます"),
                    ("이", "가", " 맛있어요", "がおいしいです")]
            apply([(k, j)], [first] + rest, "2級・食事表現")
    apply(blocks["topics"], topic_p, "2級・抽象語表現")

    raw = []
    for cat, words in V.items():
        for w in words:
            raw.append({"category": cat, "ko": w[0], "kana": w[1], "jp": w[2]})
    for i, w in enumerate(raw):
        w["id"] = "w" + str(i + 1).zfill(4)
        w["level"] = "1級" if i < 800 else "2級"
        w["chapter"] = i // 100 + 1
    assert len(raw) == 2000, f"単語数が2000ではありません: {len(raw)}"
    assert len({w['ko'] for w in raw}) == 2000, "韓国語の重複があります"
    assert all(w["ko"] and w["kana"] and w["jp"] for w in raw), "必須項目の不足があります"
    return raw


# ---------------------------------------------------------------- grammar data
def parse_grammar():
    doc = read("topik1-grammar-list.html")
    items = []
    sections = re.split(r'<section class="grammar-group" id="group-\d+">', doc)[1:]
    for sec in sections:
        hm = re.search(r"<h2>(.*?)<span>", sec, re.S)
        group = strip_tags(hm.group(1)) if hm else ""
        for c in re.findall(r'<article class="grammar-card" id="(g\d+)">(.*?)</article>', sec, re.S):
            gid, body = c
            num = int(gid[1:])
            title = strip_tags(re.search(r"<h3[^>]*>(.*?)</h3>", body, re.S).group(1))
            meaning = strip_tags(re.search(r'<p class="meaning">(.*?)</p>', body, re.S).group(1))
            fields = {}
            for dt, dd in re.findall(r"<dt>(.*?)</dt><dd>(.*?)</dd>", body, re.S):
                label = strip_tags(dt)
                ex = re.search(r'<span class="example"[^>]*>(.*?)</span>', dd, re.S)
                tr = re.search(r'<span class="translation">(.*?)</span>', dd, re.S)
                if ex:
                    fields[label] = {"example": strip_tags(ex.group(1)),
                                     "translation": strip_tags(tr.group(1)) if tr else ""}
                else:
                    fields[label] = {"text": strip_tags(dd)}
            items.append({"id": gid, "num": num, "title": title, "meaning": meaning,
                          "group": group, "fields": fields})
    items.sort(key=lambda x: x["num"])
    assert len(items) == 30, f"文法項目数が30ではありません: {len(items)}"
    return items


# ---------------------------------------------------------------- page template
FONT_BLOCK = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
              '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
              '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
              'family=Noto+Sans+JP:wght@400;500;700;900&display=swap">'
              '<style>body{font-family:"Noto Sans JP","Hiragino Kaku Gothic ProN",'
              '"Hiragino Sans","Yu Gothic UI","Yu Gothic",-apple-system,'
              'BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.65;}'
              'h1{line-height:1.35;letter-spacing:.02em}h2{line-height:1.45;letter-spacing:.02em}'
              'h3{line-height:1.5;letter-spacing:.02em}</style>')
PAGE_CSS = ('<style>.word-table{width:100%;border-collapse:collapse;font-size:15px;line-height:1.7}'
            '.word-table th,.word-table td{padding:9px 10px;border:1px solid #c9d8e8;text-align:left;vertical-align:top}'
            '.word-table thead{background:#f7f3e9}.word-table .ko{font-weight:900;color:#0b2239;white-space:nowrap}'
            '.pager{display:flex;gap:10px;flex-wrap:wrap;margin-top:26px}.pager a{padding:10px 14px;'
            'border:1px solid #c9d8e8;border-radius:999px;background:#fff;color:#17456e;font-weight:800;text-decoration:none}'
            '.example-box{padding:18px;background:#fff;border:1px solid #e2dccf;border-radius:12px}'
            '.example-box .ko{font-size:19px;font-weight:900;color:#0b2239}.example-box .jp{color:#5d7183;margin-top:4px}</style>')


def head(title, desc, path, jsonlds):
    ld = "".join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>'
                 for x in jsonlds)
    return f'''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{BASE}/{path}">
<meta name="robots" content="index,follow">
<meta property="og:type" content="article">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{BASE}/{path}">
<meta property="og:image" content="{OG_IMAGE}">
<meta property="og:image:width" content="1600"><meta property="og:image:height" content="900">
<meta property="og:image:alt" content="景福宮とソウルの街並み">
<meta property="og:site_name" content="TOPIK STUDY">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{OG_IMAGE}">
<meta name="theme-color" content="#0b2239">
<link rel="stylesheet" href="./study-guides.css?v=4">
<link rel="stylesheet" href="./next-learning.css?v=1">
<link rel="icon" type="image/svg+xml" href="./favicon.svg"><link rel="icon" type="image/png" href="./app-icon-192.png">
<link rel="apple-touch-icon" href="./apple-touch-icon.png">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-KNXR84DQ9V"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments)}}gtag('js',new Date());gtag('config','G-KNXR84DQ9V');</script>
{ld}
{FONT_BLOCK}
{PAGE_CSS}
<link rel="stylesheet" href="./design-system.css?v=2">
</head>
'''


def frame(title, desc, path, jsonlds, tag, h1, hero_p, crumb, body):
    return (head(title, desc, path, jsonlds)
            + f'''<body><div class="page">
<header class="topbar"><a class="brand" href="./">韓国語能力試験 TOPIK 対策<small>TOPIK STUDY</small></a><a class="back" href="./">ホームへ</a></header>
<div class="hero"><span class="tag">{esc(tag)}</span><h1>{h1}</h1><p>{hero_p}</p></div>
<main class="content">
<nav class="breadcrumb" aria-label="パンくずリスト">{crumb}</nav>
{body}
</main></div>
<script src="./site-footer.js?v=71"></script>
<script src="./back-to-top.js?v=1"></script></body></html>
''')


def breadcrumb(leaf):
    return f'<a href="./">ホーム</a> &gt; {esc(leaf)}'


# ---------------------------------------------------------------- generators
def gen_grammar(items):
    files = []
    by_group = {}
    for it in items:
        by_group.setdefault(it["group"], []).append(it)
    for it in items:
        n = it["num"]
        path = f"topik1-grammar-{it['id']}"
        title = f"{it['title']}｜TOPIK I文法 {n}/30・{it['meaning']}"
        usage = it["fields"].get("使い方・接続", {}).get("text", "")
        example = it["fields"].get("例文", {})
        note = it["fields"].get("間違えやすい点・活用例", {}).get("text", "")
        desc = (f"TOPIK I文法「{it['title']}」（{it['meaning']}）の使い方・接続、例文"
                f"「{example.get('example','')}」と日本語訳、間違えやすい点を解説。"
                f"文法一覧30の{n}番目（{it['group']}）です。無料・登録不要。")
        prev_it = items[n - 2] if n >= 2 else None
        next_it = items[n] if n < 30 else None
        pager = ""
        if prev_it:
            pager += f'<a href="./topik1-grammar-{prev_it["id"]}">← 前：{esc(prev_it["title"])}</a>'
        if next_it:
            pager += f'<a href="./topik1-grammar-{next_it["id"]}">次：{esc(next_it["title"])} →</a>'
        same = "".join(
            f'<a href="./topik1-grammar-{o["id"]}">{esc(o["title"])}（{esc(o["meaning"])}）</a>'
            for o in by_group[it["group"]] if o["num"] != n)
        ld = [
            {"@context": "https://schema.org", "@type": "LearningResource",
             "name": title, "description": desc, "educationalLevel": "Beginner",
             "learningResourceType": "Reference", "inLanguage": ["ja", "ko"],
             "isAccessibleForFree": True, "url": f"{BASE}/{path}",
             "dateModified": LASTMOD},
            {"@context": "https://schema.org", "@type": "BreadcrumbList",
             "itemListElement": [
                 {"@type": "ListItem", "position": 1, "name": "ホーム", "item": BASE + "/"},
                 {"@type": "ListItem", "position": 2, "name": "TOPIK I文法一覧30",
                  "item": BASE + "/topik1-grammar-list"},
                 {"@type": "ListItem", "position": 3, "name": it["title"], "item": f"{BASE}/{path}"}]},
        ]
        body = f'''
<section><h2>意味と使い方</h2>
<p><strong lang="ko">{esc(it['title'])}</strong> は「{esc(it['meaning'])}」を表す、TOPIK I対策の文法です（文法一覧30の{n}番目／{esc(it['group'])}）。</p>
<div class="example-box"><p class="ko">使い方・接続</p><p>{esc(usage)}</p></div></section>
<section><h2>例文</h2>
<div class="example-box"><p class="ko" lang="ko">{esc(example.get('example',''))}</p><p class="jp">{esc(example.get('translation',''))}</p></div>
<p>例文は声に出して読み、文の中での位置と接続の形を確認しましょう。</p></section>
<section><h2>間違えやすい点・活用例</h2><p>{esc(note)}</p></section>
<section><h2>練習する</h2>
<div class="cta-grid"><a class="cta primary" href="./topik1-grammar?item={it['id']}">この項目の問題を解く<small>「{esc(it['title'])}」の1問・解説つき</small></a><a class="cta secondary" href="./topik1-grammar-list">文法一覧30へ戻る<small>意味・接続・例文を一覧で確認</small></a></div></section>
<section><h2>同じ分野（{esc(it['group'])}）の文法</h2><div class="related">{same}</div>
<nav class="pager" aria-label="前後の文法">{pager}</nav></section>
'''
        files.append((path + ".html", frame(
            title, desc, path, ld, f"TOPIK I GRAMMAR {n} / 30",
            f'{esc(it["title"])}<br><small style="font-size:.55em">{esc(it["meaning"])}</small>',
            f"TOPIK I文法一覧30の{n}番目。意味・接続・例文・日本語訳と、間違えやすい点を1ページで確認できます。",
            breadcrumb("文法：" + it["title"]), body)))
    return files


def gen_chapters(raw):
    files = []
    for c in range(1, 21):
        words = [w for w in raw if w["chapter"] == c]
        start = (c - 1) * 100 + 1
        end = start + len(words) - 1
        level = words[0]["level"]
        path = f"topik1-vocabulary-chapter-{c:02d}"
        title = f"TOPIK I単語2000 Chapter {c}（{start}〜{end}語）｜{level}・韓国語・読み・意味一覧"
        cats = []
        for w in words:
            if w["category"] not in cats:
                cats.append(w["category"])
        desc = (f"TOPIK I単語2000のChapter {c}（{start}〜{end}語・{level}）を一覧で掲載。"
                f"韓国語・読み方・日本語の意味を表で確認できます。分野：{'、'.join(cats[:4])}など。無料・登録不要。")
        rows = "".join(
            f'<tr><td>{start + i}</td><td class="ko" lang="ko">{esc(w["ko"])}</td>'
            f'<td>{esc(w["kana"])}</td><td>{esc(w["jp"])}</td><td>{esc(w["category"])}</td></tr>'
            for i, w in enumerate(words))
        pager = ""
        if c > 1:
            pager += f'<a href="./topik1-vocabulary-chapter-{c-1:02d}">← Chapter {c-1}</a>'
        if c < 20:
            pager += f'<a href="./topik1-vocabulary-chapter-{c+1:02d}">Chapter {c+1} →</a>'
        ld = [
            {"@context": "https://schema.org", "@type": "LearningResource",
             "name": title, "description": desc, "educationalLevel": "Beginner",
             "learningResourceType": "Reference", "inLanguage": ["ja", "ko"],
             "isAccessibleForFree": True, "url": f"{BASE}/{path}", "dateModified": LASTMOD},
            {"@context": "https://schema.org", "@type": "BreadcrumbList",
             "itemListElement": [
                 {"@type": "ListItem", "position": 1, "name": "ホーム", "item": BASE + "/"},
                 {"@type": "ListItem", "position": 2, "name": "TOPIK I単語トレーニング",
                  "item": BASE + "/topik1-vocabulary"},
                 {"@type": "ListItem", "position": 3, "name": f"Chapter {c}", "item": f"{BASE}/{path}"}]},
        ]
        body = f'''
<section><h2>Chapter {c}の単語（{start}〜{end}語・{level}）</h2>
<p>単語2000を100語ずつに分けたChapter {c}です。分野は{'、'.join(esc(x) for x in cats)}を含みます。韓国語・読み方・意味を表で確認し、覚えたら下のボタンからChapter {c}のトレーニングをそのまま始めましょう。</p>
<div class="table-wrap"><table class="word-table"><thead><tr><th>No.</th><th>韓国語</th><th>読み方</th><th>意味</th><th>分野</th></tr></thead><tbody>{rows}</tbody></table></div></section>
<section><h2>このChapterを練習する</h2>
<div class="cta-grid"><a class="cta primary" href="./topik1-vocabulary?chapter={c}">Chapter {c}を練習する<small>このChapterが開いた状態で始まる・10問ずつ練習</small></a><a class="cta secondary" href="./topik1-vocabulary-list">場面別の基礎単語220を見る<small>食事・買い物など場面ごとに確認</small></a></div>
<nav class="pager" aria-label="前後のチャプター">{pager}</nav></section>
'''
        files.append((path + ".html", frame(
            title, desc, path, ld, f"TOPIK I VOCABULARY CHAPTER {c} / 20",
            f"TOPIK I単語2000<br>Chapter {c}（{start}〜{end}語）",
            f"{level}の単語{len(words)}語を、韓国語・読み方・意味の表で一覧できます。",
            breadcrumb(f"単語 Chapter {c}"), body)))
    return files


# ---------------------------------------------------------------- hub / sitemap
def insert_block(doc, marker, block, anchor, where="before"):
    if marker in doc:
        doc = re.sub(re.escape(marker) + r".*?" + re.escape(marker.replace("START", "END")),
                     block, doc, flags=re.S)
        return doc
    if anchor not in doc:
        raise SystemExit(f"挿入アンカーが見つかりません: {anchor[:60]}")
    return doc.replace(anchor, (block + anchor) if where == "before" else (anchor + block), 1)


def update_hubs_sitemap(grammar_items, chapter_count=20):
    g_links = "".join(
        f'<a href="./topik1-grammar-{it["id"]}">{it["num"]:02d} {esc(it["title"])}（{esc(it["meaning"])}）</a>'
        for it in grammar_items)
    g_block = (f'\n<!-- SEO-INDIVIDUAL-START --><section id="individual-pages"><h2>文法を1項目ずつ詳しく見る</h2>'
               f'<p>30項目それぞれに、使い方・例文・間違えやすい点をまとめた個別ページがあります。</p>'
               f'<nav class="grammar-nav" aria-label="文法個別ページ">{g_links}</nav></section><!-- SEO-INDIVIDUAL-END -->\n')
    doc = read("topik1-grammar-list.html")
    write("topik1-grammar-list.html",
          insert_block(doc, "<!-- SEO-INDIVIDUAL-START -->", g_block, '<section class="grammar-search"'))

    c_links = "".join(
        f'<a href="./topik1-vocabulary-chapter-{c:02d}">Chapter {c}（{(c-1)*100+1}〜{c*100}語・{"1級" if c <= 8 else "2級"}）</a>'
        for c in range(1, chapter_count + 1))
    c_block = (f'\n<!-- SEO-INDIVIDUAL-START --><section id="chapter-pages"><h2>単語2000をチャプター別に見る</h2>'
               f'<p>単語2000は100語ごとのChapterに分かれています。各Chapterの全単語を、韓国語・読み方・意味の表で確認できます。</p>'
               f'<nav class="grammar-nav" aria-label="単語チャプターページ">{c_links}</nav></section><!-- SEO-INDIVIDUAL-END -->\n')
    doc = read("topik1-vocabulary-list.html")
    write("topik1-vocabulary-list.html",
          insert_block(doc, "<!-- SEO-INDIVIDUAL-START -->", c_block, '<section id="faq">'))

    sm = read("sitemap.xml")
    urls = [f"topik1-grammar-{it['id']}" for it in grammar_items] + \
           [f"topik1-vocabulary-chapter-{c:02d}" for c in range(1, chapter_count + 1)]
    add = ""
    for u in urls:
        if f"<loc>{BASE}/{u}</loc>" not in sm:
            add += (f"  <url>\n    <loc>{BASE}/{u}</loc>\n    <lastmod>{LASTMOD}</lastmod>\n"
                    f"    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n")
    if add:
        sm = sm.replace("</urlset>", add + "</urlset>")
        write("sitemap.xml", sm)
    return len(urls)


def main():
    raw = build_vocab()
    items = parse_grammar()
    files = gen_grammar(items) + gen_chapters(raw)
    for name, content in files:
        write(name, content)
    n = update_hubs_sitemap(items)
    print(f"生成: 文法{len(items)}ページ + 単語{len(files) - len(items)}ページ = {len(files)}ページ")
    print(f"sitemap対象URL: {n}件")


if __name__ == "__main__":
    main()
