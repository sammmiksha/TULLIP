# TULLIP local financial model

## Money and accounts

Every stored amount and every calculation uses safe integer minor units (paise
for INR). User-entered decimal amounts are parsed before persistence. There is
one journal currency; changing the preference cannot relabel existing financial
records into a different currency. Accounts and payment methods are separate:
UPI and debit cards identify how a bank account was used, while cash and credit
cards use the corresponding account kinds.

Default accounts are Bank account, Cash wallet, and Historical / unassigned.
Additional bank, cash or credit-card accounts can be added. Account financial
fields cannot be rewritten after creation. Opening funds are assigned through
`settings.openingBalanceAccountId`; fresh installs use the bank account, while
upgrades retain historical funds in the unassigned account.

`accountBalances` is the common account calculation service. `balanceMinor` is
actual money held before reservations, `allocatedMinor` is savings reserved in
that account, and `availableMinor` is the difference. The UI should call the
latter available/unallocated balance. Credit-card available cash is always zero;
a negative card balance is a liability. `financialSummary` separately reports
available cash, allocated savings, assets, liabilities and net worth.

For the acceptance scenario, salary of 2,000,000 paise into Bank followed by
100,000 and 500,000 paise allocated to two jars produces 1,400,000 available,
600,000 reserved, 2,000,000 actual assets, and zero expenses. Reservations do not
physically leave the bank or create a second asset.

## Savings ledger and purchases

The existing `savingsContributions` table is retained. New entries have a kind:

| Kind | Available funds | Jar reservation | Income / expense |
| --- | --- | --- | --- |
| allocation | Decrease in source account | Increase | Neither |
| withdrawal | Increase in destination account | Decrease | Neither |
| purchase | Expense reduces actual source money | Reduce funded portion | One linked expense |
| reversal | Invert the referenced history entry | Invert its reservation effect | Neither; linked expense reversal is handled atomically |

Withdrawals carry `fundingSplits`, preserving the accounts whose reservations
funded the release. Releasing bank-backed savings to cash reduces actual bank
money and increases cash; the amount is never duplicated. Withdrawals select
available reservations deterministically and reject insufficient jar funds.

A linked purchase must use jar savings held in its selected bank/cash account.
If the jar is backed by another account, withdraw to the intended account first.
The purchase may use additional unallocated funds and retains unused savings.
The expense, purchase history, goal status and optional receipt metadata commit
together. Direct credit-card jar funding is not supported: record the card
expense, release savings to bank, and record a bank-to-card bill transfer.

Corrections append a reversal and a replacement entry in one transaction.
Reversals never delete original contribution/withdrawal history and cannot be
applied twice. A purchase reversal is performed by removing its linked expense;
the transaction is soft-voided, its jar funding reversed, and the audit history
retained. Reports, budgets and exports exclude voided transactions. A funded jar
must be emptied before archiving; archiving preserves its history.

## Expenses, transfers, cards and refunds

Income increases its account; expenses decrease it. A credit-card expense
increases card liability. A transfer moves money between accounts and is
excluded from income and expenses. A bank-to-card transfer pays down the card
liability without recording the purchase a second time. Credit-card cash
advances are not supported.

New explicit refunds are income-shaped ledger inflows with `isRefund: true` and
`refundOfTransactionId`. Shared cash-flow/category/payment/budget services treat
them as expense reductions, never salary/income. Refunds keep the original
expense's account, category, method and currency, cannot predate or exceed that
expense, and may be partial. A later-month refund can produce negative net
expenses in that month. Refunds restore unallocated funds; they do not silently
re-reserve money into a jar. Remove linked refunds before removing the original
expense. Historical unlinked Refund-category incomes remain as recorded.

## Validation and atomic persistence

Financial repository mutations are serialized. Each reads a fresh snapshot,
validates the proposed ledger, and writes all affected records in one database
transaction. IndexedDB uses a Dexie read/write transaction; Android SQLite uses
explicit begin/commit/rollback with individual writes in the same transaction.
Generic `put` cannot bypass transaction, savings or account validation.

Validation checks integer amounts, dates, accounts, method compatibility, jar
funding, duplicate IDs, references, and linked refunds. It reconciles account
reservations and jar reservations at every recorded calendar-day boundary,
including later dates affected by a backdated correction. Bank/cash spending
cannot consume funds reserved for other jars. A failed mutation writes nothing.
Multiple events within a date have no time ordering because the existing model
stores calendar dates rather than settlement timestamps.

## Migration 2 and backups

The database name (`tullip-local-v1` in IndexedDB, `tullipSQLite.db` on Android)
and application ID stay unchanged. Dexie schema version 2 adds accounts. Native
`schema_migrations` records version 2 after adding the accounts table and
upgrading settings inside one transaction. Existing transaction, attachment,
goal and contribution payloads are not rewritten or removed. Reopening is
idempotent. Existing users get completed onboarding/walkthrough flags rather
than being forced through setup after an update.

Old transactions without accounts remain Historical / unassigned. Old savings
contributions without `kind` remain **legacy planning history**: the old app did
not reserve account money, so deducting them now would silently change balances.
They are shown separately as `legacyMinor`, excluded from actual allocation and
jar fill, and never discarded, including orphaned history from formerly removed
goals. To fund such a goal, the user explicitly records new account-aware
allocations after checking their account balances. No automatic conversion runs.
Positive unassigned cash can be explicitly assigned to a bank or cash account
with `reconcileLegacyFunds`: it appends a new transfer, checks available funds
through the selected date and later history, and never rewrites old records or
creates income. Mixed historical currencies require review before assignment.

New JSON backups use envelope schema 2 and include accounts and the retained
audit history. Schema 1 remains readable. Built-in restores validate the full
candidate ledger and merge missing IDs atomically; existing IDs and Settings are
not overwritten in a populated journal. For a completely empty journal, restore
also restores the backup's financial currency, starting funds and starting-funds
account, while preserving display name, onboarding and display preferences.
This prevents starting money disappearing when moving to a fresh installation.
Built-in account kinds cannot be changed by a backup. A conflicting account or
missing linked record can block the merge with no changes. Back up before
upgrading or changing devices. Native
receipt files remain app-private, and a JSON backup containing only a native
file path does not by itself transfer that file to another device.

## Verified scope

The automated suite exercises actual Dexie v1-to-v2 migration, reopen/persistence,
serialized racing allocations, append-only corrections, failed multi-record
transaction rollback, the salary scenario, cross-account releases, cards and
bill payments, explicit refunds, and common report/export arithmetic. Native
SQLite runtime and final APK/device results are recorded separately in
`ANDROID_BUILD.md`; browser tests alone do not verify an Android device.

Storage remains unencrypted. An optional app lock is an access gate, not database
encryption or a substitute for Android device security. Records, receipts,
backups and authentication material must remain outside Git.
