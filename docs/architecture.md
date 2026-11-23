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

## 3. Потоки средств и алгоритм распределения аренды

1. **Первичная покупка (`buy_shares`):**
   - Инвестор с активным `Investor` PDA переводит `cost = shares * price_per_share` в `payment_mint`.
   - Комиссия `fee = cost * sale_fee_bps / 10_000` уходит в `treasury`, остаток `cost - fee` — на счёт `owner_payment`.
   - Перед изменением `position.shares` накопленная до этого момента аренда фиксируется в `position.unclaimed`, чтобы новые доли не претендовали на прошлые выплаты.
   - `Property` PDA выпускает `shares` токенов `share_mint` на ATA инвестора.
2. **Внесение аренды (`deposit_rent`):**
   - Вызывается строго управляющей компанией (`Property.manager`).
   - Комиссия `rent_fee_bps` уходит в `treasury`, чистая сумма `net` — в `vault`.
   - Глобальный аккумулятор обновляется за $O(1)$:
     $$\text{acc\_rent\_per\_share} \mathrel{+}= \left\lfloor \frac{\text{net} \times 10^{12}}{\text{shares\_sold}} \right\rfloor$$
3. **Вывод дохода (`claim_rent`):**
   - Доступен инвестору в любой момент — даже при включённой паузе или отозванном KYC.
   - Выплачивается `unclaimed + floor(shares * acc_rent_per_share / 1e12) - reward_debt` из `vault` за подписью `Property` PDA.

---

## 4. Ключевые проектные решения (вкратце)

| Решение | Почему выбрано |
|---|---|
| **Token-2022 `NonTransferable`** | Исключает двойной клейм аренды при пересылке токенов без сложного `TransferHook` |
| **Стейблкоин (`TokenInterface`) вместо SOL** | Защищает рентную доходность 6–8% годовых от волатильности SOL и поддерживает как SPL USDC, так и Token-2022 PYUSD |
| **Аккумулятор $O(1)$ с масштабом `1e12`** | Постоянная стоимость `deposit_rent` независимо от числа инвесторов и минимальная погрешность округления |
| **`shares_sold` вместо `share_mint.supply`** | Сжигание долевых токенов пользователем не искажает знаменатель аренды и не позволяет превысить `total_shares` |
| **`claim_rent` вне режима `paused`** | Гарантирует, что администратор не может заморозить уже накопленный доход инвесторов в `vault` |
