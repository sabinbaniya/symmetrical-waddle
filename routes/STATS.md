# Stats API Documentation

## Overview

The Stats API provides endpoints for retrieving user statistics, game history, payment history, and fairness data.

**Base Path**: `/stats`

---

## Endpoints

### 1. GET `/stats/profile`

Get aggregate profile statistics for the authenticated user (wagers, earnings, deposits, withdrawals).

- **Authentication Required**: Yes
- **Method**: `GET`

#### Response

```json
{
    "wagerAmount": 5000.0,
    "earningAmount": 4800.0,
    "depositAmount": 1000.0,
    "withdrawAmount": 800.0
}
```

---

### 2. GET `/stats/games`

Get game history for the authenticated user.

- **Authentication Required**: Yes
- **Method**: `GET`

#### Query Parameters

| Parameter | Type   | Description                                                  |
| :-------- | :----- | :----------------------------------------------------------- |
| `page`    | Number | Page number (default: 1)                                     |
| `limit`   | Number | Items per page (default: 10)                                 |
| `sort`    | String | `most-recent`, `least-recent`, `most-earned`, `least-earned` |
| `search`  | String | Filter by game name                                          |

#### Response

```json
{
    "success": true,
    "data": {
        "games": [
            {
                "game": "mines",
                "wager": 10.0,
                "earning": 25.0,
                "multiplier": 2.5,
                "date": 1735700000000
            }
        ],
        "totalGames": 50,
        "totalPages": 5,
        "currentPage": 1
    },
    "hasMore": true
}
```

---

### 3. GET `/stats/payments`

Get payment history (deposits and withdrawals) for the authenticated user.

- **Authentication Required**: Yes
- **Method**: `GET`

#### Query Parameters

| Parameter | Type   | Description                                                      |
| :-------- | :----- | :--------------------------------------------------------------- |
| `page`    | Number | Page number (default: 1)                                         |
| `limit`   | Number | Items per page (default: 10)                                     |
| `type`    | String | `all`, `deposits`, `withdraws`                                   |
| `sort`    | String | `most-recent`, `least-recent`, `highest-amount`, `lowest-amount` |
| `search`  | String | Search by txhash, chain, or asset                                |

#### Response

```json
{
    "success": true,
    "data": {
        "payments": [
            {
                "_id": "...",
                "type": "deposit",
                "chain": "ETH",
                "asset": "USDT",
                "amount": "100.000000",
                "usdAmount": 100.0,
                "txhash": "0x...",
                "date": 1735700000000
            }
        ],
        "totalPayments": 10,
        "totalPages": 1,
        "currentPage": 1
    },
    "hasMore": false
}
```

---

### 4. GET `/stats/fairness`

Get Provably Fair data for user's gameplay history across Mines, Battles, and other games.

- **Authentication Required**: Yes
- **Method**: `GET`

#### Query Parameters

| Parameter | Type   | Description                                  |
| :-------- | :----- | :------------------------------------------- |
| `page`    | Number | Page number (default: 1)                     |
| `limit`   | Number | Items per page (default: 10)                 |
| `sort`    | String | `most-recent`, `least-recent`                |
| `search`  | String | Search by server seed, client seed, or nonce |
| `game`    | String | `all` (default)                              |

#### Response

```json
{
    "success": true,
    "data": {
        "items": [
            {
                "id": "...",
                "game": "mines",
                "betAmount": 10,
                "payout": 0,
                "status": "lost",
                "completedAt": 1735700000000,
                "pf": {
                    "serverSeedCommitment": "...",
                    "serverSeed": "...",
                    "clientSeed": "...",
                    "nonce": 1
                }
            }
        ],
        "total": 100,
        "totalPages": 10,
        "currentPage": 1
    }
}
```
