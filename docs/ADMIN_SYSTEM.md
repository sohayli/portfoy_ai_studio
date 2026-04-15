# Admin Privileges System

Role-based access control (RBAC) for user management.

## User Roles

| Role | Permissions |
|------|-------------|
| **user** | - View own portfolios<br>- Manage own assets<br>- Access personal data |
| **admin** | - All user permissions<br>- View all users<br>- Change user roles<br>- View system stats<br>- Sync TEFAS data |
| **superadmin** | - All admin permissions<br>- Delete users<br>- Full system access<br>- Manage all data |

## Current Admins

```
sohayli@gmail.com → superadmin
salihozcanhayli@gmail.com → user
```

## Database Schema

```sql
users:
- id (TEXT, PK)
- email (TEXT)
- displayName (TEXT)
- role (TEXT) ← NEW: 'user' | 'admin' | 'superadmin'
- createdAt (TIMESTAMP)
```

## API Endpoints

### 1. List All Users (Admin Only)

**GET** `/api/admin/users`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
[
  {
    "id": "110229643305230390619",
    "email": "salihozcanhayli@gmail.com",
    "displayName": "Salih özcan",
    "role": "user",
    "createdAt": "2026-04-15T20:01:22.644Z"
  },
  {
    "id": "100006217162045286552",
    "email": "sohayli@gmail.com",
    "displayName": "Salih Haylis",
    "role": "superadmin",
    "createdAt": "2026-04-15T20:01:22.638Z"
  }
]
```

### 2. Change User Role (Admin Only)

**PATCH** `/api/admin/users/:id/role`

**Request Body:**
```json
{
  "role": "admin"
}
```

**Response:**
```json
{
  "id": "110229643305230390619",
  "email": "salihozcanhayli@gmail.com",
  "role": "admin",
  "updatedAt": "2026-04-15T21:10:00.000Z"
}
```

**Valid Roles:** `user`, `admin`, `superadmin`

### 3. Delete User (Superadmin Only)

**DELETE** `/api/admin/users/:id`

**Response:**
```json
{
  "success": true,
  "deleted": {
    "id": "...",
    "email": "...",
    "role": "user"
  }
}
```

**Note:** Cannot delete your own account.

### 4. System Stats (Admin Only)

**GET** `/api/admin/stats`

**Response:**
```json
{
  "users": 2,
  "portfolios": 5,
  "assets": 12,
  "funds": 4353
}
```

## Middleware

### authMiddleware

Validates JWT token for all authenticated users.

```typescript
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  const decoded = jwt.verify(token, JWT_SECRET);
  req.user = decoded; // { userId, email, role }
  
  next();
}
```

### adminMiddleware

Checks if user has admin or superadmin role.

```typescript
async function adminMiddleware(req, res, next) {
  const user = await db.select().from(users).where(eq(users.id, req.user.userId));
  
  if (user[0].role !== 'admin' && user[0].role !== 'superadmin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
}
```

## Testing

### Test Admin Endpoints

```bash
# Login as admin (sohayli@gmail.com)
# Get JWT token from localStorage

# List users
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:3000/api/admin/users

# Change role
curl -X PATCH \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"role":"admin"}' \
  http://localhost:3000/api/admin/users/110229643305230390619/role

# System stats
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:3000/api/admin/stats

# Delete user (superadmin only)
curl -X DELETE \
  -H "Authorization: Bearer <TOKEN>" \
  http://localhost:3000/api/admin/users/110229643305230390619
```

## Frontend Integration

### Check User Role

```typescript
const user = {
  id: "...",
  email: "...",
  role: "admin" // from JWT
};

if (user.role === 'admin' || user.role === 'superadmin') {
  // Show admin panel button
}
```

### Admin Panel Route

```tsx
function App() {
  const user = useUser();
  
  if (user.role === 'admin' || user.role === 'superadmin') {
    return <AdminPanel />;
  }
  
  return <Dashboard />;
}

function AdminPanel() {
  const [users, setUsers] = useState([]);
  
  useEffect(() => {
    fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(r => r.json())
    .then(setUsers);
  }, []);
  
  return (
    <div>
      <h1>Admin Panel</h1>
      <table>
        {users.map(u => (
          <tr>
            <td>{u.email}</td>
            <td>{u.role}</td>
            <td>
              <button onClick={() => changeRole(u.id, 'admin')}>
                Make Admin
              </button>
            </td>
          </tr>
        ))}
      </table>
    </div>
  );
}
```

## Security

### JWT Token

Contains user role:
```json
{
  "userId": "...",
  "email": "...",
  "role": "admin"
}
```

### Role Validation

- Backend validates role on every admin request
- Frontend checks role for UI rendering
- Database stores role persistently

### Permission Checks

| Action | Required Role |
|--------|--------------|
| View own data | user |
| View all users | admin |
| Change roles | admin |
| Delete users | superadmin |
| Sync TEFAS | admin |
| View stats | admin |

## Admin Actions

### Make User Admin

```sql
UPDATE users SET role = 'admin' WHERE email = 'user@example.com';
```

### Remove Admin

```sql
UPDATE users SET role = 'user' WHERE email = 'admin@example.com';
```

### List Admins

```sql
SELECT email, role FROM users WHERE role IN ('admin', 'superadmin');
```

## Role Hierarchy

```
superadmin
  └─ admin
      └─ user
```

- **superadmin**: Can promote/demote admins
- **admin**: Can promote users to admin
- **user**: No admin privileges

## Error Handling

### 401 Unauthorized

```json
{
  "error": "No token provided"
}
```

**Solution:** Add JWT token to Authorization header.

### 403 Forbidden

```json
{
  "error": "Admin access required"
}
```

**Solution:** User must have admin or superadmin role.

### 400 Bad Request

```json
{
  "error": "Invalid role"
}
```

**Solution:** Use valid role: `user`, `admin`, or `superadmin`.

## Database Management

### Add Role to New User

```sql
-- Default: role = 'user'
INSERT INTO users (id, email, role) VALUES ('...', '...', 'user');
```

### Check Role

```sql
SELECT email, role FROM users;
```

### Count Users by Role

```sql
SELECT role, COUNT(*) FROM users GROUP BY role;
```

## Future Features

1. **Admin Dashboard UI** - Visual admin panel
2. **Role History** - Track role changes
3. **Audit Log** - Log all admin actions
4. **Permission Matrix** - Fine-grained permissions
5. **Temporary Admin** - Time-limited admin access

## Documentation

- Backend: `server.ts:11-30` (middleware)
- Admin endpoints: `server.ts:384-466`
- Schema: `src/lib/schema.ts:6-11`
- Database: `users.role` column