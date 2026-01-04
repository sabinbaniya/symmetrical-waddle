# Upgrader Socket Documentation

The Upgrader allows users to wager an amount to try and "upgrade" it to a specific item. The win chance is proportional to the bet amount vs item price.

## Events

### Client -> Server

#### `upgrader:spin`

Attempts to upgrade the wager to the target item.

- **Payload**:
    ```json
    {
        "amount": 10.0, // Wager amount
        "item": "AK-47 | Redline", // Target item name (marketHashName)
        "clientSeed": "seed"
    }
    ```
- **Response**: `upgrader:spin` (Confirmation).

### Server -> Client

#### `upgrader:pf`

Provably Fair commitment data.

- **Payload**:
    ```json
    {
        "serverSeedCommitment": "hash",
        "clientSeed": "seed",
        "nonce": 5,
        "percent": 45.55 // The rolled lucky number
    }
    ```

#### `upgrader:spin` (Response)

- **Payload (Success/Fail)**:
    ```json
    {
        "status": true,
        "result": {
            "success": true, // Did the upgrade succeed?
            "amount": 50.0, // Won amount (value of item) or 0
            "item": "AK-47 | Redline"
        }
    }
    ```

#### `upgrader:proof`

Reveals server seed after a delay (approx 6s).

- **Payload**:
    ```json
    {
        "serverSeed": "secret",
        "serverSeedCommitment": "hash",
        "clientSeed": "seed",
        "nonce": 5
    }
    ```

---

## Game Logic Details

1.  **Locking**: Ensures only one spin per user at a time using Redis locks.
