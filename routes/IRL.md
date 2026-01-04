# IRL (In Real Life) Cases API Documentation

This document describes the API endpoints for managing IRL (Real-Life Items) cases.

**Base URL**: `/irl`

---

## Endpoints

### 1. GET `/irl`

Fetch all available IRL cases.

- **Authentication Required**: No
- **Method**: `GET`
- **URL**: `/irl`

#### Response

Returns an array of case objects, sorted in reverse chronological order (newest first).

```json
[
  {
    "id": "luxury-liquidity",
    "name": "Luxury Liquidity",
    "price": 3700,
    "items": [
      {
        "name": "Richard Mille RM055 Replica",
        "image": "https://cdn.luckyrust.gg/irl-items/...",
        "price": "8100",
        "percentage": 2
      },
      ...
    ],
    "spins": 1500
  },
  ...
]
```

| Field   | Type            | Description                                      |
| :------ | :-------------- | :----------------------------------------------- |
| `id`    | String          | Unique identifier for the case.                  |
| `name`  | String          | Display name of the case.                        |
| `price` | Number          | Cost to open the case.                           |
| `items` | Array<CaseItem> | List of items contained in the case.             |
| `spins` | Number          | Total number of times this case has been opened. |

**CaseItem Object:**

| Field        | Type   | Description                                                        |
| :----------- | :----- | :----------------------------------------------------------------- |
| `name`       | String | Name of the item.                                                  |
| `image`      | String | URL to the item's image.                                           |
| `price`      | String | Value of the item.                                                 |
| `percentage` | Number | Probability of winning this item (default split if not specified). |

#### Errors

| Status Code | Description            |
| :---------- | :--------------------- |
| `500`       | Internal Server Error. |

---

### 2. GET `/irl/:id`

Fetch a specific IRL case by its ID.

- **Authentication Required**: No
- **Method**: `GET`
- **URL**: `/irl/:id`

#### Parameters

| Parameter | Type   | Description                                    |
| :-------- | :----- | :--------------------------------------------- |
| `id`      | String | The ID of the case (e.g., `luxury-liquidity`). |

#### Response

Returns a single case object. Items are sorted by percentage (ascending).

```json
{
  "id": "luxury-liquidity",
  "name": "Luxury Liquidity",
  "price": 3700,
  "items": [
    {
      "name": "Item Name",
      "image": "https://...",
      "price": "100",
      "percentage": 0.5
    },
    ...
  ]
}
```

| Field   | Type            | Description                          |
| :------ | :-------------- | :----------------------------------- |
| `id`    | String          | Unique identifier for the case.      |
| `name`  | String          | Display name of the case.            |
| `price` | Number          | Cost to open the case.               |
| `items` | Array<CaseItem> | List of items, sorted by percentage. |

#### Errors

| Status Code | Description            |
| :---------- | :--------------------- |
| `400`       | Invalid Case ID.       |
| `404`       | Case not found.        |
| `500`       | Internal Server Error. |
