import type { Engine, MqttReporter } from "@3pb/printer-monitor-core";

let engine: Engine | null = null;
let brokerPort: number | null = null;
let brokerPin: string | null = null;
// MqttReporter(s) yang dibuat startEngine() bareng Engine yang lagi aktif. Engine.stop()
// (packages/printer-monitor-core) CUMA stop connector+timer, tidak pernah nutup reporter-nya
// sendiri -- jadi siapa pun yang ganti Engine (agent:sync) WAJIB juga nutup reporter lama
// lewat state ini, kalau tidak tiap restart bikin 1 koneksi MQTT baru yang gak pernah
// ditutup (leak, lihat Task 13 review post-fix-wave).
let reporters: MqttReporter[] = [];

export function setEngine(e: Engine | null): void { engine = e; }
export function getEngine(): Engine | null { return engine; }
export function setBrokerPort(port: number | null): void { brokerPort = port; }
export function getBrokerPort(): number | null { return brokerPort; }
export function setBrokerPin(pin: string | null): void { brokerPin = pin; }
export function getBrokerPin(): string | null { return brokerPin; }
export function setReporters(r: MqttReporter[]): void { reporters = r; }
export function getReporters(): MqttReporter[] { return reporters; }

let updateAvailable = false;

export function setUpdateAvailable(available: boolean): void { updateAvailable = available; }
export function getUpdateAvailable(): boolean { return updateAvailable; }

let credentialStoreDegraded = false;

export function setCredentialStoreDegraded(degraded: boolean): void { credentialStoreDegraded = degraded; }
export function getCredentialStoreDegraded(): boolean { return credentialStoreDegraded; }
