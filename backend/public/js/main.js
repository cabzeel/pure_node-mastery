// main.js — Entry point: router, logout, log drawer and boot.
import { api } from './api.js';
import { ROUTES, TOKEN, USER_ID, endSession } from './config.js';
import { $, h } from './dom.js';
import { RES, collectionView } from './views/feed.js';
import { overviewView } from './views/overview.js';
import { postFormView } from './views/postForm.js';
import { loadMe, profileView } from './views/profile.js';
import { usersView } from './views/users.js';
import { workoutFormView } from './views/workoutForm.js';

const VIEWS = { overview: overviewView, feed: () => collectionView(RES.posts), workouts: () => collectionView(RES.workouts), profile: profileView, users: usersView, 'new-post': () => postFormView(), 'edit-post': (id) => postFormView(id), 'new-workout': () => workoutFormView(), 'edit-workout': (id) => workoutFormView(id) };
const NAV = { 'edit-post': 'feed', 'new-workout': 'workouts', 'edit-workout': 'workouts' }; // which sidebar link stays lit on sub-pages
function route() {
  const [key, arg] = (location.hash.replace('#/', '') || 'overview').split('/');
  const name = Object.hasOwn(VIEWS, key) ? key : 'overview';
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === (NAV[name] ?? name)));
  $('#view').replaceChildren(VIEWS[name](arg));
  scrollTo(0, 0);
}
addEventListener('hashchange', route);

$('#log-toggle').addEventListener('click', () => { $('#log').hidden = !$('#log').hidden; });
$('#logout').addEventListener('click', async () => {
  try { await api('POST', ROUTES.logout); } catch { /* leave anyway */ }
  endSession();
  location.assign('login.html');
});

if (!TOKEN) location.replace('login.html');
else if (!USER_ID) {
  $('#view').replaceChildren(h('div', { class: 'empty' },
    h('h3', {}, 'Your login did not include a user id'),
    h('p', { class: 'muted' }, 'Every route is now /api/users/<id>, so the login and signup responses must contain user.id. Add it on the server, then log in again.'),
    h('button', { class: 'btn', onclick: () => { endSession(); location.assign('login.html'); } }, 'Back to login')));
} else loadMe().catch((e) => console.warn('Startup request failed:', e.message)).finally(route);
