// ============================================================================
// Rust CLI для Solana-разработчика
// Демонстрация конструкций Rust, необходимых для Solana-разработки
// ============================================================================

use std::collections::HashMap;
use std::env;
use std::fmt;

// ============================================================================
// 1. ENUM — Аналог Instruction в Solana
//    В Solana программах enum используется для определения инструкций
// ============================================================================
#[derive(Debug, Clone)]
enum Instruction {
    CreateWallet { owner: String, balance: u64 },
    Transfer { from: String, to: String, amount: u64 },
    GetBalance { owner: String },
    CloseWallet { owner: String },
}

// ============================================================================
// 2. STRUCT — Аналог Account Data в Solana
//    Хранит данные аккаунта (баланс, owner, статус)
// ============================================================================
#[derive(Debug, Clone)]
struct WalletAccount {
    owner: String,
    balance: u64,
    is_initialized: bool,
}

// ============================================================================
// 3. TRAIT — Аналог сериализации/десериализации (BorshSerialize/Deserialize)
//    Определяем собственный трейт для сериализации в Vec<u8>
// ============================================================================
trait Serializable {
    fn serialize(&self) -> Vec<u8>;
    fn description(&self) -> String;
}

impl Serializable for WalletAccount {
    /// Сериализация в байты — в Solana используется Borsh
    fn serialize(&self) -> Vec<u8> {
        let mut data = Vec::new();

        // Записываем флаг инициализации (1 байт)
        data.push(if self.is_initialized { 1 } else { 0 });

        // Записываем длину owner + строку
        let owner_bytes = self.owner.as_bytes();
        data.extend_from_slice(&(owner_bytes.len() as u32).to_le_bytes());
        data.extend_from_slice(owner_bytes);

        // Записываем баланс (8 байт, little-endian — как в Solana)
        data.extend_from_slice(&self.balance.to_le_bytes());

        data
    }

    fn description(&self) -> String {
        format!(
            "Wallet[owner={}, balance={} lamports, initialized={}]",
            self.owner, self.balance, self.is_initialized
        )
    }
}

// ============================================================================
// 4. Display TRAIT — Для красивого вывода
// ============================================================================
impl fmt::Display for WalletAccount {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "👛 {} | Balance: {} lamports | Status: {}",
            self.owner,
            self.balance,
            if self.is_initialized {
                "✅ Active"
            } else {
                "❌ Closed"
            }
        )
    }
}

// ============================================================================
// 5. CUSTOM ERROR — Аналог ProgramError в Solana
//    В Solana каждая программа определяет свои ошибки
// ============================================================================
#[derive(Debug)]
enum ProgramError {
    AccountNotFound(String),
    AccountAlreadyExists(String),
    InsufficientFunds { available: u64, requested: u64 },
    AccountClosed(String),
    InvalidInstruction(String),
}

impl fmt::Display for ProgramError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ProgramError::AccountNotFound(addr) => {
                write!(f, "❌ Account not found: {}", addr)
            }
            ProgramError::AccountAlreadyExists(addr) => {
                write!(f, "❌ Account already exists: {}", addr)
            }
            ProgramError::InsufficientFunds {
                available,
                requested,
            } => {
                write!(
                    f,
                    "❌ Insufficient funds: available={}, requested={}",
                    available, requested
                )
            }
            ProgramError::AccountClosed(addr) => {
                write!(f, "❌ Account is closed: {}", addr)
            }
            ProgramError::InvalidInstruction(msg) => {
                write!(f, "❌ Invalid instruction: {}", msg)
            }
        }
    }
}

// ============================================================================
// 6. PROCESSOR — Аналог process_instruction в Solana
//    HashMap используется как симуляция account storage (AccountInfo[])
// ============================================================================
struct Processor {
    accounts: HashMap<String, WalletAccount>,
}

impl Processor {
    fn new() -> Self {
        Processor {
            accounts: HashMap::new(),
        }
    }

    /// Основной обработчик — аналог entrypoint process_instruction
    /// В Solana: fn process_instruction(program_id, accounts, instruction_data) -> ProgramResult
    fn process_instruction(&mut self, instruction: Instruction) -> Result<String, ProgramError> {
        // match — ключевая конструкция для роутинга инструкций в Solana
        match instruction {
            Instruction::CreateWallet { owner, balance } => {
                self.create_wallet(&owner, balance)
            }
            Instruction::Transfer { from, to, amount } => {
                self.transfer(&from, &to, amount)
            }
            Instruction::GetBalance { owner } => {
                self.get_balance(&owner)
            }
            Instruction::CloseWallet { owner } => {
                self.close_wallet(&owner)
            }
        }
    }

