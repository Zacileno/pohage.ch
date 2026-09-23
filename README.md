# pohage.ch

Static website for PoHaGe GmbH (heating, air conditioning and pump technology,
Steinhausen ZG). Plain HTML, CSS and JavaScript, no build step. Deployed on Vercel
from the `main` branch.

## Languages

German is the default and lives in the repository root. The other languages are in
subfolders and use the same file names:

| Language | Folder | Example |
|---|---|---|
| German (default) | `/` | `https://pohage.ch/servis.html` |
| English | `/en/` | `https://pohage.ch/en/servis.html` |
| French | `/fr/` | `https://pohage.ch/fr/servis.html` |
| Italian | `/it/` | `https://pohage.ch/it/servis.html` |

Every page carries a self-referencing `canonical` plus the full set of `hreflang`
links (all four languages and `x-default`). When you add a page, add it in **all four**
languages and keep those links in sync, otherwise search engines drop the versions
that are missing from the set.

Assets (images, `style.css`, `js/main.js`) live in the root only. Pages inside a
language folder reference them with `../`.

## After changing content

Regenerate the sitemap:

```bash
python3 tools/generate-sitemap.py
```

It walks the German pages, skips anything marked `noindex` and writes one `<url>`
block per page and language, each with the `xhtml:link` alternates.

## Images

Images are served as WebP. Every `<img>` carries `width`, `height` and
`loading="lazy"`, except the hero image of each page, which is `eager` with
`fetchpriority="high"` and preloaded in the `<head>`.

To add an image, convert it first — keep the longest side at 1920 px for hero
photography and 200 px for icons.

## Contact form

The forms post to a Make webhook defined in `js/main.js`. The success and error
messages come from `data-success` and `data-error` on `.form-success`, so they are
translated per page.
