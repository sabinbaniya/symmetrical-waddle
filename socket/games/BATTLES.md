# Case Battles Socket Documentation

### Client -> Server Events

**`battles:create`**
Creates a new battle lobby.
* **Payload**:
  ```json
  {
      "gamemode": "1v1", // "1v1", "1v1v1", "1v1v1v1", "2v2", "2v2v2", "3v3"
      "battleMode": "normal", // "normal", "share", "pointRush", "jackpot"
      "cases": [
          { "id": "case-id-1", "quantity": 2 },
          "case-id-2" // simplified ID also works
      ],
      "isBot": false, 
      "isPrivate": false,
      "isReversed": false, // Inverse Mode
      "isFastMode": false,
      "isLastChance": false,
      "fundingOptions": {
          "percentage": 50, // 0-100% (Partial Slot Funding)
          "minDeposit": 10,
          "period": "week", // "all", "day", "week", "month"
          "onlyAffiliates": true
      }
  }
  ```
* **Response**: `battles:create` with `{ status: true, gameID: "uuid" }`.

**`battles:join`**
Joins an existing battle lobby.
* **Payload**:
  ```json
  {
      "gameID": "uuid",
      "spot": 1 // Optional: index of the seat (0 to max-1)
  }
  ```

**`battles:leave`**
Leaves the waiting lobby and refunds the user.
* **Payload**: `{ "gameID": "uuid" }`

**`battles:sponsor`**
Creators can sponsor (pay for) someone else's spot.
* **Payload**: `{ "gameID": "uuid", "spot": 1 }`

**`battles:details`**
Request the full state of a specific game.
* **Payload**: `{ "gameID": "uuid" }`

**`battles:games`**
Fetch the list of all active/waiting battles.
* **Payload**: `{}`

---

### Server -> Client Events

**`battles:details`**
Emitted when someone joins, leaves, or a user explicitly requests details.
* **Payload**:
  ```json
  {
    "id": "uuid",
    "status": "waiting", // "waiting", "in-game", "finished"
    "participants": ["user-id", null, "BOT"],
    "avatars": ["url", null, "url"],
    "names": ["Alice", null, "Bot Alpha"],
    "cases": ["id1", "id1", "id2"], // Flattened list
    "cost": 15.50,
    "round": 1,
    "battleMode": "normal",
    "isFastMode": false,
    "isLastChance": false,
    "isReversed": false,
    "isPrivate": false,
    "fundingOptions": { "percentage": 0, "minDeposit": 0, ... },
    "sponsor": [0, 1, 0] // 1 if the spot is sponsored/paid for by creator
  }
  ```

**`battles:pf`**
Emitted when the game starts, sharing the Provably Fair commitment.
* **Payload**: `{ "serverSeedCommitment": "hash", "publicSeed": "str", "round": 1, "gameID": "uuid" }`

**`battles:spin`**
Emitted for every round. Contains the items unboxed by each participant.
* **Payload**:
  ```json
  {
    "id": "uuid",
    "round": 2,
    "itemPools": [[...], [...]], // Aesthetic items for the roulette
    "forces": [15, 20],        // The static winning index in the pool
    "items": [
        { "name": "Skin A", "price": "$5.00", "image": "..." },
        { "name": "Skin B", "price": "$0.50", "image": "..." }
    ]
  }
  ```

**`battles:result`**
Emitted when the game finishes.
* **Payload**:
  ```json
  {
    "gameID": "uuid",
    "winners": ["userId1", "userId2"], // Can be multiple in Team/Share/Draws
    "prize": 25.50, // Total dollars
    "serverSeed": "revealed-seed",
    "publicSeed": "block-id"
  }
  ```

**`battles:proof`**
Explicit PF reveal event sent alongside the result.
* **Payload**: `{ "serverSeed": "...", "publicSeed": "...", "gameID": "..." }`

---

### Key Game Concepts

1. **Battle Modes**:
   - **Normal**: Highest total value wins.
   - **Share**: Total pot split equally among all players.
   - **Point Rush**: Round-by-round points based on highest pull.
   - **Jackpot**: Weighted raffle based on unboxed value.
2. **Options**:
   - **Inverse**: Lowest value wins. (Disabled in Share Mode)
   - **Last Chance**: Only the final round counts for selection. (Disabled in Share Mode)
   - **Fast Mode**: Spins and delays are 50% faster.
3. **Teams**:
   - Supported in all modes. Points and values are aggregated per team (e.g., 2v2v2 = 3 teams).
