// アプリ全体のメンバー一覧およびWebログイン認証・セッション管理コンテキスト
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { User, SystemSettings } from "@/types";
import { DEFAULT_SYSTEM_SETTINGS } from "@/lib/dateUtils";
import UserManageModal from "./UserManageModal";

interface LoginResult {
  ok: boolean;
  error?: string;
}

interface UserContextValue {
  users: User[];
  currentUser: User | null;
  isAuthReady: boolean;
  login: (loginId: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  setCurrentUserById: (id: number) => void;
  refreshUsers: () => Promise<void>;
  openUserManageModal: () => void;
  settings: SystemSettings;
  refreshSettings: () => Promise<void>;
  updateSettings: (next: Partial<SystemSettings>) => Promise<SystemSettings>;
}

const UserContext = createContext<UserContextValue>({
  users: [],
  currentUser: null,
  isAuthReady: false,
  login: async () => ({ ok: false }),
  logout: async () => {},
  setCurrentUserById: () => {},
  refreshUsers: async () => {},
  openUserManageModal: () => {},
  settings: DEFAULT_SYSTEM_SETTINGS,
  refreshSettings: async () => {},
  updateSettings: async () => DEFAULT_SYSTEM_SETTINGS,
});

const STORAGE_KEY = "backlog_current_user_id";

export function UserProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SYSTEM_SETTINGS);

  const refreshSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data: SystemSettings = await res.json();
        setSettings({ ...DEFAULT_SYSTEM_SETTINGS, ...data });
      }
    } catch (err) {
      console.error("システム設定の取得エラー:", err);
    }
  }, []);

  const updateSettings = useCallback(
    async (next: Partial<SystemSettings>): Promise<SystemSettings> => {
      try {
        const res = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (res.ok) {
          const updated: SystemSettings = await res.json();
          const merged = { ...DEFAULT_SYSTEM_SETTINGS, ...updated };
          setSettings(merged);
          return merged;
        }
      } catch (err) {
        console.error("システム設定の更新エラー:", err);
      }
      return settings;
    },
    [settings]
  );

  // メンバー一覧とログインセッションの同期
  const refreshUsers = useCallback(async () => {
    try {
      const [usersRes, authRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/auth"),
      ]);

      let usersData: User[] = [];
      if (usersRes.ok) {
        usersData = await usersRes.json();
        setUsers(usersData);
      }

      if (authRes.ok) {
        const authData = await authRes.json();
        if (authData.authenticated && authData.user) {
          setCurrentUserId(authData.user.id);
          if (typeof window !== "undefined") {
            localStorage.setItem(STORAGE_KEY, String(authData.user.id));
          }
          setIsAuthReady(true);
          return;
        }
      }

      // セッションCookieがない場合、localStorageの保存IDを確認
      const savedIdStr = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      const savedId = savedIdStr ? Number(savedIdStr) : null;
      if (savedId && usersData.some((u) => u.id === savedId)) {
        setCurrentUserId(savedId);
      } else {
        setCurrentUserId(null);
      }
    } catch (err) {
      console.error("メンバー・認証情報の取得エラー:", err);
    } finally {
      setIsAuthReady(true);
    }
  }, []);

  useEffect(() => {
    refreshUsers();
    refreshSettings();
  }, [refreshUsers, refreshSettings]);

  // 未ログイン状態で /login 以外のページにアクセスした場合は /login へ誘導
  useEffect(() => {
    if (!isAuthReady) return;
    if (!currentUserId && pathname !== "/login") {
      router.replace("/login");
    }
  }, [isAuthReady, currentUserId, pathname, router]);

  // ID・パスワードによるWebログイン
  const login = useCallback(
    async (loginId: string, password: string): Promise<LoginResult> => {
      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ loginId, password }),
        });

        const data = await res.json();
        if (!res.ok || !data.authenticated) {
          return { ok: false, error: data.error || "ログインに失敗しました" };
        }

        setCurrentUserId(data.user.id);
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY, String(data.user.id));
        }
        await refreshUsers();
        return { ok: true };
      } catch {
        return { ok: false, error: "ログイン通信に失敗しました" };
      }
    },
    [refreshUsers]
  );

  // ログアウト（セッション破棄 ＆ ログイン画面へ遷移）
  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth", { method: "DELETE" });
    } catch (err) {
      console.error("ログアウトエラー:", err);
    }
    setCurrentUserId(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
    setIsManageOpen(false);
    router.push("/login");
  }, [router]);

  const setCurrentUserById = useCallback((id: number) => {
    setCurrentUserId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(id));
    }
  }, []);

  const currentUser = users.find((u) => u.id === currentUserId) || null;

  return (
    <UserContext.Provider
      value={{
        users,
        currentUser,
        isAuthReady,
        login,
        logout,
        setCurrentUserById,
        refreshUsers,
        openUserManageModal: () => setIsManageOpen(true),
        settings,
        refreshSettings,
        updateSettings,
      }}
    >
      {children}
      <UserManageModal
        isOpen={isManageOpen}
        users={users}
        currentUser={currentUser}
        onSelectCurrentUser={(id) => setCurrentUserById(id)}
        onClose={() => setIsManageOpen(false)}
        onUpdated={refreshUsers}
      />
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
