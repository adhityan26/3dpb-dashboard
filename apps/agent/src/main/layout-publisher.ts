import mqtt from "mqtt";
import log from "electron-log/main";
import { fetchLayout } from "./saas-client";

const MQTT_AUTH_USERNAME_PLACEHOLDER = "agent";

/** cydDeviceId "default" sesuai kontrak lama §13 (1 layar CYD per akun, MVP sub-proyek 1). pin dipakai sebagai password CONNECT (lihat broker.ts authenticate). */
export async function publishLayout(
  token: string,
  brokerPort: number,
  cydDeviceId: string,
  pin: string,
): Promise<{ published: boolean }> {
  const result = await fetchLayout(token);
  // Not publishing is the one failure the CYD can never explain by itself (it just shows
  // "Tampilan belum diatur" forever), so every skipped publish gets a line in the log.
  if (!result.ok) {
    log.error(`[layout-publisher] layout NOT published to 3dpb/cyd/${cydDeviceId}/layout -- fetchLayout failed: ${result.kind}`);
    return { published: false };
  }
  if (result.data === null) {
    log.warn(`[layout-publisher] layout NOT published to 3dpb/cyd/${cydDeviceId}/layout -- no layout configured on the SaaS yet (404)`);
    return { published: false };
  }

  const client = await mqtt.connectAsync(`mqtt://127.0.0.1:${brokerPort}`, {
    username: MQTT_AUTH_USERNAME_PLACEHOLDER,
    password: pin,
  });
  await client.publishAsync(`3dpb/cyd/${cydDeviceId}/layout`, JSON.stringify(result.data), { retain: true });
  await client.endAsync();
  return { published: true };
}
