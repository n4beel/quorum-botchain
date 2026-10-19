# Quorum

A minimal multisig wallet on BOT Chain.

### BOT Chain mainnet (677) — live

| | |
|---|---|
| Factory | [`0x7849c33234B8392435042FF93fEB54e0e234e90b`](https://scan.botchain.ai/address/0x7849c33234B8392435042FF93fEB54e0e234e90b) · source verified |
| Deploy block | 27267252 |

### Bohr testnet (968) — live

| | |
|---|---|
| Factory | [`0x2f1b8b468a3e57d61C564D5099ED8223f0de91Cb`](https://scan.bohr.life/address/0x2f1b8b468a3e57d61C564D5099ED8223f0de91Cb) · source verified |
| Deploy block | 27397234 |

The two addresses differ because the deployer's nonce diverged between the chains; each is the
factory for its own network. The site targets mainnet.

---

## What it does
Quorum lets teams deploy a minimal M-of-N multisig wallet using a factory pattern (`QuorumFactory`). Owners propose transactions, confirm them, and execute them once the required threshold of confirmations is reached.

## What it deliberately cannot do
- **No owner additions/removals**: owners are immutable once deployed
- **No threshold adjustments**: threshold is fixed at construction
- **No emergency recovery**: no backdoor or owner override
- **No upgradeability**: unalterable byte-level logic

## Gas
- `create()` (factory): ~180k gas (target: ~200k)
- `submit()`: ~75k gas
- `confirm()`: ~48k gas (target: ~50k)
- `execute()`: ~45k gas beyond payload execution

## Honest limits
- Maximum 20 owners (bounded to keep quadratic duplicate checks gas-safe)
- If enough owners lose their private keys such that the threshold cannot be met, funds in that wallet become permanently inaccessible
