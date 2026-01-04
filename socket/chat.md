# Chat Socket Documentation

This document outlines the socket events, payloads, and workflows for the Chat feature implemented in `chat.js`.

## Overview

The chat system is room-based, supporting real-time messaging, user lists, and moderation commands. It uses `socket.io`.

### Connection

- **Path**: `/socket.io`
- **Transport**: Websocket
- **Authentication**: `steam-user` cookie is required for identifying the user.

### Rooms

The following rooms are currently allowed:

- `English`
- `Turkish`
- `French`

---

### Setup Example (React/Next.js)

```javascript
import { io } from "socket.io-client";

const socket = io("https://your-backend-url.com", {
    path: "/socket.io",
    transports: ["websocket"],
    withCredentials: true, // Important for passing cookies
});

// Connection listeners
socket.on("connect", () => {
    console.log("Connected to chat socket:", socket.id);
});

socket.on("disconnect", () => {
    console.log("Disconnected from chat socket");
});
```

---

## Client -> Server Events

These are events emitted by the frontend to the backend.

### 1. `join-room`

Joins a specific chat room.

- **Payload**:
    ```json
    {
        "room": "English" // or "Turkish", "French"
    }
    ```
- **Behavior**:
    - Validates the room name.
    - Sends back the recent history via `get-messages`.
    - Adds user to the online list for that room.
    - Broadcasts updated `online-users` counts to all clients.
- **Rate Limit**: Yes (Default)
- **Frontend Code**:
    ```javascript
    const joinRoom = roomName => {
        socket.emit("join-room", { room: roomName });
    };
    // Example usage:
    joinRoom("English");
    ```

### 2. `send-message`

Sends a message to the current room.

- **Payload**:
    ```json
    {
        "room": "English",
        "message": "Hello world!"
    }
    ```
- **Behavior**:
    - Validates auth, room, and message length (max 256 chars).
    - Checks for `muted` or `banned` status.
    - Checks for Admin/Mod commands (e.g., `/mute`, `/ban`).
    - If successful, broadcasts the message via `message-response`.
- **Rate Limit**: 2000ms (approx)
- **Restrictions**:
    - Max length: 256 characters.
    - User must not be muted or banned.
- **Frontend Code**:
    ```javascript
    const sendMessage = (room, messageText) => {
        socket.emit("send-message", {
            room: room,
            message: messageText,
        });
    };
    ```

### 3. `online-users` (Request)

Requests the current count of online users per room.

- **Payload**: None
- **Behavior**: Server responds with `online-users` event containing counts.
- **Frontend Code**:
    ```javascript
    // To request an update immediately
    socket.emit("online-users");
    ```

### 4. `get-online-users`

Requests the list of specific users in the current room.

- **Payload**: None
- **Behavior**: Server responds with `online-users-list` containing user details.
- **Frontend Code**:
    ```javascript
    socket.emit("get-online-users");
    ```

---

## Server -> Client Events

These are events emitted by the backend to the frontend.

### 1. `message-response`

The primary event for incoming messages, errors, and system notifications.

- **Payload (Success/Broadcast)**:
    ```json
    {
        "status": true,
        "room": "English",
        "output": [
            {
                "message": "Hello world!",
                "date": 1715600000000,
                "user": {
                    "steamid": "76561198...",
                    "username": "Player1",
                    "avatar": "https://...",
                    "level": 10,
                    "role": "user", // "user", "mod", "admin"
                    "color": "#ff0000"
                }
            }
            // ... list of recent messages (up to 50)
        ]
    }
    ```
- **Payload (Error/Notification)**:

    ```json
    {
        "status": false,
        "room": "English",
        "message": "You are sending messages too fast"
    }
    ```

- **Frontend Code**:

    ```javascript
    socket.on("message-response", data => {
        if (!data.status) {
            console.error("Chat Error:", data.message);
            // Show toast or alert
            return;
        }

        // data.output contains the array of messages
        // If it's a new message, it might return the whole list or just the new one depending on implementation details
        // (Based on current server code, it returns the updated list of last 50 messages)
        updateChatUI(data.output);
    });
    ```

