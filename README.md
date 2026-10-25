# Оценщик всего (rate)

Веб-приложение **«Оценщик всего»** для оценки и составления рейтингов.

- Точка входа: `index.html`

---

## ⚡ Развертывание на Cloudflare Pages

Проект полностью оптимизирован и готов для деплоя на **Cloudflare Pages**:

### Вариант 1: Через панель Cloudflare (Автоматический деплой при push)
1. Откройте [Cloudflare Dashboard](https://dash.cloudflare.com/) и перейдите в раздел **Compute (Workers & Pages)**.
2. Нажмите **Create application** -> вкладка **Pages** -> **Connect to Git**.
3. Выберите репозиторий `anorroDev/rate`.
4. В настройках сборки (**Build settings**):
   - **Framework preset**: `None`
   - **Build command**: оставить пустым
   - **Build output directory**: `/` (или `.`)
5. Нажмите **Save and Deploy**.

Сайт будет опубликован на бесплатном домене вида `*.pages.dev` с глобальным CDN, защитой от DDoS и автоматическим SSL.

### Вариант 2: Через Wrangler CLI
В терминале внутри папки проекта выполните:
```bash
npx wrangler pages deploy . --project-name=rate
```
