# Socket Client Setup & Authentication

This guide explains how to initialize the Socket.IO client on the frontend, specifically handling authentication across subdomains (e.g., frontend at `buzzedcasino.com` and backend at `api.buzzedcasino.com`).

## Authentication Mechanism

The backend uses `express-session` with `passport` for authentication.

- When a user logs in via the API, a `connect.sid` HTTP-only cookie is set.
- This cookie is configured with a `Domain` attribute (e.g., `.buzzedcasino.com`) allowing it to be shared across subdomains.
- For the socket connection to be authenticated, this cookie **MUST** be sent with the handshake request.

## Installation

```bash
npm install socket.io-client
# or
yarn add socket.io-client
```

## Initialization Code

To ensure cookies are sent, you must set `withCredentials: true`.

### Basic Setup

```javascript
import { io } from "socket.io-client";

// URL of your backend (e.g., api.buzzedcasino.com)
const SOCKET_URL = "https://api.yourdomain.com";

export const socket = io(SOCKET_URL, {
    path: "/socket.io", // Default path
    transports: ["websocket"], // Force WebSocket for better performance
    withCredentials: true, // CRITICAL: Sends cookies (connect.sid) with request
    autoConnect: true, // Connect automatically
});

socket.on("connect", () => {
    console.log("Connected with ID:", socket.id);
});

socket.on("connect_error", err => {
    console.error("Connection failed:", err.message);
});
```

### React Hook / Context Pattern

For a Next.js or React application, it is best to manage the socket connection effectively, ensuring it hasn't successfully connected before the user is authenticated (though often we want a public connection + auth upgrade).

However, since the cookie is HTTP-only and automatic, the browser handles the "sending" part. Only the server needs to validate it.

```javascript
// lib/socket.js
import { io } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export const socket = io(SOCKET_URL, {
    path: "/socket.io",
    transports: ["websocket"],
    withCredentials: true, // Required for cross-site auth cookies
    autoConnect: false, // We control when to connect
});
```

```javascript
// hooks/useSocket.js
import { useEffect, useState } from "react";
import { socket } from "../lib/socket";

export const useSocket = () => {
    const [isConnected, setIsConnected] = useState(socket.connected);

    useEffect(() => {
        function onConnect() {
            setIsConnected(true);
            console.log("Socket connected");
        }

        function onDisconnect() {
            setIsConnected(false);
            console.log("Socket disconnected");
        }

        // Attempt connection
        if (!socket.connected) {
            socket.connect();
        }

        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);

        return () => {
            socket.off("connect", onConnect);
            socket.off("disconnect", onDisconnect);
            // Optional: don't disconnect on unmount if you want persistence across pages
            // socket.disconnect();
        };
    }, []);

    return { socket, isConnected };
};
```
