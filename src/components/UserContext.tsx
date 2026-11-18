// アプリ全体のメンバー一覧およびWebログイン認証・セッション管理コンテキスト
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { User, SystemSettings, ThemeId, WeekStartDay } from "@/types";
import { DEFAULT_SYSTEM_SETTINGS } from "@/lib/dateUtils";
import UserManageModal from "./UserManageModal";
import PasswordChangeModal from "./PasswordChangeModal";

interface LoginResult {
  ok: boolean;
  error?: string;
  requires2fa?: boolean;
  tempToken?: string;
}

interface UserContextValue {
  users: User[];
  currentUser: User | null;
  isAuthReady: boolean;
  login: (loginId: string, password: string) => Promise<LoginResult>;
  verify2fa: (tempToken: string, code: string) => Promise<LoginResult>;
  setupAdmin: (name: string, loginId: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  setCurrentUser: (user: User) => void;
  setCurrentUserById: (id: number) => void;
  refreshUsers: () => Promise<void>;
  openUserManageModal: (initialUserId?: number) => void;
  openPasswordChangeModal: () => void;
  updateUserWeekStart: (userId: number, weekStart: WeekStartDay) => Promise<boolean>;
  effectiveWeekStart: WeekStartDay;
  updateUserShowHolidays: (userId: number, showHolidays: boolean) => Promise<boolean>;
  effectiveShowHolidays: boolean;
  settings: SystemSettings;
  refreshSettings: () => Promise<void>;
  updateSettings: (next: Partial<SystemSettings>) => Promise<SystemSettings>;
  previewTheme: ThemeId | null;
  setPreviewTheme: (theme: ThemeId | null) => void;
  currentTheme: ThemeId;
}

const UserContext = createContext<UserContextValue>({
  users: [],
  currentUser: null,
  isAuthReady: false,
  login: async () => ({ ok: false }),
  verify2fa: async () => ({ ok: false }),
  setupAdmin: async () => ({ ok: false }),
  logout: async () => {},
  setCurrentUser: () => {},
  setCurrentUserById: () => {},
  refreshUsers: async () => {},
  openUserManageModal: () => {},
  openPasswordChangeModal: () => {},
  updateUserWeekStart: async () => false,
  effectiveWeekStart: "monday",
  updateUserShowHolidays: async () => false,
  effectiveShowHolidays: true,
  settings: DEFAULT_SYSTEM_SETTINGS,
  refreshSettings: async () => {},
  updateSettings: async () => DEFAULT_SYSTEM_SETTINGS,
  previewTheme: null,
  setPreviewTheme: () => {},
  currentTheme: "cosmic",
});

const STORAGE_KEY = "litelog_current_user_id";
const THEME_STORAGE_KEY = "litelog_theme";

export function UserProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [initialEditUserId, setInitialEditUserId] = useState<number | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SYSTEM_SETTINGS);
  const [previewTheme, setPreviewTheme] = useState<ThemeId | null>(null);

  // ローカルストレージにキャッシュされた前回のテーマ（初回0ミリ秒適用用）
  const [storedTheme, setStoredTheme] = useState<ThemeId | null>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem("backlog_theme");
      if (saved) return saved as ThemeId;
    }
    return null;
  });

  // 現在有効なテーマ（プレビュー指定があればそれを最優先、なければ保存済みテーマ）
  const currentTheme: ThemeId = previewTheme || settings.theme || storedTheme || "cosmic";

  // HTMLのroot要素にテーマ用データ属性を反映
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", currentTheme);
      // プレビュー以外の正規テーマをローカルストレージへ即時同期
      if (!previewTheme && currentTheme) {
        try {
          localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
        } catch {
          // ignore
        }
      }
    }
  }, [currentTheme, previewTheme]);

  const refreshSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data: SystemSettings = await res.json();
        // localStorage にユーザー個別の週開始曜日設定がある場合は尊重
        let localWeekStart: WeekStartDay | undefined = undefined;
        if (typeof window !== "undefined") {
          const stored = localStorage.getItem("litelog_week_start") || localStorage.getItem("backlog_week_start");
          if (stored === "monday" || stored === "sunday") {
            localWeekStart = stored;
          }
          if (data.theme) {
            localStorage.setItem(THEME_STORAGE_KEY, data.theme);
            setStoredTheme(data.theme);
          }
        }
        setSettings({
          ...DEFAULT_SYSTEM_SETTINGS,
          ...data,
          ...(localWeekStart ? { weekStart: localWeekStart } : {}),
        });
      }
    } catch (err) {
      console.error("システム設定の取得エラー:", err);
    }
  }, []);

  const updateSettings = useCallback(
    async (next: Partial<SystemSettings>): Promise<SystemSettings> => {
      // 週開始曜日はlocalStorageにも保存して即時反映を保証
      if (typeof window !== "undefined") {
        if (next.weekStart) {
          try {
            localStorage.setItem("litelog_week_start", next.weekStart);
          } catch {
            // ignore
          }
        }
        if (next.theme) {
          try {
            localStorage.setItem(THEME_STORAGE_KEY, next.theme);
            setStoredTheme(next.theme);
          } catch {
            // ignore
          }
        }
      }
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
      // 一般ユーザー等でAPI更新が許可されていない場合でもローカルステートは更新
      const fallback = { ...settings, ...next };
      setSettings(fallback);
      return fallback;
    },
    [settings]
  );

  // メンバー一覧とログインセッションの同期
  const refreshUsers = useCallback(async () => {
    try {
      const [usersRes, authRes] = await Promise.all([
        fetch("/api/users", { cache: "no-store" }),
        fetch("/api/auth", { cache: "no-store" }),
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

      // サーバー側の署名付きセッションCookieが存在しない・無効な場合は未ログイン状態とする
      setCurrentUserId(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
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

  // 未ログイン状態で /login および /invite 以外のページにアクセスした場合は /login へ誘導
  useEffect(() => {
    if (!isAuthReady) return;
    if (!currentUserId && pathname !== "/login" && !pathname.startsWith("/invite")) {
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

        // 2要素認証コード入力が必要な場合
        if (data.requires2fa && data.tempToken) {
          return {
            ok: true,
            requires2fa: true,
            tempToken: data.tempToken,
          };
        }

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

  // 2要素認証コードの検証とログイン完了
  const verify2fa = useCallback(
    async (tempToken: string, code: string): Promise<LoginResult> => {
      try {
        const res = await fetch("/api/auth/2fa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tempToken, code }),
        });

        const data = await res.json();
        if (!res.ok || !data.authenticated) {
          return { ok: false, error: data.error || "2要素認証コードが正しくありません" };
        }

        setCurrentUserId(data.user.id);
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY, String(data.user.id));
        }
        await refreshUsers();
        return { ok: true };
      } catch {
        return { ok: false, error: "2要素認証通信に失敗しました" };
      }
    },
    [refreshUsers]
  );

  // 初回セットアップ用管理者アカウント作成
  const setupAdmin = useCallback(
    async (name: string, loginId: string, password: string): Promise<LoginResult> => {
      try {
        const res = await fetch("/api/auth/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, loginId, password }),
        });

        const data = await res.json();
        if (!res.ok || !data.authenticated) {
          return { ok: false, error: data.error || "管理者アカウントの作成に失敗しました" };
        }

        setCurrentUserId(data.user.id);
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY, String(data.user.id));
        }
        await refreshUsers();
        return { ok: true };
      } catch {
        return { ok: false, error: "管理者アカウント作成通信に失敗しました" };
      }
    },
    [refreshUsers]
  );

  // ログアウト（セッション破棄 ＆ ログイン画面へ遷移）
  const logout = useCallback(async () => {
    setCurrentUserId(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
    setIsManageOpen(false);
    setIsPasswordModalOpen(false);
    try {
      await fetch("/api/auth", { method: "DELETE", cache: "no-store" });
    } catch (err) {
      console.error("ログアウトエラー:", err);
    }
    router.replace("/login");
  }, [router]);

  const setCurrentUserById = useCallback((id: number) => {
    setCurrentUserId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(id));
    }
  }, []);

  const setCurrentUser = useCallback((user: User) => {
    setCurrentUserId(user.id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(user.id));
    }
    setUsers((prev) => {
      const exists = prev.some((u) => u.id === user.id);
      if (exists) {
        return prev.map((u) => (u.id === user.id ? user : u));
      }
      return [...prev, user];
    });
  }, []);

  const currentUser = users.find((u) => u.id === currentUserId) || null;

  // 有効なカレンダー週開始曜日（ログイン中ユーザーの個人設定 > システム設定 > デフォルト）
  const effectiveWeekStart: WeekStartDay =
    currentUser?.week_start || settings.weekStart || "monday";

  // 個別ユーザーのカレンダー週開始設定を更新
  const updateUserWeekStart = useCallback(
    async (userId: number, nextWeekStart: WeekStartDay): Promise<boolean> => {
      try {
        const res = await fetch(`/api/users/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekStart: nextWeekStart }),
        });
        if (res.ok) {
          const updatedUser: User = await res.json();
          setUsers((prev) =>
            prev.map((u) =>
              u.id === userId
                ? { ...u, week_start: updatedUser.week_start || nextWeekStart }
                : u
            )
          );
          if (currentUserId === userId && typeof window !== "undefined") {
            try {
              localStorage.setItem("litelog_week_start", nextWeekStart);
            } catch {
              // ignore
            }
          }
          return true;
        }
      } catch (err) {
        console.error("ユーザー週開始設定の更新エラー:", err);
      }
      return false;
    },
    [currentUserId]
  );

  // 有効な日本の祝日表示フラグ（個人設定 > システム設定 > デフォルトtrue）
  const effectiveShowHolidays: boolean =
    currentUser?.show_holidays !== undefined
      ? Boolean(currentUser.show_holidays)
      : (settings.showHolidays ?? true);

  // 個別ユーザーの祝日表示設定を更新
  const updateUserShowHolidays = useCallback(
    async (userId: number, nextShowHolidays: boolean): Promise<boolean> => {
      try {
        const res = await fetch(`/api/users/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ showHolidays: nextShowHolidays }),
        });
        if (res.ok) {
          const updatedUser: User = await res.json();
          setUsers((prev) =>
            prev.map((u) =>
              u.id === userId
                ? { ...u, show_holidays: updatedUser.show_holidays !== undefined ? updatedUser.show_holidays : nextShowHolidays }
                : u
            )
          );
          return true;
        }
      } catch (err) {
        console.error("ユーザー祝日表示設定の更新エラー:", err);
      }
      return false;
    },
    []
  );

  return (
    <UserContext.Provider
      value={{
        users,
        currentUser,
        isAuthReady,
        login,
        verify2fa,
        setupAdmin,
        logout,
        setCurrentUser,
        setCurrentUserById,
        refreshUsers,
        openUserManageModal: (initialUserId?: number) => {
          setInitialEditUserId(typeof initialUserId === "number" ? initialUserId : null);
          setIsManageOpen(true);
        },
        openPasswordChangeModal: () => setIsPasswordModalOpen(true),
        updateUserWeekStart,
        effectiveWeekStart,
        updateUserShowHolidays,
        effectiveShowHolidays,
        settings,
        refreshSettings,
        updateSettings,
        previewTheme,
        setPreviewTheme,
        currentTheme,
      }}
    >
      {children}
      <UserManageModal
        isOpen={isManageOpen}
        initialUserId={initialEditUserId}
        users={users}
        currentUser={currentUser}
        onSelectCurrentUser={(id) => setCurrentUserById(id)}
        onClose={() => {
          setIsManageOpen(false);
          setInitialEditUserId(null);
        }}
        onUpdated={refreshUsers}
        onOpenPasswordChange={() => setIsPasswordModalOpen(true)}
      />
      <PasswordChangeModal
        isOpen={isPasswordModalOpen}
        currentUser={currentUser}
        onClose={() => setIsPasswordModalOpen(false)}
        onSuccess={refreshUsers}
        onLogout={async () => {
          // マイアカウントモーダルを閉じてからログアウト処理を実行
          setIsPasswordModalOpen(false);
          await logout();
        }}
      />
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
