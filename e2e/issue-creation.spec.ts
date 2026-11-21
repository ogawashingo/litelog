// コア機能の最小E2Eテスト: ログインおよび課題追加モーダルの入力保持・起票テスト
import { test, expect } from "@playwright/test";

// テスト用認証情報（.env.local などの環境変数から取得し、平文ハードコードを排除）
const TEST_LOGIN_ID = process.env.E2E_LOGIN_ID || "";
const TEST_PASSWORD = process.env.E2E_PASSWORD || "";

test.describe("基本機能 E2E テスト", () => {
  // 各テスト前にログインを実行
  test.beforeEach(async ({ page }) => {
    if (!TEST_LOGIN_ID || !TEST_PASSWORD) {
      throw new Error(
        "E2Eテスト用の認証情報が未設定です。環境変数 E2E_LOGIN_ID および E2E_PASSWORD（.env.local など）を設定してください。"
      );
    }

    // ログイン画面へアクセス
    await page.goto("/login");

    // 既にログイン済みの場合はダッシュボードへリダイレクトされる
    if (!page.url().includes("/login")) {
      return;
    }

    // ログイン情報の入力と送信
    await page.fill('input[placeholder*="ログインID"]', TEST_LOGIN_ID);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("ログインする")');

    // ダッシュボードへの遷移を待機
    await page.waitForURL("**/");
  });

  test("シナリオ1: ログインしてダッシュボードが正常に表示されること", async ({ page }) => {
    // ヘッダーと主要UIの表示確認
    await expect(page.locator("text=litelog").first()).toBeVisible();
    await expect(page.locator('button:has-text("課題の追加")')).toBeVisible();
  });

  test("シナリオ2: 課題追加モーダルを開き、文字入力が消えずに保持され起票できること", async ({ page }) => {
    // 「課題の追加」ボタンをクリックしてモーダルを開く
    await page.click('button:has-text("課題の追加")');

    // モーダルの表示確認
    const modalHeading = page.locator('h3:has-text("課題の追加")');
    await expect(modalHeading).toBeVisible();

    // 件名と詳細の入力欄を特定
    const titleInput = page.locator('input[placeholder="課題の概要を入力してください"]');
    const descriptionTextarea = page.locator('textarea[placeholder*="タスクの背景"]');

    const testTitle = `E2E検証タスク_${Date.now()}`;
    const testDesc = "E2E自動テストによる入力保持と登録の動作確認本文です。";

    // 件名と詳細を入力
    await titleInput.fill(testTitle);
    await descriptionTextarea.fill(testDesc);

    // 【重要】入力直後に値が消去されるリセットバグが発生していないことを検証（1秒待機後も保持）
    await page.waitForTimeout(1000);
    await expect(titleInput).toHaveValue(testTitle);
    await expect(descriptionTextarea).toHaveValue(testDesc);

    // 「追加する」ボタンを押して送信
    const submitBtn = page.locator('button[type="submit"]:has-text("追加する")');
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click();

    // モーダルが正常に閉じることを確認（初回ビルド・通信遅延を考慮して15秒待機）
    await expect(modalHeading).not.toBeVisible({ timeout: 15000 });

    // 作成した課題が画面上の一覧に反映されていることを確認（レスポンシブで表示中の要素を検証）
    const createdItem = page.locator(`text=${testTitle}`).filter({ visible: true }).first();
    await expect(createdItem).toBeVisible({ timeout: 15000 });
  });
});
