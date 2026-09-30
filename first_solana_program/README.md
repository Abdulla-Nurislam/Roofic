# First Solana Program — Native Counter

Нативная Solana Program (без Anchor) с функциональностью счётчика.

## Архитектура

```
first_solana_program/
├── src/
│   └── lib.rs           # Программа: entrypoint, инструкции, обработчики
├── client/
│   ├── client.ts        # TypeScript-клиент
│   ├── package.json
│   └── tsconfig.json
├── Cargo.toml
└── target/deploy/
    ├── first_solana_program.so          # Скомпилированная программа
    └── first_solana_program-keypair.json # Keypair программы
```

## Инструкции программы

| Инструкция | Описание |
|-----------|----------|
| `Initialize` | Инициализирует счётчик (count = 0) |
| `Increment` | Увеличивает счётчик на 1 |
| `Decrement` | Уменьшает счётчик на 1 (проверка >= 0) |
| `Set { value }` | Устанавливает конкретное значение |

## Сборка

```bash
# Через cargo build-sbf (нужен rustup-cargo в PATH)
PATH="$HOME/.cargo/bin:$PATH" cargo build-sbf
```

## Деплой в Devnet

```bash
# Убедитесь что есть SOL
solana airdrop 2

# Деплой
solana program deploy target/deploy/first_solana_program.so
```

## Клиент

```bash
cd client
npm install
npx ts-node --esm client.ts
```

## Ключевые концепции

- **Entrypoint** — `process_instruction(program_id, accounts, instruction_data)`
- **Borsh** — сериализация/десериализация данных
- **AccountInfo** — доступ к данным аккаунтов
- **ProgramError** — обработка ошибок
- **msg!()** — логирование на блокчейне
