import { useEffect, useRef, useCallback } from "react";
import { DungeonMap, PlayerState, isWall, DIR_VECTORS } from "./dungeon";

interface Props {
  dungeon: DungeonMap;
  player: PlayerState;
}

const LINE_COLOR = "#00cc00";
const LINE_WIDTH = 1.5;
const PERSPECTIVE = 1.9;
const MAX_DEPTH = 5;
const VIEW_SCALE = 0.86;

export default function WireframeView({ dungeon, player }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineJoin = "miter";

    const box = (d: number) => {
      const hw = (W * VIEW_SCALE * 0.5) / Math.pow(PERSPECTIVE, d);
      const hh = (H * VIEW_SCALE * 0.5) / Math.pow(PERSPECTIVE, d);
      return { x1: cx - hw, y1: cy - hh, x2: cx + hw, y2: cy + hh };
    };

    const seg = (x1: number, y1: number, x2: number, y2: number) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };

    const rect = (b: ReturnType<typeof box>) => {
      seg(b.x1, b.y1, b.x2, b.y1);
      seg(b.x1, b.y2, b.x2, b.y2);
      seg(b.x1, b.y1, b.x1, b.y2);
      seg(b.x2, b.y1, b.x2, b.y2);
    };

    const [fwdX, fwdY] = DIR_VECTORS[player.dir];
    const [lx, ly] = DIR_VECTORS[(player.dir + 3) % 4];
    const [rx, ry] = DIR_VECTORS[(player.dir + 1) % 4];

    let wallAt = MAX_DEPTH;
    for (let d = 1; d <= MAX_DEPTH; d++) {
      if (isWall(dungeon, player.x + fwdX * d, player.y + fwdY * d)) {
        wallAt = d;
        break;
      }
    }

    for (let d = wallAt; d >= 1; d--) {
      const near = box(d - 1);
      const far = box(d);
      const hasFront = d === wallAt;
      const nx = player.x + fwdX * (d - 1);
      const ny = player.y + fwdY * (d - 1);
      const hasLeft = isWall(dungeon, nx + lx, ny + ly);
      const hasRight = isWall(dungeon, nx + rx, ny + ry);

      if (hasFront) {
        rect(far);
      }

      seg(near.x1, near.y1, near.x2, near.y1);
      seg(near.x1, near.y2, near.x2, near.y2);

      if (hasLeft) {
        seg(near.x1, near.y1, near.x1, near.y2);
        seg(near.x1, near.y1, far.x1, far.y1);
        seg(near.x1, near.y2, far.x1, far.y2);
        seg(far.x1, far.y1, far.x1, far.y2);
      } else {
        seg(near.x1, near.y1, far.x1, far.y1);
        seg(near.x1, near.y2, far.x1, far.y2);
      }

      if (hasRight) {
        seg(near.x2, near.y1, near.x2, near.y2);
        seg(near.x2, near.y1, far.x2, far.y1);
        seg(near.x2, near.y2, far.x2, far.y2);
        seg(far.x2, far.y1, far.x2, far.y2);
      } else {
        seg(near.x2, near.y1, far.x2, far.y1);
        seg(near.x2, near.y2, far.x2, far.y2);
      }
    }
  }, [dungeon, player]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      draw();
    };

    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(container);
    return () => obs.disconnect();
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}
