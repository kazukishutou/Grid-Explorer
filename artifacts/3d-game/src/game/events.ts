export type EventType = "resource";

export interface GameEvent {
  type: EventType;
  message: string;
}

const EVENT_MESSAGES: Record<EventType, string> = {
  resource: "資源を発見した！",
};

export function triggerEvent(type: EventType): GameEvent {
  return { type, message: EVENT_MESSAGES[type] };
}

export function checkForEvent(probability = 0.15): GameEvent | null {
  if (Math.random() < probability) {
    return triggerEvent("resource");
  }
  return null;
}
