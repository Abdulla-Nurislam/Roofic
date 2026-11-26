# Roofic — Модель рисков и угроз

Компактная сводка безопасности протокола **Roofic** (`capstone/programs/roofic`): какие активы защищаются, от каких векторов атак защищает ончейн-код и какие ограничения являются осознанными компромиссами MVP.

---

## 1. Защищаемые активы

| Актив | Где хранится | Критичность |
|---|---|---|
| Арендный пул объекта (`vault`) | Token-счёт PDA `["vault", property]` | Средства инвесторов, не должны блокироваться или выводиться третьими лицами |
| Реестр долей (`Property.shares_sold`, `Position.shares`) | PDA `Property` и `Position` | Истина для расчёта пропорциональной доли аренды ($O(1)$ аккумулятор) |
| Долевые токены (Token-2022) | ATA инвестора, минт `["share_mint", property]` | Подтверждение участия с расширением `NonTransferable` |
| Конфигурация платформы (`PlatformConfig`) | Синглтон PDA `["config"]` | Права `admin`, ставки комиссий (`≤ 20%`), адрес `payment_mint` и `treasury` |
| KYC/KYB-допуск (`Investor`) | PDA `["investor", wallet]` | Контроль доступа к листингу объектов и первичной покупке долей |
| Целостность оценки (`valuation_hash`) | Поле `Property.valuation_hash` (`[u8; 32]`) | Неизменяемая фиксация SHA-256 отчёта доходности и риск-скора |

---

## 2. Модель нарушителя

1. **Неавторизованный пользователь сети** — может отправлять произвольные транзакции и подставлять поддельные аккаунты/программы в любую инструкцию.
2. **Недобросовестный держатель долей** — может пытаться переводить или сжигать свои Token-2022 доли, завышать расчётную долю в `vault` или выводить чужую аренду.
3. **Эмитент или менеджер за пределами своей роли** — `owner` не может вносить аренду вместо `manager`, а `manager` не может менять параметры платформы или выводить `vault`.
4. **Фронтраннер при деплое** — пытается перехватить вызов `initialize_platform` сразу после публикации программы.

---

## 3. От чего протокол защищён

| Угроза | Механизм защиты в Roofic | Проверка в коде и тестах |
|---|---|---|
| Перехват `initialize_platform` (front-running) | Сверка `program.programdata_address()` и `program_data.upgrade_authority_address == Some(admin)` | `capstone/programs/roofic/src/lib.rs`, тест `initialize_platform_rejects_non_upgrade_authority` |
| Подделка ролей (`admin`, `owner`, `manager`, `investor`) | `Signer<'info>` + `has_one` + PDA-сиды `["investor", wallet]` / `["position", property, investor]` | Тесты `only_the_admin_can_pause_and_fees_are_capped`, `only_the_property_manager_can_deposit_rent`, `unapproved_issuer_cannot_create_property`, `nobody_can_claim_someone_elses_position` |
| Двойное получение аренды через пересылку долей | Расширение Token-2022 `NonTransferable` запрещает переводы долей между кошельками | Тест `shares_cannot_be_transferred_between_wallets` |
| Манипуляция долей пула через сжигание (`Burn`) долей | Делитель в `deposit_rent` и лимит в `buy_shares` используют монотонный `property.shares_sold`, а не `share_mint.supply` | Тесты `burning_share_tokens_cannot_steal_other_holders_rent`, `burning_share_tokens_cannot_oversell_beyond_total_shares` |
| Дефицит `vault` из-за комиссий на перевод стейблкоина | `assert_clean_payment_mint` блокирует `TransferFeeConfig`, `TransferHook`, `PermanentDelegate` на `payment_mint` | Тест `fee_bearing_payment_mint_is_rejected_at_init` |
| Захват средств инвесторов при паузе или отзыве KYC | `claim_rent` намеренно не проверяет `config.paused` и не требует активной записи `Investor` | Тесты `pause_blocks_buying_and_rent_but_never_claims`, `revoked_investor_can_still_claim_accrued_rent` |
| Подмена токен-программы (Arbitrary CPI) и переполнения | Типизированные `Program<Token2022>` / `Interface<TokenInterface>`, `transfer_checked`, `checked_*` + `overflow-checks = true` | Тесты `wrong_payment_token_program_is_rejected`, `money_is_conserved_with_the_spl_token_program`, `money_is_conserved_with_the_token2022_program` |
| Произвольное завышение комиссий администратором | Жёсткий потолок `MAX_FEE_BPS = 2_000` (20%) на уровне контракта | Тест `only_the_admin_can_pause_and_fees_are_capped` |
| Подмена фида оракула на фронтенде/клиенте | Проверка владельца аккаунта Pyth Receiver (`rec5EKMG…`) при декодировании `PriceUpdateV2` | `week-09-defi/src/pyth.ts`, `capstone/app/src/lib/defi.ts` |

---

## 4. Ограничения и осознанные компромиссы (Trade-offs)

| Ограничение | Почему так в MVP | Как закрывается в продакшне |
|---|---|---|
| **Один ключ `admin` и `upgrade_authority`** | Упрощённое администрирование учебного деплоя в Devnet | Перенос `admin` и `upgrade_authority` на мультисиг (Squads) + timelock |
| **Нет вторичного рынка долей** | `NonTransferable` исключает рассинхронизацию рентного аккумулятора без сложного хука | Внедрение `TransferHook`, синхронизирующего `Position` и `reward_debt` при каждом переводе |
| **Доверие к off-chain KYC и УК (`manager`)** | Блокчейн не может принудить арендатора перевести фиат в USDC без юридического контура | Юридическая структура SPV и публичный аудит отчётов УК (`week-13-rwa-design/RWA_DESIGN.md`) |
| **Остаток округления (dust)** | Целочисленное деление `net * 1e12 / shares_sold` оставляет `< shares_sold` минимальных единиц в `vault` | Доказано инвариантом в тестах (`vault < 25` базовых единиц, инсольвентность невозможна) |
| **Окружение Devnet и публичный RPC** | Учебный проект без собственного валидатора и платного RPC | Выделенный RPC-провайдер с резервированием и мониторинг событий контракта |
