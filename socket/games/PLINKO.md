# Plinko Socket Documentation

Plinko involves dropping a ball down a pegged pyramid. The landing slot determines the multiplier applied to the bet.

## Events

### Client -> Server

#### `plinko:bet`

Places a bet and drops a ball.

- **Payload**:
    ```json
    {
        "betAmount": 10,
        "rows": 16, // 8 to 16
        "risk": "medium", // "low", "medium", "high"
        "clientSeed": "seed" // client's seed
    }
    ```
- **Response**: `plinko:bet` (Confirmation).

### Server -> Client

#### `plinko:pf`

Emitted immediately upon receiving the bet.

- **Payload**:
    ```json
    {
        "serverSeedCommitment": "hash",
        "clientSeed": "seed",
        "nonce": 10
    }
    ```

#### `plinko:fire`

Signals the start of the ball drop animation.

- **Payload**:
    ```json
    {
      "multiplier": 5.6,
      "path": ["L", "R", "L", ...], // Path instructions or array of indices
      "betId": "uuid",
      "pathDuration": 2000          // ms
    }
    ```

#### `plinko:bet` (Response/Confirmation)

Final result confirmation.

- **Payload**:
    ```json
    {
        "status": true,
        "betId": "uuid",
        "multiplier": 5.6,
        "payout": 56.0,
        "userBalance": 1000.0
    }
    ```

#### `plinko:proof`

Reveals seeds after the animation duration.

- **Payload**:
    ```json
    {
        "serverSeed": "secret",
        "serverSeedCommitment": "hash",
        "clientSeed": "seed",
        "nonce": 10
    }
    ```
