# Profile API Documentation

## Overview

This document provides API documentation for the profile routes implemented in the `lucky-be` backend. These routes handle user profile management, notifications, vault operations, and user settings.

**Base Path**: `/profile`

**Authentication**: Most endpoints require authentication via Passport.js session. The user must be logged in to access protected endpoints.

---

## Endpoints

### 1. GET `/profile/notifications`

Get all notifications for the authenticated user.

**Authentication**: Required

#### Response

Returns an array of notification objects.

```typescript
Array<{
    title: string;
    message: string;
    date: number;
}>;
```

**Success Response (200)**:

```json
[
    {
        "title": "Welcome",
        "message": "Welcome to Buzzed Casino!",
        "date": 1703001234567
    }
]
```

**Error Responses**:

- `401 Unauthorized`: User is not authenticated
- `400 Bad Request`: User not found
- `500 Internal Server Error`: Server error

---

### 2. DELETE `/profile/notifications`

Clear all notifications for the authenticated user.

**Authentication**: Required

#### Response

**Success Response (200)**:

```json
{
    "success": true
}
```

**Error Responses**:

- `401 Unauthorized`: User is not authenticated
- `400 Bad Request`: User not found
- `500 Internal Server Error`: Server error

---

### 3. GET `/profile/user/:id`

Get public user data by Steam ID.

**Authentication**: Not required (public endpoint)

#### Parameters

- `id` (path parameter): Steam ID of the user

#### Response

**Success Response (200)**:

```json
{
    "status": true,
    "user": {
        "steamid": "76561198123456789",
        "username": "PlayerName",
        "avatar": "https://avatars.steamstatic.com/...",
        "experience": 5000,
        "level": 5,
        "registerDate": 1703001234567
    }
}
```

**Error Responses**:

- `404 Not Found`: User not found

```json
{
    "status": false,
    "error": "User not found"
}
```

- `500 Internal Server Error`: Server error

---

### 4. POST `/profile/vault/lock`

Lock coins in the vault with a deadline. This moves coins from the user's balance to their vault balance and sets a lock deadline.

**Authentication**: Required

#### Request Body

```json
{
    "amount": 1000,
    "deadline": 1703001234567
}
```

- `amount` (number, required): Amount of coins to lock (must be positive)
- `deadline` (number, required): Unix timestamp in milliseconds when the vault will unlock (must be in the future)

#### Response

**Success Response (200)**:

```json
{
    "success": true
}
```

**Error Responses**:

- `401 Unauthorized`: User is not authenticated
- `400 Bad Request`: Invalid parameters

```json
{
    "error": "Amount and deadline are required"
}
// or
{
    "error": "Invalid amount"
}
// or
{
    "error": "Invalid deadline"
}
```

- `500 Internal Server Error`: Server error

---

### 5. POST `/profile/vault/unlock`

Unlock coins from the vault. This moves coins from the vault balance back to the user's regular balance.

**Authentication**: Required

#### Request Body

No body required.

#### Response

**Success Response (200)**:

```json
{
    "success": true
}
```

**Error Responses**:

- `401 Unauthorized`: User is not authenticated
- `400 Bad Request`: Cannot unlock vault

```json
{
    "error": "User not found"
}
// or
{
    "error": "Vault is empty"
}
// or
{
    "error": "Vault is still locked"
}
```

- `500 Internal Server Error`: Server error

---

### 6. PUT `/profile/trade-url`

Set or update the user's Steam trade URL.

**Authentication**: Required

#### Request Body

```json
{
    "url": "https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=ABCDEFGH"
}
```

- `url` (string, required): Steam trade URL (must start with `https://steamcommunity.com/tradeoffer/new/?partner`)

#### Response

**Success Response (200)**:

```json
{
    "success": true
}
```

**Error Responses**:

- `401 Unauthorized`: User is not authenticated
- `400 Bad Request`: Invalid trade URL

```json
{
    "error": "Trade URL is required"
}
// or
{
    "error": "Invalid trade URL"
}
```

- `500 Internal Server Error`: Server error

---

### 7. PUT `/profile/email`

Update the user's email address.

**Authentication**: Required

**Status**: Not implemented (returns 501)

#### Request Body

```json
{
    "email": "user@example.com"
}
```

#### Response

**Error Response (501)**:

```json
{
    "error": "This action is not available yet"
}
```

---

## Usage Examples

### Frontend Integration

#### Get Notifications

```javascript
const getNotifications = async () => {
    try {
        const response = await fetch("http://localhost:4000/profile/notifications", {
            method: "GET",
            credentials: "include", // Important for session cookies
        });

        if (!response.ok) {
            throw new Error("Failed to fetch notifications");
        }

        const notifications = await response.json();
        return notifications;
    } catch (error) {
        console.error("Error fetching notifications:", error);
        return [];
    }
};
```

#### Clear Notifications

```javascript
const clearNotifications = async () => {
    try {
        const response = await fetch("http://localhost:4000/profile/notifications", {
            method: "DELETE",
            credentials: "include",
        });

        if (!response.ok) {
            throw new Error("Failed to clear notifications");
        }

        const result = await response.json();
        return result.success;
    } catch (error) {
        console.error("Error clearing notifications:", error);
        return false;
    }
};
```

#### Get Public User

```javascript
const getPublicUser = async steamId => {
    try {
        const response = await fetch(`http://localhost:4000/profile/user/${steamId}`, {
            method: "GET",
        });

        if (!response.ok) {
            throw new Error("Failed to fetch user");
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error("Error fetching user:", error);
        return { status: false, error: "User not found" };
    }
};
```

#### Lock Coins in Vault

```javascript
const lockCoins = async (amount, deadline) => {
    try {
        const response = await fetch("http://localhost:4000/profile/vault/lock", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({ amount, deadline }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to lock coins");
        }

        const result = await response.json();
        return result.success;
    } catch (error) {
        console.error("Error locking coins:", error);
        return false;
    }
};
```

#### Unlock Coins from Vault

```javascript
const unlockCoins = async () => {
    try {
        const response = await fetch("http://localhost:4000/profile/vault/unlock", {
            method: "POST",
            credentials: "include",
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to unlock coins");
        }

        const result = await response.json();
        return result.success;
    } catch (error) {
        console.error("Error unlocking coins:", error);
        return false;
    }
};
```

#### Set Trade URL

```javascript
const setTradeURL = async url => {
    try {
        const response = await fetch("http://localhost:4000/profile/trade-url", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({ url }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to set trade URL");
        }

        const result = await response.json();
        return result.success;
    } catch (error) {
        console.error("Error setting trade URL:", error);
        return false;
    }
};
```

---

## Authentication

All protected endpoints require the user to be authenticated via Passport.js session. The session is maintained using cookies, so make sure to:

1. Include credentials in fetch requests: `credentials: 'include'`
2. Ensure CORS is properly configured to allow credentials
3. Use HTTPS in production for secure cookie transmission

The authentication middleware checks `req.isAuthenticated()` and returns a 401 error if the user is not logged in.

---

## Error Handling

All endpoints follow a consistent error response format:

```json
{
    "error": "Error message description"
}
```

Common HTTP status codes:

- `200 OK`: Successful request
- `400 Bad Request`: Invalid input or business logic error
- `401 Unauthorized`: User not authenticated
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server-side error
- `501 Not Implemented`: Feature not yet available

---

## Notes

- The vault feature allows users to lock their coins for a specified period, preventing them from being used until the deadline passes.
- The email update feature is currently disabled and will return a 501 status code.
- All monetary amounts are in the platform's base currency units.
- Timestamps are in Unix milliseconds format.
