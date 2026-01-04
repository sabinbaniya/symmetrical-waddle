# Sweepstake API Documentation

This document provides API documentation for the sweepstake routes implemented in the `lucky-be` backend. Use these endpoints to access sweepstake configuration and calculation logic.

**Base Path**: `/sweepstake`

---

## Endpoints

### 1. GET `/sweepstake/value`

Retrieves the current configured value for "USD to Sweepstake Balance" conversion.

#### Response

```json
{
  "value": number
}
```

#### Example

**Request:**

```bash
GET /sweepstake/value
```

**Response:**

```json
{
    "value": 1.66
}
```

---

### 2. GET `/sweepstake/calc-deposit`

Calculates the sweepstake balance equivalent for a given USD deposit amount based on the current configuration.

#### Query Parameters

| Parameter | Type   | Required | Description                               |
| :-------- | :----- | :------- | :---------------------------------------- |
| `amount`  | number | Yes      | The USD deposit amount to calculate from. |

#### Response

```json
{
  "value": number
}
```

#### Error Responses

- **400 Bad Request**: If `amount` is missing or not a valid number.
- **500 Internal Server Error**: If an error occurs during calculation.

#### Example

**Request:**

```bash
GET /sweepstake/calc-deposit?amount=100
```

**Response:**

```json
{
    "value": 60.24
}
```
