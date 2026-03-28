import { useState, useCallback, useRef } from "react";
import {
  DungeonMap,
  Direction,
  turnLeft,
  turnRight,
  moveForward,
  moveBackward,
  createVisitedGrid,
} from "./dungeon";
import { checkForEvent, getDebateSequence } from "./events";

export interface PlayerState {
  x: number;
  y: number;
  dir: Direction;
}

function markVisited(visited: boolean[][], x: number, y: number): boolean[][] {
  if (visited[y]?.[x] === true) return visited;
  const next = visited.map((row) => [...row]);
  next[y][x] = true;
  return next;
}

// How long after the last debate message to release the event lock
const POST_EVENT_UNLOCK_MS = 1200;

const FOOD_INITIAL = 10;
const FOOD_LOG_COLOR = "#d4a050";

export function usePlayerState(dungeon: DungeonMap | null, testMode: boolean) {
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [visited, setVisited] = useState<boolean[][]>([]);
  const [eventLog, setEventLog] = useState<Array<{ message: string; color?: string }>>([]);
  const [food, setFood] = useState(FOOD_INITIAL);

  const pendingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isEventRunning = useRef(false);

  const clearPendingTimers = useCallback(() => {
    pendingTimers.current.forEach(clearTimeout);
    pendingTimers.current = [];
  }, []);

  const addLog = useCallback((message: string, color?: string) => {
    setEventLog((prev) => [...prev, { message, color }]);
  }, []);

  const scheduleUnlock = useCallback((afterMs: number) => {
    const id = setTimeout(() => {
      isEventRunning.current = false;
    }, afterMs);
    pendingTimers.current.push(id);
  }, []);

  const initPlayer = useCallback((d: DungeonMap) => {
    clearPendingTimers();
    isEventRunning.current = false;
    const v = createVisitedGrid(d.width, d.height);
    v[d.startY][d.startX] = true;
    setVisited(v);
    setEventLog([]);
    setFood(FOOD_INITIAL);
    setPlayer({ x: d.startX, y: d.startY, dir: d.startDir });
  }, [clearPendingTimers]);

  const onPlayerMoved = useCallback((nx: number, ny: number, prevX: number, prevY: number) => {
    setVisited((v) => markVisited(v, nx, ny));

    if (isEventRunning.current) return;

    if (nx !== prevX || ny !== prevY) {
      const event = checkForEvent(0.15);
      if (event) {
        isEventRunning.current = true;
        addLog(event.message);

        if (event.type === "enemy") {
          const { sequence, foodCost } = getDebateSequence(testMode);
          sequence.forEach(({ message, color, delay }) => {
            const id = setTimeout(() => addLog(message, color), delay);
            pendingTimers.current.push(id);
          });
          const lastDelay = sequence[sequence.length - 1].delay;
          // Food deduction fires just after the outcome message
          const foodDelay = lastDelay + 400;
          const foodId = setTimeout(() => {
            setFood((prev) => {
              const next = Math.max(0, prev - foodCost);
              addLog(`食料を${foodCost}消費した（残り: ${next}）`, FOOD_LOG_COLOR);
              return next;
            });
          }, foodDelay);
          pendingTimers.current.push(foodId);
          scheduleUnlock(lastDelay + POST_EVENT_UNLOCK_MS);
        } else {
          scheduleUnlock(POST_EVENT_UNLOCK_MS);
        }
      }
    }
  }, [addLog, scheduleUnlock, testMode]);

  const handleTurnLeft = useCallback(() => {
    if (!player) return;
    setPlayer((p) => p && { ...p, dir: turnLeft(p.dir) });
  }, [player]);

  const handleTurnRight = useCallback(() => {
    if (!player) return;
    setPlayer((p) => p && { ...p, dir: turnRight(p.dir) });
  }, [player]);

  const handleMoveForward = useCallback(() => {
    if (!player || !dungeon) return;
    const [nx, ny] = moveForward(dungeon, player.x, player.y, player.dir);
    setPlayer((p) => p && { ...p, x: nx, y: ny });
    onPlayerMoved(nx, ny, player.x, player.y);
  }, [player, dungeon, onPlayerMoved]);

  const handleMoveBackward = useCallback(() => {
    if (!player || !dungeon) return;
    const [nx, ny] = moveBackward(dungeon, player.x, player.y, player.dir);
    setPlayer((p) => p && { ...p, x: nx, y: ny });
    onPlayerMoved(nx, ny, player.x, player.y);
  }, [player, dungeon, onPlayerMoved]);

  return {
    player,
    visited,
    eventLog,
    food,
    initPlayer,
    handleTurnLeft,
    handleTurnRight,
    handleMoveForward,
    handleMoveBackward,
  };
}
