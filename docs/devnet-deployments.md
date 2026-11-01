# Program IDs и адреса деплоев

Все программы репозитория имеют зафиксированные ключи (`declare_id!` и `Anchor.toml`) и покрыты локальными интеграционными тестами **LiteSVM** (не требуют SOL для прогона).

| Неделя | Программа / Токен | Адрес (Program ID) | Папка |
|-------:|-------------------|--------------------|-------|
| 5 | `counter_program` | `5ACn229Xq3arXb1MgF4Ux1iXY9yRTrN7VkaALLLttnLv` | [`week-05-anchor-counter`](../week-05-anchor-counter/) |
| 6 | `profile_program` | `2RAyCS5nhX6osbmoqKeXoyXC9kxY57fvE4mRQxS3ZAdP` | [`week-06-pda-profile`](../week-06-pda-profile/) |
| 7 | `ROOF` (Token-2022) | Создаётся скриптом `npm run create` (сохраняется в `.state/devnet.json`) | [`week-07-spl-token`](../week-07-spl-token/) |
| 8 | `roofic_mvp` | `4qSqEcJ7KhcFsLnURE6dHuQ8KSRkkEX56oFYiRk8zKKf` | [`week-08-mvp`](../week-08-mvp/) |
| 9 | Pyth Price Feeds (Devnet) | SOL/USD `J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix`, USDC/USD `5SSkXsEKQepHHAewytPVwdej4epN1nxgLVM84L4KXgy7` | [`week-09-defi`](../week-09-defi/) |
| 11 | `roofic_shares` | `DJuq8q9WhsLAbji7AbTS48tvLasnj3EoxECHsgyrQFdt` | [`week-11-cpi`](../week-11-cpi/) |
| 11 | `roofic_portfolio` | `8XJaa7FSPhVBXX6SW6kxRCGNZBLt565VWHxKiSFZ7cT4` | [`week-11-cpi`](../week-11-cpi/) |
| 12 | `exploit_lab` | `4GAnpvGGpnACC1MbBLs8THPE8n8XtVSioPzsgUsQ74ws` | [`week-12-security-lab`](../week-12-security-lab/) |
| 12 | `evil_program` | `95mqtwpJwMSUiFZKczLbTi7unYqPkEjHQRkEUV53LxH9` | [`week-12-security-lab`](../week-12-security-lab/) |
| 14 | `roofic` (Capstone) | `EvLmbfYUs5m5YHWm4QWCeQfy63df4BBiaBiZw8Rf12mo` | [`capstone`](../capstone/) |

## Деплой в Devnet

Для деплоя любой Anchor-программы в Devnet (требуется ~1.5–2.5 SOL на rent исполняемого аккаунта программы):

```bash
solana config set --url devnet
anchor build
anchor deploy --provider.cluster devnet
```

После завершения курса программы можно закрыть командой `solana program close <PROGRAM_ID> --bypass-warning`, чтобы вернуть заблокированные SOL обратно на кошелёк.
