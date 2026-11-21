// api.js — Every request to the server goes through api(): adds the Authorization header, handles 401, keeps the API log.
import { BASE, TOKEN, endSession } from './config.js';
import { $, h, toast } from './dom.js';

export class ApiError extends Error {
  constructor(status, msg, missing = false) { super(msg); this.status = status; this.missing = missing; }
}
export const logList = $('#log-list');
export const log = (method, path, status, ms) => {
  logList.prepend(h('li', { class: status && status < 400 ? 'ok' : 'bad' }, h('span', {}, `${method} ${path}`), h('span', {}, `${status || 'ERR'} · ${ms}ms`)));
  while (logList.children.length > 40) logList.lastChild.remove();
};

export async function api(method, path, body) {
  const url = BASE + path;
  const t0 = performance.now();
  let res, raw, type = '';
  try {
    const isForm = body instanceof FormData; // multipart/form-data: the browser adds the content-type AND the boundary itself, so it must not be set here
    res = await fetch(url, {
      method,
      headers: { accept: 'application/json', authorization: `Bearer ${TOKEN}`, ...(body && !isForm && { 'content-type': 'application/json' }) },
      body: isForm ? body : body && JSON.stringify(body),
      cache: 'no-store', // never reuse a stale API response
    });
    type = res.headers.get('content-type') || '';
    raw = await res.text();
  } catch {
    log(method, path, 0, Math.round(performance.now() - t0));
    throw new ApiError(0, 'Could not reach the server. Is it running?');
  }
  log(method, path, res.status, Math.round(performance.now() - t0));

  if (res.status === 401) { // your backend answers bad/expired tokens with 401 (sessions last 15 min)
    endSession();
    toast('Session expired. Sending you to log in…', 'bad');
    setTimeout(() => location.assign('login.html'), 1200);
    throw new ApiError(401, 'Unauthorized');
  }
  if (res.ok && raw === '') return { success: true };      // empty 2xx (e.g. 204 after a delete)
  let data = null;
  try { data = JSON.parse(raw); } catch { /* not JSON */ }
  // Your static handler replies to unknown URLs with the HTML 404 page, so "not JSON" == route not built yet.
  if (!data) throw new ApiError(res.status, `Route not built yet (HTTP ${res.status}, ${type || 'no content-type'})`, true); // the detail shows what the server really sent
  if (!res.ok || data.success === false) throw new ApiError(res.status, data.message || `Request failed (${res.status})`);
  return data;
}
// Accept either {data:...} or {user:...}/{post:...} etc.
export const one = (d, noun) => d.data ?? d[noun] ?? d;
export const many = (d) => (Array.isArray(d) ? d : d.data ?? d.items ?? d.comments ?? d.users ?? d.posts ?? d.workouts ?? []);
