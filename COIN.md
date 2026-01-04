# Coin API Documentation

This document describes the API endpoints for managing coin-related data (deposits, withdrawals, and prices).

**Base URL**: `/coin`

---

## Endpoints

### 1. GET `/coin/deposits`

Fetch the deposit history for the authenticated user.

- **Authentication Required**: Yes (Session Cookie)
- **Method**: `GET`
- **URL**: `/coin/deposits`

#### Response

Returns an array of deposit objects, sorted in reverse chronological order (newest first).

```json
[
  {
    "steamid": "76561198012345678",
    "txhash": "0x123abc...",
    "asset": "ETH",
    "amount": "0.1",
    "usdAmount": 350.50,
    "sweepstakeAmount": 350.50,
    "source": "coinbase",
    "date": "2023-10-27T10:00:00.000Z"
  },
  ...
]
```

| Field              | Type   | Description                                                 |
| :----------------- | :----- | :---------------------------------------------------------- |
| `steamid`          | String | The SteamID of the user.                                    |
| `txhash`           | String | The transaction hash on the blockchain.                     |
| `asset`            | String | The cryptocurrency asset symbol (e.g., ETH, BTC).           |
| `amount`           | String | The amount deposited in crypto units.                       |
| `usdAmount`        | Number | The value of the deposit in USD at the time of transaction. |
| `sweepstakeAmount` | Number | The sweepstake value associated with the deposit.           |
| `source`           | String | The source of the deposit.                                  |
| `date`             | Date   | The timestamp of the deposit.                               |

#### Errors

| Status Code | Description                          |
| :---------- | :----------------------------------- |
| `401`       | Unauthorized. User is not logged in. |
| `500`       | Internal Server Error.               |

---

### 2. GET `/coin/withdraws`

Fetch the withdrawal history for the authenticated user.

- **Authentication Required**: Yes (Session Cookie)
- **Method**: `GET`
- **URL**: `/coin/withdraws`

#### Response

Returns an array of withdrawal objects, sorted in reverse chronological order (newest first).

```json
[
  {
    "steamid": "76561198012345678",
    "to": "0xUserWalletAddress...",
    "txhash": "0x456def...",
    "asset": "BTC",
    "amount": "0.005",
    "usdAmount": 450.00,
    "date": "2023-10-28T14:30:00.000Z"
  },
  ...
]
```

| Field       | Type   | Description                                                    |
| :---------- | :----- | :------------------------------------------------------------- |
| `steamid`   | String | The SteamID of the user.                                       |
| `to`        | String | The destination wallet address.                                |
| `txhash`    | String | The transaction hash on the blockchain.                        |
| `asset`     | String | The cryptocurrency asset symbol.                               |
| `amount`    | String | The amount withdrawn in crypto units.                          |
| `usdAmount` | Number | The value of the withdrawal in USD at the time of transaction. |
| `date`      | Date   | The timestamp of the withdrawal.                               |

#### Errors

| Status Code | Description                          |
| :---------- | :----------------------------------- |
| `401`       | Unauthorized. User is not logged in. |
| `500`       | Internal Server Error.               |

---

### 3. GET `/coin/prices`

Fetch current cryptocurrency prices (Bitcoin, Ethereum, Litecoin) in USD.

- **Authentication Required**: No
- **Method**: `GET`
- **URL**: `/coin/prices`
- **Caching**: This endpoint caches prices for 1 hour to optimize performance and respect API rate limits.

#### Response

Returns an object containing the current prices.

```json
{
    "Bitcoin": 95000,
    "Ethereum": 3500,
    "Litecoin": 90,
    "Tether": 1
}
```

#### Errors

| Status Code | Description                                                                                         |
| :---------- | :-------------------------------------------------------------------------------------------------- |
| `500`       | Internal Server Error. May occur if the upstream price API fails or `COINGECKO_API_KEY` is missing. |
