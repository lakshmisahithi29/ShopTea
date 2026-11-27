import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { User, Shop } from '../types';
import {
  getSessionUser,
  loginUser,
  registerUser,
  logoutUser,
  LoginPayload,
  RegisterPayload,
  AuthResponse,
} from '../api/auth';
import {
  setupShop as apiSetupShop,
  updateShop as apiUpdateShop,
  SetupShopPayload,
  UpdateShopPayload,
} from '../api/shop';

interface AuthContextType {
  user: User | null;
  shop: Shop | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<AuthResponse>;
  register: (payload: RegisterPayload) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  createShop: (payload: SetupShopPayload) => Promise<AuthResponse>;
  updateShop: (payload: UpdateShopPayload) => Promise<Shop>;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async () => {
    try {
      setIsLoading(true);

      const res = await getSessionUser();

      if (res.success && res.user) {
        setUser(res.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (
    payload: LoginPayload
  ): Promise<AuthResponse> => {
    const res = await loginUser(payload);

    if (res.success && res.user) {
      setUser(res.user);
    }

    return res;
  };

  const register = async (
    payload: RegisterPayload
  ): Promise<AuthResponse> => {
    return await registerUser(payload);
  };

  const logout = async (): Promise<void> => {
    try {
      await logoutUser();
    } finally {
      setUser(null);
    }
  };

  const createShop = async (
    payload: SetupShopPayload
  ): Promise<AuthResponse> => {
    const res = await apiSetupShop(payload);

    if (res.success && res.user) {
      setUser(res.user);
    }

    return res;
  };

  const updateShop = async (payload: UpdateShopPayload): Promise<Shop> => {
    const res = await apiUpdateShop(payload);
    if (res.user) {
      setUser(res.user);
    }
    return res.shop;
  };

  const shop = user?.shop || null;
  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        shop,
        isAuthenticated,
        isLoading,
        login,
        register,
        logout,
        createShop,
        updateShop,
        refreshUser,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}