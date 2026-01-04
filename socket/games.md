# Game Sockets Overview

**File**: `games.js`

This file is the main entry point for all game-related socket events. It initializes specific game handlers and manages global game events.

## Structure

The `Games` class initializes instances of:

- `IRL` (IRL Unboxing)
- `Mines`
- `Plinko`
- `Battles` (Case Battles)
- `Unboxing` (Standard Case Unboxing)
- `Upgrader`

It routes the main `io` and `socket` connections to each of these sub-handlers.

## Global Events

### Client -> Server

#### `get-live-bets`

Requests a list of the most recent bets across all games.

- **Payload**: None
- **Response**: `live-bets` (via `game.announce`).

#### `change:active-balance-type`

Switches the user's active wallet between real money and sweepstakes coins.

- **Payload**:
    ```json
    "balance" // or "sweepstakeBalance"
    ```
- **Response**: `change:active-balance-type`
    ```json
    {
        "success": true,
        "activeBalanceType": "balance"
    }
    ```

## Individual Game Documentation

For specific game events and payloads, refer to:

- [Battles](./games/BATTLES.md)
- [Mines](./games/MINES.md)
- [Plinko](./games/PLINKO.md)
- [Unboxing](./games/UNBOXING.md)
- [IRL Unboxing](./games/IRL.md)
- [Upgrader](./games/UPGRADER.md)
