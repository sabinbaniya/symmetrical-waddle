# P2P Socket API Documentation

This documentation provides details for frontend developers integrating with the P2P marketplace socket events.

---

## Overview

The P2P (Peer-to-Peer) marketplace allows users to deposit and withdraw Steam items directly between each other. The backend manages the items pool, handles trade confirmations, and ensures secure transactions.

---

## Data Models

### Item Object

The item object used in the marketplace.

| Field    | Type     | Description                                                         |
| :------- | :------- | :------------------------------------------------------------------ |
| `id`     | `string` | Steam Asset ID.                                                     |
| `appid`  | `number` | Steam App ID (e.g., 730 for CS2, 252490 for Rust).                  |
| `gun`    | `string` | Name of the gun/weapon (can be `null` for some categories).         |
| `skin`   | `string` | Name of the skin.                                                   |
| `type`   | `string` | Item category/type.                                                 |
| `wear`   | `string` | Item wear condition (optional).                                     |
| `image`  | `string` | Full URL to the item icon.                                          |
| `price`  | `number` | Item price in sweepstake balance (includes seller rate adjustment). |
| `rate`   | `number` | Seller's price adjustment percentage (-25 to 25).                   |
| `seller` | `string` | Steam ID of the seller.                                             |
| `status` | `string` | `marketplace` \| `pending` \| `success` \| `failed` \| `timeout`.   |
| `buyer`  | `string` | Steam ID of the buyer (present if status is not `marketplace`).     |

### Trade Record

The structure returned by trade-related events.

```typescript
interface TradeRecord {
    seller: string;
    buyer:
        | {
              avatar: string;
              username: string;
              steamid: string;
          }
        | string
        | null;
    item: Item;
    status: string;
    deadline?: number; // Timestamp when the trade expires
    tradeLink?: string; // Buyer's trade URL (for seller)
    confirmations: {
        buyer: boolean;
        seller: boolean;
    };
}
```

---

## Client -> Server Events

### `marketplace`

Request the current pool of items available for withdrawal.

- **Payload**: `{ appid: number }`
- **Response**: Emits `marketplace` event.
- **Example Response**:
    ```json
    {
      "marketplace": [
        {
          "id": "276412312",
          "appid": 730,
          "gun": "AK-47",
          "skin": "Asiimov",
          "price": 120.50,
          "status": "marketplace",
          ...
        }
      ]
    }
    ```

### `deposit-item`

List items on the marketplace.

- **Payload**: `Array<{ id: string, rate: number }>`
- **Response**: Emits `deposit-item` event.
- **Example Response**:
    ```json
    { "status": true }
    // OR
    { "status": false, "error": "You already deposited this item" }
    ```

### `cancel-deposit`

Remove a listed item from the marketplace.

- **Payload**: `{ id: string }`
- **Response**: Emits `cancel-deposit` event.
- **Example Response**:
    ```json
    { "status": true }
    // OR
    { "status": false, "error": "You cannot cancel the deposit when there is a buyer" }
    ```

### `withdraw-item`

Initiate a purchase/withdrawal of items.

- **Payload**: `Array<{ id: string }>`
- **Response**: Emits `withdraw-item` event.
- **Example Response**:
    ```json
    { "status": true, "totalCost": 150.25 }
    // OR
    { "status": false, "error": "Insufficent balance" }
    ```

### `check-trades`

Sync the current state of active trades (both as buyer and seller).

- **Payload**: _None_
- **Response**: Emits `buyer-response` and/or `seller-response`.
- **Example Response (`buyer-response`)**:
    ```json
    [
      {
        "seller": "76561198000000001",
        "item": { "id": "123", "price": 50, ... },
        "status": "pending",
        "confirmations": { "buyer": false, "seller": true }
      }
    ]
    ```

### `create-trade`

Request the buyer's trade URL to initiate the Steam trade.

- **Payload**: `{ id: string }`
- **Response**: Emits `create-trade` event.
- **Example Response**:
    ```json
    { "status": true, "url": "https://steamcommunity.com/tradeoffer/new/?partner=..." }
    // OR
    { "status": false, "error": "Item not found" }
    ```

### `confirm-trade`

Confirm that the trade has been completed on Steam.

- **Payload**: `{ id: string, position: "seller" | "buyer" }`
- **Response**: Emits `confirm-trade` event.
- **Example Response**:
    ```json
    { "status": true }
    // OR
    { "status": false, "error": "You cannot confirm the trade until seller sends a trade offer." }
    ```

### `not-received-trade`

Report a trade failure where the seller confirmed but the buyer did not receive the item.

- **Payload**: `{ id: string }`
- **Response**: Emits `failed-trade` event to both parties.
- **Example Response**:
    ```json
    { "id": "123456789" }
    ```

---

## Server -> Client Events

### `marketplace`

Broadcasted marketplace pool updates.

- **Data**: `{ marketplace: Item[] }`

### `buyer-response`

Active trades where the user is the **buyer**.

- **Data**: `TradeRecord[]`

### `seller-response`

Active trades/listings where the user is the **seller**.

- **Data**: `TradeRecord[]`

### `confirm-trade-response`

Triggered when a trade confirmation is processed. Use this to refresh the UI.

### `response-reload`

Signal to reload trade data.

### `failed-trade`

Signal that a trade has failed.

- **Data**: `{ id: string }`

---

## Integration Example

### Buying an Item

```javascript
// 1. Listen for responses
socket.on("withdraw-item", res => {
    if (res.status) {
        console.log("Withdrawal initiated", res.totalCost);
    } else {
        alert(res.error);
    }
});

// 2. Emit withdrawal
socket.emit("withdraw-item", [{ id: "123456789" }]);

// 3. Sync trades to see progress
socket.emit("check-trades");
socket.on("buyer-response", trades => {
    const trade = trades.find(t => t.item.id === "123456789");
    if (trade && trade.confirmations.seller) {
        // Seller has confirmed, buyer can now confirm after receiving item
    }
});
```
