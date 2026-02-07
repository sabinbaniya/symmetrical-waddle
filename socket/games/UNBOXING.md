# Case Unboxing

### Events

#### Client -> Server

**`unboxing:spin`**

Opens one or more cases with real balance.

* **Payload**:

  ```json
  {
      "caseIDs": ["case-id-1", "case-id-2"], // Array of 1-5 case IDs
      "clientSeed": "my-seed"
  }
  ```
* **Constraints**:
  - `caseIDs` must be an array with 1 to 5 items.
  - Special cases (`level-X` or `free-case`) must be opened individually (array length 1).
* **Response (Emit)**: Responds directly via `unboxing:spin` event with success/failure and results.

**`unboxing:demo-spin`**

Simulates case opening without using the user's balance.

* **Payload**:

  ```json
  {
      "caseIDs": ["case-id-1", "case-id-2"] // Array of 1-5 case IDs
  }
  ```
* **Response (Emit)**: `unboxing:demo-spin`.

#### Server -> Client

**`unboxing:pf`**

Emitted immediately before the result to establish the Provably Fair commitment.

* **Payload**:

  ```json
  {
      "serverSeedCommitment": "hash",
      "clientSeed": "seed",
      "nonce": 42
  }
  ```

**`unboxing:spin` (Response)**

Returns the result of the spin.

* **Payload (Success)**:

  ```json
  {
    "status": true,
    "data": {
      "pools": [
        {
          "item": { ... }, // Won item
          "force": 123,    // Winning index (visuals)
          "caseId": "case-id-1"
        },
        {
          "item": { ... },
          "force": 456,
          "caseId": "case-id-2"
        }
      ],
      "earning": 50.00 // Total earning across all cases
    }
  }
  ```

**`unboxing:proof`**

Returns the server seed and nonce for verification after the animation is finished (~4 seconds).

* **Payload**:

  ```json
  {
      "serverSeed": "original-server-seed",
      "serverSeedCommitment": "hash",
      "clientSeed": "user-seed",
      "nonce": 42
  }
  ```
