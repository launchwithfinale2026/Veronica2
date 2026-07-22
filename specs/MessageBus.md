# VERONICA Message Bus Specification

## Purpose

The Message Bus is the nervous system of VERONICA OS.

No department, agent, or service communicates directly with another 
component.

All communication flows through the Message Bus.

---

# Core Principle

Components do not know each other.

They know:

- What they need
- What they provide
- How to request it

The Message Bus handles routing.

---

# Communication Flow

Example:

USER
 |
VERONICA
 |
Message Bus
 |
ATHENA
 |
METIS Agent
 |
Report
 |
Message Bus
 |
VERONICA


---

# Message Structure

Every message contains:

```json
{
  "id": "unique-message-id",
  "timestamp": "ISO-date",
  "sender": "component-id",
  "receiver": "component-id",
  "type": "request|response|event",
  "priority": "low|normal|high|critical",
  "payload": {}
}
