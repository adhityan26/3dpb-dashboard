import mqtt from "mqtt";
import { fetchLayout } from "./saas-client";
import type { Logger } from "./interfaces";

const MQTT_AUTH_USERNAME_PLACEHOLDER = "agent";

export async function publishLayout(
  baseUrl: string,
  token: string,
  brokerPort: number,
  cydDeviceId: string,
  pin: string,
  logger: Logger,
): Promise<{ published: boolean }> {
  const result = await fetchLayout(baseUrl, token);
  if (!result.ok) {
    logger.error(`[layout-publisher] layout NOT published to 3dpb/cyd/${cydDeviceId}/layout -- fetchLayout failed: ${result.kind}`);
    return { published: false };
  }
  if (result.data === null) {
    logger.warn(`[layout-publisher] layout NOT published to 3dpb/cyd/${cydDeviceId}/layout -- no layout configured on the SaaS yet (404)`);
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
