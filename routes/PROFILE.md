# Profile API Documentation

**Base Path**: `/profile`

***

#### Endpoints

**1. GET `/profile/notifications`**

Get all notifications for the authenticated user.

**Authentication**: Required

**Response**

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
        "message": "Welcome to Casino!",
        "date": 1703001234567
    }
]
```

**Error Responses**:

* `401 Unauthorized`: User is not authenticated
* `400 Bad Request`: User not found
* `500 Internal Server Error`: Server error

***

**2. DELETE `/profile/notifications`**

Clear all notifications for the authenticated user.

**Authentication**: Required

**Response**

**Success Response (200)**:

```json
{
    "success": true
}
```

**Error Responses**:

* `401 Unauthorized`: User is not authenticated
* `400 Bad Request`: User not found
* `500 Internal Server Error`: Server error

***

**3. GET `/profile/user/:id`**

Get public user data by Steam ID.

**Authentication**: Not required (public endpoint)

**Parameters**

* `id` (path parameter): Steam ID of the user

**Response**

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

* `404 Not Found`: User not found

```json
{
    "status": false,
    "error": "User not found"
}
```

* `500 Internal Server Error`: Server error

***

**4. POST `/profile/vault/lock`**

Lock coins in the vault with a deadline. This moves coins from the user's balance to their vault balance and sets a lock deadline.

**Authentication**: Required

**Request Body**

```json
{
    "amount": 1000,
    "deadline": 1703001234567
}
```

* `amount` (number, required): Amount of coins to lock (must be positive)
* `deadline` (number, required): Unix timestamp in milliseconds when the vault will unlock (must be in the future)

**Response**

**Success Response (200)**:

```json
{
    "success": true
}
```

**Error Responses**:

* `401 Unauthorized`: User is not authenticated
* `400 Bad Request`: Invalid parameters

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

* `500 Internal Server Error`: Server error

***

**5. POST `/profile/vault/unlock`**

Unlock coins from the vault. This moves coins from the vault balance back to the user's regular balance.

**Authentication**: Required

**Request Body**

No body required.

**Response**

**Success Response (200)**:

```json
{
    "success": true
}
```

**Error Responses**:

* `401 Unauthorized`: User is not authenticated
* `400 Bad Request`: Cannot unlock vault

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

* `500 Internal Server Error`: Server error

***

**6. PUT `/profile/trade-url`**

Set or update the user's Steam trade URL.

**Authentication**: Required

**Request Body**

```json
{
    "url": "https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=ABCDEFGH"
}
```

* `url` (string, required): Steam trade URL (must start with `https://steamcommunity.com/tradeoffer/new/?partner`)

**Response**

**Success Response (200)**:

```json
{
    "success": true
}
```

**Error Responses**:

* `401 Unauthorized`: User is not authenticated
* `400 Bad Request`: Invalid trade URL

```json
{
    "error": "Trade URL is required"
}
// or
{
    "error": "Invalid trade URL"
}
```

* `500 Internal Server Error`: Server error

***

**7. PUT `/profile/email`**

Update the user's email address.

**Authentication**: Required

**Status**: Not implemented (returns 501)

**Request Body**

```json
{
    "email": "user@example.com"
}
```

**Response**

**Error Response (501)**:

```json
{
    "error": "This action is not available yet"
}
```

***

**8. PUT `/profile/client-seed`**

Update the user's Provably Fair client seed.

**Authentication**: Required

**Validation Constraints:**

* **Min Length**: 4 characters
* **Max Length**: 64 characters
* **Allowed**: Alphanumeric, `-`, and `_`

**Request Body**

```json
{
    "clientSeed": "your-new-seed_123"
}
```

**Response**

**Success Response (200)**:

```json
{
    "success": true
}
```

**Error Responses**:

* `401 Unauthorized`
* `400 Bad Request`: Validation error

***

**9. GET `/profile/details`**

Get extended profile information, including personal info and shipping address.

**Authentication**: Required

**Response**

**Success Response (200)**:

```json
{
    "success": true,
    "data": {
        "username": "PlayerName",
        "firstName": "John",
        "lastName": "Doe",
        "phone": "+1234567890",
        "shippingAddress": {
            "addressLine1": "123 Main St",
            "addressLine2": "Apt 4B",
            "city": "London",
            "zipCode": "E1 6AN",
            "state": "Greater London",
            "country": "United Kingdom"
        }
    }
}
```

***

**10. PUT `/profile/details`**

Update profile details and shipping address. All fields are optional.

**Authentication**: Required

**Request Body**

