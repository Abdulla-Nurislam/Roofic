# Эталонные пресеты объектов RWA (`PRESET_CATALOG`)

Документ фиксирует аналитические паспорта трёх демонстрационных объектов недвижимости Казахстана, используемых в финансовой модели [`model/unit_economics.py`](model/unit_economics.py), эталонном Python-скоринге [`../capstone/scoring/engine.py`](../capstone/scoring/engine.py), веб-терминале [`../capstone/app/src/lib/scoring.ts`](../capstone/app/src/lib/scoring.ts) и ончейн-деплое в Solana Devnet.

> **Дисклеймер:** параметры доходности, вакантности и операционных расходов являются **иллюстративными модельными допущениями** для демонстрации работы протокола и детерминированного скоринга. Перед реальным размещением каждый объект обязан пройти независимую оценку и аудит SPV.

---

## 1. Сводная матрица объектов

Все объекты структурированы с единым номиналом одной доли **`$100 USDC`** (`0 decimals`, расширение Token-2022 `NonTransferable`), ставкой комиссии с аренды `rent_fee_bps = 100` (1.0%) и комиссией первичного размещения `sale_fee_bps = 150` (1.5%).

| ID | Объект | Город | Стоимость (`price_usd`) | Долей (`total_shares`) | Валовая ставка (`gross_yield`) | Вакантность | OpEx | Комиссия УК | Возраст здания |
|--:|---|---|---:|---:|---:|---:|---:|---:|---:|
| `1` | **Almaty Loft #1** | Алматы | $100 000 | 1 000 | 9.50% | 7.0% | 18.0% | 5.0% | 4 года |
| `2` | **Astana Business Center** | Астана | $250 000 | 2 500 | 11.00% | 6.0% | 16.0% | 5.0% | 3 года |
| `3` | **Shymkent Family House** | Шымкент | $80 000 | 800 | 8.80% | 9.0% | 20.0% | 5.0% | 8 лет |
| **Σ** | **Портфель (3 объекта)** | **РК** | **$430 000** | **4 300** | **10.24%** *(взвеш.)* | — | — | — | — |

---

## 2. Водопад годового дохода и комиссии платформы (базовый сценарий)

Расчёт выполнен по модели [`model/unit_economics.py`](model/unit_economics.py):

| Объект | Потенциальная аренда | Сбор после вакантности | Чистый операционный доход (NOI) | Рентная комиссия (1%) | Доход инвесторов / год | Чистая доходность (`base`) | Разовая комиссия листинга (1.5%) |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Almaty Loft #1** | $9 500.00 | $8 835.00 | $6 802.95 | $68.03 | $6 734.92 | **6.73%** | $1 500.00 |
| **Astana Business Center** | $27 500.00 | $25 850.00 | $20 421.50 | $204.22 | $20 217.29 | **8.09%** | $3 750.00 |
| **Shymkent Family House** | $7 040.00 | $6 406.40 | $4 804.80 | $48.05 | $4 756.75 | **5.95%** | $1 200.00 |
| **Итого по портфелю** | **$44 040.00** | **$41 091.40** | **$32 029.25** | **$320.29** | **$31 708.96** | **7.37%** *(взвеш.)* | **$6 450.00** |

- **Выручка платформы за 1-й год на пилотном портфеле ($430k AUM):** `$6 450.00` (листинг) + `$320.29` (рента) = **`$6 770.29`** (покрывает ~18.8% годовых фиксированных издержек `$36 000` всего на трёх объектах).

---

## 3. Сценарная доходность, риск-скор и ончейн-хэш (`valuation_hash`)

Значения полностью совпадают между Python ([`capstone/scoring/engine.py`](../capstone/scoring/engine.py)) и TypeScript ([`capstone/app/src/lib/scoring.ts`](../capstone/app/src/lib/scoring.ts)):

| Объект | Bear / Base / Bull | Risk Score | Грейд | Разложение факторов (`vacancy` / `opex` / `age` / `downside`) | SHA-256 `valuation_hash` |
|---|:---:|---:|:---:|:---:|---|
| **Almaty Loft #1** | `4.95%` / `6.73%` / `8.09%` | `37 / 100` | **B** | `9 + 14 + 3 + 11` | `0x65801abf0776d0b4d6078345c19e926980837f10cf383e7175ebfb96f014a9c1` |
| **Astana Business Center** | `5.96%` / `8.09%` / `9.70%` | `30 / 100` | **B** | `8 + 13 + 2 + 7` | `0x5ab5ab049c3c64259895384316a5660ee26b6998fa8dcda10fd4772aee7b3349` |
| **Shymkent Family House** | `4.35%` / `5.95%` / `7.15%` | `45 / 100` | **C** | `11 + 15 + 6 + 13` | `0x72cac0027b03ed2ab7547944d8369d52ec3d9da8d77dee7844f1b432d4473979` |

> Для **Shymkent Family House** стресс-доходность `bear = 4.35%` опускается ниже порога `4.50%`, поэтому движок скоринга автоматически формирует предупреждение `Bear-case net yield falls below 4.5% threshold` и присваивает грейд **C**.

---

## 4. Привязка к ончейн-аккаунтам в Solana Devnet

Все три пресета развёрнуты в кластере **Solana Devnet** скриптом [`capstone/app/scripts/seed.ts`](../capstone/app/scripts/seed.ts):

| Объект | `Property` PDA | `vault` PDA (Demo USDC) |
|---|---|---|
| **Almaty Loft #1** | [`Den4nnxLdHra37Rh8e3qwygKoE8pMDC3PU5KQaCVkrFY`](https://explorer.solana.com/address/Den4nnxLdHra37Rh8e3qwygKoE8pMDC3PU5KQaCVkrFY?cluster=devnet) | [`6wnLsf7wwSck4g5v4YMLmkuG6NvVYxhiBvkiYyimnkuG`](https://explorer.solana.com/address/6wnLsf7wwSck4g5v4YMLmkuG6NvVYxhiBvkiYyimnkuG?cluster=devnet) |
| **Astana Business Center** | [`5uCpYV7DCk4eVZudGMmso4GZ5EkdKnuzCg3U9F28nAMB`](https://explorer.solana.com/address/5uCpYV7DCk4eVZudGMmso4GZ5EkdKnuzCg3U9F28nAMB?cluster=devnet) | [`BHoiUDxbPJL5FN7Djge1raKfucS15phCpjhR4g3NgavH`](https://explorer.solana.com/address/BHoiUDxbPJL5FN7Djge1raKfucS15phCpjhR4g3NgavH?cluster=devnet) |
| **Shymkent Family House** | [`9n8jLdfeog4fCpUBBes6WVxPJBXsx4pS7rx5n2DAqoey`](https://explorer.solana.com/address/9n8jLdfeog4fCpUBBes6WVxPJBXsx4pS7rx5n2DAqoey?cluster=devnet) | [`FVHiWsFhqYHd9mkhQ4EoqgyCPL1iAaM3etzJkgGhdf4Q`](https://explorer.solana.com/address/FVHiWsFhqYHd9mkhQ4EoqgyCPL1iAaM3etzJkgGhdf4Q?cluster=devnet) |
