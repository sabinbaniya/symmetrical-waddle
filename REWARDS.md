# Rewards API Documentation

## Overview

This document provides API documentation for the rewards routes implemented in the `lucky-be` backend. These routes handle fetching rewards history, claiming rakeback rewards, and redeeming promo codes.

**Base Path**: `/rewards`

---

## Endpoints

### 1. GET `/rewards`

Get rewards history and free case countdown.

#### Request Headers

| Header   | Value             | Description    |
| :------- | :---------------- | :------------- |
| `Cookie` | `connect.sid=...` | Session cookie |

#### Response

```json
{
    "history": {
        "daily": 1703817600000,
        "weekly": 1703212800000
    },
    "freeCaseCountdown": 1703904000000
}
```

- `history`: Object containing timestamps of last claimed rewards (daily, weekly, monthly).
- `freeCaseCountdown`: Timestamp when the next free case is available, or 0 if available now.

---

### 2. GET `/rewards/deposit-bonus`

Get deposit bonus status.

#### Request Headers

| Header   | Value             | Description    |
| :------- | :---------------- | :------------- |
| `Cookie` | `connect.sid=...` | Session cookie |

#### Response

```json
false
```

OR

```json
true
```

Returns a boolean indicating if the user has an active deposit bonus.

---

### 3. GET `/rewards/free-cases/details`

Get details for free cases.

#### Request Headers

| Header   | Value             | Description    |
| :------- | :---------------- | :------------- |
| `Cookie` | `connect.sid=...` | Session cookie |

#### Response

**Success:**

```json
{
    "status": true,
    "freeCases": 2
}
```

**Failure:**

```json
{
    "status": false,
    "message": "You have already opened a free case today"
}
```

---

### 4. POST `/rewards/claim`

Claim rakeback reward (daily, weekly, monthly).

#### Request Headers

| Header         | Value              | Description    |
| :------------- | :----------------- | :------------- |
| `Cookie`       | `connect.sid=...`  | Session cookie |
| `Content-Type` | `application/json` |                |

#### Request Body

```json
{
    "type": "daily"
}
```

- `type`: "daily", "weekly", or "monthly".

#### Response

**Success:**

```json
{
    "status": true,
    "reward": 10.5
}
```

**Failure:**

```json
{
    "status": false,
    "error": "You've already claimed the prize"
}
```

---

### 5. POST `/rewards/promo-code`

Redeem a promo code.

#### Request Headers

| Header         | Value              | Description    |
| :------------- | :----------------- | :------------- |
| `Cookie`       | `connect.sid=...`  | Session cookie |
| `Content-Type` | `application/json` |                |

#### Request Body

```json
{
    "promoCode": "WELCOME2024"
}
```

#### Response

**Success:**

```json
{
    "prize": 5.0
}
```

**Failure:**

```json
{
    "message": "Invalid promo code"
}
```
