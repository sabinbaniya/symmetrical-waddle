# P2P API Documentation

This document describes the API endpoints for Peer-to-Peer (P2P) trading related functionality, specifically for fetching user inventories and transactions.

**Base URL**: `/p2p`

---

## Endpoints

### 1. GET `/p2p/inventory`

Fetch the authenticated user's inventory for a specific game (AppID). The response includes simplified item details suitable for display.

- **Authentication Required**: Yes (Session Cookie)
- **Method**: `GET`
- **URL**: `/p2p/inventory`

#### Query Parameters

| Parameter | Type   | Required | Description                                      |
| :-------- | :----- | :------- | :----------------------------------------------- |
| `appid`   | String | Yes      | The Steam AppID of the game (e.g., 730 for CS2). |

#### Response

Returns a JSON object containing an `inventory` array. The items are sorted by price in descending order.

```json
{
    "inventory": [
        {
            "id": "1234567890",
            "skin": "Redline",
            "gun": "AK-47",
            "wear": "Field-Tested",
            "image": "https://steamcommunity-a.akamaihd.net/economy/image/...",
            "type": "Rifle",
            "tradable": true,
            "appid": 730,
            "price": "$12.50"
        },
        {
            "id": "0987654321",
            "skin": "Sand Dune",
            "gun": "P250",
            "wear": "Factory New",
            "image": "https://steamcommunity-a.akamaihd.net/economy/image/...",
            "type": "Pistol",
            "tradable": true,
            "appid": 730,
            "price": "$0.05"
        }
    ]
}
```

| Field      | Type    | Description                                                   |
| :--------- | :------ | :------------------------------------------------------------ |
| `id`       | String  | The unique asset ID of the item.                              |
| `skin`     | String  | The skin name of the item.                                    |
| `gun`      | String  | The weapon name (e.g., AK-47).                                |
| `wear`     | String  | The wear condition (e.g., Field-Tested).                      |
| `image`    | String  | The URL to the item's image.                                  |
| `type`     | String  | The type of item (e.g., Rifle, Pistol, Container).            |
| `tradable` | Boolean | Whether the item is currently tradable.                       |
| `appid`    | Number  | The AppID of the game the item belongs to.                    |
| `price`    | String  | The estimated market price of the item formatted as a string. |

#### Errors

| Status Code | Description                          |
| :---------- | :----------------------------------- |
| `401`       | Unauthorized. User is not logged in. |
| `400`       | Bad Request. Missing `appid`.        |
| `500`       | Internal Server Error.               |

### 2. GET `/p2p/transactions`

Fetch the P2P transaction history for the authenticated user, including both buy and sell orders.

- **Authentication Required**: Yes (Session Cookie)
- **Method**: `GET`
- **URL**: `/p2p/transactions`

#### Query Parameters

| Parameter | Type   | Required | Description                                                                             |
| :-------- | :----- | :------- | :-------------------------------------------------------------------------------------- |
| `page`    | Number | No       | Page number for pagination (default: 1).                                                |
| `limit`   | Number | No       | Number of items per page (default: 10).                                                 |
| `sort`    | String | No       | Sort order: `most-recent` (default), `least-recent`, `highest-amount`, `lowest-amount`. |
| `search`  | String | No       | Search term to filter by status or item name.                                           |

#### Response

Returns account P2P transaction history.

```json
{
    "success": true,
    "data": {
        "transactions": [
            {
                "_id": "67750...",
                "buyer": "76561198...",
                "seller": "76561198...",
                "worth": 12.5,
                "status": "success",
                "date": 1735700000000,
                "item": {
                    "id": "123...",
                    "appid": 730,
                    "skin": "Redline",
                    "gun": "AK-47",
                    "image": "..."
                }
            }
        ],
        "totalTransactions": 15,
        "totalPages": 2,
        "currentPage": 1
    },
    "hasMore": true
}
```
