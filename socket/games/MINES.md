# Mines Socket Documentation

**File**: `mines.js`

Mines is a single-player grid game (5x5). Players try to reveal tiles without hitting a mine.

## Events

### Client -> Server

#### `mines:start`

Starts a new game.

- **Payload**:
    ```json
    {
        "betAmount": 10.5,
        "mineCount": 3, // 1 to 24
        "clientSeed": "user-provided-seed"
    }
    ```
- **Response**: `mines:start` (Confirmation)

#### `mines:reveal`

Reveals a tile on the grid.

- **Payload**:
    ```json
    {
        "index": 12 // 0-24
    }
    ```
- **Response**: `mines:reveal` (Result)

#### `mines:cashout`

Cashes out the current winnings.

- **Payload**: None
- **Response**: `mines:cashout` (Success/Failure)

### Server -> Client

#### `mines:start` (Response)

- **Payload (Success)**:
    ```json
    {
        "status": true,
        "nextMultiplier": 1.12,
        "pf": {
            "serverSeedCommitment": "hash", // hash of server seed, can be shown to users on frontend before game end
            "clientSeed": "seed", // provided by client themslves
            "nonce": 1, // random nonce
            "publicSeed": "block-id"
        }
    }
    ```

#### `mines:reveal` (Response)

- **Payload (Safe)**:
    ```json
    {
        "status": true,
        "index": 12,
        "nextMultiplier": 1.25
    }
    ```
- **Payload (Bomb/Loss)**:
    ```json
    {
      "status": true,
      "mineRevealed": true,
      "mines": [0, 1, 0, ... 2 ...] // 0 is unrevealed, 1 is mine/bomb, 2 is revelaed area
    }
    ```

#### `mines:cashout` (Response)

- **Payload (Success)**:
    ```json
    {
      "status": true,
      "winningAmount": 150.00,
      "mines": [...] // Full board revealed
    }
    ```

#### `mines:proof`

Emitted after game end (Cashout or Loss) to reveal secrets.

- **Payload**:
    ```json
    {
        "serverSeed": "original-secret-hex",
        "serverSeedCommitment": "hash",
        "clientSeed": "seed",
        "nonce": 1
    }
    ```

---

## Game Logic Details

1.  **Provably Fair**:
    - Uses `serverSeed`, `clientSeed`, `nonce`.
    - Generates the mine positions deterministically using a Fisher-Yates shuffle.
    - Public seed is captured but code notes imply it might not be strictly used for the core rng in this specific implementation (client seed + server seed dominate).
