# Quorum

A minimal multisig wallet on BOT Chain.

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
