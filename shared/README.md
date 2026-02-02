# OpenPath Shared

Shared utilities, Zod schemas, and TypeScript types used across the OpenPath monorepo.

## Overview

This workspace acts as the "Single Source of Truth" for data models and validation logic. By sharing schemas between the API, Dashboard, SPA, and other clients, we ensure end-to-end type safety and consistent validation.

## Features

- **Zod Schemas**: Pre-defined validation schemas for all major entities (Classrooms, Machines, Users, etc.).
- **TypeScript Types**: Automatically inferred types from Zod schemas.
- **Constants**: Shared system constants used throughout the project.

## Usage

Add as a dependency in your `package.json`:

```json
"dependencies": {
  "@openpath/shared": "workspace:*"
}
```

Import schemas and types:

```typescript
import { Classroom, User, DomainRequest } from '@openpath/shared';
import type { Classroom as ClassroomType } from '@openpath/shared';
```

## Quick Start

### Build

```bash
npm run build
```

### Typecheck

```bash
npm run typecheck
```

## Testing

Schema validation logic is tested to ensure it correctly identifies valid and invalid data.

```bash
npm test
```

## License

AGPL-3.0-or-later
