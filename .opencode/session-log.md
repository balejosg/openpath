### 09:05 - Learning

**Context:** Securing enrollment flow (teacher-safe install one-liner)
**What happened:** Found canonical role assignment via tRPC (users.assignRole) and that JWT roles are embedded at login time.
**Impact:** Enrollment test must assign role BEFORE final login; avoids false 403s on ticket endpoint.
**Action:** Update enrollment test setup to re-login after role insert/assignment.

---
