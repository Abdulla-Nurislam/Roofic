# Регламент разработки и контрибьюции в Roofic

Перед началом работы ознакомьтесь с [`docs/architecture.md`](docs/architecture.md), [`docs/risk-and-security-model.md`](docs/risk-and-security-model.md) и матрицей ролей [`docs/team.md`](docs/team.md).

## 1. Команда и зоны ответственности

| Участник | Контур | Основные директории |
|---|---|---|
| **Абдулла Нурислам** | Lead Developer (Solana / Rust / Anchor) | `capstone/programs/roofic/`, `week-08-mvp/programs/`, `week-11-cpi/programs/`, Devnet-деплои |
| **Кадирханов Жангир** | Full-stack, DeFi & Security / QA | `capstone/app/`, `capstone/scoring/`, `week-09-defi/`, `week-10-dashboard/`, `week-12-security-lab/` |
| **Йылмаз Мухаммедали** | Product & RWA / FinModel Analyst | `week-13-rwa-design/`, пресеты объектов, юнит-экономика |
| **Әбілдаев Нұрым** | Team Lead, Pitch & Compliance | `docs/pitch-and-demo.md`, комплаенс SPV, приёмочное тестирование |

## 2. Ветки, коммиты и Pull Request

Новая работа не коммитится прямо в `main`. Своя ветка, пуш только в неё, затем Pull Request. Сливает в `main` другой участник, после зелёного CI.

Команды ниже одинаковы в PowerShell и в bash. Формат сообщений — **Conventional Commits**: `feat(capstone): ...`, `fix(security): ...`, `docs: ...`, `ci: ...`. Один коммит — одно логическое изменение, без `wip` и без смешивания несвязанных правок.

Перед первым коммитом в этом клоне проверьте автора. GitHub привязывает коммит к аккаунту по email, а не по факту входа в браузер:

```bash
git config --global user.name "Имя Фамилия"
git config --global user.email "почта@из.настроек.github"
```

Email должен быть подтверждён в GitHub → Settings → Emails. Адрес-заглушка вроде `example.com` попадёт в график вкладчиков как отдельный неизвестный автор.

### 2.1. Ветка от свежего `main`

Рабочее дерево должно быть чистым (`git status` без изменений). Иначе незакоммиченные правки переедут в новую ветку.

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/короткое-имя
git branch --show-current
```

`git switch -c` создаёт ветку и сразу переключает на неё. Если такое имя уже есть, команда остановится — выберите другое. `git checkout -b` делает то же самое и оставлен для старых инструкций; в новых командах используем `switch`.

`--ff-only` не даёт `git pull` создать случайный merge-коммит, если локальная `main` разъехалась с GitHub. Если pull отказал, не решайте это через `git push --force`. Посмотрите `git status` и спросите того, кто ведёт `main`.

### 2.2. Коммит, затем пуш только своей ветки

```bash
git add путь/к/файлам
git commit -m "docs: зачем эта правка"
git push -u origin HEAD
```

`-u` один раз связывает ветку с `origin`, следующие `git push` и `git pull` работают без длинной команды.

Не выполняйте `git push origin main` и не используйте `git push --force` в `main`. Обычный push в `main` сам по себе не затирает чужие коммиты: если на GitHub уже есть новые коммиты, Git отклонит push и попросит сначала забрать их. Чужие коммиты пропадают в двух случаях: `git push --force` в общую ветку либо конфликт слияния, в котором при ручном разрешении удалили чужой код. Своя ветка как раз не даёт такой правке уехать в `main` до ревью.

Отдельная ветка не страхует файлы, которые вы удалили и ещё не закоммитили. Такие файлы возвращает `git restore путь`, а не имя ветки. Сначала посмотрите `git status`.

Повторный пуш в свою ветку после новых коммитов — обычный `git push`. `--force-with-lease` допустим только на вашей личной ветке, если вы переписали её историю rebase и больше никто в неё не коммитит.

### 2.3. Pull Request

Шаблон описания — [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md).

```bash
gh pr create --base main --fill
```

Жёлтая плашка **Compare & pull request** на сайте появляется не всегда и скоро пропадает. Надёжный путь: вкладка Pull requests → New, либо команда выше.

**Able to merge** значит только то, что Git смог совместить ветки без конфликта. Это не проверка тестов. Ждите зелёную сводку [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (`ci-ok`). Если плашка красная, обновите ветку от `main` (`git switch main`, `git pull --ff-only origin main`, `git switch feat/короткое-имя`, `git rebase origin/main`) и снова `git push`. При rebase личной ветки, которую уже пушили, нужен `git push --force-with-lease`.

PR смотрит другой участник: вкладка **Files changed**, затем **Merge pull request**. Автор не сливает свой запрос сам. После кнопки merge на GitHub нажмите **Delete branch**.

Локально после слияния:

```bash
git switch main
git pull --ff-only origin main
git branch -d feat/короткое-имя
```

### 2.4. Запрет прямого пуша в `main`

Пока это договорённость. Её включает владелец репозитория, не каждый участник: GitHub → Settings → Rules → Rulesets (или Branch protection rules) для ветки `main`.

- требовать Pull Request перед слиянием;
- требовать прохождение проверки `ci-ok`;
- запретить force push;
- не давать автору PR обойти эти правила в одиночку.

Без этого правила Git по-прежнему примет прямой push в `main`, если история не расходилась.

## 3. Обязательные локальные проверки перед push

```bash
# 1. Capstone Anchor-программа + LiteSVM-тесты
cd capstone && cargo build-sbf --manifest-path programs/roofic/Cargo.toml && cargo test

# 2. Опциональный Devnet smoke-тест (в CI не запускается)
cd capstone && ROOFIC_DEVNET=1 cargo test devnet_smoke -- --nocapture

# 3. Python-скоринг и финансовая модель
python3 -m unittest discover -s capstone/scoring -v
python3 -m unittest discover -s week-13-rwa-design/model -v

# 4. Фронтенд Next.js (Capstone)
cd capstone/app && npm test && npm run typecheck && npm run build
```

## 4. Правила безопасности и Definition of Done

- **Никогда не коммитьте секреты:** файлы `.env*.local`, `*-keypair.json` с реальными ключами, `.wallets.bin`, `.state/`.
- Все изменения смарт-контракта должны сопровождаться позитивными и негативными тестами в `LiteSVM` (включая проверку неизменности состояния после отклонённых транзакций).
- Изменения формул скоринга в `capstone/scoring/engine.py` обязаны синхронно отражаться в `capstone/app/src/lib/scoring.ts` с побайтовым совпадением SHA-256 `valuation_hash`.
- Перед мержем в `main` все проверки в [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (`ci-ok`) должны быть зелёными.
