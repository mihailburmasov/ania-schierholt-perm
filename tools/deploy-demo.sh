#!/usr/bin/env bash
# Демо на GitHub Pages: собирает сайт с префиксом подпапки и публикует dist/ в ветку gh-pages.
# Запуск из корня проекта: npm run deploy:demo
set -euo pipefail
REPO_NAME="ania-schierholt-perm"
export MSYS_NO_PATHCONV=1   # Git Bash на Windows иначе превращает /ania-schierholt-perm в путь C:/...
BASE="/$REPO_NAME" npm run build
TMP=$(mktemp -d)
cp -r dist/. "$TMP/"
touch "$TMP/.nojekyll"
cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$OLDPWD" config user.name)" -c user.email="$(git -C "$OLDPWD" config user.email)" \
  commit -q -m "Демо-сборка $(date '+%Y-%m-%d %H:%M')"
git push -f "$(git -C "$OLDPWD" remote get-url origin)" gh-pages
cd "$OLDPWD" && rm -rf "$TMP"
npm run build >/dev/null   # вернуть обычную сборку в dist/
echo "Готово: https://mihailburmasov.github.io/$REPO_NAME/ (обновится через 1–2 минуты)"
