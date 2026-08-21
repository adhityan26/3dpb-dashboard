// Di-inject `define` electron.vite.config.ts (target `renderer`) saat build sungguhan --
// duplikasi kecil dgn pola sama di src/main/saas-client.ts (target `main`), TAPI harus modul
// terpisah: Vite mem-bundle main/renderer sbg build target beda, tak bisa saling import.
declare const __AGENT_VERSION__: string | undefined;
declare const __AGENT_COMMIT_HASH__: string | undefined;

const AGENT_VERSION = typeof __AGENT_VERSION__ === "string" ? __AGENT_VERSION__ : "0.0.0";
const AGENT_COMMIT_HASH = typeof __AGENT_COMMIT_HASH__ === "string" ? __AGENT_COMMIT_HASH__ : "nogit";

// Gaya semver build-metadata ("+hash") -- lihat komentar AGENT_BUILD_ID di saas-client.ts
// buat alasan lengkap kenapa commit hash (bukan naik versi) yang dipakai selama staging.
export const AGENT_BUILD_ID = `${AGENT_VERSION}+${AGENT_COMMIT_HASH}`;
