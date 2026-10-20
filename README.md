# Roofic — Solana IT-Startup Course

> **Roofic** — платформа токенизации арендной недвижимости на Solana.
> Инвестор покупает долю объекта (Token-2022) за стейблкоин и получает арендный доход пропорционально доле.
> ML-модуль прогнозирует доходность и риск объекта.

Репозиторий организован **по неделям тематического плана**: каждая папка `week-NN-*` — отдельная лабораторная
с собственным `README.md` (задание → результат обучения → реализация → запуск → проверка).
Финальный продукт находится в [`capstone/`](capstone/).

## Карта курса

| Неделя | Тема | РО | Папка | Статус |
|-------:|------|:--:|-------|:------:|
| 1 | Вход в Web3: первая транзакция | РО1 | — | сдано ранее |
| 2 | Как работает Solana (Transaction Detective) | РО1 | — | сдано ранее |
| 3 | Rust для Solana-разработчика | РО2 | [week-03-rust-cli](week-03-rust-cli/) | ✅ |
| 4 | Первая Solana Program (native) | РО2 | [week-04-native-program](week-04-native-program/) | ✅ |
| 5 | Anchor Framework: Counter | РО2 | [week-05-anchor-counter](week-05-anchor-counter/) | ✅ |
| 6 | Accounts, PDAs: on-chain профиль | РО2 | [week-06-pda-profile](week-06-pda-profile/) | ✅ |
| 7 | SPL Tokens & Token Extensions | РО2 | [week-07-spl-token](week-07-spl-token/) | ⏳ |
| 8 | РК1 · Build Sprint: первый Web3 MVP | РО3 | [week-08-mvp](week-08-mvp/) | ⏳ |
| 9 | DeFi на Solana | РО3 | [week-09-defi](week-09-defi/) | ⏳ |
| 10 | RPC, API и blockchain data | РО3 | [week-10-dashboard](week-10-dashboard/) | ⏳ |
| 11 | CPI и composable applications | РО3 | [week-11-cpi](week-11-cpi/) | ⏳ |
| 12 | Security & Exploit Lab | РО4 | [week-12-security-lab](week-12-security-lab/) | ⏳ |
| 13 | RWA, Stablecoins и платежи | РО4 | [week-13-rwa-design](week-13-rwa-design/) | ⏳ |
| 14 | Capstone Build Week | РО5 | [capstone](capstone/) | ⏳ |
| 15 | РК2 · Solana Demo Day | РО5 | [week-15-demo-day](week-15-demo-day/) | ⏳ |
| 16 | Защита проекта | РО5 | [week-16-defense](week-16-defense/) | ⏳ |

## Команда
См. [docs/team.md](docs/team.md).

## Devnet-деплои
Все Program ID и адреса токенов: [docs/devnet-deployments.md](docs/devnet-deployments.md).

## Требования к окружению

| Инструмент | Версия |
|------------|--------|
| Rust | 1.89+ (toolchain зафиксирован в `rust-toolchain.toml` программ) |
| Solana CLI (Agave) | 4.x |
| Anchor CLI | 1.2.0 |
| Node.js | 22.x |

```bash
solana config set --url devnet
solana-keygen new          # если ещё нет кошелька
solana airdrop 2           # или https://faucet.solana.com
```
