# Admin Access — BotRoyale

## Overview

The `/admin` route is protected by role-based access control (RBAC). Only users whose `role` column equals `'admin'` in the `users` table can access it. All other authenticated users are silently redirected to the dashboard (`/`).

---

## How the Guard Works

`ProtectedRoute` in `frontend/src/App.tsx` accepts an optional `allowedRoles` prop:

```tsx
<ProtectedRoute allowedRoles={['admin']}>
  <AdminDashboard />
</ProtectedRoute>
```

Redirect logic:
1. **Not logged in** → `/signin`
2. **Logged in, wrong role** → `/` (dashboard, no error exposed to the user)
3. **`role === 'admin'`** → renders `AdminDashboard`

The `role` field is stored in the Zustand auth store (`useAuthStore`) and is populated from the JWT payload on login. The backend must set `role: 'admin'` in the JWT claims for this to propagate correctly.

---

## Granting Admin Access

### Option 1 — Direct SQL (fastest)

```sql
-- Connect to the database
psql -d poker

-- Promote a user by email
UPDATE users
SET role = 'admin'
WHERE email = 'target@example.com';

-- Verify
SELECT id, email, role FROM users WHERE email = 'target@example.com';
```

The user must **log out and back in** so the new role is reflected in a fresh JWT.

### Option 2 — npm Script (recommended for team use)

Run from the project root (`servers_poker/`):

```bash
npx ts-node scripts/set-admin.ts target@example.com
```

Create the script at `scripts/set-admin.ts` if it doesn't exist yet:

```typescript
import { DataSource } from 'typeorm'
import { dataSourceOptions } from '../src/database/data-source'

async function main() {
  const email = process.argv[2]
  if (!email) { console.error('Usage: set-admin.ts <email>'); process.exit(1) }

  const ds = new DataSource(dataSourceOptions)
  await ds.initialize()

  const result = await ds.query(
    `UPDATE users SET role = 'admin' WHERE email = $1 RETURNING id, email, role`,
    [email]
  )
  if (result.length === 0) {
    console.error(`No user found with email: ${email}`)
    process.exit(1)
  }
  console.log('Promoted:', result[0])
  await ds.destroy()
}

main().catch(e => { console.error(e); process.exit(1) })
```

### Option 3 — Revoking Admin

```sql
UPDATE users SET role = 'user' WHERE email = 'target@example.com';
```

---

## Backend JWT Requirement

The NestJS auth module must include `role` in the JWT payload so the frontend receives it on login. Verify in `src/modules/auth/auth.service.ts`:

```typescript
// The JWT payload must contain the role field
const payload = { sub: user.id, email: user.email, role: user.role }
return this.jwtService.sign(payload)
```

And the login response must return `role` in the user object so the Zustand store persists it:

```typescript
// AuthController login response
return { token, user: { id, email, name, role, subscription_status } }
```

---

## Security Notes

- The frontend guard is a **UX convenience only** — it prevents accidental navigation.
- All admin API endpoints must independently enforce `role === 'admin'` server-side via a NestJS `RolesGuard`.
- Never rely solely on frontend RBAC for sensitive operations.
- See `docs/SECURITY.md` for the full threat model.
