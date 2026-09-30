// ============================================================================
// Тесты для Counter Program (LiteSVM)
// ============================================================================

use counter_program::accounts;
use counter_program::instruction;
use anchor_lang::{InstructionData, ToAccountMetas, system_program};
use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;

fn program_id() -> anchor_lang::prelude::Pubkey {
    counter_program::id()
}

/// Находит PDA адрес для counter
fn find_counter_pda(authority: &solana_keypair::Keypair) -> (anchor_lang::prelude::Pubkey, u8) {
    anchor_lang::prelude::Pubkey::find_program_address(
        &[b"counter", authority.pubkey().as_ref()],
        &program_id(),
    )
}

fn setup() -> (LiteSVM, Keypair) {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(
        program_id(),
        "../../target/deploy/counter_program.so",
    )
    .unwrap();

    let authority = Keypair::new();
    svm.airdrop(&authority.pubkey(), 10_000_000_000).unwrap();

    (svm, authority)
}

fn init_counter(svm: &LiteSVM, authority: &Keypair) -> Transaction {
    let (counter_pda, _bump) = find_counter_pda(authority);

    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: program_id(),
        accounts: accounts::Initialize {
            counter: counter_pda,
            authority: authority.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::Initialize {}.data(),
    };

    Transaction::new(
        &[authority],
        Message::new(&[ix], Some(&authority.pubkey())),
        svm.latest_blockhash(),
    )
}

#[test]
fn test_initialize() {
    let (mut svm, authority) = setup();

    let tx = init_counter(&svm, &authority);
    let result = svm.send_transaction(tx);
    assert!(result.is_ok(), "Initialize failed: {:?}", result.err());

    // Verify account data
    let (counter_pda, _) = find_counter_pda(&authority);
    let account = svm.get_account(&counter_pda).unwrap();
    // Anchor discriminator (8 bytes) + count (8 bytes) + authority (32 bytes) + bump (1 byte)
    assert_eq!(account.data.len(), 8 + 8 + 32 + 1);

    println!("✅ Initialize test passed!");
}

#[test]
fn test_increment() {
    let (mut svm, authority) = setup();

    // Initialize first
    let tx = init_counter(&svm, &authority);
    svm.send_transaction(tx).unwrap();

    let (counter_pda, _) = find_counter_pda(&authority);

    // Increment 3 times
    for i in 1..=3 {
        let ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: program_id(),
            accounts: accounts::Update {
                counter: counter_pda,
                authority: authority.pubkey(),
            }
            .to_account_metas(None),
            data: instruction::Increment {}.data(),
        };

        let tx = Transaction::new(
            &[&authority],
            Message::new(&[ix], Some(&authority.pubkey())),
            svm.latest_blockhash(),
        );
        svm.send_transaction(tx).unwrap();

        println!("✅ Increment #{} passed!", i);
    }
}

#[test]
fn test_decrement() {
    let (mut svm, authority) = setup();

    // Initialize
    let tx = init_counter(&svm, &authority);
    svm.send_transaction(tx).unwrap();

    let (counter_pda, _) = find_counter_pda(&authority);

    // Increment first
    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: program_id(),
        accounts: accounts::Update {
            counter: counter_pda,
            authority: authority.pubkey(),
        }
        .to_account_metas(None),
        data: instruction::Increment {}.data(),
    };
    let tx = Transaction::new(
        &[&authority],
        Message::new(&[ix], Some(&authority.pubkey())),
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx).unwrap();

    // Decrement
    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: program_id(),
        accounts: accounts::Update {
            counter: counter_pda,
            authority: authority.pubkey(),
        }
        .to_account_metas(None),
        data: instruction::Decrement {}.data(),
    };
    let tx = Transaction::new(
        &[&authority],
        Message::new(&[ix], Some(&authority.pubkey())),
        svm.latest_blockhash(),
    );
    let result = svm.send_transaction(tx);
    assert!(result.is_ok(), "Decrement failed: {:?}", result.err());

    println!("✅ Decrement test passed!");
}

#[test]
fn test_set_value() {
    let (mut svm, authority) = setup();

    let tx = init_counter(&svm, &authority);
    svm.send_transaction(tx).unwrap();

    let (counter_pda, _) = find_counter_pda(&authority);

    // Set to 42
    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: program_id(),
        accounts: accounts::Update {
            counter: counter_pda,
            authority: authority.pubkey(),
        }
        .to_account_metas(None),
        data: instruction::Set { value: 42 }.data(),
    };
    let tx = Transaction::new(
        &[&authority],
        Message::new(&[ix], Some(&authority.pubkey())),
        svm.latest_blockhash(),
    );
    let result = svm.send_transaction(tx);
    assert!(result.is_ok(), "Set failed: {:?}", result.err());

    println!("✅ Set value test passed!");
}

#[test]
fn test_close() {
    let (mut svm, authority) = setup();

    let tx = init_counter(&svm, &authority);
    svm.send_transaction(tx).unwrap();

    let (counter_pda, _) = find_counter_pda(&authority);

    // Close
    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: program_id(),
        accounts: accounts::Close {
            counter: counter_pda,
            authority: authority.pubkey(),
        }
        .to_account_metas(None),
        data: instruction::Close {}.data(),
    };
    let tx = Transaction::new(
        &[&authority],
        Message::new(&[ix], Some(&authority.pubkey())),
        svm.latest_blockhash(),
    );
    let result = svm.send_transaction(tx);
    assert!(result.is_ok(), "Close failed: {:?}", result.err());

    // Verify account is closed
    let account = svm.get_account(&counter_pda);
    assert!(account.is_none(), "Account should be closed");

    println!("✅ Close test passed!");
}

#[test]
fn test_unauthorized_update_fails() {
    let (mut svm, authority) = setup();

    let attacker = Keypair::new();
    svm.airdrop(&attacker.pubkey(), 10_000_000_000).unwrap();

    // Initialize with authority
    let tx = init_counter(&svm, &authority);
    svm.send_transaction(tx).unwrap();

    let (counter_pda, _) = find_counter_pda(&authority);

    // Try to increment with attacker — PDA seeds won't match
    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: program_id(),
        accounts: accounts::Update {
            counter: counter_pda,           // authority's counter
            authority: attacker.pubkey(),    // but signed by attacker
        }
        .to_account_metas(None),
        data: instruction::Increment {}.data(),
    };
    let tx = Transaction::new(
        &[&attacker],
        Message::new(&[ix], Some(&attacker.pubkey())),
        svm.latest_blockhash(),
    );
    let result = svm.send_transaction(tx);
    assert!(result.is_err(), "Unauthorized increment should fail!");

    println!("✅ Unauthorized update correctly rejected!");
}
