# Admin Panel UI Guide

Visual interface for managing user roles and system administration.

## Access

**URL:** http://localhost:3000

**Login as superadmin:** `salihozcanhayli@gmail.com`

**Navbar:** "Admin" button with purple badge (only visible for admin/superadmin)

## Features

### 1. System Stats Dashboard

Cards showing:
- **Users:** Total registered users
- **Portfolios:** Total portfolios created
- **Assets:** Total assets tracked
- **TEFAS Funds:** Historical fund records

### 2. Quick Actions

- **Sync TEFAS Data:** Trigger manual fund price sync (takes ~5 minutes)
- **Refresh Users:** Reload user list

### 3. User Management Table

Each user card shows:
- Avatar icon
- Display name / Email
- Role badge (User/Admin/Superadmin)
- Action buttons (role change + delete)

**Role Change Buttons:**
- `User` → Make regular user
- `Admin` → Grant admin privileges
- `Super` → Grant superadmin privileges

**Delete Button:**
- Only visible for superadmin
- Cannot delete own account
- Confirmation popup before deletion

### 4. Role Permissions Info Card

Shows permissions for each role:
- **Superadmin:** Full system access
- **Admin:** Manage users, sync data
- **User:** Own portfolios/assets

## User Roles

### Role Badge Colors

| Role | Badge Color | Icon |
|------|-------------|------|
| **superadmin** | Purple | Shield |
| **admin** | Blue | Shield |
| **user** | Gray | - |

### Role Change Flow

```
User clicks "Admin" button
↓
API call: PATCH /api/admin/users/:id/role
↓
Role updated in database
↓
User list refreshed
↓
Success alert: "✅ Role updated to admin"
```

### Delete User Flow

```
User clicks delete button
↓
Confirmation popup
↓
API call: DELETE /api/admin/users/:id
↓
User removed from database
↓
User list refreshed
↓
Stats updated
↓
Success alert: "✅ User deleted"
```

## Example Screens

### Stats Dashboard

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ Users: 2    │ Portfolios: │ Assets: 12  │ Funds: 4353 │
│             │ 5           │             │             │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

### User List

```
┌──────────────────────────────────────────────────────┐
│ [Avatar] salihozcanhayli@gmail.com    [Superadmin]   │
│          Salih özcan                  [You]          │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ [Avatar] sohayli@gmail.com           [User]         │
│          Salih Haylis                                │
│ [User][Admin][Super] [Delete]                        │
└──────────────────────────────────────────────────────┘
```

### Quick Actions

```
┌──────────────────────────────────────────────────────┐
│ Quick Actions                                         │
│ [🔄 Sync TEFAS Data] [👥 Refresh Users]              │
└──────────────────────────────────────────────────────┘
```

## API Calls

### Fetch Users

```typescript
const token = localStorage.getItem('authToken');
const response = await fetch('/api/admin/users', {
  headers: { Authorization: `Bearer ${token}` }
});
const users = await response.json();
```

### Change Role

```typescript
await fetch(`/api/admin/users/${userId}/role`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ role: 'admin' })
});
```

### Delete User

```typescript
await fetch(`/api/admin/users/${userId}`, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${token}` }
});
```

### Sync TEFAS

```typescript
const response = await fetch('/api/tefas/scrape');
const data = await response.json();
// data.saved: number of funds synced
// data.duration: time in seconds
```

## Admin Panel Component

File: `src/components/AdminPanel.tsx`

**Props:**
```typescript
interface AdminPanelProps {
  user: {
    id: string;
    email: string;
    role: 'user' | 'admin' | 'superadmin';
  };
}
```

**State:**
```typescript
const [users, setUsers] = useState<AdminUser[]>([]);
const [stats, setStats] = useState<AdminStats | null>(null);
const [loading, setLoading] = useState(true);
const [syncing, setSyncing] = useState(false);
```

## Navigation

### Navbar Integration

File: `src/components/Navbar.tsx`

Admin button added to navbar:
```typescript
const adminItem = { id: 'admin', label: 'Admin', icon: Shield, color: 'purple' };
const allNavItems = user.role === 'admin' || user.role === 'superadmin' 
  ? [...navItems, adminItem] 
  : navItems;
```

**Desktop navbar:** Shows all nav items including Admin
**Mobile menu:** Same structure with purple Admin button

## Permissions

### View Admin Panel

- `user.role === 'admin'` → Allowed
- `user.role === 'superadmin'` → Allowed
- `user.role === 'user'` → Blocked (shows "Admin Access Required")

### Role Change

- Superadmin: Can change to any role (user/admin/superadmin)
- Admin: Can change user ↔ admin (not superadmin)
- User: Cannot change roles

### Delete User

- Superadmin: Can delete users (except own account)
- Admin: Cannot delete users
- User: Cannot delete users

## Testing

### Test Admin Access

1. Login as `salihozcanhayli@gmail.com` (superadmin)
2. Click "Admin" button in navbar (purple badge)
3. See admin panel with stats and user list

### Test Role Change

1. Select user from list
2. Click role button (User/Admin/Super)
3. Confirm success alert
4. Verify role badge changed

### Test Delete User

1. Select non-admin user
2. Click delete button (trash icon)
3. Confirm deletion popup
4. Verify user removed from list

### Test Sync TEFAS

1. Click "Sync TEFAS Data" button
2. See "Syncing..." loading state
3. Wait ~5 minutes
4. Verify success alert with stats
5. Check funds count updated

## Troubleshooting

### Admin Button Not Visible

**Issue:** User role is 'user' (not admin/superadmin)

**Solution:**
```sql
UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
```

### Role Change Failed

**Issue:** "Failed: Admin access required"

**Solution:** Check user.role in JWT token

### Delete Button Disabled

**Issue:** Trying to delete own account

**Solution:** Cannot delete yourself (self-protection)

### Sync Button Hangs

**Issue:** Sync takes >5 minutes

**Solution:** Backend timeout is 300s, wait or retry

## Future Features

1. **Audit Log:** Track all admin actions with timestamps
2. **Bulk Actions:** Select multiple users for batch operations
3. **Search Users:** Filter users by email/name
4. **Export Users:** Download user list as CSV
5. **User Details:** Click user for detailed profile view
6. **Activity Monitor:** Real-time user activity tracking

## Documentation

- Backend: `docs/ADMIN_SYSTEM.md`
- Frontend: `src/components/AdminPanel.tsx`
- Navbar: `src/components/Navbar.tsx`
- Routes: `src/App.tsx` (view: 'admin')

## Security

- All admin endpoints require JWT token
- Role validation on every request
- Self-deletion prevention
- Frontend role checks before rendering
- Backend middleware for all admin actions