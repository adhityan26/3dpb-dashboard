const KEY = "slizebiz-rincian";

export function getRincianPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setRincianPref(v: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    /* noop */
  }
}
