# Регламент разработки и контрибьюции в Roofic

Перед началом работы ознакомьтесь с [`docs/architecture.md`](docs/architecture.md), [`docs/risk-and-security-model.md`](docs/risk-and-security-model.md) и матрицей ролей [`docs/team.md`](docs/team.md).

## 1. Команда и зоны ответственности

| Участник | Контур | Основные директории |
|---|---|---|
| **Абдулла Нурислам** | Lead Developer (Solana / Rust / Anchor) | `capstone/programs/roofic/`, `week-08-mvp/programs/`, `week-11-cpi/programs/`, Devnet-деплои |
| **Кадирханов Жангир** | Full-stack, DeFi & Security / QA | `capstone/app/`, `capstone/scoring/`, `week-09-defi/`, `week-10-dashboard/`, `week-12-security-lab/` |
| **Йылмаз Мухаммедали** | Product & RWA / FinModel Analyst | `week-13-rwa-design/`, пресеты объектов, юнит-экономика |
| **Әбілдаев Нұрым** | Team Lead, Pitch & Compliance | `docs/pitch-and-demo.md`, комплаенс SPV, приёмочное тестирование |

## 2. Ветки и коммиты

- Основная ветка — `main`. Новые изменения оформляются через Pull Request с шаблоном [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md).
- Формат коммитов — **Conventional Commits**: `feat(capstone): ...`, `fix(security): ...`, `docs: ...`, `ci: ...`.
- Один коммит — одно логическое изменение без «wip» и смешивания несвязанных правок.

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
cd capstone/app && npm run typecheck && npm run build
```

## 4. Правила безопасности и Definition of Done

- **Никогда не коммитьте секреты:** файлы `.env*.local`, `*-keypair.json` с реальными ключами, `.wallets.bin`, `.state/`.
- Все изменения смарт-контракта должны сопровождаться позитивными и негативными тестами в `LiteSVM` (включая проверку неизменности состояния после отклонённых транзакций).
- Изменения формул скоринга в `capstone/scoring/engine.py` обязаны синхронно отражаться в `capstone/app/src/lib/scoring.ts` с побайтовым совпадением SHA-256 `valuation_hash`.
- Перед мержем в `main` все проверки в [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (`ci-ok`) должны быть зелёными.
