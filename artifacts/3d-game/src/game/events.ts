export type EventType = "resource" | "enemy" | "debate";

export interface GameEvent {
  type: EventType;
  message: string;
}

const EVENT_MESSAGES: Record<"resource" | "enemy", string> = {
  resource: "資源を発見した！",
  enemy: "敵と遭遇した！",
};

type Personality = "aggressive" | "cautious" | "neutral" | "chaotic";
type Vote = "fight" | "escape" | "wait";

interface TeamMember {
  name: string;
  personality: Personality;
  isLeader: boolean;
  dislikesLeader: boolean;
}

const TEAM: TeamMember[] = [
  { name: "アレス", personality: "aggressive", isLeader: true,  dislikesLeader: false },
  { name: "セイラ", personality: "cautious",   isLeader: false, dislikesLeader: true  },
  { name: "レン",   personality: "neutral",    isLeader: false, dislikesLeader: false },
  { name: "カイ",   personality: "chaotic",    isLeader: false, dislikesLeader: false },
];

// Personality → the vote it always casts ("random" for neutral/chaotic)
const PERSONALITY_VOTE: Record<Personality, Vote | "random"> = {
  aggressive: "fight",
  cautious:   "escape",
  neutral:    "random",
  chaotic:    "random",
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

// ─── TEST MODE ────────────────────────────────────────────────
// true  → 全員ランダム投票・全員weight=1・リーダー/反発無効
// false → 通常ロジック（personality固定・leader weight=2・反発あり）
const TEST_MODE = true;
// ─────────────────────────────────────────────────────────────

export function triggerEvent(type: "resource" | "enemy"): GameEvent {
  return { type, message: EVENT_MESSAGES[type] };
}

// Returns a sequence of {message, delay} to display after an enemy encounter.
export function getDebateSequence(): Array<{ message: string; delay: number }> {
  const votes: Record<Vote, number> = { fight: 0, escape: 0, wait: 0 };

  let leaderVote: Vote | null = null;

  // Rebellion suffix lines shown when a member defies the leader
  const REBELLION_LINES = [
    "…納得できないが",
    "本当にそれでいいのか？",
    "あなたの判断は疑わしい",
  ];

  const sequence = TEAM.map((member, i) => {
    let vote: Vote;
    let weight: number;
    let rebelled = false;

    if (TEST_MODE) {
      // テストモード：全員ランダム・全員weight=1・リーダー/反発無効
      vote = pickRandom(VOTE_OPTIONS);
      weight = 1;
    } else {
      // 通常ロジック
      // Step 1: personality に基づく投票
      const voteKey = PERSONALITY_VOTE[member.personality];
      vote = voteKey === "random" ? pickRandom(VOTE_OPTIONS) : voteKey;

      // Step 2: 反発処理
      if (member.dislikesLeader && leaderVote && Math.random() < 0.5) {
        const opposite: Vote =
          leaderVote === "fight"  ? "escape" :
          leaderVote === "escape" ? "fight"  :
          pickRandom(["fight", "escape"] as Vote[]);
        vote = opposite;
        rebelled = true;
      }

      // Step 3: リーダーは2票
      weight = member.isLeader ? 2 : 1;
    }

    votes[vote] += weight;
    if (member.isLeader) leaderVote = vote;

    // 表示テキスト
    const label = TEST_MODE
      ? member.name
      : member.isLeader ? `${member.name}（リーダー）` : member.name;

    let messageText: string;
    if (TEST_MODE || member.personality === "chaotic") {
      // テストモード or カイ → 投票内容を直接表示
      messageText = `${label}：「（DEBUG）${vote} を選択」`;
    } else {
      const opinion = pickRandom(VOTE_OPINIONS[vote]);
      const suffix = rebelled ? `　${pickRandom(REBELLION_LINES)}` : "";
      messageText = `${label}：「${opinion}」${suffix}`;
    }

    console.log({ name: member.name, vote, weight, rebelled: TEST_MODE ? "N/A(test)" : rebelled });

    return {
      message: messageText,
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
    return triggerEvent(Math.random() < 0.1 ? "resource" : "enemy");
  }
  return null;
}
