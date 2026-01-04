# Transactions Socket API Documentation

This documentation provides details for frontend developers integrating with the cryptocurrency transaction system (deposits and withdrawals) via Fireblocks.

---

## Overview

The Transactions system handles cryptocurrency deposits and withdrawals. It supports multiple assets and uses a multi-tiered vault system (HOT, WARM, COLD) for secure withdrawal processing.

### Key Concepts

- **Account-based Assets**: (ETH, USDT, USDC) Managed via hidden per-user intermediate vaults.
- **UTXO-style Assets**: (BTC, LTC, SOL) Managed via unique per-user addresses on a central Omnibus treasury vault.
- **Withdrawal Tiers**:
    - **HOT**: Manual/Instant (up to $500).
    - **WARM**: Two-phase processing ($500 - $1,500).
    - **COLD**: High-security two-phase processing with manual approval (> $1,500).

---

## Supported Assets

| Symbol | Name     | Type          |
| :----- | :------- | :------------ |
| `BTC`  | Bitcoin  | UTXO          |
| `LTC`  | Litecoin | UTXO          |
| `ETH`  | Ethereum | Account-based |
| `SOL`  | Solana   | UTXO          |
| `USDT` | Tether   | Account-based |
| `USDC` | USD Coin | Account-based |
| `XRP`  | Ripple   | UTXO          |
| `TRX`  | Tron     | UTXO          |
| `ADA`  | Cardano  | UTXO          |
| `POL`  | Polygon  | UTXO          |
| `DOGE` | Dogecoin | UTXO          |

---

## Client -> Server Events

### `deposit-address`

Generate/Retrieve a unique deposit address for a specific asset.

- **Payload**: `{ asset: string }`
- **Response**: Emits `deposit-address` event.

### `withdraw`

Initiate a cryptocurrency withdrawal.

- **Payload**:

```typescript
{
    asset: string,
    to: string, // Destination wallet address
    amount: number // Amount in USD
}
```

- **Response**: Emits `withdraw` event.

---

## Server -> Client Events

### `deposit-address`

Returns the generated deposit address.

- **Data**:

```typescript
{
    status: true,
    address: string
} | {
    status: false,
    error: string
}
```

### `withdraw`

Detailed status of the withdrawal request.

- **Data**:

```typescript
{
    status: true,
    queued?: boolean // present for WARM/COLD tiers
} | {
    status: "pending" // Initial acknowledgement
} | {
    status: false,
    error: string,
    kyc?: boolean // if true, KYC is required
}
```

---

## Withdrawal Process Details

### Phase Logic

1. **SUBMITTED**: Initial request received and validated.
2. **FUNDING / COLD_FUNDING**: Transferring funds from treasury to intermediate processing vaults (WARM/COLD).
3. **PAYOUT_SUBMITTED**: Funds arrived in processing vault; final payout to user address initiated.
4. **AWAITING_TAP**: (COLD only) Awaiting manual approval/signing.
5. **COMPLETED**: Transaction successfully finalized on-chain and balance updated.

### Error Codes

- `Insufficient balance`: User does not have enough sweepstake balance.
- `Minimum withdraw amount is $20`: Small withdrawals are restricted.
- `Hot wallets are temporarily underfunded`: Temporary liquidity issue in the HOT tier.
- `You need to wager more to withdraw`: Wager requirements not met.

---

## Integration Example

### Requesting a Deposit Address

```javascript
socket.emit("deposit-address", { asset: "ETH" });

socket.on("deposit-address", res => {
    if (res.status) {
        console.log("Deposit ETH to:", res.address);
    } else {
        alert(res.error);
    }
});
```

### Requesting a Withdrawal

```javascript
socket.emit("withdraw", {
    asset: "LTC",
    to: "LTC_ADDRESS_HERE",
    amount: 100, // USD
});

socket.on("withdraw", res => {
    if (res.status === "pending") {
        console.log("Working on it...");
    } else if (res.status === true) {
        console.log("Withdrawal submitted successfully!");
    } else {
        alert(res.error);
    }
});
```
