from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ('href', 'src') and value:
                self.urls.append(value)


root = Path('dist')
pages = list(root.rglob('*.html'))
missing = []
for page in pages:
    parser = Links()
    parser.feed(page.read_text(encoding='utf-8'))
    for url in parser.urls:
        parsed = urlsplit(url)
        path = parsed.path
        if parsed.scheme or parsed.netloc or not path.startswith('/') or path.startswith('//'):
            continue
        target = root / unquote(path.lstrip('/'))
        if not target.exists() and not (target / 'index.html').exists():
            missing.append((str(page.relative_to(root)), url))

print(f'Страниц: {len(pages)}; отсутствующих внутренних адресов: {len(missing)}')
for page, url in missing[:30]:
    print(f'{page}: {url}')
raise SystemExit(bool(missing))
