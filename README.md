<div align="center">

<img src="docs/assets/roofic-logo.png" width="112" alt="Логотип Roofic" />

# Roofic

**Платформа фракционной токенизации арендной недвижимости (RWA) на Solana**

[![Roofic CI](https://github.com/Abdulla-Nurislam/Roofic/actions/workflows/ci.yml/badge.svg)](https://github.com/Abdulla-Nurislam/Roofic/actions/workflows/ci.yml)
![Solana Devnet](https://img.shields.io/badge/Solana-Devnet-9945FF?style=flat-square&logo=solana&logoColor=white)
![Anchor 1.2.0](https://img.shields.io/badge/Anchor-1.2.0-111827?style=flat-square&logo=rust&logoColor=white)
![Token-2022](https://img.shields.io/badge/SPL-Token--2022-14F195?style=flat-square&logoColor=black)
![Next.js](https://img.shields.io/badge/Next.js-App_Router-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-C2410C?style=flat-square)

</div>

---

Финальный продукт находится в [`capstone/`](capstone/).

## Карта курса

| Неделя | Тема | РО | Папка | Статус |
|-------:|------|:--:|-------|:------:|
| 3 | Rust для Solana-разработчика | РО2 | [week-03-rust-cli](week-03-rust-cli/) | ✅ (7 тестов) |
| 4 | Первая Solana Program (native) | РО2 | [week-04-native-program](week-04-native-program/) | ✅ (4 теста, Devnet) |
| 5 | Anchor Framework: Counter | РО2 | [week-05-anchor-counter](week-05-anchor-counter/) | ✅ (7 тестов, Devnet) |
| 6 | Accounts, PDAs: on-chain профиль | РО2 | [week-06-pda-profile](week-06-pda-profile/) | ✅ (7 тестов, Devnet) |
| 7 | SPL Tokens & Token Extensions | РО2 | [week-07-spl-token](week-07-spl-token/) | ✅ (Token-2022, Devnet) |
| 8 | РК1 · Build Sprint: первый Web3 MVP | РО3 | [week-08-mvp](week-08-mvp/) | ✅ (9 тестов, Next.js, Devnet) |
| 9 | DeFi на Solana (Pyth, Jupiter, Kamino) | РО3 | [week-09-defi](week-09-defi/) | ✅ (5 тестов + интеграция) |
| 10 | RPC, API и blockchain data | РО3 | [week-10-dashboard](week-10-dashboard/) | ✅ (7 тестов, Next.js) |
| 11 | CPI и composable applications | РО3 | [week-11-cpi](week-11-cpi/) | ✅ (11 тестов, 2 программы) |
| 12 | Security & Exploit Lab | РО4 | [week-12-security-lab](week-12-security-lab/) | ✅ (11 эксплойт/фикс-тестов) |
| 13 | RWA, Stablecoins и платежи | РО4 | [week-13-rwa-design](week-13-rwa-design/) | ✅ (12 тестов финмодели) |
| 14 | Capstone Build Week | РО5 | [capstone](capstone/) | ✅ (22 Rust + 5 Python тестов, Next.js, Devnet) |
| 15 | РК2 · Solana Demo Day (5–7 мин питч и live demo) | РО5 | [docs/pitch-and-demo.md](docs/pitch-and-demo.md) | ✅ |
| 16 | Защита проекта (Q&A, архитектура и безопасность) | РО1–5 | [docs/pitch-and-demo.md](docs/pitch-and-demo.md) | ✅ |

## Команда и вклад участников
См. [docs/team.md](docs/team.md).

## Devnet-деплои и ончейн-артефакты
Все 9 развёрнутых программ, адреса токенов, оракулов Pyth и транзакций: [docs/devnet-deployments.md](docs/devnet-deployments.md).

## Требования к окружению

| Инструмент | Версия |
|------------|--------|
| Rust | 1.89+ (`rust-toolchain.toml` в каждой Anchor-программе) |
| Solana CLI (Agave) | 2.1+ / 3.x |
| Anchor CLI | 0.32.1 |
| Node.js | 22.x |
| Python | 3.10+ |

```bash
solana config set --url devnet
solana-keygen new          # если ещё нет кошелька
solana airdrop 2           # или https://faucet.solana.com
```

## Лицензия
Проект распространяется под лицензией [MIT](LICENSE).