    fn create_wallet(&mut self, owner: &str, balance: u64) -> Result<String, ProgramError> {
        // Проверка: аккаунт не должен уже существовать
        if self.accounts.contains_key(owner) {
            return Err(ProgramError::AccountAlreadyExists(owner.to_string()));
        }

        let account = WalletAccount {
            owner: owner.to_string(),
            balance,
            is_initialized: true,
        };

        // Сериализация — показываем как данные выглядят в байтах
        let serialized = account.serialize();
        println!("  📦 Serialized data ({} bytes): {:?}", serialized.len(), serialized);

        self.accounts.insert(owner.to_string(), account);

        Ok(format!("✅ Wallet created for '{}' with {} lamports", owner, balance))
    }

    fn transfer(&mut self, from: &str, to: &str, amount: u64) -> Result<String, ProgramError> {
        // Проверяем sender
        let sender = self
            .accounts
            .get(from)
            .ok_or_else(|| ProgramError::AccountNotFound(from.to_string()))?;

        if !sender.is_initialized {
            return Err(ProgramError::AccountClosed(from.to_string()));
        }

        if sender.balance < amount {
            return Err(ProgramError::InsufficientFunds {
                available: sender.balance,
                requested: amount,
            });
        }

        // Проверяем receiver
        if !self.accounts.contains_key(to) {
            return Err(ProgramError::AccountNotFound(to.to_string()));
        }

        let receiver = self.accounts.get(to).unwrap();
        if !receiver.is_initialized {
            return Err(ProgramError::AccountClosed(to.to_string()));
        }

        // Выполняем перевод (мутабельный доступ)
        self.accounts.get_mut(from).unwrap().balance -= amount;
        self.accounts.get_mut(to).unwrap().balance += amount;

        Ok(format!(
            "✅ Transferred {} lamports: '{}' → '{}'",
            amount, from, to
        ))
    }

    fn get_balance(&self, owner: &str) -> Result<String, ProgramError> {
        let account = self
            .accounts
            .get(owner)
            .ok_or_else(|| ProgramError::AccountNotFound(owner.to_string()))?;

        Ok(format!("  {}", account))
    }

    fn close_wallet(&mut self, owner: &str) -> Result<String, ProgramError> {
        let account = self
            .accounts
            .get_mut(owner)
            .ok_or_else(|| ProgramError::AccountNotFound(owner.to_string()))?;

        if !account.is_initialized {
            return Err(ProgramError::AccountClosed(owner.to_string()));
        }

        // В Solana: возвращаем lamports rent-payer'у и обнуляем данные
        let remaining = account.balance;
        account.balance = 0;
        account.is_initialized = false;

        Ok(format!(
            "✅ Wallet '{}' closed. Returned {} lamports.",
            owner, remaining
        ))
    }

    fn list_accounts(&self) {
        println!("\n📋 All Accounts:");
        println!("{}", "─".repeat(60));
        if self.accounts.is_empty() {
            println!("  (no accounts)");
        }
        for (_, account) in &self.accounts {
            println!("  {}", account);
            println!("    └─ {}", account.description());
        }
        println!("{}", "─".repeat(60));
    }
}

// ============================================================================
// 7. PARSE CLI ARGS — Парсинг аргументов командной строки
//    Аналог десериализации instruction_data из байтов
// ============================================================================
fn parse_instruction(args: &[String]) -> Result<Instruction, ProgramError> {
    if args.is_empty() {
        return Err(ProgramError::InvalidInstruction(
            "No command provided".to_string(),
        ));
    }

    // match по строке команды — аналог match по первому байту instruction_data
    match args[0].as_str() {
        "create" => {
            if args.len() < 3 {
                return Err(ProgramError::InvalidInstruction(
                    "Usage: create <owner> <balance>".to_string(),
                ));
            }
            let balance = args[2].parse::<u64>().map_err(|_| {
                ProgramError::InvalidInstruction("Balance must be a number".to_string())
            })?;
            Ok(Instruction::CreateWallet {
                owner: args[1].clone(),
                balance,
            })
        }
        "transfer" => {
            if args.len() < 4 {
                return Err(ProgramError::InvalidInstruction(
                    "Usage: transfer <from> <to> <amount>".to_string(),
                ));
            }
            let amount = args[3].parse::<u64>().map_err(|_| {
                ProgramError::InvalidInstruction("Amount must be a number".to_string())
            })?;
            Ok(Instruction::Transfer {
                from: args[1].clone(),
                to: args[2].clone(),
                amount,
            })
        }
        "balance" => {
            if args.len() < 2 {
                return Err(ProgramError::InvalidInstruction(
                    "Usage: balance <owner>".to_string(),
                ));
            }
            Ok(Instruction::GetBalance {
                owner: args[1].clone(),
            })
        }
        "close" => {
            if args.len() < 2 {
                return Err(ProgramError::InvalidInstruction(
                    "Usage: close <owner>".to_string(),
                ));
            }
            Ok(Instruction::CloseWallet {
                owner: args[1].clone(),
            })
        }
        cmd => Err(ProgramError::InvalidInstruction(format!(
            "Unknown command: '{}'. Available: create, transfer, balance, close",
            cmd
        ))),
    }
}

