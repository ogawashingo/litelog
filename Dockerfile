# ==========================================
# ステージ1: 依存パッケージのインストール
# ==========================================
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# パッケージ定義ファイルをコピー
COPY package.json package-lock.json ./
# 本番およびビルドに必要な依存関係をインストール
RUN npm ci

# ==========================================
# ステージ2: アプリケーションのビルド
# ==========================================
FROM node:22-alpine AS builder
WORKDIR /app

# 依存パッケージをコピー
COPY --from=deps /app/node_modules ./node_modules
# ソースコードをコピー
COPY . .

# Next.js のテレメトリを無効化
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# ビルドを実行（standalone 出力）
RUN npm run build

# ==========================================
# ステージ3: 本番実行用ランナー
# ==========================================
FROM node:22-alpine AS runner
WORKDIR /app

# 本番環境フラグとテレメトリ無効化
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# データベースファイルの保存先ディレクトリ設定
ENV BACKLOG_DB_PATH=/app/data/backlog.db

# セキュリティのため非 root ユーザーを作成
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 公開静的ファイルと standalone 出力結果をコピー
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# データ永続化ディレクトリを作成し権限を付与
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# 実行ユーザーの切り替え
USER nextjs

# アプリケーションポートの公開
EXPOSE 3000

# サーバー起動
CMD ["node", "server.js"]
