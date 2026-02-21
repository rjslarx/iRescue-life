import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { User } from '@shared/schema';

// Extend User type to include activeRole
type FrontendUser = User & {
  activeRole: string;
};

interface AuthContextType {
  user: FrontendUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, selectedRole?: string) => Promise<{ success: boolean; error?: string; requiresMfa?: boolean; userId?: string; user?: FrontendUser }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  switchRole: (role: string) => Promise<{ success: boolean; error?: string }>;
  completeMfaLogin: (user: FrontendUser) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TENANT_STORAGE_KEY = 'rescue_portal_tenant';

function getTenantHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const tenantId = localStorage.getItem(TENANT_STORAGE_KEY);
  // For custom domains, don't send x-tenant-id - backend resolves from hostname
  if (tenantId === 'custom-domain') {
    return {};
  }
  return tenantId ? { 'x-tenant-id': tenantId } : {};
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FrontendUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const tenantHeaders = getTenantHeaders();
      const response = await fetch('/api/me', {
        credentials: 'include',
        headers: tenantHeaders,
      });
      
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string, selectedRole?: string): Promise<{ success: boolean; error?: string; requiresMfa?: boolean; userId?: string; user?: FrontendUser }> => {
    try {
      const tenantHeaders = getTenantHeaders();
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...tenantHeaders,
        },
        credentials: 'include',
        body: JSON.stringify({ email, password, selectedRole }),
      });

      const data = await response.json();

      if (response.ok) {
        // Check if MFA is required
        if (data.requiresMfa) {
          return { 
            success: true, 
            requiresMfa: true, 
            userId: data.userId 
          };
        }
        
        // Normal login (no MFA)
        if (data.user) {
          setUser(data.user);
          // Wait for auth state to fully propagate by re-checking from server
          await checkAuth();
          return { success: true, user: data.user };
        }
      }
      
      return { success: false, error: data.error || data.message || 'Login failed' };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'An error occurred during login' };
    }
  };

  const completeMfaLogin = async (user: FrontendUser) => {
    setUser(user);
    // Wait for auth state to fully propagate by re-checking from server
    await checkAuth();
  };

  const switchRole = async (role: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const tenantHeaders = getTenantHeaders();
      const response = await fetch('/api/switch-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...tenantHeaders,
        },
        credentials: 'include',
        body: JSON.stringify({ role }),
      });

      const data = await response.json();

      if (response.ok && data.user) {
        setUser(data.user);
        queryClient.invalidateQueries(); // Refresh all data after role switch
        return { success: true };
      } else {
        return { success: false, error: data.error || data.message || 'Failed to switch role' };
      }
    } catch (error) {
      console.error('Switch role error:', error);
      return { success: false, error: 'An error occurred while switching roles' };
    }
  };

  const logout = async () => {
    try {
      await apiRequest('POST', '/api/logout');
      setUser(null);
      queryClient.clear();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        checkAuth,
        switchRole,
        completeMfaLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
