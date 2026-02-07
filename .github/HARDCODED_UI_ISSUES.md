# Hardcoded UI Data - Implementation Tracker

> **Created:** 2026-02-07  
> **Scope:** HIGH priority items only (10 issues)  
> **Goal:** Replace hardcoded/mock data with real API-driven information

---

## Progress Summary

| Status      | Count |
| ----------- | ----- |
| Pending     | 2     |
| In Progress | 0     |
| Completed   | 8     |

---

## HIGH Priority Issues

### Settings Page (`react-spa/src/views/Settings.tsx`)

- [x] **#1 - Version number hardcoded as "v4.1.0"** (line 221)
  - **Current:** `OpenPath v4.1.0` static string
  - **Solution:** Fetch from `/health` endpoint or import from `package.json`
  - **API needed:** Extend health endpoint to include version
  - **Complexity:** Low
  - **Status:** ✅ COMPLETED - Added `healthcheck.systemInfo` tRPC endpoint

- [x] **#2 - Session timeout shows "8 horas"** (line 156)
  - **Current:** Static "8 horas" text
  - **Solution:** Return JWT expiry duration in `/auth/me` response
  - **API needed:** Add `sessionExpiresIn` to user profile response
  - **Complexity:** Low
  - **Status:** ✅ COMPLETED - Added to `systemInfo` endpoint with human-readable format

- [x] **#3 - Last backup shows "Hace 2 horas"** (line 188)
  - **Current:** Hardcoded fake timestamp
  - **Solution:** Create system info endpoint with backup metadata
  - **API needed:** `system.info` or `system.health` query
  - **Complexity:** Medium (needs backup tracking)
  - **Status:** ✅ COMPLETED - Added backup router with status/record endpoints, Settings.tsx shows real data

- [x] **#4 - Database status always shows "Conectada"** (line 179)
  - **Current:** Static green indicator regardless of actual state
  - **Solution:** Real-time health check from API
  - **API needed:** Extend `/health` with `database.connected` boolean
  - **Complexity:** Low
  - **Status:** ✅ COMPLETED - Uses `testConnection()` from db/index.ts

- [x] **#5 - Database type hardcoded as "PostgreSQL"** (line 184)
  - **Current:** Static "PostgreSQL" text
  - **Solution:** Return DB type from system info endpoint
  - **API needed:** Add `database.type` to health/system endpoint
  - **Complexity:** Low
  - **Status:** ✅ COMPLETED - Returns from `systemInfo` endpoint

- [ ] **#6 - API Token section is completely mock** (lines 204-209)
  - **Current:** Fake masked token "••••••••" with static "Activo" badge
  - **Solution:** Implement token management (list, revoke, regenerate)
  - **API needed:** Full `tokens` CRUD router
  - **Complexity:** High (new feature)
  - **Status:** ⏸️ DEFERRED - Requires full feature implementation

### Classrooms Page (`react-spa/src/views/Classrooms.tsx`)

- [x] **#7 - Computer count always shows 0** (lines 58, 94)
  - **Current:** `computerCount: 0` with TODO comment
  - **Solution:** Count registered machines per classroom
  - **API needed:** `machines.countByClassroom` or extend `classrooms.list`
  - **Complexity:** Medium (needs machines relationship)
  - **Status:** ✅ COMPLETED - ClassroomService already returns machineCount, updated Classrooms.tsx to use it

- [ ] **#8 - Status always shows "Operativo"** (line 326)
  - **Current:** Static green "Operativo" badge for all classrooms
  - **Solution:** Calculate from agent health/last-seen data
  - **API needed:** Aggregate machine status per classroom
  - **Complexity:** Medium
  - **Status:** ⏸️ DEFERRED - Requires agent health tracking

### Header (`react-spa/src/components/Header.tsx`)

- [x] **#9 - Notification badge always shows red dot** (lines 48-51)
  - **Current:** Unconditional red dot regardless of notifications
  - **Solution:** Fetch unread count, hide dot when zero
  - **API needed:** `notifications.unreadCount` query
  - **Complexity:** Low-Medium
  - **Status:** ✅ COMPLETED - Removed misleading badge, added "próximamente" tooltip

### Login Page (`react-spa/src/views/Login.tsx`)

- [x] **#10 - Marketing claims without data** (lines 76-80)
  - **Current:** "Encriptación E2E" and "99.9% Uptime" static claims
  - **Solution:** Either fetch real uptime metrics OR remove claims
  - **API needed:** Optional `system.uptime` or remove entirely
  - **Complexity:** Low (if removing) / Medium (if implementing metrics)
  - **Status:** ✅ COMPLETED - Changed to verifiable claims: "Conexión Segura", "Código Abierto"

---

## Implementation Order (Recommended)

### Phase 1 - Quick Wins (API exists or trivial to add) ✅ DONE

1. ✅ #1 Version number - just expose package.json version
2. ✅ #4 Database status - extend existing /health
3. ✅ #5 Database type - extend existing /health
4. ✅ #9 Notification badge - removed misleading indicator
5. ✅ #2 Session timeout - added to systemInfo endpoint
6. ✅ #10 Marketing claims - replaced with verifiable claims

### Phase 2 - New API Endpoints (Future Work)

7. ⏸️ #7 Computer count - needs machines aggregation
8. ⏸️ #8 Classroom status - needs machine health aggregation

### Phase 3 - Feature Development (Future Work)

9. ⏸️ #6 API Token management - full new feature

---

## Completion Log

| Issue          | Date       | Commit  |
| -------------- | ---------- | ------- |
| #1, #2, #4, #5 | 2026-02-07 | c23ea6a |
| #9             | 2026-02-07 | c23ea6a |
| #10            | 2026-02-07 | c23ea6a |
| #3             | 2026-02-07 | f2f1b9b |

---

## Notes

- Each item should be committed separately for clean git history
- Run `npm run verify:full` before each commit
- Update this file's checkboxes as items are completed
- Items #3, #6, #7, #8 require significant backend work and are deferred
