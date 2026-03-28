export type EventType = "resource" | "enemy";

export interface GameEvent {
  type: EventType;
  message: string;
}

const EVENT_MESSAGES: Record<EventType, string> = {
  resource: "資源を発見した！",
  enemy: "敵と遭遇した！",
};

export function triggerEvent(type: EventType): GameEvent {
  return { type, message: EVENT_MESSAGES[type] };
}

export function checkForEvent(probability = 0.15): GameEvent | null {
  if (Math.random() < probability) {
    const roll = Math.random();
    if (roll < 0.6) {
      return triggerEvent("resource");
    } else {
      return triggerEvent("enemy");
    }
  }
  return null;
}
