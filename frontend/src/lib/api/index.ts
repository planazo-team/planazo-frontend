import { config } from '../config';
import { liveApi } from './live';
import { mockApi } from './mock';
import type { Api } from './types';

export type { Api } from './types';

/** Punto único de acceso a los servicios. Se elige con NEXT_PUBLIC_API_MODE. */
export const api: Api = config.mode === 'live' ? liveApi : mockApi;
