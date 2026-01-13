# E2E Tests Status - React Migration

## ✅ Updated for React

- `global-setup.ts` - Updated selectors for React components
- `login-ui.spec.ts` - Updated for LoginView component
- `react-smoke.spec.ts` - New basic smoke tests for React app

## ⚠️ Needs Update (Legacy Vanilla TS Selectors)

The following tests were written for the vanilla TypeScript version and need updating to work with React components:

### High Priority (Authentication & Setup)
- `auth.spec.ts` - Authentication flow tests
- `setup-flow.spec.ts` - First-time setup wizard
- `blocked-domain.spec.ts` - Block page functionality

### Medium Priority (Admin Views)
- `admin-domains.spec.ts` - Groups management (now GroupsListView + GroupDetailView)
- `admin-classrooms.spec.ts` - Classrooms management (now ClassroomsView)
- `admin-users.spec.ts` - User management (now UsersView)
- `admin-requests.spec.ts` - Domain requests (now RequestsView)

### Low Priority (Extended Functionality)
- `teacher-flow.spec.ts` - Teacher-specific workflows
- `teacher-dashboard.spec.ts` - Teacher dashboard views
- `student-view.spec.ts` - Student-specific views
- `multi-user-flow.spec.ts` - Multi-role scenarios
- `schedules.spec.ts` - Schedule management
- `classroom-management.spec.ts` - Classroom operations
- `admin-health.spec.ts` - System health checks
- `push-notifications.spec.ts` - Push notification features
- `api-integration.spec.ts` - API integration tests
- `edge-cases-security.spec.ts` - Edge cases and security
- `visual.spec.ts` - Visual regression tests

## Migration Guide for Test Updates

### Key Changes

**Old (Vanilla TS):**
```typescript
await page.click('#login-email');
await page.fill('#login-password', 'password');
await page.click('#email-login-btn');
await page.waitForSelector('#dashboard-screen:not(.hidden)');
```

**New (React):**
```typescript
await page.fill('input[type="email"]', 'user@example.com');
await page.fill('input[type="password"]', 'password');
await page.click('button[type="submit"]:has-text("Entrar")');
await page.waitForSelector('text=Panel de control');
```

### Component Mapping

| Old Selector | New Selector | Component |
|--------------|--------------|-----------|
| `#login-screen` | `text=Iniciar sesión` | LoginView |
| `#setup-header` | `text=Configuración inicial` | SetupView |
| `#dashboard-screen` | `text=Panel de control` | DashboardLayout |
| `#groups-list` | `text=Grupos` (sidebar) | GroupsListView |
| `#users-list` | `text=Usuarios` (sidebar) | UsersView |
| `#requests-list` | `text=Solicitudes` (sidebar) | RequestsView |
| `#classrooms-list` | `text=Aulas` (sidebar) | ClassroomsView |

### Running Tests

```bash
# Smoke tests only (React migration verified)
npm run test:e2e:smoke

# All tests (many will fail until updated)
npm run test:e2e

# With browser UI
npm run test:e2e:headed

# Single spec
npx playwright test e2e/react-smoke.spec.ts
```

## Notes

- React uses semantic HTML and text-based selectors instead of IDs
- Navigation uses React Router, URLs change instantly
- Forms use native HTML validation with React controlled components
- Toasts are handled by react-hot-toast (different API from vanilla implementation)
- Modals are rendered using React portals
