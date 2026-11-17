import { config } from '../config';
import { gateway } from '../mock/gateway';
import { backend } from '../mock/services';
import { getSession } from '../session';
import { RealtimeClient } from './client';
import { wsTransport } from './ws';

export type { ConnState, ConnStatus } from './client';

type G = typeof globalThis & { __planazoRealtime?: RealtimeClient };

/** Una sola conexión de tiempo real por pestaña. Solo se crea en el navegador. */
export function realtime(): RealtimeClient {
  const g = globalThis as G;
  if (g.__planazoRealtime) return g.__planazoRealtime;

  let client: RealtimeClient;
  if (config.mode === 'live') {
    // Sin NEXT_PUBLIC_REALTIME_URL no hay canal en vivo: la app sigue funcionando por HTTP.
    const transport = config.realtimeUrl
      ? wsTransport(config.realtimeUrl, () => getSession()?.token)
      : { connect() {}, send() {}, close() {} };
    client = new RealtimeClient(transport);
  } else {
    backend(); // arranca la actividad simulada de la ciudad
    client = new RealtimeClient(gateway().transport());
  }
  g.__planazoRealtime = client;
  return client;
}
