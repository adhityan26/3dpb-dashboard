const KEY = "slizebiz-rincian";

// Rincian tampil secara default; hanya tersembunyi bila user mematikannya ("0").
export function getRincianPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
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
