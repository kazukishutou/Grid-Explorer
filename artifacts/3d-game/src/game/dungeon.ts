export type Cell = 0 | 1;
export type Direction = 0 | 1 | 2 | 3;

export interface DungeonMap {
  width: number;
  height: number;
  grid: Cell[][];
  startX: number;
  startY: number;
  startDir: Direction;
}

const DIRS: [number, number][] = [
  [0, -2], [2, 0], [0, 2], [-2, 0],
];

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function carve(grid: Cell[][], cx: number, cy: number, w: number, h: number) {
  grid[cy][cx] = 0;
  for (const [dx, dy] of shuffle([...DIRS])) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 1 && grid[ny][nx] === 1) {
      grid[cy + dy / 2][cx + dx / 2] = 0;
      carve(grid, nx, ny, w, h);
    }
  }
}

export function generateDungeon(width = 21, height = 21): DungeonMap {
  const grid: Cell[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => 1 as Cell)
  );

  const startX = 1;
  const startY = 1;
  carve(grid, startX, startY, width, height);

  const openCells: [number, number][] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] === 0) openCells.push([x, y]);
    }
  }

  const [px, py] = openCells[Math.floor(Math.random() * openCells.length)];

  return {
    width,
    height,
    grid,
    startX: px,
    startY: py,
    startDir: Math.floor(Math.random() * 4) as Direction,
  };
}

export function isWall(dungeon: DungeonMap, x: number, y: number): boolean {
  if (x < 0 || x >= dungeon.width || y < 0 || y >= dungeon.height) return true;
  return dungeon.grid[y][x] === 1;
}

export const DIR_VECTORS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function turnLeft(dir: Direction): Direction {
  return ((dir + 3) % 4) as Direction;
}

export function turnRight(dir: Direction): Direction {
  return ((dir + 1) % 4) as Direction;
}

export function moveForward(
  dungeon: DungeonMap,
  x: number,
  y: number,
  dir: Direction
): [number, number] {
  const [dx, dy] = DIR_VECTORS[dir];
  const nx = x + dx;
  const ny = y + dy;
  if (!isWall(dungeon, nx, ny)) return [nx, ny];
  return [x, y];
}

export function moveBackward(
  dungeon: DungeonMap,
  x: number,
  y: number,
  dir: Direction
): [number, number] {
  const backDir = ((dir + 2) % 4) as Direction;
  const [dx, dy] = DIR_VECTORS[backDir];
  const nx = x + dx;
  const ny = y + dy;
  if (!isWall(dungeon, nx, ny)) return [nx, ny];
  return [x, y];
}
