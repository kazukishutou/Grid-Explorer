import { useEffect, useRef } from "react";
import { DungeonMap, PlayerState } from "./dungeon";

interface Props {
  dungeon: DungeonMap;
  player: PlayerState;
}

// ── constants ────────────────────────────────────────────────────────────────
const STEP_MS   = 160;
const MAX_DEPTH = 5;
const GREEN     = "#00dd44";
const LW        = 2.5;

// Direction vectors  0=N 1=E 2=S 3=W
const FWD: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const LFT: [number, number][] = [[-1, 0], [0, -1], [1, 0], [0, 1]];

// ── depth-slice screen coordinates (fractions of W / H) ──────────────────
// Index 0 = screen boundary; index d = corridor opening d tiles away.
// The front wall at depth d fills exactly SX1[d]→SX2[d], SY1[d]→SY2[d]
// which always stays inside the screen, so the screen never goes fully black.
const SX1 = [0.00, 0.20, 0.34, 0.42, 0.46, 0.485];
const SX2 = [1.00, 0.80, 0.66, 0.58, 0.54, 0.515];
const SY1 = [0.00, 0.12, 0.26, 0.35, 0.40, 0.44 ];
const SY2 = [1.00, 0.88, 0.74, 0.65, 0.60, 0.56 ];

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// Return slice coords at fractional depth (for smooth movement animation).
function sliceAt(fracD: number, W: number, H: number) {
  const d0 = Math.max(0, Math.min(SX1.length - 2, Math.floor(fracD)));
  const t  = Math.max(0, Math.min(1, fracD - d0));
  return {
    x1: lerp(SX1[d0], SX1[d0 + 1], t) * W,
    x2: lerp(SX2[d0], SX2[d0 + 1], t) * W,
    y1: lerp(SY1[d0], SY1[d0 + 1], t) * H,
    y2: lerp(SY2[d0], SY2[d0 + 1], t) * H,
  };
}

function isCellWall(dungeon: DungeonMap, x: number, y: number): boolean {
  return x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height
    || dungeon.grid[y][x] === 1;
}

function fillQuad(
  ctx: CanvasRenderingContext2D,
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
  dx: number, dy: number,
) {
  ctx.beginPath();
  ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy); ctx.lineTo(dx, dy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// ── main render function ──────────────────────────────────────────────────
// `depthOffset`: 0 = camera at (px,py); negative = camera is between tiles
//   (used for smooth forward-step animation; ranges –1→0 for forward moves).
function drawView(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  dungeon: DungeonMap,
  px: number, py: number, dir: number,
  depthOffset = 0,           // -1..0 for forward, +1..0 for backward
) {
  // clear
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  const f = FWD[dir];
  const l = LFT[dir];
  const r: [number, number] = [-l[0], -l[1]];

  // Helper: screen coords of slice at integer depth d, shifted by depthOffset
  const S = (d: number) => sliceAt(d - depthOffset, W, H);

  // ── Pass 1: floor & ceiling perspective grid (drawn first, always visible) ──
  ctx.strokeStyle = GREEN;
  ctx.lineWidth   = LW;

  for (let d = 0; d <= MAX_DEPTH; d++) {
    const s = S(d);
    // floor horizontal
    ctx.beginPath(); ctx.moveTo(s.x1, s.y2); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    // ceiling horizontal
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y1); ctx.stroke();
  }
  for (let d = 0; d < MAX_DEPTH; d++) {
    const sN = S(d), sF = S(d + 1);
    // perspective lines connecting depths (floor)
    ctx.beginPath(); ctx.moveTo(sN.x1, sN.y2); ctx.lineTo(sF.x1, sF.y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sN.x2, sN.y2); ctx.lineTo(sF.x2, sF.y2); ctx.stroke();
    // ceiling
    ctx.beginPath(); ctx.moveTo(sN.x1, sN.y1); ctx.lineTo(sF.x1, sF.y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sN.x2, sN.y1); ctx.lineTo(sF.x2, sF.y1); ctx.stroke();
  }

  // ── Pass 2: wall panels back → front ──────────────────────────────────────
  ctx.lineWidth = LW;

  for (let d = MAX_DEPTH - 1; d >= 0; d--) {
    const sN = S(d), sF = S(d + 1);

    // Cell one step further in forward direction from depth d
    const ax = px + (d + 1) * f[0], ay = py + (d + 1) * f[1];
    // Cells to the left and right at depth d
    const lx = px + d * f[0] + l[0], ly = py + d * f[1] + l[1];
    const rx = px + d * f[0] + r[0], ry = py + d * f[1] + r[1];

    // Front wall at depth d+1
    if (isCellWall(dungeon, ax, ay)) {
      ctx.fillStyle   = "#000";
      ctx.strokeStyle = GREEN;
      ctx.fillRect(sF.x1, sF.y1, sF.x2 - sF.x1, sF.y2 - sF.y1);
      ctx.strokeRect(sF.x1, sF.y1, sF.x2 - sF.x1, sF.y2 - sF.y1);
    }

    // Left wall face (trapezoid)
    if (isCellWall(dungeon, lx, ly)) {
      ctx.fillStyle   = "#000";
      ctx.strokeStyle = GREEN;
      fillQuad(ctx,
        sN.x1, sN.y1,  sF.x1, sF.y1,
        sF.x1, sF.y2,  sN.x1, sN.y2,
      );
    }

    // Right wall face (trapezoid)
    if (isCellWall(dungeon, rx, ry)) {
      ctx.fillStyle   = "#000";
      ctx.strokeStyle = GREEN;
      fillQuad(ctx,
        sN.x2, sN.y1,  sF.x2, sF.y1,
        sF.x2, sF.y2,  sN.x2, sN.y2,
      );
    }
  }

  // ── Pass 3: re-draw floor/ceiling lines on top so they're always visible ──
  ctx.strokeStyle = GREEN;
  ctx.lineWidth   = LW;
  for (let d = 0; d <= MAX_DEPTH; d++) {
    const s = S(d);
    ctx.beginPath(); ctx.moveTo(s.x1, s.y2); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y1); ctx.stroke();
  }
  for (let d = 0; d < MAX_DEPTH; d++) {
    const sN = S(d), sF = S(d + 1);
    ctx.beginPath(); ctx.moveTo(sN.x1, sN.y2); ctx.lineTo(sF.x1, sF.y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sN.x2, sN.y2); ctx.lineTo(sF.x2, sF.y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sN.x1, sN.y1); ctx.lineTo(sF.x1, sF.y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sN.x2, sN.y1); ctx.lineTo(sF.x2, sF.y1); ctx.stroke();
  }
}

