import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { motion } from 'motion/react';
import { 
  Shield, 
  Users, 
  Trash2, 
  TrendingUp,
  Wallet,
  Activity,
  RefreshCw,
  CheckCircle,
  XCircle,
  User as UserIcon
} from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  createdAt: string | null;
}

interface AdminStats {
  users: number;
  portfolios: number;
  assets: number;
  funds: number;
}

export function AdminPanel({ user }: { user: any }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (user && (user.role === 'admin' || user.role === 'superadmin')) {
      fetchUsers();
      fetchStats();
    }
  }, [user]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        console.error('[ADMIN] No auth token found');
        alert('Please login first');
        return;
      }
      
      console.log('[ADMIN] Fetching users with token:', token.substring(0, 20) + '...');
      
      const response = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('[ADMIN] Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[ADMIN] Users fetched:', data.length, data);
        setUsers(data);
      } else {
        const error = await response.json();
        console.error('[ADMIN] Failed to fetch users:', error);
        alert(`Failed to fetch users: ${error.error}`);
      }
    } catch (error) {
      console.error('[ADMIN] Failed to fetch users:', error);
      alert('Failed to fetch users');
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/admin/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setStats(data);
        setLoading(false);
      }
    } catch (error) {
      console.error('[ADMIN] Failed to fetch stats:', error);
      setLoading(false);
    }
  };

  const changeRole = async (userId: string, newRole: string) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: newRole })
      });
      
      if (response.ok) {
        await fetchUsers();
        alert(`✅ Role updated to ${newRole}`);
      } else {
        const error = await response.json();
        alert(`❌ Failed: ${error.error}`);
      }
    } catch (error) {
      alert('❌ Failed to update role');
    }
  };

  const deleteUser = async (userId: string, email: string) => {
    if (!window.confirm(`Delete user ${email}? This cannot be undone.`)) return;
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        await fetchUsers();
        await fetchStats();
        alert(`✅ User deleted`);
      } else {
        const error = await response.json();
        alert(`❌ Failed: ${error.error}`);
      }
    } catch (error) {
      alert('❌ Failed to delete user');
    }
  };

  const syncTefas = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/tefas/scrape');
      const data = await response.json();
      
      if (data.success) {
        await fetchStats();
        alert(`✅ Synced ${data.saved} funds in ${data.duration}s`);
      } else {
        alert(`❌ Sync failed: ${data.error}`);
      }
    } catch (error) {
      alert('❌ Sync failed');
    }
    setSyncing(false);
  };

  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
    return (
      <div className="text-center py-20">
        <Shield className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Admin Access Required</h2>
        <p className="text-slate-500">You need admin privileges to view this page.</p>
      </div>
    );
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'superadmin':
        return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100">Superadmin</Badge>;
      case 'admin':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">Admin</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100">User</Badge>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
              <Shield className="w-8 h-8 text-indigo-600" />
              Admin Panel
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Manage users, roles, and system settings
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100">
              {user.role === 'superadmin' ? 'Superadmin' : 'Admin'}
            </Badge>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.users}</p>
                    <p className="text-xs text-slate-500">Users</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Wallet className="w-5 h-5 text-emerald-600" />
                  <div>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.portfolios}</p>
                    <p className="text-xs text-slate-500">Portfolios</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-indigo-600" />
                  <div>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.assets}</p>
                    <p className="text-xs text-slate-500">Assets</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-rose-600" />
                  <div>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.funds}</p>
                    <p className="text-xs text-slate-500">TEFAS Funds</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Actions */}
        {user.role === 'superadmin' && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-indigo-600" />
                Superadmin Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button 
                  onClick={syncTefas}
                  disabled={syncing}
                  className="flex items-center gap-2"
                >
                  {syncing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Sync TEFAS Data
                    </>
                  )}
                </Button>
                
                <Button 
                  variant="secondary"
                  onClick={fetchUsers}
                  className="flex items-center gap-2"
                >
                  <Users className="w-4 h-4" />
                  Refresh Users
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Users List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              User Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-10">
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
                <p className="text-slate-500 mt-2">Loading...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {users.map((u) => (
                  <div 
                    key={u.id}
                    className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
                        <UserIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {u.displayName || u.email}
                        </p>
                        <p className="text-sm text-slate-500">{u.email}</p>
                      </div>
                      {getRoleBadge(u.role)}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {/* Role Change */}
                      {user.role === 'superadmin' && u.id !== user.id && (
                        <div className="flex gap-1">
                          <Button 
                            size="sm"
                            variant="outline"
                            onClick={() => changeRole(u.id, 'user')}
                            disabled={u.role === 'user'}
                          >
                            User
                          </Button>
                          <Button 
                            size="sm"
                            variant="outline"
                            onClick={() => changeRole(u.id, 'admin')}
                            disabled={u.role === 'admin'}
                          >
                            Admin
                          </Button>
                          <Button 
                            size="sm"
                            variant="outline"
                            onClick={() => changeRole(u.id, 'superadmin')}
                            disabled={u.role === 'superadmin'}
                          >
                            Super
                          </Button>
                        </div>
                      )}
                      
                      {/* Admin can change user ↔ admin (not superadmin) */}
                      {user.role === 'admin' && u.id !== user.id && u.role !== 'superadmin' && (
                        <div className="flex gap-1">
                          <Button 
                            size="sm"
                            variant="outline"
                            onClick={() => changeRole(u.id, 'user')}
                            disabled={u.role === 'user'}
                          >
                            User
                          </Button>
                          <Button 
                            size="sm"
                            variant="outline"
                            onClick={() => changeRole(u.id, 'admin')}
                            disabled={u.role === 'admin'}
                          >
                            Admin
                          </Button>
                        </div>
                      )}
                      
                      {/* Delete (Superadmin only) */}
                      {user.role === 'superadmin' && u.id !== user.id && (
                        <Button 
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteUser(u.id, u.email)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                      
                      {/* Show message for admin trying to manage superadmin */}
                      {user.role === 'admin' && u.role === 'superadmin' && (
                        <Badge className="bg-purple-100 text-purple-800 text-xs">
                          Cannot modify superadmin
                        </Badge>
                      )}
                      
                      {u.id === user.id && (
                        <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100">
                          You
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
                
                {users.length === 0 && (
                  <div className="text-center py-10">
                    <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">No users found</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Role Permissions Info */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-600" />
              Role Permissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Badge className="bg-purple-100 text-purple-800">Superadmin</Badge>
                <div className="flex-1">
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    Full system access: manage all roles, delete users, sync data, view all portfolios
                  </p>
                </div>
              </div>
              
              <Separator />
              
              <div className="flex items-start gap-3">
                <Badge className="bg-blue-100 text-blue-800">Admin</Badge>
                <div className="flex-1">
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    Manage users (user ↔ admin), view stats, sync TEFAS, read all data
                  </p>
                </div>
              </div>
              
              <Separator />
              
              <div className="flex items-start gap-3">
                <Badge className="bg-slate-100 text-slate-800">User</Badge>
                <div className="flex-1">
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    Standard access: own portfolios, own assets, personal settings
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}