```json
{
    "username": "NewUsername",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1234567890",
    "shippingAddress": {
        "addressLine1": "123 Main St",
        "city": "London",
        "country": "United Kingdom"
    }
}
```

**Logic:**

* **Username**: If provided and different from the current one, it checks for uniqueness.
* **Partial Updates**: You can provide only the fields you wish to change.

**Response**

**Success Response (200)**:

```json
{
    "success": true
}
```

***

**11. GET `/profile/2fa/status`**

Check if 2FA is enabled for the authenticated user.

**Authentication**: Required

**Response**

**Success Response (200)**:

```json
{
    "success": true,
    "enabled": true
}
```

***

**12. POST `/profile/2fa/setup`**

Initiate 2FA setup. Generates a secret and a QR code.

**Authentication**: Required

**Response**

**Success Response (200)**:

```json
{
    "success": true,
    "secret": "JBSWY3DPEHPK3PXP",
    "qrCode": "data:image/png;base64,..."
}
```

***

**13. POST `/profile/2fa/enable`**

Verify and enable 2FA using a code from the authenticator app.

**Authentication**: Required

**Request Body**

```json
{
    "code": "123456"
}
```

**Response**

**Success Response (200)**:

```json
{
    "success": true,
    "message": "2FA enabled successfully"
}
```

**Error Responses**:

* `400 Bad Request`: Invalid code or setup not initiated.

***

**14. POST `/profile/2fa/disable`**

Disable 2FA after verifying a code.

**Authentication**: Required

**Request Body**

```json
{
    "code": "123456"
}
```

**Response**

**Success Response (200)**:

```json
{
    "success": true,
    "message": "2FA disabled successfully"
}
```

**Error Responses**:

* `400 Bad Request`: Invalid code or 2FA not enabled.

***

#### 2FA Login Flow

The login flow changes when 2FA is enabled for a user. It becomes a two-step process to ensure security.

**Step 1: Initial Login**

**A. Email/Password Login**

Call `POST /auth/login` with email and password.

If 2FA is enabled, the server returns:

```json
{
    "twoFactorRequired": true,
    "preAuthToken": "eyJhbGciOi..."
}
```

* `preAuthToken`: A short-lived (5 min) JWT token required for the second step.

**B. OAuth Login (Steam, Google, Discord)**

If a user with 2FA enabled logs in via an OAuth provider, the backend will redirect them to the home page with query parameters:

`${MAIN_URL}?required2fa=true&token=${preAuthToken}`

The frontend should detect `required2fa=true`, extract the `token`, and proceed to Step 2.

**Step 2: 2FA Verification**

Call `POST /auth/login/2fa` with the `preAuthToken` and the 6-digit TOTP code.

**Request Body**

```json
{
    "preAuthToken": "eyJhbGciOi...",
    "code": "123456"
}
```

**Response**

**Success Response (200)**:

Returns the user object and sets the session cookie, completing the login.

```json
{
    "user": { ... }
}
```

***

#### Usage Examples

**Frontend Integration**

**Get Notifications**

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

**Clear Notifications**

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

**Get Public User**

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

**Lock Coins in Vault**

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

**Unlock Coins from Vault**

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

**Set Trade URL**

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

**Update Client Seed**

```javascript
const updateClientSeed = async (clientSeed) => {
    const response = await fetch("/profile/client-seed", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientSeed })
    });
    return await response.json();
};
```

**Update Profile Details**

```javascript
const updateDetails = async (details) => {
    const response = await fetch("/profile/details", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(details)
    });
    return await response.json();
};
```

**2FA Setup Flow**

```javascript
// 1. Get Setup Info
const setup2FA = async () => {
    const res = await fetch("/profile/2fa/setup", { method: "POST", credentials: "include" });
    const { qrCode, secret } = await res.json();
    // Display qrCode and allow user to copy secret
};

// 2. Enable 2FA
const enable2FA = async (code) => {
    const res = await fetch("/profile/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code })
    });
    return await res.json();
};
```

**2FA Login Flow**

```javascript
const login = async (email, password) => {
    const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (data.twoFactorRequired) {
        // Show 2FA input field
        const code = prompt("Enter 2FA code:"); // Simplified for example
        const res2 = await fetch("/auth/login/2fa", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ preAuthToken: data.preAuthToken, code })
        });
        return await res2.json();
    }

    return data;
};
```

***

#### Notes

* The vault feature allows users to lock their coins for a specified period, preventing them from being used until the deadline passes.
* The email update feature is currently disabled and will return a 501 status code.
* Timestamps are in Unix milliseconds format.
