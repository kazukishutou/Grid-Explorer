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

export function usePlayerState(dungeon: DungeonMap | null) {
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [visited, setVisited] = useState<boolean[][]>([]);
  const [lastEvent, setLastEvent] = useState<GameEvent | null>(null);

  // Track pending debate timers so they can be cancelled if a new event fires
  const debateTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearDebateTimers = useCallback(() => {
    debateTimers.current.forEach(clearTimeout);
    debateTimers.current = [];
  }, []);

  const initPlayer = useCallback((d: DungeonMap) => {
    clearDebateTimers();
    const v = createVisitedGrid(d.width, d.height);
    v[d.startY][d.startX] = true;
    setVisited(v);
    setLastEvent(null);
    setPlayer({ x: d.startX, y: d.startY, dir: d.startDir });
  }, [clearDebateTimers]);

  const onPlayerMoved = useCallback((nx: number, ny: number, prevX: number, prevY: number) => {
    setVisited((v) => markVisited(v, nx, ny));
    if (nx !== prevX || ny !== prevY) {
      const event = checkForEvent(0.15);
      if (event) {
        // Cancel any ongoing debate before starting a new one
        clearDebateTimers();
        setLastEvent(event);

        if (event.type === "enemy") {
          const sequence = getDebateSequence();
          sequence.forEach(({ message, delay }) => {
            const id = setTimeout(() => {
              setLastEvent({ type: "debate", message });
            }, delay);
            debateTimers.current.push(id);
          });
        }
      }
    }
  }, [clearDebateTimers]);

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
