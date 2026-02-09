# Case Battles

#### Client -> Server Events

**`battles:create`** Creates a new battle lobby.

* **Payload**:

  ```json
  {
      "gamemode": "1v1", // "1v1", "1v1v1", "1v1v1v1", "2v2", "2v2v2", "3v3"
      "battleMode": "normal", // "normal", "share", "pointRush", "jackpot"
      "cases": [
          { "id": "case-id-1", "quantity": 2 },
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

**`battles:join`** Joins an existing battle lobby.

* **Payload**:

  ```json
  {
      "gameID": "uuid",
      "spot": 1 // Optional: index of the seat (0 to max-1)
  }
  ```

**`battles:leave`** Leaves the waiting lobby and refunds the user.

* **Payload**: `{ "gameID": "uuid" }`

**`battles:sponsor`** Creators can sponsor (pay for) someone else's spot.

* **Payload**: `{ "gameID": "uuid", "spot": 1 }`

**`battles:details`** Request the full state of a specific game.

* **Payload**: `{ "gameID": "uuid" }`

**`battles:games`** Fetch the list of all active/waiting battles.

* **Payload**:&#x20;

  ```json
  [
    {
      "id": "7abc-1234-5678-90ef",
      "status": "waiting",
      "participants": ["65b123...", null, "BOT"],
      "maxParticipants": 3,
      "avatars": ["https://...", null, "https://..."],
      "names": ["Rekt", null, "Bot Alpha"],
      "cases": ["neon-case", "neon-case", "dragon-case"], 
      "cost": 45.50,
      "round": 1,
      "date": 1707297000000,
      "gamemode": "1v1v1",
      "battleMode": "pointRush",
      "prize": 0,
      "winners": [],
      "earnings": [],
      "isFastMode": true,
      "isLastChance": false,
      "isReversed": false,
      "isPrivate": false,
      "fundingOptions": {
        "percentage": 50,
        "minDeposit": 5.00,
        "period": "all",
        "onlyAffiliates": false
      },
      "sponsor": [0, 0, 0] 
    },
    {
      "id": "9def-4321-8765-09gh",
      "status": "in-game",
      "participants": ["65b456...", "65b789..."],
      "maxParticipants": 2,
      "avatars": ["https://...", "https://..."],
      "names": ["JohnDoe", "JaneSmith"],
      "cases": ["budget-case"],
      "cost": 1.50,
      "round": 2,
      "date": 1707297100000,
      "gamemode": "1v1",
      "battleMode": "normal",
      "prize": 0,
      "winners": [],
      "earnings": [0.50, 0.75],
      "isFastMode": false,
      "isLastChance": true,
      "isReversed": false,
      "isPrivate": false,
      "fundingOptions": { "percentage": 0, "minDeposit": 0, "period": "all", "onlyAffiliates": false },
      "sponsor": [0, 1]
    }
  ]
  ```

**`battles:list`** Fetch a paginated list of battles with filters.

* **Payload**:

  ```json
  {
      "page": 1,
      "limit": 10,
      "status": "active", // "waiting", "in-game", "finished", "active"
      "gamemode": "1v1",
      "battleMode": "normal",
      "user": false, // true to filter by authenticated user (my games)
      "includePrivate": false,
      "sort": "desc" // "asc" or "desc"
  }
  ```

* **Response**: `battles:list`

  ```json
  {
      "status": true,
      "data": [ ... ], // Array of game objects (same as battles:games)
      "pagination": {
          "page": 1,
          "limit": 10,
          "total": 100,
          "pages": 10
      }
  }
  ```

***

#### Server -> Client Events

**`battles:details`** Emitted when someone joins, leaves, or a user explicitly requests details.

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

**`battles:pf`** Emitted when the game starts, sharing the Provably Fair commitment.

* **Payload**: `{ "serverSeedCommitment": "hash", "publicSeed": "str", "round": 1, "gameID": "uuid" }`

**`battles:spin`** Emitted for every round. Contains the items unboxed by each participant.

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

**`battles:result`** Emitted when the game finishes.

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

**`battles:proof`** Explicit PF reveal event sent alongside the result.

* **Payload**: `{ "serverSeed": "...", "publicSeed": "...", "gameID": "..." }`

***

#### Key Game Concepts

1. **Battle Modes**:
   * **Normal**: Highest total value wins.
   * **Share**: Total pot split equally among all players.
   * **Point Rush**: Round-by-round points based on highest pull.
   * **Jackpot**: Weighted raffle based on unboxed value.
2. **Options**:
   * **Inverse**: Lowest value wins. (Disabled in Share Mode)
   * **Last Chance**: Only the final round counts for selection. (Disabled in Share Mode)
   * **Fast Mode**: Spins and delays are 50% faster.
   * **Partial Slot Funding:** Fund slots for other players with different criterias and funding percentage.
3. **Teams**:
   * Supported in all modes. Points and values are aggregated per team (e.g., 2v2v2 = 3 teams).
