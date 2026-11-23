# Архитектура платформы Roofic

Документ описывает устройство финального протокола [`capstone/`](../capstone/): ончейн-схему PDA-аккаунтов, потоки токенов и связку с аналитическим скорингом.

---

## 1. Компоненты системы

```text
capstone/
├── programs/roofic/
│   ├── src/lib.rs            # Anchor-программа: KYC, листинг, покупка долей, аренда, пауза
│   └── tests/roofic_test.rs  # Интеграционные тесты LiteSVM (SPL Token + Token-2022)
├── scoring/
│   ├── engine.py             # Детерминированный расчёт Bear/Base/Bull + Risk Score + SHA-256
│   └── test_engine.py        # Юнит-тесты скоринга
└── app/
    └── src/
        ├── lib/program.ts    # Клиент Anchor, PDA-деривация и чтение состояния
        ├── lib/defi.ts       # Ончейн-цены Pyth PriceUpdateV2 и котировка Jupiter v6
        └── lib/scoring.ts    # Зеркальный TS-расчёт с побайтовой сверкой SHA-256 с Python
```

---

## 2. Карта PDA-аккаунтов

Все адреса вычисляются детерминированно из сидов, экспортированных в IDL через `#[constant]`:

| Аккаунт | Seeds | Назначение |
|---|---|---|
| `PlatformConfig` | `["config"]` | Глобальные настройки: `admin`, `treasury`, `payment_mint`, `sale_fee_bps`, `rent_fee_bps`, `paused` |
| `Investor` | `["investor", wallet]` | Ончейн-реестр KYC/KYB (требуется для `create_property` и `buy_shares`) |
| `Property` | `["property", owner, id_le]` | Паспорт объекта: параметры эмиссии, `shares_sold`, `acc_rent_per_share`, `valuation_hash`; выступает authority для `share_mint` и `vault` |
| `share_mint` | `["share_mint", property]` | Token-2022 минт долей (`decimals = 0`, расширение `NonTransferable`) |
| `vault` | `["vault", property]` | Изолированный токен-сейф арендного дохода конкретного объекта |
| `Position` | `["position", property, investor]` | Учёт долей вкладчика (`shares`), `reward_debt`, `unclaimed` и `total_claimed` |

---

