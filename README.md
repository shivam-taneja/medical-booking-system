# Medical Booking System (Microservices)

This project implements a distributed booking system using NestJS microservices. It demonstrates the **Saga Pattern** for distributed transactions, ensuring eventual consistency between a **Booking Service** and a **Discount Service**.

## Architecture Overview

The system consists of two decoupled services communicating asynchronously via RabbitMQ:

1.  **Booking Service (Service A):**
    * Accepts HTTP requests to create bookings.
    * Persists initial state as `PENDING`.
    * Emits `booking_created` events to the message broker.
    * Listens for `discount_processed` events to finalize the booking status (`CONFIRMED` or `REJECTED`).

2.  **Discount Service (Service B):**
    * Listens for `booking_created` events.
    * Evaluates business rules (R1: Eligibility) and system constraints (R2: Daily Quota).
    * Uses **Redis** for atomic quota management.
    * Emits the result back to the Booking Service.

3.  **Infrastructure:**
    * **RabbitMQ:** Message broker for asynchronous communication.
    * **Redis:** In-memory store for maintaining the daily discount quota.

## Prerequisites

* Node.js (v22)
* Docker & Docker Compose
* pnpm

---

## Installation & Setup

1.  **Clone the repository**
    ```bash
    git clone https://github.com/shivam-taneja/medical-booking-system.git
    cd medical-booking-system
    ```

2.  **Install dependencies**
    ```bash
    pnpm install
    ```

3.  **Environment Configuration**
    Copy the `.env.example` to `.env` and fill in the values

4.  **Start Infrastructure**
    Start RabbitMQ and Redis containers:
    ```bash
    pnpm run du
    ```

5.  **Start Microservices**
    Run both services concurrently:
    ```bash
    pnpm dev
    ```

## Testing Scenarios

The following scenarios validate the business logic (Rules R1 & R2) and the compensation workflow.

| Scenario        | Inputs                                              | Expected Result                                                                          |
|-----------------|-----------------------------------------------------|------------------------------------------------------------------------------------------|
| Positive Case   | Female user, today is birthday, Quota available     | Success: 12% discount applied, status CONFIRMED.                                         |
| Negative Case A | Male user, Price < 1000                             | Success: No discount applied (doesn't qualify for R1), status CONFIRMED at Base Price.   |
| Negative Case B | Female user, today is birthday, Quota is full       | Failure: Service B emits failure, Service A updates to REJECTED.                         |

## Technical Design Decisions

**Communication Pattern:** Asynchronous Choreography. Service A does not wait for Service B to respond; it polls or waits for a callback event.

**Persistence:**

* Booking Service: Uses an In-Memory Map (simulating a database) to store transaction states (PENDING, CONFIRMED, REJECTED).
* Discount Service: Uses Redis INCR commands to ensure atomic counting of daily discounts, preventing race conditions under high load.

**Error Handling:** The system implements manual acknowledgment (ack) in RabbitMQ. Messages are only removed from the queue after they have been successfully processed and persisted.

## Troubleshooting

### Resetting Daily Quota

The system enforces a daily discount limit based on **IST (Indian Standard Time)**. The Redis key follows the format `discount_quota:YYYY-MM-DD`.

1. **Check Current Usage:**
   
   Verify how many discounts have been granted for today (e.g., `2026-01-30`).
   
   ```bash
   # Replace <container-id> with your Redis container ID
   docker exec -it <container-id> redis-cli get discount_quota:2026-01-30
   ```

2. **Reset Quota:**
   
   Delete only today's counter to allow new R1 discounts immediately.
   
   ```bash
   # Replace <container-id> with your Redis container ID
   docker exec -it <container-id> redis-cli del discount_quota:2026-01-30
   ```
