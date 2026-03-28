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
  isLeader: boolean;
}

const TEAM: TeamMember[] = [
  { name: "アレス", personality: "aggressive", isLeader: true  },
  { name: "セイラ", personality: "cautious",   isLeader: false },
  { name: "レン",   personality: "neutral",    isLeader: false },
];

// Personality → the vote it always casts ("random" for neutral)
const PERSONALITY_VOTE: Record<Personality, Vote | "random"> = {
  aggressive: "fight",
  cautious:   "escape",
  neutral:    "random",
};

const VOTE_OPTIONS: Vote[] = ["fight", "escape", "wait"];

// Vote → display texts that match that vote (used for ALL members)
// This guarantees the spoken line always matches the actual vote cast.
const VOTE_OPINIONS: Record<Vote, string[]> = {
  fight:  ["戦うべきだ！", "ここで退くわけにはいかない！", "相手は弱そうだ、やれる！"],
  escape: ["危険だ、逃げよう", "無理はしないほうがいい…", "今は引くべきだ"],
  wait:   ["様子を見るべきだ", "じっと見守ろう", "急ぐことはない"],
};

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

  let leaderVote: Vote | null = null;

  const sequence = TEAM.map((member, i) => {
    // Step 1: determine the vote
    const voteKey = PERSONALITY_VOTE[member.personality];
    const vote: Vote = voteKey === "random" ? pickRandom(VOTE_OPTIONS) : voteKey;

    // Step 2: leader counts as 2 votes, others as 1
    const weight = member.isLeader ? 2 : 1;
    votes[vote] += weight;
    if (member.isLeader) leaderVote = vote;

    // Step 3: pick display text that matches the same vote
    const opinion = pickRandom(VOTE_OPINIONS[vote]);
    const label = member.isLeader ? `${member.name}（リーダー）` : member.name;

    console.log({ name: member.name, isLeader: member.isLeader, vote, weight, opinion });

    return {
      message: `${label}：「${opinion}」`,
      delay: 800 + i * 700,
    };
  });

  console.log("votes:", votes);

  // Determine winner — most votes wins; ties go to the leader's vote
  const entries = Object.entries(votes) as [Vote, number][];
  const maxCount = Math.max(...entries.map(([, n]) => n));
  const winners = entries.filter(([, n]) => n === maxCount).map(([v]) => v);
  const winningVote =
    winners.length > 1 && leaderVote && winners.includes(leaderVote)
      ? leaderVote
      : pickRandom(winners);
  const result = VOTE_TO_RESULT[winningVote];

  console.log("winning vote:", winningVote, "→ result:", result);

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
