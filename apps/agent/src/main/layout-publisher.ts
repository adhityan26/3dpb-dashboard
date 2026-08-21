import mqtt from "mqtt";
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
  if (!result.ok || result.data === null) return { published: false };

  const client = await mqtt.connectAsync(`mqtt://127.0.0.1:${brokerPort}`, {
    username: MQTT_AUTH_USERNAME_PLACEHOLDER,
    password: pin,
  });
  await client.publishAsync(`3dpb/cyd/${cydDeviceId}/layout`, JSON.stringify(result.data), { retain: true });
  await client.endAsync();
  return { published: true };
}
