#!/usr/bin/env python3
"""Generates sitemap.xml for all language versions of pohage.ch.

Run after every content change:  python3 tools/generate-sitemap.py
"""
import datetime
import os
import xml.sax.saxutils as x

BASE = "https://pohage.ch"          # no trailing slash
LANGS = ["de", "en", "fr", "it", "cs"]    # de lives in the repository root
DEFAULT_LANG = "de"
PRIORITY = {"index.html": ("1.0", "monthly"), "kontakt.html": ("0.6", "yearly")}
FALLBACK = ("0.8", "monthly")

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(root)


def folder(lang):
    return "." if lang == DEFAULT_LANG else lang


def url(lang, page):
    tail = "" if page == "index.html" else page
    prefix = "" if lang == DEFAULT_LANG else lang + "/"
    return f"{BASE}/{prefix}{tail}"


def indexable(path):
    with open(path, encoding="utf-8") as handle:
        return 'name="robots" content="noindex' not in handle.read()


pages = sorted(
    f for f in os.listdir(folder(DEFAULT_LANG))
    if f.endswith(".html") and indexable(os.path.join(folder(DEFAULT_LANG), f))
)

blocks = []
for lang in LANGS:
    for page in pages:
        path = os.path.join(folder(lang), page)
        if not os.path.exists(path):
            print(f"  skipped (missing): {path}")
            continue
        modified = datetime.date.fromtimestamp(os.path.getmtime(path)).isoformat()
        priority, changefreq = PRIORITY.get(page, FALLBACK)
        alternates = "".join(
            f'    <xhtml:link rel="alternate" hreflang="{other}" '
            f'href="{x.escape(url(other, page))}" />\n'
            for other in LANGS
        )
        alternates += (
            f'    <xhtml:link rel="alternate" hreflang="x-default" '
            f'href="{x.escape(url(DEFAULT_LANG, page))}" />\n'
        )
        blocks.append(
            f"  <url>\n"
            f"    <loc>{x.escape(url(lang, page))}</loc>\n"
            f"{alternates}"
            f"    <lastmod>{modified}</lastmod>\n"
            f"    <changefreq>{changefreq}</changefreq>\n"
            f"    <priority>{priority}</priority>\n"
            f"  </url>"
        )

with open("sitemap.xml", "w", encoding="utf-8") as handle:
    handle.write(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
        '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
        + "\n".join(blocks)
        + "\n</urlset>\n"
    )

print(f"sitemap.xml - {len(blocks)} urls ({len(pages)} pages x {len(LANGS)} languages)")