### 2. `get-messages`

Sent immediately after joining a room to load chat history.

- **Payload**:
    ```json
    {
        "messages": [
            // Array of Message Objects (same structure as above)
        ]
    }
    ```
- **Frontend Code**:
    ```javascript
    socket.on("get-messages", data => {
        const history = data.messages;
        initializeChatHistory(history);
    });
    ```

### 3. `online-users` (Broadcast)

Updates the counts of users in each room. Includes "fake" inflation counts.

- **Payload**:
    ```json
    {
        "English": 120,
        "Turkish": 45,
        "French": 12
    }
    ```
- **Frontend Code**:
    ```javascript
    socket.on("online-users", counts => {
        // counts = { English: 120, Turkish: 45, ... }
        updateOnlineCounts(counts);
    });
    ```

### 4. `online-users-list`

Response to `get-online-users`.

- **Payload**:
    ```json
    {
        "users": {
            "76561198...": {
                "username": "Player1",
                "avatar": "https://..."
            },
            "76561199...": {
                "username": "Player2",
                "avatar": "https://..."
            }
        }
    }
    ```
- **Frontend Code**:
    ```javascript
    socket.on("online-users-list", data => {
        const usersMap = data.users;
        // Convert to array if needed for rendering
        const usersList = Object.values(usersMap);
        renderUserList(usersList);
    });
    ```

---

## Data Models

### Message Object

```javascript
{
  "message": string,       // The message text
  "date": number,          // Timestamp (ms)
  "user": {
    "steamid": string,
    "username": string,
    "avatar": string,      // URL
    "level": number,
    "role": string,        // "user", "mod", "admin", etc.
    "color": string        // Role color hex code
  }
}
```

---

## Moderation Commands

Available to users with `role: "mod"` or `"admin"`.

| Command   | Usage                        | Description                                             |
| :-------- | :--------------------------- | :------------------------------------------------------ |
| `/mute`   | `/mute [steamid] [duration]` | Mutes a user. Duration format: `10s`, `5m`, `2h`, `1d`. |
| `/ban`    | `/ban [steamid]`             | Bans a user from the specific feature/site.             |
| `/unmute` | `/unmute [steamid]`          | Unmutes a user.                                         |
| `/unban`  | `/unban [steamid]`           | Unbans a user.                                          |

_Examples:_

- `/mute 76561198000000001 1h`
- `/ban 76561198000000001`

---

## Full Frontend Hook Example (React)

Here is a comprehensive example of a React hook to manage chat.

```javascript
import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

// Singleton socket instance (or manage via Context)
const socket = io("https://api.yourdomain.com", {
    path: "/socket.io",
    transports: ["websocket"],
    withCredentials: true,
    autoConnect: false, // Connect manually when needed
});

export const useChatConfig = (initialRoom = "English") => {
    const [messages, setMessages] = useState([]);
    const [room, setRoom] = useState(initialRoom);
    const [onlineCounts, setOnlineCounts] = useState({});
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        socket.connect();
        setIsConnected(true);

        // Initial Join
        socket.emit("join-room", { room });

        // Listeners
        socket.on("get-messages", data => {
            setMessages(data.messages || []);
        });

        socket.on("message-response", data => {
            if (data.status) {
                // data.output is the full list of last 50 messages
                setMessages(data.output);
            } else {
                console.warn("Chat Error:", data.message);
                // Dispatch toast notification here
            }
        });

        socket.on("online-users", counts => {
            setOnlineCounts(counts);
        });

        return () => {
            socket.off("get-messages");
            socket.off("message-response");
            socket.off("online-users");
            socket.disconnect();
            setIsConnected(false);
        };
    }, [room]);

    const sendMessage = text => {
        if (!text.trim()) return;
        socket.emit("send-message", { room, message: text });
    };

    const changeRoom = newRoom => {
        setRoom(newRoom);
        setMessages([]); // Clear messages on room switch
        // The useEffect will re-run and join the new room
    };

    return {
        messages,
        sendMessage,
        room,
        changeRoom,
        onlineCounts,
        isConnected,
    };
};
```
