import { useEffect, useRef } from "react";
import { DungeonMap, PlayerState, DIR_VECTORS } from "./dungeon";

interface Props {
  dungeon: DungeonMap;
  player: PlayerState;
}

const TILE = 6;

export default function Minimap({ dungeon, player }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = dungeon.width * TILE;
    const h = dungeon.height * TILE;
    canvas.width = w;
    canvas.height = h;

    for (let y = 0; y < dungeon.height; y++) {
      for (let x = 0; x < dungeon.width; x++) {
        ctx.fillStyle = dungeon.grid[y][x] === 1 ? "#3d2e20" : "#c8a96e";
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    const px = player.x * TILE + TILE / 2;
    const py = player.y * TILE + TILE / 2;
    const [dx, dy] = DIR_VECTORS[player.dir];

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(dy, dx));

    ctx.fillStyle = "#ff5533";
    ctx.beginPath();
    ctx.moveTo(TILE * 0.7, 0);
    ctx.lineTo(-TILE * 0.5, TILE * 0.4);
    ctx.lineTo(-TILE * 0.5, -TILE * 0.4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }, [dungeon, player]);

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
