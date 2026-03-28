import { useEffect, useRef } from "react";
import { DungeonMap, PlayerState, DIR_VECTORS } from "./dungeon";

interface Props {
  dungeon: DungeonMap;
  player: PlayerState;
  visited: boolean[][];
}

const T = 8;
const WALL_W = 2;

export default function Minimap({ dungeon, player, visited }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = dungeon.width * T;
    const H = dungeon.height * T;
    canvas.width = W;
    canvas.height = H;

    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);

    for (let y = 0; y < dungeon.height; y++) {
      for (let x = 0; x < dungeon.width; x++) {
        if (dungeon.grid[y][x] === 1) continue;
        if (!visited[y]?.[x]) continue;

        const px = x * T;
        const py = y * T;

        const isPlayer = x === player.x && y === player.y;

        ctx.fillStyle = isPlayer ? "#00cfff" : "#445566";
        ctx.fillRect(px + WALL_W, py + WALL_W, T - WALL_W * 2, T - WALL_W * 2);

        const walls = dungeon.tiles[y][x].walls;

        ctx.strokeStyle = "#00cfff";
        ctx.lineWidth = 1.5;

        if (walls.north) {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + T, py);
          ctx.stroke();
        }
        if (walls.south) {
          ctx.beginPath();
          ctx.moveTo(px, py + T);
          ctx.lineTo(px + T, py + T);
          ctx.stroke();
        }
        if (walls.west) {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px, py + T);
          ctx.stroke();
        }
        if (walls.east) {
          ctx.beginPath();
          ctx.moveTo(px + T, py);
          ctx.lineTo(px + T, py + T);
          ctx.stroke();
        }
      }
    }

    const [dx, dy] = DIR_VECTORS[player.dir];
    const cx = player.x * T + T / 2;
    const cy = player.y * T + T / 2;
    const angle = Math.atan2(dy, dx);
    const r = T * 0.32;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = "#ffffff";
    ctx.shadowBlur = 4;
    ctx.shadowColor = "#00cfff";
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(-r * 0.6, r * 0.55);
    ctx.lineTo(-r * 0.6, -r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }, [dungeon, player, visited]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        imageRendering: "pixelated",
        maxWidth: "100%",
        maxHeight: "100%",
      }}
    />
  );
}
