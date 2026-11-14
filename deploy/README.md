# Proxmox LXC 自動起動セットアップガイド

Proxmox VE の LXC コンテナ起動時に、本アプリケーション（Personal Backlog）をポート 3000 で自動リッスン・起動させるための手順です。

---

## 構成ファイル

- **`setup.sh`**: 自動で systemd サービスを登録・有効化するスクリプト
- **`personal-backlog.service`**: Node.js 直接実行用の systemd サービス定義ファイル
- **`personal-backlog-docker.service`**: Docker Compose を利用する場合の systemd サービス定義ファイル

---

## 手順 1: コンテナ内での自動起動設定

コンテナ内のターミナルで以下のコマンドを実行します。

```bash
# プロジェクトディレクトリへ移動
cd /path/to/personal-backlog

# セットアップスクリプトを root 権限で実行
sudo bash deploy/setup.sh
```

このスクリプトにより以下が自動実行されます：
1. Next.js アプリケーションのビルド（未ビルドの場合）
2. 現在のディレクトリパスに応じた `/etc/systemd/system/personal-backlog.service` の配置
3. `systemctl daemon-reload`
4. `systemctl enable --now personal-backlog.service`（自動起動の有効化および起動）

### 動作確認コマンド

```bash
# サービスの状態確認
sudo systemctl status personal-backlog.service

# 3000番ポートが LISTEN しているか確認
ss -tulpn | grep 3000

# リアルタイムログ確認
sudo journalctl -u personal-backlog.service -f
```

---

## 手順 2: Proxmox VE 起動時にコンテナ自体を自動起動する設定

物理サーバー再起動時にもコンテナが自動で立ち上がるよう、Proxmox Web GUI で設定します。

1. Proxmox VE の Web GUI にログイン
2. 左ツリーから該当の **LXCコンテナ** を選択
3. **「オプション（Options）」** > **「起動時に開始（Start at boot）」** をダブルクリック
4. チェックを入れて **「OK」** をクリック

*(Proxmoxホスト側のCLIで設定する場合)*:
```bash
pct set <コンテナID> -onboot 1
```

---

## サービスの停止・再起動

```bash
# 停止
sudo systemctl stop personal-backlog.service

# 再起動（コード更新後など）
sudo systemctl restart personal-backlog.service

# 自動起動の解除
sudo systemctl disable personal-backlog.service
```
