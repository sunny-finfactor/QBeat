const ROOM_NICKNAME_KEY = "qbeat:nickname";

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function getStoredNickname() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(ROOM_NICKNAME_KEY) ?? "";
}

export function getOrCreateNickname() {
  const existing = getStoredNickname().trim();

  if (existing) {
    return existing;
  }

  const fallback = `Guest-${randomSuffix()}`;
  setStoredNickname(fallback);
  return fallback;
}

export function setStoredNickname(value: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ROOM_NICKNAME_KEY, value.trim());
}
