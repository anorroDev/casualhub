# Казуал Хаб (rategod)

Сайт **«Казуал Хаб»**: оценки и рейтинги всего подряд плюс колесо на выбывание.

- Оценки и рейтинги: `index.html`
- Колесо Толямбуса: `koleso/index.html` (открывается по адресу `/koleso/`)

---

## ⚡ Развертывание на Cloudflare Pages

Проект настроен для развертывания под именем **`rategod`** (`https://rategod.pages.dev`):

### Вариант 1: Через панель Cloudflare (Автоматический деплой)
1. Откройте [Cloudflare Dashboard](https://dash.cloudflare.com/) и перейдите в раздел **Compute (Workers & Pages)**.
2. Нажмите **Create application** -> вкладка **Pages** -> **Connect to Git**.
3. Выберите репозиторий `anorroDev/rate`.
4. В поле **Project name** укажите: `rategod`.
5. В настройках сборки (**Build settings**):
   - **Framework preset**: `None`
   - **Build command**: оставить пустым
   - **Build output directory**: `/` (или `.`)
6. Нажмите **Save and Deploy**.

Ваш сайт будет опубликован по адресу **`https://rategod.pages.dev`**.

### Вариант 2: Через Wrangler CLI
В терминале внутри папки проекта выполните:
```bash
npx wrangler pages deploy . --project-name=rategod
```
