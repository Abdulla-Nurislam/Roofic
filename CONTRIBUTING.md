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

