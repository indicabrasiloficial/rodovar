# Security Specification - RODOVAR MONITORA

This document specifies the security posture and access control matrix for the RODOVAR MONITORA Firestore collections.

## 1. Data Invariants

- **Authentication Invariant**: No reads or writes are allowed to `/entregas` or `/scheduled_messages` without a valid, signed-in user session (`request.auth != null`).
- **Owner Isolation Invariant**: Users can only read, create, update, or delete their own data (`resource.data.userId == request.auth.uid` or `request.resource.data.userId == request.auth.uid`).
- **Data Integrity Invariant**: All status transitions must remain within allowed enums. Immutable fields such as `createdAt` or `created_at` may never be modified once set.
- **Size Bounds Invariant**: String attributes like `vendedor`, `cliente`, `motorista` are strictly capped in size to prevent resource-exhaustion or "Denial of Wallet" exploits.

## 2. The "Dirty Dozen" (12 Malicious Payloads blocked by Security rules)

1. **Anonymous Write Attack**: Trying to write a new delivery without any authenticating credentials.
2. **Identity Spoofing Attack**: Authenticated user `User_A` attempting to write a delivery with `userId: "User_B"`.
3. **Ghost Field Injection**: Sending additional un-schemed properties ` { isVerifiedReal: true, isAdminUser: true }` in the payload.
4. **Incorrect Status Enum Poisoning**: Writing a delivery with `status: "hack_state"`.
5. **PII Unauthorized Read Exposure**: Authenticated user `User_A` issues a get query on user `User_B`'s private delivery record.
6. **Delivery Deletion Hijack**: Authenticated user `User_A` tries to delete a delivery belonging to user `User_B`.
7. **Negative Frete Amount Exploit**: Writing a delivery with negative freight numbers (`frete_empresa: -5000`).
8. **Immortal CreatedAt Field Overwrite**: Updating an existing delivery to alter its original `created_at` timestamp.
9. **Junk ID Path Overflow**: Injecting 1.5MB junk string characters as an ID path variable (`/entregas/someHugePoisonedIDString...`).
10. **Unauthenticated Scheduler Hijack**: Submitting a scheduled WhatsApp message task without signing in first.
11. **Cross-User Scheduled Message Alteration**: User `User_A` attempts to edit/cancel a scheduled message belonging to `User_B`.
12. **Status Enum Override in Scheduled Task**: Setting message `status: "arbitrary_state"` bypasses status restrictions.

## 3. Test Runner Design

The security configuration will reject all of the above payloads with `PERMISSION_DENIED`. Complete assertions verified by static linting rules with `@firebase/eslint-plugin-security-rules`.
