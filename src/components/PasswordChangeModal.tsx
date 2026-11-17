// ログイン中ユーザー自身のマイアカウント設定モーダル（アバター色・表示名・パスワード変更）
"use client";

import React, { useState, useEffect } from "react";
import { X, KeyRound, Check, AlertCircle, Eye, EyeOff, Shield, Crown, Palette, User as UserIcon, LogOut, Calendar, Smartphone, QrCode, ShieldCheck, Copy } from "lucide-react";
import { User, WeekStartDay, getUserRoleType } from "@/types";
import { getUserInitials } from "./UserManageModal";
import { AVATAR_COLORS, AVATAR_COLOR_VALUES } from "@/lib/avatarColors";
import AvatarColorPicker from "./AvatarColorPicker";

interface PasswordChangeModalProps {
  isOpen: boolean;
  currentUser: User | null;
  onClose: () => void;
  onSuccess?: () => void;
  onLogout?: () => void;
}

export default function PasswordChangeModal({
  isOpen,
  currentUser,
  onClose,
  onSuccess,
  onLogout,
}: PasswordChangeModalProps) {
  // プロフィール（表示名・テーマ色・カレンダー設定）用State
  const [name, setName] = useState("");
  const [color, setColor] = useState(AVATAR_COLOR_VALUES[0]);
  const [weekStart, setWeekStart] = useState<WeekStartDay>("monday");
  const [showHolidays, setShowHolidays] = useState(true);

  // パスワード変更用State（変更する場合のみ入力）
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // 2要素認証（TOTP）管理用State
  const [is2faEnabled, setIs2faEnabled] = useState(Boolean(currentUser?.totp_enabled));
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [totpSetupData, setTotpSetupData] = useState<{ secret: string; uri: string; qrSvg: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [copiedTotpSecret, setCopiedTotpSecret] = useState(false);
  const [showTotpDisable, setShowTotpDisable] = useState(false);
  const [totpDisablePassword, setTotpDisablePassword] = useState("");
  const [isTotpLoading, setIsTotpLoading] = useState(false);

  // 2要素認証セットアップ情報のロード
  const handleStartTotpSetup = async () => {
    try {
      setIsTotpLoading(true);
      setErrorMsg("");
      const res = await fetch("/api/auth/2fa");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "2FA情報の生成に失敗しました");
      }
      setTotpSetupData(data);
      setShowTotpSetup(true);
      setShowTotpDisable(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "2FA設定の開始に失敗しました");
    } finally {
      setIsTotpLoading(false);
    }
  };

  // 2要素認証の有効化実行
  const handleEnableTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpSetupData || !totpCode.trim()) {
      setErrorMsg("認証アプリに表示されている6桁のコードを入力してください");
      return;
    }
    try {
      setIsTotpLoading(true);
      setErrorMsg("");
      const res = await fetch("/api/auth/2fa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: totpSetupData.secret,
          code: totpCode.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "2要素認証の有効化に失敗しました");
      }
      setIs2faEnabled(true);
      setShowTotpSetup(false);
      setTotpCode("");
      setSuccessMsg("2要素認証を有効化しました！次回ログイン時から確認コードが要求されます。");
      if (onSuccess) await onSuccess();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "有効化エラーが発生しました");
    } finally {
      setIsTotpLoading(false);
    }
  };

  // 2要素認証の解除実行
  const handleDisableTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpDisablePassword) {
      setErrorMsg("2要素認証を解除するには現在のパスワードを入力してください");
      return;
    }
    try {
      setIsTotpLoading(true);
      setErrorMsg("");
      const res = await fetch("/api/auth/2fa", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: totpDisablePassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "2要素認証の解除に失敗しました");
      }
      setIs2faEnabled(false);
      setShowTotpDisable(false);
      setTotpDisablePassword("");
      setSuccessMsg("2要素認証を解除しました。");
      if (onSuccess) await onSuccess();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "解除エラーが発生しました");
    } finally {
      setIsTotpLoading(false);
    }
  };

  // モーダルを開いたときに現在のユーザー情報で初期化
  useEffect(() => {
    if (isOpen && currentUser) {
      setName(currentUser.name || "");
      setColor(currentUser.color || AVATAR_COLOR_VALUES[0]);
      setWeekStart(currentUser.week_start || "monday");
      setShowHolidays(
        currentUser.show_holidays !== undefined
          ? Boolean(currentUser.show_holidays)
          : true
      );
      setIs2faEnabled(Boolean(currentUser.totp_enabled));
      setShowTotpSetup(false);
      setShowTotpDisable(false);
      setTotpCode("");
      setTotpDisablePassword("");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswords(false);
      setErrorMsg("");
      setSuccessMsg("");
    }
  }, [isOpen, currentUser]);

  if (!isOpen || !currentUser) return null;

  // 設定保存処理（色・名前の変更 ＆ パスワード入力時はパスワード変更）
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!name.trim()) {
      setErrorMsg("表示名（氏名）を入力してください");
      return;
    }

    // パスワード欄のいずれかが入力されている場合はパスワード変更バリデーションを実施
    const isChangingPassword =
      Boolean(currentPassword) || Boolean(newPassword.trim()) || Boolean(confirmPassword.trim());

    if (isChangingPassword) {
      if (!currentPassword) {
        setErrorMsg("パスワードを変更する場合は、現在のパスワードを入力してください");
        return;
      }
      if (!newPassword.trim()) {
        setErrorMsg("新しいパスワードを入力してください");
        return;
      }
      if (newPassword.trim().length < 4) {
        setErrorMsg("新しいパスワードは4文字以上で入力してください");
        return;
      }
      if (newPassword.trim() !== confirmPassword.trim()) {
        setErrorMsg("新しいパスワードと確認用パスワードが一致しません");
        return;
      }
      if (currentPassword === newPassword.trim()) {
        setErrorMsg("新しいパスワードには現在のパスワードと異なるものを指定してください");
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const payload: Record<string, unknown> = {
        name: name.trim(),
        color,
        weekStart,
        showHolidays,
      };
      if (isChangingPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword.trim();
      }

      const res = await fetch(`/api/users/${currentUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "設定の更新に失敗しました");
      }

      setSuccessMsg(
        isChangingPassword
          ? "プロフィール設定とパスワードを変更しました。"
          : "プロフィール設定（テーマ色・表示名・カレンダー設定）を保存しました。"
      );
      setIs2faEnabled(Boolean(currentUser.totp_enabled));
      setShowTotpSetup(false);
      setShowTotpDisable(false);
      setTotpCode("");
      setTotpDisablePassword("");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      if (onSuccess) {
        await onSuccess();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "更新中にエラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ログアウト処理（誤タップ防止の確認ダイアログ付き）
  const handleLogout = () => {
    if (!onLogout) return;
    if (window.confirm("ログアウトしてもよろしいですか？")) {
      onLogout();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* モーダルヘッダー（テーマ連動） */}
        <div className="app-header px-6 py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2">
            <UserIcon className="w-5 h-5 app-nav-indicator" />
            <h3 className="font-bold text-base">マイアカウント設定</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-white/20 transition-colors text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* フォーム本体 */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* 対象アカウント＆リアルタイムプレビュー */}
          <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div
              style={{ backgroundColor: color }}
              className="w-12 h-12 rounded-full text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-sm transition-colors"
            >
              {getUserInitials(name || currentUser.name)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-sm text-gray-900 truncate">
                  {name || currentUser.name}
                </span>
                {getUserRoleType(currentUser) === "admin" ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded-full">
                    <Crown className="w-3 h-3 text-amber-600" />
                    Admin
                  </span>
                ) : getUserRoleType(currentUser) === "pmo" ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded-full">
                    <Shield className="w-3 h-3 text-emerald-600" />
                    PMO
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-full">
                    <Shield className="w-3 h-3 text-indigo-500" />
                    一般メンバー
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 font-mono mt-0.5">
                ログインID: <strong className="text-gray-800">{currentUser.login_id}</strong>
                <span className="ml-2 text-gray-400">({currentUser.role || "メンバー"})</span>
              </div>
            </div>
          </div>

          {/* エラーメッセージ */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 完了メッセージ */}
          {successMsg && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs rounded-lg font-medium flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-indigo-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* 1. テーマ色（アバターカラー）設定 */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
              <Palette className="w-3.5 h-3.5 text-indigo-600" />
              <span>アイコンの色（テーマカラー）</span>
            </label>
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <AvatarColorPicker
                selectedColor={color}
                onChange={setColor}
                mode="inline"
                size="md"
              />
            </div>
          </div>

          {/* 2. 表示名（氏名）設定 */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              表示名（氏名） <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="表示名を入力"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* 3. カレンダー週開始曜日設定 */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>カレンダーの週開始曜日（あなたの個人設定）</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWeekStart("monday")}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                  weekStart === "monday"
                    ? "border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500"
                    : "border-gray-200 hover:bg-gray-50 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-800">月曜始まり</span>
                  {weekStart === "monday" && (
                    <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.2 rounded font-semibold">
                      選択中
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">月・火・水・木・金・土・日</div>
              </button>

              <button
                type="button"
                onClick={() => setWeekStart("sunday")}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                  weekStart === "sunday"
                    ? "border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500"
                    : "border-gray-200 hover:bg-gray-50 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-800">日曜始まり</span>
                  {weekStart === "sunday" && (
                    <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.2 rounded font-semibold">
                      選択中
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">日・月・火・水・木・金・土</div>
              </button>
            </div>

            {/* 日本の祝日表示 ON/OFF */}
            <label className="mt-2.5 flex items-center justify-between p-2.5 rounded-lg border border-gray-200 bg-gray-50/70 hover:bg-gray-100/70 transition-colors cursor-pointer select-none">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-800">日本の祝日を表示する</span>
                <span className="text-[10px] text-gray-500">（カレンダーに祝日名と赤字を反映）</span>
              </div>
              <input
                type="checkbox"
                checked={showHolidays}
                onChange={(e) => setShowHolidays(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-[#4f46e5]"
              />
            </label>
          </div>

          {/* 4. パスワード変更セクション（任意） */}
          <div className="pt-3 border-t border-gray-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                <span>パスワードの変更</span>
              </span>
              <span className="text-[11px] text-gray-400">※変更する場合のみ入力</span>
            </div>

            {/* 現在のパスワード */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                現在のパスワード
              </label>
              <input
                type={showPasswords ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="現在のパスワードを入力"
                autoComplete="current-password"
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs text-gray-900 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* 新しいパスワード */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  新しいパスワード（4文字以上）
                </label>
                <input
                  type={showPasswords ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="新しいパスワード"
                  autoComplete="new-password"
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs text-gray-900 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* 新しいパスワード（確認用） */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  新しいパスワード（確認用）
                </label>
                <input
                  type={showPasswords ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="もう一度入力"
                  autoComplete="new-password"
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs text-gray-900 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* パスワード表示切替 */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowPasswords((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 cursor-pointer select-none"
              >
                {showPasswords ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-gray-500" />
                    <span>パスワードを隠す</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-gray-500" />
                    <span>入力中のパスワードを表示する</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 5. 2要素認証（TOTP）セキュリティ設定セクション */}
          <div className="pt-3 border-t border-gray-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                <span>2要素認証（TOTP）設定</span>
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  is2faEnabled
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                    : "bg-slate-100 text-slate-500 border border-slate-200"
                }`}
              >
                {is2faEnabled ? "有効（保護中）" : "未設定"}
              </span>
            </div>

            {is2faEnabled ? (
              /* 2FA有効中の表示と解除ボタン */
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>スマートフォン認証アプリで保護されています</span>
                  </div>
                  {!showTotpDisable && (
                    <button
                      type="button"
                      onClick={() => setShowTotpDisable(true)}
                      className="text-xs text-rose-600 hover:text-rose-800 font-medium underline cursor-pointer"
                    >
                      解除する
                    </button>
                  )}
                </div>

                {showTotpDisable && (
                  <div className="pt-2 border-t border-emerald-200 space-y-2 animate-in fade-in duration-150">
                    <p className="text-[11px] text-slate-600">
                      2要素認証を解除するには現在のパスワードを入力してください:
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={totpDisablePassword}
                        onChange={(e) => setTotpDisablePassword(e.target.value)}
                        placeholder="現在のパスワード"
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                      <button
                        type="button"
                        disabled={isTotpLoading || !totpDisablePassword}
                        onClick={handleDisableTotp}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                      >
                        {isTotpLoading ? "解除中..." : "解除を実行"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowTotpDisable(false);
                          setTotpDisablePassword("");
                        }}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs cursor-pointer font-medium"
                      >
                        中止
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* 2FA未設定時の案内と設定開始UI */
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Google Authenticator 等のアプリで6桁コードを要求し、アカウントを不正アクセスから強固に守ります。
                  </p>
                  {!showTotpSetup && (
                    <button
                      type="button"
                      disabled={isTotpLoading}
                      onClick={handleStartTotpSetup}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition cursor-pointer shrink-0 shadow-xs"
                    >
                      {isTotpLoading ? "準備中..." : "2FAを設定する"}
                    </button>
                  )}
                </div>

                {showTotpSetup && totpSetupData && (
                  <div className="pt-2 border-t border-slate-200 space-y-3 animate-in fade-in duration-150">
                    <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-4 rounded-xl border border-slate-200">
                      <div
                        className="w-44 h-44 flex items-center justify-center p-2 bg-white rounded-xl border border-slate-200 shrink-0 shadow-xs"
                        dangerouslySetInnerHTML={{ __html: totpSetupData.qrSvg }}
                      />
                      <div className="text-[11px] text-slate-600 space-y-2 flex-1">
                        <p className="font-semibold text-slate-800 text-xs">
                          ① 認証アプリ（Microsoft Authenticator, Google Authenticator等）でQRコードを読み取ってください
                        </p>
                        <div>
                          <span className="text-slate-400">または手動入力用コード:</span>
                          <div className="flex items-center gap-1 font-mono text-[10px] bg-slate-100 px-2 py-1 rounded select-all mt-0.5">
                            <span className="truncate">{totpSetupData.secret}</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(totpSetupData.secret);
                                setCopiedTotpSecret(true);
                                setTimeout(() => setCopiedTotpSecret(false), 2000);
                              }}
                              className="ml-auto p-0.5 hover:text-indigo-600 cursor-pointer"
                              title="コピー"
                            >
                              {copiedTotpSecret ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700">
                        ② アプリに表示された6桁の確認コードを入力してください
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          value={totpCode}
                          onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                          placeholder="例: 123456"
                          className="w-36 text-center tracking-widest font-mono font-bold py-1.5 bg-white border border-slate-300 rounded-lg text-sm"
                        />
                        <button
                          type="button"
                          disabled={isTotpLoading || totpCode.length !== 6}
                          onClick={handleEnableTotp}
                          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow-xs"
                        >
                          {isTotpLoading ? "検証中..." : "有効化して完了"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowTotpSetup(false);
                            setTotpCode("");
                          }}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium cursor-pointer"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* フッターボタン */}
          <div className="pt-3 border-t border-gray-200 flex items-center justify-between gap-2">
            {/* ログアウトボタン（誤操作防止のため左側に分離配置） */}
            {onLogout ? (
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 text-xs font-semibold transition-colors cursor-pointer"
                title="ログアウトして別IDでログイン"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>ログアウト</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                閉じる
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg app-primary-btn text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isSubmitting ? "保存中..." : "設定を保存する"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
