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

export function usePlayerState(dungeon: DungeonMap | null) {
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [visited, setVisited] = useState<boolean[][]>([]);
  const [eventLog, setEventLog] = useState<string[]>([]);

  const pendingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isEventRunning = useRef(false);

  const clearPendingTimers = useCallback(() => {
    pendingTimers.current.forEach(clearTimeout);
    pendingTimers.current = [];
  }, []);

  const addLog = useCallback((message: string) => {
    setEventLog((prev) => [...prev, message]);
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
          const sequence = getDebateSequence();
          sequence.forEach(({ message, delay }) => {
            const id = setTimeout(() => addLog(message), delay);
            pendingTimers.current.push(id);
          });
          const lastDelay = sequence[sequence.length - 1].delay;
          scheduleUnlock(lastDelay + POST_EVENT_UNLOCK_MS);
        } else {
          scheduleUnlock(POST_EVENT_UNLOCK_MS);
        }
      }
    }
  }, [addLog, scheduleUnlock]);

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
    initPlayer,
    handleTurnLeft,
    handleTurnRight,
    handleMoveForward,
    handleMoveBackward,
  };
}
