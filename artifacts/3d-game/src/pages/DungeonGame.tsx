import { useState, useEffect, useCallback, useRef } from "react";
import { generateDungeon, DungeonMap } from "../game/dungeon";
import { usePlayerState } from "../game/usePlayerState";
import DungeonRenderer from "../game/DungeonRenderer";
import Minimap from "../game/Minimap";

type GamePhase = "start" | "playing";

export default function DungeonGame() {
  const [phase, setPhase] = useState<GamePhase>("start");
  const [dungeon, setDungeon] = useState<DungeonMap | null>(null);
  const [testMode, setTestMode] = useState(false);
  const { player, visited, eventLog, food, hasReturnFlag, initPlayer, handleTurnLeft, handleTurnRight, handleMoveForward, handleMoveBackward } =
    usePlayerState(dungeon, testMode);

  const [minimapOpen, setMinimapOpen] = useState(true);
  const lastKeyTime = useRef<number>(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log to bottom whenever a new message arrives
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [eventLog]);

  const startGame = useCallback(() => {
    const d = generateDungeon(21, 21);
    setDungeon(d);
    initPlayer(d);
    setPhase("playing");
  }, [initPlayer]);

  useEffect(() => {
    if (phase !== "playing") return;

    const KEY_COOLDOWN = 120;

    const onKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      if (now - lastKeyTime.current < KEY_COOLDOWN) return;
      lastKeyTime.current = now;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          handleMoveForward();
          break;
        case "ArrowDown":
          e.preventDefault();
          handleMoveBackward();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handleTurnLeft();
          break;
        case "ArrowRight":
          e.preventDefault();
          handleTurnRight();
          break;
        case "m":
        case "M":
          setMinimapOpen((v) => !v);
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, handleMoveForward, handleMoveBackward, handleTurnLeft, handleTurnRight]);

  if (phase === "start") {
    return (
      <div style={styles.startScreen}>
        <div style={styles.startBox}>
          <h1 style={styles.title}>DUNGEON</h1>
          <p style={styles.subtitle}>A First-Person Exploration</p>
          <div style={styles.divider} />
          <ul style={styles.controls}>
            <li><span style={styles.key}>↑</span> Move Forward</li>
            <li><span style={styles.key}>↓</span> Move Backward</li>
            <li><span style={styles.key}>←</span> Turn Left</li>
            <li><span style={styles.key}>→</span> Turn Right</li>
            <li><span style={styles.key}>M</span> Toggle Minimap</li>
          </ul>
          <button style={styles.startBtn} onClick={startGame}>
            ENTER THE DUNGEON
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.gameRoot}>
      {dungeon && player && (
        <>
          <div style={styles.viewport}>
            <DungeonRenderer dungeon={dungeon} player={player} />
            <div style={styles.overlay}>
              <div style={styles.crosshair} />
            </div>
          </div>

          <div style={styles.hud}>
            <div style={styles.hudLeft}>
              <div style={styles.coords}>
                {player.x}, {player.y}
              </div>
              <div style={styles.dirLabel}>
                {["North", "East", "South", "West"][player.dir]}
              </div>
              <div style={styles.foodLabel}>
                🍖 Food: {food}
              </div>
              {hasReturnFlag && (
                <div style={styles.returnFlag}>
                  ⚠ 帰還推奨
                </div>
              )}
            </div>
            <div style={styles.hudRight}>
              <button
                style={{
                  ...styles.testModeBtn,
                  ...(testMode ? styles.testModeBtnOn : {}),
                }}
                onClick={() => setTestMode((v) => !v)}
              >
                TEST MODE: {testMode ? "ON" : "OFF"}
              </button>
              <button style={styles.restartBtn} onClick={startGame}>
                Restart
              </button>
            </div>
          </div>

          {minimapOpen && (
            <div style={styles.minimap}>
              <Minimap dungeon={dungeon} player={player} visited={visited} />
            </div>
          )}

          {eventLog.length > 0 && (
            <div style={styles.eventLog}>
              {eventLog.map((entry, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.eventMessage,
                    ...(entry.color ? { color: entry.color } : {}),
                  }}
                >
                  ▶ {entry.message}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}

          <div style={styles.mobileControls}>
            <div style={styles.mobileRow}>
              <button style={styles.mobileBtn} onPointerDown={handleMoveForward}>↑</button>
            </div>
            <div style={styles.mobileRow}>
              <button style={styles.mobileBtn} onPointerDown={handleTurnLeft}>←</button>
              <button style={styles.mobileBtn} onPointerDown={handleMoveBackward}>↓</button>
              <button style={styles.mobileBtn} onPointerDown={handleTurnRight}>→</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  startScreen: {
    width: "100vw",
    height: "100vh",
    background: "#0a0705",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Courier New', Courier, monospace",
  },
  startBox: {
    background: "#13100d",
    border: "1px solid #4a3a28",
    borderRadius: 4,
    padding: "48px 64px",
    maxWidth: 420,
    width: "90%",
    textAlign: "center",
    boxShadow: "0 0 60px rgba(255,136,51,0.08)",
  },
  title: {
    color: "#f0c060",
    fontSize: 48,
    letterSpacing: 12,
    margin: 0,
    fontWeight: 700,
    textShadow: "0 0 20px rgba(240,192,96,0.4)",
  },
  subtitle: {
    color: "#806040",
    fontSize: 13,
    letterSpacing: 4,
    marginTop: 8,
    marginBottom: 0,
  },
  divider: {
    height: 1,
    background: "#3a2a1a",
    margin: "28px 0",
  },
  controls: {
    listStyle: "none",
    padding: 0,
    margin: "0 0 32px 0",
    color: "#a08060",
    fontSize: 14,
    lineHeight: 2,
    textAlign: "left",
  },
  key: {
    display: "inline-block",
    background: "#2a1f14",
    border: "1px solid #5a4030",
    borderRadius: 3,
    padding: "1px 7px",
    marginRight: 10,
    color: "#f0c060",
    fontFamily: "monospace",
    fontSize: 13,
  },
  startBtn: {
    background: "#3a2010",
    border: "1px solid #f0c060",
    color: "#f0c060",
    padding: "14px 36px",
    cursor: "pointer",
    fontFamily: "'Courier New', monospace",
    fontSize: 14,
    letterSpacing: 3,
    borderRadius: 2,
    transition: "background 0.2s, box-shadow 0.2s",
    boxShadow: "0 0 20px rgba(240,192,96,0.1)",
  },
  gameRoot: {
    width: "100vw",
    height: "100vh",
    background: "#000",
    position: "relative",
    overflow: "hidden",
  },
  viewport: {
    position: "absolute",
    inset: 0,
    display: "flex",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  crosshair: {
    width: 12,
    height: 12,
    position: "relative",
    opacity: 0.5,
  },
  hud: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "12px 16px",
    background: "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)",
    pointerEvents: "none",
    fontFamily: "'Courier New', monospace",
  },
  hudLeft: {
    pointerEvents: "none",
  },
  coords: {
    color: "#f0c060",
    fontSize: 12,
    letterSpacing: 2,
    opacity: 0.8,
  },
  dirLabel: {
    color: "#c8a060",
    fontSize: 11,
    letterSpacing: 2,
    opacity: 0.7,
    marginTop: 2,
  },
  foodLabel: {
    color: "#d4a050",
    fontSize: 13,
    letterSpacing: 1,
    fontFamily: "'Courier New', monospace",
    marginTop: 6,
  },
  returnFlag: {
    marginTop: 6,
    padding: "3px 8px",
    background: "rgba(60,20,0,0.85)",
    border: "1px solid #e08030",
    color: "#e08030",
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: "'Courier New', monospace",
    borderRadius: 2,
    boxShadow: "0 0 8px rgba(224,128,48,0.35)",
  },
  hudRight: {
    pointerEvents: "auto",
  },
  restartBtn: {
    background: "rgba(30,15,5,0.8)",
    border: "1px solid #5a3a1a",
    color: "#c8a060",
    padding: "6px 14px",
    cursor: "pointer",
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    borderRadius: 2,
    letterSpacing: 1,
  },
  testModeBtn: {
    display: "block",
    marginBottom: 6,
    background: "rgba(10,10,10,0.8)",
    border: "1px solid #444",
    color: "#666",
    padding: "5px 10px",
    cursor: "pointer",
    fontFamily: "'Courier New', monospace",
    fontSize: 11,
    borderRadius: 2,
    letterSpacing: 1,
  },
  testModeBtnOn: {
    border: "1px solid #ff4444",
    color: "#ff4444",
    background: "rgba(40,0,0,0.85)",
    boxShadow: "0 0 8px rgba(255,68,68,0.3)",
  },
  minimap: {
    position: "absolute",
    top: 56,
    right: 16,
    background: "rgba(0,5,15,0.88)",
    border: "1px solid #00cfff44",
    borderRadius: 3,
    padding: 4,
    width: 180,
    height: 180,
    overflow: "hidden",
    boxShadow: "0 0 12px rgba(0,207,255,0.12)",
  },
  eventLog: {
    position: "absolute",
    bottom: 148,
    left: 16,
    width: 300,
    maxHeight: 200,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    pointerEvents: "none",
    // Hide scrollbar visually but keep it functional
    scrollbarWidth: "none",
  },
  eventMessage: {
    background: "rgba(0, 10, 20, 0.85)",
    border: "1px solid #00cfff44",
    color: "#00cfff",
    fontFamily: "'Courier New', monospace",
    fontSize: 13,
    letterSpacing: 1,
    padding: "6px 14px",
    borderRadius: 2,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    boxShadow: "0 0 10px rgba(0,207,255,0.15)",
    textShadow: "0 0 8px rgba(0,207,255,0.5)",
  },
  mobileControls: {
    position: "absolute",
    bottom: 16,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    alignItems: "center",
  },
  mobileRow: {
    display: "flex",
    gap: 4,
  },
  mobileBtn: {
    width: 52,
    height: 52,
    background: "rgba(30,15,5,0.85)",
    border: "1px solid #5a3a1a",
    color: "#f0c060",
    fontSize: 20,
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "monospace",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    WebkitUserSelect: "none",
    touchAction: "manipulation",
  },
};
