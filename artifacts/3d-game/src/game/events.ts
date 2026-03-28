export type EventType = "resource" | "enemy" | "debate";

export interface GameEvent {
  type: EventType;
  message: string;
}

const EVENT_MESSAGES: Record<"resource" | "enemy", string> = {
  resource: "資源を発見した！",
  enemy: "敵と遭遇した！",
};

type Personality = "aggressive" | "cautious" | "neutral";
type Vote = "fight" | "escape" | "wait";

interface TeamMember {
  name: string;
  personality: Personality;
}

const TEAM: TeamMember[] = [
  { name: "アレス", personality: "aggressive" },
  { name: "セイラ", personality: "cautious"   },
  { name: "レン",   personality: "neutral"    },
];

const PERSONALITY_OPINIONS: Record<Personality, string[]> = {
  aggressive: ["戦うべきだ！", "ここで退くわけにはいかない！", "相手は弱そうだ、やれる！"],
  cautious:   ["危険だ、逃げよう", "無理はしないほうがいい…", "今は引くべきだ"],
  neutral:    ["戦うべきだ！", "逃げよう", "様子を見るべきだ"],
};

// Each personality maps to a fixed vote, or "random" for neutral
const PERSONALITY_VOTE: Record<Personality, Vote | "random"> = {
  aggressive: "fight",
  cautious:   "escape",
  neutral:    "random",
};

const VOTE_OPTIONS: Vote[] = ["fight", "escape", "wait"];

// Vote label → display text and outcome messages
const VOTE_TO_RESULT: Record<Vote, string> = {
  fight:  "戦闘開始",
  escape: "逃走",
  wait:   "様子見",
};

const OUTCOME_MESSAGES: Record<string, string[]> = {
  "戦闘開始": ["戦闘に突入した！"],
  "逃走":     ["なんとか逃げ切った！", "ギリギリで離脱した…", "逃走に成功した。"],
  "様子見":   ["敵の動きを観察している…", "じっと息を潜めた。", "敵はやがて去っていった。"],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function triggerEvent(type: "resource" | "enemy"): GameEvent {
  return { type, message: EVENT_MESSAGES[type] };
}

// Returns a sequence of {message, delay} to display after an enemy encounter.
export function getDebateSequence(): Array<{ message: string; delay: number }> {
  const votes: Record<Vote, number> = { fight: 0, escape: 0, wait: 0 };

  // Each member speaks once and casts a vote aligned with their personality
  const sequence = TEAM.map((member, i) => {
    const voteKey = PERSONALITY_VOTE[member.personality];
    const vote: Vote = voteKey === "random" ? pickRandom(VOTE_OPTIONS) : voteKey;
    votes[vote]++;

    const opinion = pickRandom(PERSONALITY_OPINIONS[member.personality]);
    return {
      message: `${member.name}：「${opinion}」`,
      delay: 800 + i * 700,
    };
  });

  // Determine winner by vote count; break ties randomly
  const entries = Object.entries(votes) as [Vote, number][];
  const maxCount = Math.max(...entries.map(([, n]) => n));
  const winners = entries.filter(([, n]) => n === maxCount).map(([v]) => v);
  const winningVote = pickRandom(winners);
  const result = VOTE_TO_RESULT[winningVote];

  const conclusionDelay = 800 + TEAM.length * 700;
  sequence.push({ message: `→ 結論：${result}`, delay: conclusionDelay });

  const outcome = pickRandom(OUTCOME_MESSAGES[result]);
  sequence.push({ message: outcome, delay: conclusionDelay + 900 });

  return sequence;
}

export function checkForEvent(probability = 0.15): GameEvent | null {
  if (Math.random() < probability) {
    return triggerEvent(Math.random() < 0.6 ? "resource" : "enemy");
  }
  return null;
}
