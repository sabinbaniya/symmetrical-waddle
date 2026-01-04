# Case Unboxing Socket Documentation

Case Unboxing allows users to open cases to win items. It supports single or multiple spins and demo mode.

## Events

### Client -> Server

#### `unboxing:spin`

Opens a case with real balance.

- **Payload**:
    ```json
    {
        "caseID": "case-id", // e.g., "blue-case" or "level-10"
        "spinnerAmount": 1, // 1, 2, 3, or 4
        "clientSeed": "my-seed"
    }
    ```
- **Response (Emit)**: Responds directly via `unboxing:spin` event with success/failure and results.

#### `unboxing:demo-spin`

Simulates a case opening without using balance.

- **Payload**:
    ```json
    {
        "caseID": "case-id",
        "spinnerAmount": 1
    }
    ```
- **Response (Emit)**: `unboxing:demo-spin`.

### Server -> Client

#### `unboxing:pf`

Emitted immediately before the result to establish the Provably Fair commitment.

- **Payload**:
    ```json
    {
        "serverSeedCommitment": "hash",
        "clientSeed": "seed",
        "nonce": 42
    }
    ```

#### `unboxing:spin` (Response)

Returns the result of the spin.

- **Payload (Success)**:
    ```json
    {
      "status": true,
      "results": [
        {
          "item": { ... }, // Won item
          "force": 123     // The winning index in the item pool (visuals)
        }
      ],
      "totalEarning": 50.00
    }
    ```
