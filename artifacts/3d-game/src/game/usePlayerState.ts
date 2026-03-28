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
import { checkForEvent, getDebateSequence, GameEvent } from "./events";

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

// DungeonGame clears lastEvent 3000ms after each message update.
// We add a small buffer on top so the unlock fires after the display has cleared.
const AUTO_CLEAR_MS = 3000;
const UNLOCK_BUFFER_MS = 200;

export function usePlayerState(dungeon: DungeonMap | null) {
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [visited, setVisited] = useState<boolean[][]>([]);
  const [lastEvent, setLastEvent] = useState<GameEvent | null>(null);

  // Pending timers for debate sequence (including the unlock timer)
  const pendingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Lock: true while an event sequence is still running
  const isEventRunning = useRef(false);

  const clearPendingTimers = useCallback(() => {
    pendingTimers.current.forEach(clearTimeout);
    pendingTimers.current = [];
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
    setLastEvent(null);
    setPlayer({ x: d.startX, y: d.startY, dir: d.startDir });
  }, [clearPendingTimers]);

  const onPlayerMoved = useCallback((nx: number, ny: number, prevX: number, prevY: number) => {
    setVisited((v) => markVisited(v, nx, ny));

    // Skip new events while one is still in progress
    if (isEventRunning.current) return;

    if (nx !== prevX || ny !== prevY) {
      const event = checkForEvent(0.15);
      if (event) {
        isEventRunning.current = true;
        setLastEvent(event);

        if (event.type === "enemy") {
          const sequence = getDebateSequence();
          sequence.forEach(({ message, delay }) => {
            const id = setTimeout(() => {
              setLastEvent({ type: "debate", message });
            }, delay);
            pendingTimers.current.push(id);
          });
          // Unlock after the last message has auto-cleared
          const lastDelay = sequence[sequence.length - 1].delay;
          scheduleUnlock(lastDelay + AUTO_CLEAR_MS + UNLOCK_BUFFER_MS);
        } else {
          // Resource event: single message, unlocks after auto-clear
          scheduleUnlock(AUTO_CLEAR_MS + UNLOCK_BUFFER_MS);
        }
      }
    }
  }, [scheduleUnlock]);

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

  const clearEvent = useCallback(() => setLastEvent(null), []);

  return {
    player,
    visited,
    lastEvent,
    clearEvent,
    initPlayer,
    handleTurnLeft,
    handleTurnRight,
    handleMoveForward,
    handleMoveBackward,
  };
}
