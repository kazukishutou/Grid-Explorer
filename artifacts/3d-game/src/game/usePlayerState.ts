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
import { checkForEvent, getDebateSequence, getReturnDecisionSequence } from "./events";

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
  const [hasReturnFlag, setHasReturnFlag] = useState(false);

  const pendingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isEventRunning = useRef(false);
  const foodRef = useRef(FOOD_INITIAL);
  const returnDecisionFired = useRef(false);

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
    foodRef.current = FOOD_INITIAL;
    returnDecisionFired.current = false;
    const v = createVisitedGrid(d.width, d.height);
    v[d.startY][d.startX] = true;
    setVisited(v);
    setEventLog([]);
    setFood(FOOD_INITIAL);
    setHasReturnFlag(false);
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
            const next = Math.max(0, foodRef.current - foodCost);
            foodRef.current = next;
            setFood(next);
            addLog(`食料を${foodCost}消費した（残り: ${next}）`, FOOD_LOG_COLOR);

            // food が 3 以下に落ちたら帰還判断イベントを予約
            // 戦闘イベントのロック解除（lastDelay+1200）より後に発火させるため
            // food ログ (foodDelay) の 1600ms 後 = lastDelay + 2000
            if (next <= 3 && !returnDecisionFired.current) {
              returnDecisionFired.current = true;
              const triggerId = setTimeout(() => {
                if (isEventRunning.current) return;
                isEventRunning.current = true;
                addLog("── 食料が尽きかけている ──", "#e08030");
                addLog("帰還すべきか、議論が始まった。", "#e08030");
                const { sequence: rSeq, decision } = getReturnDecisionSequence(testMode);
                rSeq.forEach(({ message, color, delay }) => {
                  const id = setTimeout(() => addLog(message, color), delay);
                  pendingTimers.current.push(id);
                });
                const lastRDelay = rSeq[rSeq.length - 1].delay;
                scheduleUnlock(lastRDelay + POST_EVENT_UNLOCK_MS);
                if (decision === "return") {
                  const flagId = setTimeout(() => setHasReturnFlag(true), lastRDelay + 400);
                  pendingTimers.current.push(flagId);
                }
              }, POST_EVENT_UNLOCK_MS + 400); // 戦闘ロック解除後 400ms
              pendingTimers.current.push(triggerId);
            }
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
    hasReturnFlag,
    initPlayer,
    handleTurnLeft,
    handleTurnRight,
    handleMoveForward,
    handleMoveBackward,
  };
}
