# Case Battles Socket Documentation

Case Battles involves users opening cases against each other. The user with the highest total item value wins the entire pot (in standard 1v1 mode).

## Events

### Client -> Server

#### `battles:create`

Creates a new battle lobby.

- **Payload**:
    ```json
    {
        "gamemode": "1v1", // "1v1", "1v1v1", "1v1v1v1", "2v2"
        "cases": ["case-id-1", "case-id-2"],
        "isBot": false, // true to fill empty spots with bots
        "isPrivate": false,
        "isReversed": false // If true, lowest total wins
    }
    ```
- **Response (Emits Back)**: `battles:create` event with { status: true, gameID: "uuid-string" }, and user is joined to that socket room with roomId as the gameId.

#### `battles:join`

Joins an existing battle lobby.

- **Payload**:
    ```json
    {
        "gameID": "uuid-string",
        "spot": 1 // Optional: specific spot index
    }
    ```

### Server -> Client

#### `battles:pf`

Emitted when the game starts, sharing Provably Fair data.

- **Payload**:
    ```json
    {
        "serverSeedCommitment": "sha256-hash",
        "publicSeed": "block-id",
        "round": 1,
        "gameID": "uuid-string"
    }
    ```

#### `battles:spin`

Emitted for every round of opening cases.

- **Payload**:
    ```json
    {
      "id": "game-id",
      "round": 2,
      "itemPools": [[...], [...]], // Visual items for the spinner
      "forces": [[...], [...]],    // The index where the spinner stops
      "items": [[...], [...]],     // The actual winning items for this round
      "status": "in-game",
      // ... other game state data
    }
    ```

---

## Game Logic details

1.  **Creation**: Validates cases, costs, and user balance.
2.  **Bots**: If `isBot` is true, the game automatically fills with bots and starts after creation.
3.  **Provably Fair**:
    - Generates a `serverSeed`.
    - Uses a `publicSeed`
    - Calculates `ticket` for each slot to determine the item.
4.  **Spinning**:
    - The server calculates the result for a round.
    - Emits `battles:spin` with the target item (via `forces` index) and the visual pool.
    - Waits for client animation (approx 4.3s) before processing the next round.
5.  **Result**:
    - Once all rounds are done, the server calculates the earnings.
    - Determines winner based on gamemode (Standard vs Reversed, Team 2v2).
    - Distributes winnings.
