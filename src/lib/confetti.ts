// タスク完了時などに画面へ紙吹雪・スパークル（Confetti）を打ち上げる軽量Canvasユーティリティ

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  shape: "rect" | "circle";
  alpha: number;
  gravity: number;
  drag: number;
}

let canvasElement: HTMLCanvasElement | null = null;
let canvasCtx: CanvasRenderingContext2D | null = null;
let particles: ConfettiParticle[] = [];
let animationFrameId: number | null = null;

// 紙吹雪アニメーション用のCanvas要素を取得または初期化
function getOrCreateCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  if (!canvasElement || !document.body.contains(canvasElement)) {
    canvasElement = document.createElement("canvas");
    canvasElement.id = "app-confetti-canvas";
    canvasElement.style.position = "fixed";
    canvasElement.style.top = "0";
    canvasElement.style.left = "0";
    canvasElement.style.width = "100vw";
    canvasElement.style.height = "100vh";
    canvasElement.style.pointerEvents = "none";
    canvasElement.style.zIndex = "9999";
    document.body.appendChild(canvasElement);
    canvasCtx = canvasElement.getContext("2d");
  }

  if (!canvasCtx && canvasElement) {
    canvasCtx = canvasElement.getContext("2d");
  }

  if (canvasElement && canvasCtx) {
    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
    return { canvas: canvasElement, ctx: canvasCtx };
  }

  return null;
}

// アニメーションループ描画
function renderConfetti() {
  if (!canvasElement || !canvasCtx) return;

  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.vx *= p.drag;
    p.vy *= p.drag;
    p.vy += p.gravity;
    p.x += p.vx;
    p.y += p.vy;
    p.rotation += p.rotationSpeed;
    p.alpha -= 0.016;

    if (p.alpha > 0) {
      canvasCtx.save();
      canvasCtx.globalAlpha = Math.max(0, p.alpha);
      canvasCtx.translate(p.x, p.y);
      canvasCtx.rotate((p.rotation * Math.PI) / 180);
      canvasCtx.fillStyle = p.color;

      if (p.shape === "rect") {
        canvasCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      } else {
        canvasCtx.beginPath();
        canvasCtx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        canvasCtx.fill();
      }
      canvasCtx.restore();
    }
  }

  // 生存しているパーティクルのみ保持
  particles = particles.filter((p) => p.alpha > 0);

  if (particles.length > 0) {
    animationFrameId = requestAnimationFrame(renderConfetti);
  } else {
    // 全てのアニメーションが完了したらキャンバスをクリア
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    animationFrameId = null;
  }
}

/**
 * 紙吹雪・スパークル（Confetti）を打ち上げる
 * @param originX 打ち上げ元の画面X座標（省略時は画面中央）
 * @param originY 打ち上げ元の画面Y座標（省略時は画面中央より少し上）
 * @param count パーティクル数（デフォルト: 48）
 */
export function fireConfetti(originX?: number, originY?: number, count = 48): void {
  if (typeof window === "undefined") return;

  // OSのアニメーション軽減（prefers-reduced-motion）設定がある場合は過度な描画を抑制
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const canvasSetup = getOrCreateCanvas();
  if (!canvasSetup) return;

  const { canvas } = canvasSetup;
  const startX = originX !== undefined ? originX : canvas.width / 2;
  const startY = originY !== undefined ? originY : canvas.height / 2;

  // 祝祭感のあるカラフルなカラーパレット（エメラルド・ローズ・アンバー・バイオレット・ブルー等）
  const colors = [
    "#10b981", // エメラルド（成功）
    "#059669",
    "#f43f5e", // ローズ
    "#f59e0b", // アンバー
    "#3b82f6", // ブルー
    "#8b5cf6", // バイオレット
    "#ec4899", // ピンク
    "#facc15", // ゴールドイエロー
  ];

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    // 上方向や外側に勢いよく放たれる速度設定
    const speed = Math.random() * 9 + 4;
    particles.push({
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3.5, // わずかに上向きの初速
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 14,
      shape: Math.random() > 0.4 ? "rect" : "circle",
      alpha: 1,
      gravity: 0.28,
      drag: 0.93,
    });
  }

  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(renderConfetti);
  }
}
