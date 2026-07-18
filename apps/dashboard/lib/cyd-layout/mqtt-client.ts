import mqtt from 'mqtt'

const BROKER_URL = process.env.MQTT_BROKER_URL ?? 'mqtt://192.168.88.113:1883'

export function readRetained(topic: string, timeoutMs = 5000): Promise<string | null> {
  return new Promise((resolve) => {
    const client = mqtt.connect(BROKER_URL, { connectTimeout: 4000 })
    const timer = setTimeout(() => { client.end(true); resolve(null) }, timeoutMs)
    client.on('connect', () => client.subscribe(topic))
    client.on('message', (_t, msg) => {
      clearTimeout(timer)
      client.end(true)
      resolve(msg.toString())
    })
    client.on('error', () => { clearTimeout(timer); client.end(true); resolve(null) })
  })
}

export function publishRetained(topic: string, payload: string): Promise<boolean> {
  return new Promise((resolve) => {
    const client = mqtt.connect(BROKER_URL, { connectTimeout: 4000 })
    client.on('connect', () => {
      client.publish(topic, payload, { retain: true }, (err) => {
        client.end(true)
        resolve(!err)
      })
    })
    client.on('error', () => { client.end(true); resolve(false) })
  })
}

// Konfirmasi save: publish config, lalu subscribe topic readback dan bandingkan.
export function publishAndConfirm(configTopic: string, readbackTopic: string, payload: string, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const client = mqtt.connect(BROKER_URL, { connectTimeout: 4000 })
    const timer = setTimeout(() => { client.end(true); resolve(false) }, timeoutMs)
    client.on('connect', () => {
      client.subscribe(readbackTopic)
      client.publish(configTopic, payload, { retain: true })
    })
    client.on('message', (_t, msg) => {
      if (msg.toString() === payload) {
        clearTimeout(timer)
        client.end(true)
        resolve(true)
      }
      // payload beda (mis. retained lama yg belum ke-overwrite) -> tunggu pesan berikutnya sampai timeout
    })
    client.on('error', () => { clearTimeout(timer); client.end(true); resolve(false) })
  })
}
