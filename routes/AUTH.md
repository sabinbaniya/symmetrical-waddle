# Authentication API Documentation

This document provides documentation for the authentication endpoints available in the backend. These endpoints handle social login via Steam, Google, and Discord, as well as user sessions and logout.

**Base URL**: `/auth`

---

## 🔐 Authentication Flow

The backend uses [Passport.js](https://www.passportjs.org/) for session-based authentication.

1. **Initiate Login**: The frontend redirects the user to the respective provider's endpoint (e.g., `/auth/steam`).
2. **Provider Redirect**: The backend redirects the user to the social provider's login page.
3. **Callback Handling**: After a successful login, the provider redirects the user back to the backend's callback URL.
4. **Session Creation**: The backend authenticates the user, establishes a session, sets a `logged-in` cookie, and redirects the user back to the `MAIN_URL` (the frontend).
5. **Accessing Data**: Subsequent requests from the frontend will include the session cookie, allowing access to protected routes or user data via `/auth/me`.

---

## 🚀 Endpoints

### 1. GET `/auth/steam`

Initiates authentication via Steam.

#### Request

- **Method**: `GET`
- **URL**: `/auth/steam`
- **Authentication**: None required.

#### Response

- **Redirects**: To the Steam OpenID login page. On failure, redirects to the `MAIN_URL`.

---

### 2. GET `/auth/google`

Initiates authentication via Google.

#### Request

- **Method**: `GET`
- **URL**: `/auth/google`
- **Scope**: `profile`, `email`
- **Authentication**: None required.

#### Response

- **Redirects**: To the Google OAuth2 login page. On failure, redirects to the `MAIN_URL`.

---

### 3. GET `/auth/discord`

Initiates authentication via Discord.

#### Request

- **Method**: `GET`
- **URL**: `/auth/discord`
- **Authentication**: None required.

#### Response

- **Redirects**: To the Discord OAuth2 login page. On failure, redirects to the `MAIN_URL`.

---

### 4. GET `/auth/logout`

Logs out the current user and terminates the session.

#### Request

- **Method**: `GET`
- **URL**: `/auth/logout`

#### Response

- **Redirects**: To the `MAIN_URL` after clearing the session.

---

### 5. GET `/auth/me`

Retrieves the currently authenticated user's profile information.

#### Request

- **Method**: `GET`
- **URL**: `/auth/me`
- **Authentication**: Session cookie required for success.

#### Response

- **Status 200 (Success)**: Returns the user object.
    ```json
    {
        "user": {
            "id": "...",
            "username": "...",
            "email": "...",
            "avatar": "...",
            "...": "..."
        }
    }
    ```
- **Status 401 (Unauthorized)**: No active session.
    ```json
    {
        "user": null
    }
    ```

---

## 💡 Frontend Integration Example

```javascript
// Check if user is logged in
async function checkAuth() {
    try {
        const response = await fetch("/auth/me");
        if (response.ok) {
            const data = await response.json();
            console.log("Logged in as:", data.user.username);
        } else {
            console.log("User is not logged in");
        }
    } catch (error) {
        console.error("Error checking auth:", error);
    }
}
```

> [!NOTE]
> Ensure that the frontend application is configured to include credentials (cookies) in requests to the backend (e.g., `credentials: 'include'` in Fetch API).
