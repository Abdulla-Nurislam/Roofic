# Неделя 9 — DeFi на Solana

| | |
|---|---|
| **Задание** | Изучить реальные протоколы экосистемы и интегрировать DeFi-функциональность в приложение |
| **РО** | РО3 — использование существующих DeFi-протоколов и инфраструктуры |
| **Ответственный** | Кадирханов Жангир (код), Йылмаз Мухаммедали (обзор протоколов) |

## Результат

1. **Изучение протоколов** — [DEFI_LANDSCAPE.md](DEFI_LANDSCAPE.md): Jupiter, Raydium/Orca, Kamino, Marinade, Jito, Pyth, с моделью дохода, рисками и применимостью к Roofic.
2. **Интеграция в приложение** — цены SOL/USD из on-chain оракула **Pyth** теперь показываются в UI недели 8 (цена доли, привлечённые средства, выплаченная аренда в долларах).
3. **Рабочие скрипты** на живых данных:

| Скрипт | Что делает |
|--------|-----------|
| `npm run pyth` | Читает `PriceUpdateV2` напрямую из аккаунтов devnet, декодирует вручную, проверяет owner / верификацию / свежесть / confidence |
| `npm run jupiter` | Реальная котировка 1 SOL → USDC, маршрут, сборка swap-транзакции и разбор её инструкций (не отправляется) |
| `npm run yields` | APY Marinade и Jito, ставки Kamino по стейблкоинам, цены Jupiter |

## Пример вывода

```text
━━━ Pyth price feeds (on-chain, devnet) ━━━
SOL/USD   $  100.1147  ±0.0926  EMA $100.0337  age 287s  [Full]
USDC/USD  $    0.9997  ±0.0001  EMA $0.9997  age 287s  [Full]

Roofic: доля за 0.002 SOL ≈ $0.20

━━━ Jupiter quote: 1 SOL → USDC ━━━
Получим:          100.2550 USDC
Минимум (slip 0.5%): 99.7537 USDC — ниже транзакция откатится
Price impact:     0.00109%
Инструкции: ComputeBudget ×2, Associated Token, System Program, SPL Token,
            Associated Token, Jupiter v6 (27 accounts), SPL Token

Kamino USDC supply APY 4.41%  ·  Marinade mSOL 5.03%  ·  Jito 4.90%
```

## Решения и обоснование

- **Pyth читаем вручную, без SDK.** Показывает, как устроен аккаунт на уровне байтов (layout в комментарии `src/pyth.ts`) — полезно для защиты и для понимания, что именно проверяет `pyth-solana-receiver-sdk`.
- **Jupiter не отправляет транзакцию.** Jupiter существует только в mainnet, а курс идёт на devnet. Мы получаем настоящую котировку и разбираем настоящую транзакцию, но средства не трогаем.
- **Kamino в Capstone — только дизайн.** Для реальной интеграции нужен CPI в mainnet-программу, которой нет на devnet. Подробности в разделе «Выводы для архитектуры» в [DEFI_LANDSCAPE.md](DEFI_LANDSCAPE.md).

## Запуск

```bash
npm install
npm run all          # все три скрипта
npm run typecheck
```

Для вывода в приложении: `cd ../week-08-mvp/app && npm run dev` (подключите devnet RPC; на локальном валидаторе Pyth-аккаунтов нет, и USD-подписи просто скрываются).
