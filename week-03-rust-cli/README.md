# Неделя 3 — Rust для Solana-разработчика

| | |
|---|---|
| **Задание** | Создать небольшую CLI-программу на Rust с использованием конструкций, которые понадобятся в Solana-разработке |
| **РО** | РО2 — разработка Solana Programs на Rust |
| **Исходный код** | [`src/main.rs`](src/main.rs) |

## Что сделано

Консольная утилита на Rust, моделирующая жизненный цикл аккаунтов и обработку инструкций в Solana без внешних зависимостей:

| Конструкция в [`src/main.rs`](src/main.rs) | Аналог в Solana Program |
|---|---|
| `enum Instruction` (`CreateWallet`, `Transfer`, `GetBalance`, `CloseWallet`) | Enum инструкций программы (Borsh-дискриминатор + аргументы) |
| `struct WalletAccount` (`owner`, `balance`, `is_initialized`) | Данные on-chain аккаунта (`AccountInfo::data`) |
| `trait Serializable` (`serialize(&self) -> Vec<u8>`) | Ручная сериализация в байты (1 байт флага + `u32` длина строки + UTF-8 + `u64` little-endian), аналогично `BorshSerialize` |
| `enum ProgramError` (`AccountNotFound`, `AccountAlreadyExists`, `InsufficientFunds`, `AccountClosed`, `InvalidInstruction`) | `solana_program::program_error::ProgramError` и кастомные коды ошибок Anchor |
| `Processor::process_instruction` | Точка входа `entrypoint!(process_instruction)` и роутинг через `match` |

## Запуск

```bash
# Полный демонстрационный сценарий из 9 шагов (создание, перевод, переполнение баланса, закрытие аккаунта)
cargo run

# Вызов отдельных CLI-команд
cargo run -- create alice 10000000
cargo run -- transfer alice bob 250000
cargo run -- balance alice
cargo run -- close bob
```

## Проверка

В режиме без аргументов (`cargo run`) программа последовательно проверяет позитивные и негативные сценарии:
1. Создание двух кошельков (`alice` и `bob`) с сериализацией состояния в байтовый массив `Vec<u8>`.
2. Отказ при повторной инициализации (`AccountAlreadyExists`).
3. Перевод `3_000_000` lamports от `alice` к `bob`.
4. Отказ при попытке перевести больше доступного баланса (`InsufficientFunds`).
5. Закрытие аккаунта `bob` (`CloseWallet`) с обнулением баланса и флага `is_initialized = false`.
6. Отказ при переводе на закрытый (`AccountClosed`) или несуществующий (`AccountNotFound`) аккаунт.

