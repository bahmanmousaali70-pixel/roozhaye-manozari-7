# Security Specification — Roozhaye Man o Zari

## 1. Data Invariants
1. A `UserProfile` at `/users/{userId}` can only be read, created, or updated by `request.auth.uid == userId` with verified email and matching `uid`/`email`.
2. A `CoupleSpace` at `/spaces/{spaceId}` must have an immutable `ownerUid == request.auth.uid` and `ownerEmail == request.auth.token.email`. Only the owner can update `partnerEmail` or `title`.
3. A `SpaceMember` at `/spaces/{spaceId}/members/{memberUid}` can only be created when `memberUid == request.auth.uid` AND either `role == 'owner'` matching `space.ownerUid` or `role == 'partner'` matching `space.partnerEmail == request.auth.token.email`.
4. All space subcollections (`goals`, `habits`, `gratitudes`, `callers`, `schedules`, `config`) require active membership in `/spaces/{spaceId}/members/{request.auth.uid}` (`isSpaceMember(spaceId)`).
5. All writes enforce server timestamps (`request.time`), `updatedByUid == request.auth.uid`, immutable `authorUid`/`createdAt`, strict allowlisted keys (`hasAll`/`hasOnly` on create, `affectedKeys().hasOnly` on update), and strict `.size()` bounds on every string and array.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated read/write** on `/spaces/space1/goals/g1` (`request.auth == null`).
2. **Unverified email write** (`request.auth.token.email_verified == false`) on `/spaces/space1`.
3. **Ghost/shadow field injection** on create (`{ ..., isAdmin: true }`) on `/spaces/space1/goals/g1`.
4. **UID spoofing** on create (`authorUid: "other-user-uid"` != `request.auth.uid`) on `/spaces/space1/goals/g1`.
5. **Unauthorized member self-join** (`role: "partner"` when `space.partnerEmail != request.auth.token.email`) on `/spaces/space1/members/attacker`.
6. **Role escalation** on update (`role: "owner"`) on `/spaces/space1/members/partnerUid`.
7. **PII cross-user read** on `/users/victimUid` by `attackerUid`.
8. **Blanket list scraping** on `/spaces` (`allow list` without `where` matching `ownerUid` or `partnerEmail`).
9. **Resource poisoning** with oversized string (`title` > 300 chars or document ID > 128 chars or invalid chars `../../etc`).
10. **Client-forged timestamp** (`createdAt` or `updatedAt` != `request.time`).
11. **Immortal field mutation** (`authorUid` or `createdAt` modified during `update`).
12. **Unbounded/malformed array injection** (`habits.completedDates.size() > 365` or `gratitudes.items.size() != 3`).
