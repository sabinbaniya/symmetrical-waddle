# Rain Socket API Documentation

This documentation provides details for frontend developers integrating with the Rain system socket events.

---

## Overview

The Rain system is a community reward mechanism where a "pot" of sweepstake balance accumulates over time (via tips and automated intervals) and is distributed to active users. The rain lifecycle consists of several phases: **Idle**, **Raining** (join phase), and **Distributing**.

---

## Configuration Constants

- **Rain Interval**: 2 hours (Time between rain sessions).
- **Join Duration**: 60 seconds (Window for users to join once rain starts).
- **Min Tip**: 1 coin.
- **Wager Requirement**: Users must meet a 7-day wager requirement to be eligible for rewards (currently set to 0 for testing).

---

## Client -> Server Events

### `get-rain-status`

Request the current status of the rain system.

- **Payload**: _None_
- **Response**: Emits `rain-status`.

### `join-rain`

Join the current active rain session.

- **Payload**: _None_
- **Response**: Emits `rain-response`.
- **Note**: Only possible when status is `raining`.

### `tip-rain`

Add coins to the rain pot.

- **Payload**: `{ amount: number }`
- **Response**: Emits `rain-response`.
- **Note**: Deducts balance immediately.

### `admin-add-rain`

(Admin/Mod only) Add coins to the pot without deducting from the user's balance.

- **Payload**: `{ amount: number }`

---

## Server -> Client Events

### `rain-status`

Broadcasted status updates.

- **Data**:

```typescript
{
    pot: number;
    nextDistribution: Date;
    status: "idle" | "raining" | "distributing";
    rainStartTime?: Date;
    participantsCount: number;
    endsAt?: Date; // Only if status is 'raining'
    duration?: number; // Join window duration in ms
}
```

### `rain-started`

Sent when a new rain session enters the join phase.

- **Data**: `{ pot: number, duration: number, endsAt: Date }`

### `rain-participant-joined`

Sent whenever a new user joins the rain.

- **Data**: `{ participantsCount: number, username: string }`

### `rain-distributed`

Sent after distribution is completed.

- **Data**:

```typescript
{
    pot: number;
    winners: Array<{
        steamid: string;
        username: string;
        amount: number;
        level: number;
        wager7d: number;
    }>;
    totalParticipants: number;
    eligibleParticipants: number;
}
```

### `rain-response`

Response to client actions (`join-rain`, `tip-rain`).

- **Data**: `{ status: boolean, message: string }`

---

## Eligibility & Rewards

### Reward Calculation

Rain rewards are distributed based on a weighted score:

- **50% Level**: Based on the user's experience level relative to others.
- **50% Wager**: Based on the user's 7-day wager history relative to others.

If no one has wagered in the last 7 days, the distribution defaults to being based solely on experience level.

### Requirements

- User must be logged in.
- Total wager in the last 7 days must meet the `MIN_WAGER_REQUIREMENT`.
