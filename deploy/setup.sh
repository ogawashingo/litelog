#!/bin/bash
# ==============================================================================
# Personal Backlog - Proxmox LXC コンテナ自動起動セットアップスクリプト
# ==============================================================================
set -e

# スクリプト自身のディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVICE_NAME="personal-backlog.service"
TARGET_SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"

echo "=== Personal Backlog 自動起動セットアップ開始 ==="

# root権限チェック
if [ "$(id -u)" -ne 0 ]; then
    echo "エラー: このスクリプトは root 権限（または sudo）で実行してください。"
    exit 1
fi

echo "プロジェクトディレクトリ: ${PROJECT_DIR}"

# 1. 依存関係のインストールとビルド（必要に応じて）
if [ ! -d "${PROJECT_DIR}/.next" ]; then
    echo "Next.js のビルド成果物が見つかりません。ビルドを実行します..."
    cd "${PROJECT_DIR}"
    npm run build
fi

# 2. サービス定義ファイルの生成（パスを現在の配置場所に自動調整）
echo "systemd サービスファイルを生成・配置中: ${TARGET_SERVICE_PATH}"
sed -e "s|/opt/personal-backlog|${PROJECT_DIR}|g" \
    "${SCRIPT_DIR}/${SERVICE_NAME}" > "${TARGET_SERVICE_PATH}"

# 3. systemd設定の再読み込み
echo "systemd 設定を再読み込み中..."
systemctl daemon-reload

# 4. 自動起動の有効化と即時起動
echo "サービスを有効化し、起動します..."
systemctl enable --now "${SERVICE_NAME}"

# 5. 稼働状態の確認
echo "=== セットアップ完了 ==="
echo "サービスの稼働状態を確認しています..."
systemctl status "${SERVICE_NAME}" --no-pager || true

echo ""
echo "ポート3000の LISTEN 状況:"
if command -v ss >/dev/null 2>&1; then
    ss -tulpn | grep 3000 || echo "※ ポート3000の起動を待機中..."
elif command -v lsof >/dev/null 2>&1; then
    lsof -i :3000 || echo "※ ポート3000の起動を待機中..."
fi

echo ""
echo "設定が完了しました！次回コンテナ起動時も自動的にポート3000でリッスンします。"
