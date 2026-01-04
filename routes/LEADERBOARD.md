# Leaderboard API Documentation

## Overview

The Leaderboard API provides endpoints for retrieving the top users based on their wager activity over a specific period.

**Base Path**: `/leaderboard`

---

## Endpoints

### 1. GET `/leaderboard`

Get the leaderboard data for a specified period.

- **Authentication Required**: No
- **Method**: `GET`

#### Query Parameters

| Parameter | Type   | Description                                                           |
| :-------- | :----- | :-------------------------------------------------------------------- |
| `period`  | String | The time period for the leaderboard: `weekly` (default) or `monthly`. |

#### Response

Returns an array of user objects, sorted by wager in descending order.

```json
[
    {
        "username": "sm***",
        "avatar": "https://avatars.steamstatic.com/...",
        "wager": 1250.75
    },
    {
        "username": "pl***",
        "avatar": "https://avatars.steamstatic.com/...",
        "wager": 980.5
    }
]
```

#### Example Request

`GET /leaderboard?period=monthly`
