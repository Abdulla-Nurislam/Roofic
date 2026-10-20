// ============================================================================
// Первая Solana Program — Hello World + Counter (Нативная, без Anchor)
// ============================================================================
//
// Эта программа демонстрирует:
// 1. Entrypoint через process_instruction
// 2. Десериализацию instruction_data (Borsh)
// 3. Чтение и запись в Account Data
// 4. Логирование через msg!()
// 5. Проверку владельца аккаунта
// 6. Обработку ошибок ProgramError
// ============================================================================

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};

// ============================================================================
// Данные аккаунта — хранятся on-chain
// ============================================================================
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct CounterAccount {
    pub count: u64,
}

// ============================================================================
// Инструкции программы
// ============================================================================
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum CounterInstruction {
    /// Инициализировать счётчик (count = 0)
    Initialize,
    /// Увеличить счётчик на 1
    Increment,
    /// Уменьшить счётчик на 1
    Decrement,
    /// Установить конкретное значение
    Set { value: u64 },
}

// ============================================================================
// Entrypoint — точка входа Solana программы
// ============================================================================
entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("🚀 Hello from First Solana Program!");
    msg!("Program ID: {}", program_id);

    // Десериализуем инструкцию из байтов
    let instruction = CounterInstruction::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    msg!("📨 Instruction: {:?}", instruction);

    // Роутинг инструкций
    match instruction {
        CounterInstruction::Initialize => initialize(program_id, accounts),
        CounterInstruction::Increment => increment(program_id, accounts),
        CounterInstruction::Decrement => decrement(program_id, accounts),
        CounterInstruction::Set { value } => set_value(program_id, accounts, value),
    }
}

// ============================================================================
// Обработчики инструкций
// ============================================================================

/// Инициализация счётчика
fn initialize(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let counter_account = next_account_info(accounts_iter)?;

    // Проверка: аккаунт принадлежит нашей программе
    if counter_account.owner != program_id {
        msg!("❌ Counter account does not belong to this program");
        return Err(ProgramError::IncorrectProgramId);
    }

    // Инициализируем данные
    let counter = CounterAccount { count: 0 };
    counter.serialize(&mut &mut counter_account.data.borrow_mut()[..])?;

    msg!("✅ Counter initialized to 0");
    Ok(())
}

/// Увеличить счётчик
fn increment(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let counter_account = next_account_info(accounts_iter)?;

    if counter_account.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    // Десериализуем текущее значение
    let mut counter = CounterAccount::try_from_slice(&counter_account.data.borrow())?;
    counter.count = counter.count.checked_add(1).ok_or(ProgramError::ArithmeticOverflow)?;
    counter.serialize(&mut &mut counter_account.data.borrow_mut()[..])?;

    msg!("✅ Counter incremented to {}", counter.count);
    Ok(())
}

/// Уменьшить счётчик
fn decrement(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let counter_account = next_account_info(accounts_iter)?;

    if counter_account.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    let mut counter = CounterAccount::try_from_slice(&counter_account.data.borrow())?;

    if counter.count == 0 {
        msg!("❌ Counter is already 0, cannot decrement");
        return Err(ProgramError::InvalidArgument);
    }

    counter.count -= 1;
    counter.serialize(&mut &mut counter_account.data.borrow_mut()[..])?;

    msg!("✅ Counter decremented to {}", counter.count);
    Ok(())
}

/// Установить значение
fn set_value(program_id: &Pubkey, accounts: &[AccountInfo], value: u64) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let counter_account = next_account_info(accounts_iter)?;

    if counter_account.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    let mut counter = CounterAccount::try_from_slice(&counter_account.data.borrow())?;
    counter.count = value;
    counter.serialize(&mut &mut counter_account.data.borrow_mut()[..])?;

    msg!("✅ Counter set to {}", value);
    Ok(())
}

// ============================================================================
// Юнит-тесты
// ============================================================================
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_instruction_serialization() {
        // Проверяем сериализацию/десериализацию инструкций
        let init = CounterInstruction::Initialize;
        let data = borsh::to_vec(&init).unwrap();
        let decoded = CounterInstruction::try_from_slice(&data).unwrap();
        assert!(matches!(decoded, CounterInstruction::Initialize));

        let set = CounterInstruction::Set { value: 42 };
        let data = borsh::to_vec(&set).unwrap();
        let decoded = CounterInstruction::try_from_slice(&data).unwrap();
        assert!(matches!(decoded, CounterInstruction::Set { value: 42 }));
    }

    #[test]
    fn test_counter_account_serialization() {
        let counter = CounterAccount { count: 100 };
        let data = borsh::to_vec(&counter).unwrap();
        assert_eq!(data.len(), 8); // u64 = 8 bytes
        let decoded = CounterAccount::try_from_slice(&data).unwrap();
        assert_eq!(decoded.count, 100);
    }
}
