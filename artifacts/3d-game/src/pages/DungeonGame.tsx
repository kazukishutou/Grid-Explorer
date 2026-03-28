import { useState, useEffect, useCallback, useRef } from "react";
import { generateDungeon, DungeonMap } from "../game/dungeon";
import { usePlayerState } from "../game/usePlayerState";
import DungeonRenderer from "../game/DungeonRenderer";
import Minimap from "../game/Minimap";
import { TEAM } from "../game/events";

type GamePhase = "start" | "playing";
type AppMode = "dungeon" | "commune";

interface CharStat {
  name: string;
  stress: number;
  morale: number;
  selected: boolean;
}

const INITIAL_CHAR_STATS: CharStat[] = [
  { name: "アレス", stress: 0, morale: 0, selected: true },
  { name: "セイラ", stress: 0, morale: 0, selected: true },
  { name: "レン",   stress: 0, morale: 0, selected: true },
  { name: "カイ",   stress: 0, morale: 0, selected: true },
];

export default function DungeonGame() {
  const [phase, setPhase] = useState<GamePhase>("start");
  const [dungeon, setDungeon] = useState<DungeonMap | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [appMode, setAppMode] = useState<AppMode>("dungeon");
  const [charStats, setCharStats] = useState<CharStat[]>(INITIAL_CHAR_STATS);

  // Derived: selected team members mapped to their full TeamMember definition
  const selectedTeam = charStats
    .filter((c) => c.selected)
    .map((c) => TEAM.find((t) => t.name === c.name)!)
    .filter(Boolean) as typeof TEAM;

  const { player, visited, eventLog, food, scrap, stepCount, isRunEnded, characterChanges, hasReturnFlag, initPlayer, handleTurnLeft, handleTurnRight, handleMoveForward, handleMoveBackward } =
    usePlayerState(dungeon, testMode, selectedTeam);

  const lastKeyTime = useRef<number>(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log to bottom whenever a new message arrives
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [eventLog]);

  // Apply run results to persistent character stats
  useEffect(() => {
    if (characterChanges.length === 0) return;
    setCharStats((prev) =>
      prev.map((stat) => {
        const change = characterChanges.find((c) => c.name === stat.name);
        if (!change) return stat;
        return {
          ...stat,
          stress: stat.stress + change.stressDelta,
          morale: stat.morale + change.moraleDelta,
        };
      })
    );
  }, [characterChanges]);

  const startGame = useCallback(() => {
    const d = generateDungeon(21, 21);
    setDungeon(d);
    initPlayer(d);
    setPhase("playing");
    setAppMode("dungeon");
  }, [initPlayer]);

  const toggleSelect = useCallback((name: string) => {
    setCharStats((prev) => {
      const target = prev.find((c) => c.name === name);
      if (!target) return prev;
      const numSelected = prev.filter((c) => c.selected).length;
      // 選択解除は常に可能（ただし1人以下にはできない）
      if (target.selected && numSelected <= 1) return prev;
      // 選択追加は最大4人まで（実質制限なし）
      if (!target.selected && numSelected >= 4) return prev;
      return prev.map((c) => c.name === name ? { ...c, selected: !c.selected } : c);
    });
  }, []);

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

  if (appMode === "commune") {
    const selectedNames = charStats.filter((c) => c.selected).map((c) => c.name);
    return (
      <div style={styles.communeScreen}>
        <div style={styles.communePanel}>
          <div style={styles.communeHeader}>
            <div style={styles.communeTitle}>COMMUNE</div>
            <div style={styles.communeSubtitle}>拠　点</div>
          </div>
          <div style={styles.communeSectionLabel}>探索チーム編成</div>
          <div style={styles.charList}>
            {charStats.map((c) => (
              <div
                key={c.name}
                onClick={() => toggleSelect(c.name)}
                style={{
                  ...styles.charCard,
                  ...(c.selected ? styles.charCardSelected : styles.charCardUnselected),
                }}
              >
                <div style={styles.charCardLeft}>
                  <span style={{
                    ...styles.charSelectDot,
                    background: c.selected ? "#4499bb" : "#1a2e3a",
                    boxShadow: c.selected ? "0 0 6px rgba(68,153,187,0.6)" : "none",
                  }} />
                  <span style={{
                    ...styles.charCardName,
                    color: c.selected ? "#a8ccd8" : "#445566",
                  }}>{c.name}</span>
                </div>
                <div style={styles.charCardStats}>
                  <span style={{
                    ...styles.charCardStress,
                    opacity: c.selected ? 1 : 0.35,
                  }}>ST　{c.stress}</span>
                  <span style={{
                    ...styles.charCardMorale,
                    opacity: c.selected ? 1 : 0.35,
                  }}>MO　{c.morale}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={styles.communeDivider} />
          <div style={styles.selectionSummary}>
            <span style={styles.selectionLabel}>編成中</span>
            <span style={styles.selectionNames}>
              {selectedNames.length > 0 ? selectedNames.join("・") : "（未選択）"}
            </span>
            <span style={styles.selectionCount}>{selectedNames.length} / 4</span>
          </div>
          <button
            style={{
              ...styles.communeExploreBtn,
              ...(selectedNames.length === 0 ? styles.communeExploreBtnDisabled : {}),
            }}
            onClick={selectedNames.length > 0 ? startGame : undefined}
          >
            このメンバーで探索
          </button>
        </div>
      </div>
    );
  }

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
              <div style={styles.scrapLabel}>
                ⚙ Scrap: {scrap}
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

          {isRunEnded && (
            <div style={styles.resultOverlay}>
              <div style={styles.resultBox}>
                <div style={styles.resultTitle}>帰　還</div>
                <div style={styles.resultDivider} />
                <div style={styles.resultStats}>
                  <div style={styles.resultRow}>
                    <span style={styles.resultLabel}>到達歩数</span>
                    <span style={styles.resultValue}>{stepCount} 歩</span>
                  </div>
                  <div style={styles.resultRow}>
                    <span style={styles.resultLabel}>残り食料</span>
                    <span style={styles.resultValue}>{food}</span>
                  </div>
                  <div style={styles.resultRow}>
                    <span style={styles.resultLabel}>回収資源</span>
                    <span style={{ ...styles.resultValue, color: "#88ddff" }}>{scrap}</span>
                  </div>
                </div>
                {characterChanges.length > 0 && (
                  <>
                    <div style={styles.resultDivider} />
                    <div style={styles.charChangesTitle}>── キャラクター変化 ──</div>
                    <div style={styles.charChangesList}>
                      {characterChanges.map((c) => {
                        const parts: string[] = [];
                        if (c.stressDelta > 0) parts.push(`ストレス +${c.stressDelta}`);
                        if (c.moraleDelta > 0) parts.push(`モラル +${c.moraleDelta}`);
                        return (
                          <div key={c.name} style={styles.charChangeRow}>
                            <span style={styles.charName}>{c.name}</span>
                            <span style={styles.charDelta}>{parts.join("　")}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
                <div style={styles.resultDivider} />
                <div style={styles.resultBtnGroup}>
                  <button style={styles.resultBtn} onClick={startGame}>
                    もう一度探索する
                  </button>
                  <button style={{ ...styles.resultBtn, ...styles.resultBtnCommune }} onClick={() => setAppMode("commune")}>
                    コミューンへ
                  </button>
                </div>
              </div>
            </div>
          )}
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
  scrapLabel: {
    color: "#88ddff",
    fontSize: 13,
    letterSpacing: 1,
    fontFamily: "'Courier New', monospace",
    marginTop: 4,
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
  resultOverlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(4,3,2,0.88)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  resultBox: {
    background: "#13100d",
    border: "1px solid #4a3a28",
    borderRadius: 4,
    padding: "44px 60px",
    minWidth: 320,
    textAlign: "center",
    fontFamily: "'Courier New', monospace",
    boxShadow: "0 0 80px rgba(255,136,51,0.12)",
  },
  resultTitle: {
    color: "#f0c060",
    fontSize: 40,
    letterSpacing: 10,
    fontWeight: 700,
    textShadow: "0 0 24px rgba(240,192,96,0.5)",
    marginBottom: 4,
  },
  resultDivider: {
    height: 1,
    background: "#3a2a1a",
    margin: "20px 0",
  },
  resultStats: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  resultRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 32,
  },
  resultLabel: {
    color: "#7a6040",
    fontSize: 13,
    letterSpacing: 2,
  },
  resultValue: {
    color: "#d4a050",
    fontSize: 22,
    letterSpacing: 1,
    fontWeight: 700,
  },
  resultBtn: {
    marginTop: 4,
    background: "rgba(30,15,5,0.8)",
    border: "1px solid #c8a060",
    color: "#c8a060",
    padding: "10px 28px",
    cursor: "pointer",
    fontFamily: "'Courier New', monospace",
    fontSize: 13,
    borderRadius: 2,
    letterSpacing: 2,
    width: "100%",
  },
  charChangesTitle: {
    color: "#7a6040",
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: "'Courier New', monospace",
    marginBottom: 10,
  },
  charChangesList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    textAlign: "left",
  },
  charChangeRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 16,
    fontFamily: "'Courier New', monospace",
  },
  charName: {
    color: "#a08060",
    fontSize: 13,
    minWidth: 48,
  },
  charDelta: {
    color: "#c8c8a0",
    fontSize: 12,
    letterSpacing: 1,
  },
  resultBtnGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 4,
  },
  resultBtnCommune: {
    background: "rgba(10,25,35,0.85)",
    border: "1px solid #4499bb",
    color: "#4499bb",
  },
  communeScreen: {
    width: "100vw",
    height: "100vh",
    background: "#060a0d",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Courier New', Courier, monospace",
  },
  communePanel: {
    background: "#0c1218",
    border: "1px solid #1e3a4a",
    borderRadius: 4,
    padding: "44px 60px",
    minWidth: 360,
    boxShadow: "0 0 60px rgba(40,120,180,0.10)",
  },
  communeHeader: {
    textAlign: "center",
    marginBottom: 4,
  },
  communeTitle: {
    color: "#60b8d8",
    fontSize: 40,
    letterSpacing: 10,
    fontWeight: 700,
    textShadow: "0 0 24px rgba(96,184,216,0.4)",
  },
  communeSubtitle: {
    color: "#2a5a70",
    fontSize: 12,
    letterSpacing: 4,
    marginTop: 6,
  },
  communeDivider: {
    height: 1,
    background: "#1e3a4a",
    margin: "20px 0",
  },
  charList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  communeSectionLabel: {
    color: "#2a5a70",
    fontSize: 11,
    letterSpacing: 3,
    textTransform: "uppercase" as const,
    marginBottom: 12,
    marginTop: 8,
  },
  charCard: {
    background: "#0a1520",
    border: "1px solid #1a2e3a",
    borderRadius: 3,
    padding: "12px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
    transition: "border-color 0.15s, background 0.15s",
  },
  charCardSelected: {
    border: "1px solid #2a6a88",
    background: "#0d1e2c",
  },
  charCardUnselected: {
    border: "1px solid #111c24",
    background: "#090e13",
  },
  charCardLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  charSelectDot: {
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    border: "1px solid #2a5a70",
    flexShrink: 0,
  },
  charCardName: {
    color: "#80a8b8",
    fontSize: 14,
    letterSpacing: 2,
    minWidth: 56,
  },
  charCardStats: {
    display: "flex",
    gap: 20,
  },
  charCardStress: {
    color: "#cc7755",
    fontSize: 12,
    letterSpacing: 1,
  },
  charCardMorale: {
    color: "#55cc88",
    fontSize: 12,
    letterSpacing: 1,
  },
  selectionSummary: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 14,
  },
  selectionLabel: {
    color: "#2a5a70",
    letterSpacing: 2,
    fontSize: 11,
  },
  selectionNames: {
    color: "#5a9ab8",
    flex: 1,
    fontSize: 12,
  },
  selectionCount: {
    color: "#2a5a70",
    fontSize: 11,
    letterSpacing: 1,
  },
  communeExploreBtn: {
    background: "rgba(5,15,25,0.8)",
    border: "1px solid #4499bb",
    color: "#4499bb",
    padding: "10px 28px",
    cursor: "pointer",
    fontFamily: "'Courier New', monospace",
    fontSize: 13,
    borderRadius: 2,
    letterSpacing: 2,
    width: "100%",
  },
  communeExploreBtnDisabled: {
    border: "1px solid #1a3a4a",
    color: "#1a3a4a",
    cursor: "default",
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
