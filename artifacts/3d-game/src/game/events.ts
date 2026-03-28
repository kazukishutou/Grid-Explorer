export type EventType = "resource" | "enemy" | "debate";

export interface GameEvent {
  type: EventType;
  message: string;
}

const EVENT_MESSAGES: Record<"resource" | "enemy", string> = {
  resource: "資源を発見した！",
  enemy: "敵と遭遇した！",
};

const DEBATE_OPINIONS = [
  "戦うべきだ！",
  "危険だ、逃げよう",
  "様子を見るべきだ",
];

const DEBATE_RESULTS = ["戦闘開始", "逃走", "様子見"];

const OUTCOME_MESSAGES: Record<string, string[]> = {
  "戦闘開始": ["戦闘に突入した！"],
  "逃走":     ["なんとか逃げ切った！", "ギリギリで離脱した…", "逃走に成功した。"],
  "様子見":   ["敵の動きを観察している…", "じっと息を潜めた。", "敵はやがて去っていった。"],
};

export function triggerEvent(type: "resource" | "enemy"): GameEvent {
  return { type, message: EVENT_MESSAGES[type] };
}

// Returns a sequence of {message, delay} to display after an enemy encounter.
export function getDebateSequence(): Array<{ message: string; delay: number }> {
  const shuffled = [...DEBATE_OPINIONS].sort(() => Math.random() - 0.5);
  const sequence = shuffled.map((msg, i) => ({
    message: msg,
    delay: 800 + i * 700,
  }));

  const result = DEBATE_RESULTS[Math.floor(Math.random() * DEBATE_RESULTS.length)];
  const conclusionDelay = 800 + 3 * 700;
  sequence.push({ message: `→ 結論：${result}`, delay: conclusionDelay });

  const outcomes = OUTCOME_MESSAGES[result];
  const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
  sequence.push({ message: outcome, delay: conclusionDelay + 900 });

  return sequence;
}

export function checkForEvent(probability = 0.15): GameEvent | null {
  if (Math.random() < probability) {
    return triggerEvent(Math.random() < 0.6 ? "resource" : "enemy");
  }
  return null;
}
