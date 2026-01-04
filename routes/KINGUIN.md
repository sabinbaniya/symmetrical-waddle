# Kinguin API Documentation

This document describes the API endpoints for managing Kinguin gift code claims.

**Base URL**: `/kinguin`

---

## Endpoints

### 1. POST `/kinguin/claim`

Claim a Kinguin gift code.

- **Authentication Required**: Yes
- **Method**: `POST`
- **URL**: `/kinguin/claim`

#### Headers

| Header         | Value              | Description                        |
| :------------- | :----------------- | :--------------------------------- |
| `Content-Type` | `application/json` | Required for sending JSON payload. |
| `Cookie`       | `connect.sid=...`  | Session cookie for authentication. |

#### Request Body

```json
{
    "code": "XXXX-XXXX-XXXX"
}
```

| Field  | Type   | Description                                           |
| :----- | :----- | :---------------------------------------------------- |
| `code` | String | The unique Kinguin gift code to claim (1-1200 chars). |

#### Response

**Success (200 OK):**

Returns the result of the claim operation including the credited amount.

```json
{
    "success": true,
    "message": "Successfully claimed 5.00 USD",
    "creditedUsd": 5.0
}
```

| Field         | Type    | Description                                       |
| :------------ | :------ | :------------------------------------------------ |
| `success`     | Boolean | Indicates if the claim was successful.            |
| `message`     | String  | A human-readable message describing the result.   |
| `creditedUsd` | Number  | The amount credited to the user's balance in USD. |

**Error Response (Example):**

```json
{
    "success": false,
    "message": "Code already claimed or invalid code"
}
```

#### Errors

| Status Code | Description                                        |
| :---------- | :------------------------------------------------- |
| `400`       | Bad Request. Invalid payload (e.g., missing code). |
| `401`       | Unauthorized. User is not logged in.               |
| `500`       | Internal Server Error (e.g., Transaction failed).  |

---