// ── React component ──────────────────────────────────────────────────────────
interface AnimState {
  fromX: number; fromY: number; fromDir: number;
  toX:   number; toY:   number; toDir:   number;
  startMs: number;
  moving: boolean; // true = forward/back move, false = turn-in-place
}

export default function DungeonRenderer({ dungeon, player }: Props) {
  const mountRef   = useRef<HTMLDivElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement | null>(null);
  const rafRef     = useRef<number>(0);
  const animRef    = useRef<AnimState>({
    fromX: player.x, fromY: player.y, fromDir: player.dir,
    toX:   player.x, toY:   player.y, toDir:   player.dir,
    startMs: 0, moving: false,
  });
  const dungeonRef = useRef(dungeon);
  const playerRef  = useRef(player);

  useEffect(() => { dungeonRef.current = dungeon; }, [dungeon]);

  useEffect(() => {
    const prev = animRef.current;
    const p    = player;
    if (p.x !== prev.toX || p.y !== prev.toY || p.dir !== prev.toDir) {
      const isMove = (p.x !== prev.toX || p.y !== prev.toY);
      animRef.current = {
        fromX: prev.toX, fromY: prev.toY, fromDir: prev.toDir,
        toX: p.x, toY: p.y, toDir: p.dir,
        startMs: performance.now(),
        moving: isMove,
      };
    }
    playerRef.current = p;
  }, [player]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100%;height:100%;display:block;";
    mount.appendChild(canvas);
    canvasRef.current = canvas;

    const resize = () => {
      canvas.width  = mount.clientWidth;
      canvas.height = mount.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Initialise animation to starting position
    const sp = dungeonRef.current;
    animRef.current = {
      fromX: sp.startX, fromY: sp.startY, fromDir: sp.startDir,
      toX:   sp.startX, toY:   sp.startY, toDir:   sp.startDir,
      startMs: performance.now() - STEP_MS,
      moving: false,
    };

    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const W = canvas.width, H = canvas.height;
      const anim = animRef.current;
      const rawT = Math.min(1, (performance.now() - anim.startMs) / STEP_MS);
      const t    = rawT < 0.5 ? 2 * rawT * rawT : -1 + (4 - 2 * rawT) * rawT; // ease

      let px = anim.toX, py = anim.toY, dir = anim.toDir;
      let depthOffset = 0;

      if (t < 1 && anim.moving) {
        // For a forward/backward move, animate the depth offset.
        // At t=0: camera is 1 tile behind the target (fromPos).
        // Determine if it was a forward or backward step.
        const f = FWD[anim.toDir];
        const isForward =
          anim.toX === anim.fromX + f[0] && anim.toY === anim.fromY + f[1];
        const sign = isForward ? -1 : 1;
        depthOffset = sign * (1 - t);   // zooms from ±1 to 0
      } else if (t < 1 && !anim.moving) {
        // Turn: snap immediately (no rotation interpolation needed in 2D slices)
        dir = anim.toDir;
      }

      drawView(ctx, W, H, dungeonRef.current, px, py, dir, depthOffset);
    };
    frame();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, [dungeon]);

  return (
    <div ref={mountRef} style={{ width: "100%", height: "100%", display: "block" }} />
  );
}