// ============================================================================
// MAIN — Точка входа
// ============================================================================
fn main() {
    println!("╔══════════════════════════════════════════════════════════╗");
    println!("║    🦀 Rust CLI — Solana Developer Concepts Demo        ║");
    println!("╚══════════════════════════════════════════════════════════╝");
    println!();

    let args: Vec<String> = env::args().collect();

    // Если есть аргументы — выполняем одну команду
    if args.len() > 1 {
        let mut processor = Processor::new();

        // Для одиночных команд создаём тестовые данные
        if args[1] != "create" {
            let _ = processor.process_instruction(Instruction::CreateWallet {
                owner: "alice".to_string(),
                balance: 1_000_000,
            });
            let _ = processor.process_instruction(Instruction::CreateWallet {
                owner: "bob".to_string(),
                balance: 500_000,
            });
        }

        let instruction_args = &args[1..];
        match parse_instruction(instruction_args) {
            Ok(instruction) => {
                println!("📨 Instruction: {:?}", instruction);
                match processor.process_instruction(instruction) {
                    Ok(msg) => println!("{}", msg),
                    Err(e) => eprintln!("{}", e),
                }
            }
            Err(e) => eprintln!("{}", e),
        }
        return;
    }

    // Если нет аргументов — запускаем полную демонстрацию
    println!("🚀 Running full demo (no CLI args provided)...\n");

    let mut processor = Processor::new();

    // Демо-сценарий
    let instructions = vec![
        // 1. Создаём кошельки
        Instruction::CreateWallet {
            owner: "alice".to_string(),
            balance: 10_000_000, // 0.01 SOL в lamports
        },
        Instruction::CreateWallet {
            owner: "bob".to_string(),
            balance: 5_000_000,
        },
        // 2. Попытка создать дубликат — ошибка
        Instruction::CreateWallet {
            owner: "alice".to_string(),
            balance: 100,
        },
        // 3. Проверяем балансы
        Instruction::GetBalance {
            owner: "alice".to_string(),
        },
        Instruction::GetBalance {
            owner: "bob".to_string(),
        },
        // 4. Переводим средства
        Instruction::Transfer {
            from: "alice".to_string(),
            to: "bob".to_string(),
            amount: 3_000_000,
        },
        // 5. Проверяем балансы после перевода
        Instruction::GetBalance {
            owner: "alice".to_string(),
        },
        Instruction::GetBalance {
            owner: "bob".to_string(),
        },
        // 6. Попытка перевести больше, чем есть — ошибка
        Instruction::Transfer {
            from: "alice".to_string(),
            to: "bob".to_string(),
            amount: 999_999_999,
        },
        // 7. Закрываем кошелёк
        Instruction::CloseWallet {
            owner: "bob".to_string(),
        },
        // 8. Попытка перевести на закрытый — ошибка
        Instruction::Transfer {
            from: "alice".to_string(),
            to: "bob".to_string(),
            amount: 100,
        },
        // 9. Несуществующий аккаунт
        Instruction::GetBalance {
            owner: "charlie".to_string(),
        },
    ];

    for (i, instruction) in instructions.iter().enumerate() {
        println!("─── Step {} ───", i + 1);
        println!("📨 {:?}", instruction);

        match processor.process_instruction(instruction.clone()) {
            Ok(msg) => println!("{}", msg),
            Err(e) => eprintln!("{}", e),
        }
        println!();
    }

    // Показываем финальное состояние
    processor.list_accounts();

    // Показываем CLI usage
    println!("\n📖 CLI Usage:");
    println!("  cargo run -- create <name> <balance>");
    println!("  cargo run -- transfer <from> <to> <amount>");
    println!("  cargo run -- balance <name>");
    println!("  cargo run -- close <name>");
}
