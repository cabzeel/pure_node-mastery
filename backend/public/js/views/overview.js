// views/overview.js — Overview page: route status probes and stats.
import { api, many } from '../api.js';
import { ROUTES } from '../config.js';
import { h } from '../dom.js';
import { state } from '../state.js';
import { workoutStats } from '../workouts.js';

export function overviewView() {
  const stats = h('div', { class: 'grid stats' });
  const checks = h('section', { class: 'card' }, h('h3', {}, 'Backend route status'), h('p', { class: 'muted' }, 'Live GET probes. Write routes (POST/PUT/DELETE) are not probed so nothing gets changed.'));
  const root = h('div', { class: 'stack' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, `Welcome${state.me?.name ? `, ${state.me.name.split(' ')[0]}` : ''}`), h('p', { class: 'muted' }, 'Every action here is a real request to your Node server. Open "API log" (bottom right) to watch them.'))),
    stats, checks);

  const probes = [['Profile', ROUTES.profile], ['Feed', ROUTES.posts], ['Workouts', ROUTES.workouts]];
  Promise.allSettled(probes.map(([, p]) => api('GET', p))).then((res) => {
    res.forEach((r, i) => {
      const [name, path] = probes[i];
      const state = r.status === 'fulfilled' ? ['live', ''] : r.reason.missing ? ['not built', 'off'] : ['error', 'err'];
      checks.append(h('div', { class: 'check' }, h('span', {}, `${name} `, h('code', {}, `GET ${path}`)), h('span', { class: `pill ${state[1]}` }, state[0])));
    });
    const stat = (label, val) => h('div', { class: 'card stat' }, h('b', {}, val), h('span', { class: 'muted' }, label));
    const posts = res[1].status === 'fulfilled' ? many(res[1].value) : null;
    const wk = res[2].status === 'fulfilled' ? many(res[2].value) : null;
    const ws = wk ? workoutStats(wk) : null;
    stats.append(
      stat('Posts in feed', posts ? posts.length : '–'),
      stat('Workouts logged', wk ? wk.length : '–'),
      stat('Sessions this week', ws ? ws.sessions : '–'),
      stat('Day streak', ws ? ws.streak : '–'),
      // lifters see volume; bodyweight-only users would see 0 kg forever, so they see total reps instead
      ws && ws.volume > 0 ? stat('Volume this week', `${Math.round(ws.volume).toLocaleString()} kg`) : stat('Reps this week', ws ? ws.reps : '–'));
  });
  return root;
}
