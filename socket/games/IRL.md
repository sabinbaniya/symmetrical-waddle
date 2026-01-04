# IRL Unboxing Socket Documentation

**File**: `irl.js`

IRL Unboxing is likely similar to standard Case Unboxing but for real-world items (or distinct "IRL" categories). Code structure mirrors `unboxing.js` closely.

## Events

### Client -> Server

#### `irl:spin`

Opens an IRL case.

- **Payload**:
    ```json
    {
        "caseID": "sneaker-case",
        "spinnerAmount": 1,
        "clientSeed": "seed"
    }
    ```

#### `irl:demo-spin`

Simulates a spin.

- **Payload**:
    ```json
    {
        "caseID": "sneaker-case",
        "spinnerAmount": 1
    }
    ```

### Server -> Client

#### `irl:pf`

Provably Fair commitment.

- **Payload**:
    ```json
    {
        "serverSeedCommitment": "hash",
        "clientSeed": "seed",
        "nonce": 1
    }
    ```

#### `irl:spin` (Response)

- **Payload**:
    ```json
    {
      "status": true,
      "data": {
        "pools": [...],    // Results for each spinner
        "earning": 120.00
      }
    }
    ```

#### `irl:proof`

Reveals seeds after animation delay (4s).

- **Payload**:
    ```json
    {
        "serverSeed": "secret",
        "serverSeedCommitment": "hash",
        "clientSeed": "seed",
        "nonce": 1
    }
    ```
