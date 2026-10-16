/* dashboard.js — the whole dashboard front end (pure JS, no libraries).
 *
 * How it works:
 *  - The server only serves dashboard.html when ?token=... is in the URL, so all "pages"
 *    are views swapped inside this one page using the #hash (dashboard.html?token=X#/feed).
 *    The hash never reaches the server, so the token in the query string is never lost.
 *  - Every request goes through api(), which appends ?token= like your backend expects.
 *  - Backend paths live ONLY in ROUTES below. Change them there if your routes differ.
 */
(() => {
  'use strict';

  /* ============ 1. ROUTE MAP (edit to match your server) ============ */
  const BASE = location.origin;
  const TOKEN = new URLSearchParams(location.search).get('token');
  const ROUTES = {
    profile: '/api/user/profile',   // GET | PATCH {name,email} | DELETE
    password: '/api/user/password', // PATCH {currentPassword,newPassword}
    posts: '/api/posts',            // GET | POST ; /:id -> GET | PUT | DELETE
    workouts: '/api/workouts',      // GET | POST ; /:id -> GET | PUT | DELETE
    logout: '/api/logout',          // POST (already built)
  };

  /* ============ 2. TINY HELPERS ============ */
  const $ = (s, r = document) => r.querySelector(s);
  // h('div', {class:'x', onclick:fn}, child, 'text') -> element. Strings become text nodes, so user content can't inject HTML.
  const h = (tag, a = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(a)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    el.append(...kids.flat().filter((k) => k != null && k !== false));
    return el;
  };
  const fmt = (t) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const toast = (msg, kind = 'ok') => {
    const t = h('div', { class: `toast ${kind}` }, msg);
    $('#toasts').append(t);
    setTimeout(() => t.remove(), 3500);
  };

  /* ============ 3. API LAYER + LOG ============ */
  class ApiError extends Error {
    constructor(status, msg, missing = false) { super(msg); this.status = status; this.missing = missing; }
  }
  const logList = $('#log-list');
  const log = (method, path, status, ms) => {
    logList.prepend(h('li', { class: status && status < 400 ? 'ok' : 'bad' }, h('span', {}, `${method} ${path}`), h('span', {}, `${status || 'ERR'} · ${ms}ms`)));
    while (logList.children.length > 40) logList.lastChild.remove();
  };

  async function api(method, path, body) {
    const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(TOKEN)}`;
    const t0 = performance.now();
    let res, raw;
    try {
      res = await fetch(url, {
        method,
        headers: { accept: 'application/json', ...(body && { 'content-type': 'application/json' }) },
        body: body && JSON.stringify(body),
      });
      raw = await res.text();
    } catch {
      log(method, path, 0, Math.round(performance.now() - t0));
      throw new ApiError(0, 'Could not reach the server. Is it running?');
    }
    log(method, path, res.status, Math.round(performance.now() - t0));

    if (res.status === 401) { // your backend answers bad/expired tokens with 401 (sessions last 15 min)
      toast('Session expired. Sending you to log in…', 'bad');
      setTimeout(() => location.assign('login.html'), 1200);
      throw new ApiError(401, 'Unauthorized');
    }
    let data = null;
    try { data = JSON.parse(raw); } catch { /* not JSON */ }
    // Your static handler replies to unknown URLs with the HTML 404 page, so "not JSON" == route not built yet.
    if (!data) throw new ApiError(res.status, 'Route not built yet', true);
    if (!res.ok || data.success === false) throw new ApiError(res.status, data.message || `Request failed (${res.status})`);
    return data;
  }
  // Accept either {data:...} or {user:...}/{post:...} etc.
  const one = (d, noun) => d.data ?? d[noun] ?? d;
  const many = (d) => (Array.isArray(d) ? d : d.data ?? d.items ?? d.posts ?? d.workouts ?? []);

  /* ============ 4. MODAL (forms + confirms) ============ */
  const dlg = $('#modal');
  function fieldEl(f, val = '') {
    const id = `f-${f.name}`;
    let input;
    if (f.type === 'textarea') input = h('textarea', { id, name: f.name, rows: 4, required: f.required, maxlength: f.max });
    else if (f.type === 'select') input = h('select', { id, name: f.name }, f.options.map((o) => h('option', { value: o, selected: o === val }, o)));
    else input = h('input', { id, name: f.name, type: f.type || 'text', required: f.required, min: f.min, autocomplete: f.auto || 'off' });
    if (f.type !== 'select') input.value = val ?? '';
    return h('div', { class: 'field' }, h('label', { for: id }, f.label), input);
  }
  // Resolves to the form values (an object), or null if cancelled.
  const ask = ({ title, fields = [], values = {}, confirm, danger, submit = 'Save' }) =>
    new Promise((resolve) => {
      const form = h('form', { class: 'stack' },
        h('h2', {}, title),
        confirm && h('p', { class: 'muted' }, confirm),
        fields.map((f) => fieldEl(f, values[f.name])),
        h('div', { class: 'row end' },
          h('button', { type: 'button', class: 'btn ghost', onclick: () => dlg.close() }, 'Cancel'),
          h('button', { type: 'submit', class: `btn${danger ? ' danger' : ''}` }, submit)));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(form));
        fields.forEach((f) => { if (f.type === 'number' && v[f.name] !== '') v[f.name] = Number(v[f.name]); });
        resolve(v);
        dlg.close();
      });
      dlg.replaceChildren(form);
      dlg.addEventListener('close', () => resolve(null), { once: true });
      dlg.showModal();
    });

  /* ============ 5. SHARED UI PIECES ============ */
  const contract = (path, fields) => [
    `GET    ${path}        -> { success:true, data:[ ... ] }`,
    `POST   ${path}        <- { ${fields.join(', ')} }`,
    `GET    ${path}/:id    -> { success:true, data:{ ... } }`,
    `PUT    ${path}/:id    <- { ${fields.join(', ')} }`,
    `DELETE ${path}/:id`,
  ].join('\n');

  function errorBox(e, spec, retry) {
    if (!e.missing) {
      return h('div', { class: 'empty' }, h('p', { class: 'bad' }, e.message), retry && h('button', { class: 'btn ghost', onclick: retry }, 'Retry'));
    }
    return h('div', { class: 'empty' },
      h('h3', {}, 'This route is not built yet'),
      h('p', { class: 'muted' }, 'The server replied with its 404 page instead of JSON. Build these routes and this page comes alive:'),
      h('pre', {}, spec));
  }

  function formCard(title, fields, values, run, label = 'Save changes', cls = '') {
    const form = h('form', { class: 'stack' }, fields.map((f) => fieldEl(f, values?.[f.name])), h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit' }, label)));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button', form);
      btn.disabled = true;
      try { await run(Object.fromEntries(new FormData(form)), form); }
      catch (err) { toast(err.missing ? `Route not built yet (${title})` : err.message, 'bad'); }
      finally { btn.disabled = false; }
    });
    return h('section', { class: `card ${cls}` }, h('h3', {}, title), form);
  }

  /* ============ 6. RESOURCES (Feed + Workouts share one CRUD view) ============ */
  const RES = {
    posts: {
      title: 'Feed', sub: 'Share updates with the community.', noun: 'post', btn: '+ New post', path: ROUTES.posts,
      fields: [{ name: 'content', label: 'Post', type: 'textarea', required: true, max: 500 }],
      render: (it) => h('p', { class: 'post' }, it.content),
    },
    workouts: {
      title: 'Workouts', sub: 'Log and manage your sessions.', noun: 'workout', btn: '+ Log workout', path: ROUTES.workouts,
      fields: [
        { name: 'title', label: 'Title', required: true, max: 80 },
        { name: 'type', label: 'Type', type: 'select', options: ['Strength', 'Cardio', 'Mobility', 'Other'] },
        { name: 'duration', label: 'Duration (minutes)', type: 'number', required: true, min: 1 },
        { name: 'notes', label: 'Notes', type: 'textarea', max: 300 },
      ],
      render: (it) => [h('h3', {}, it.title), h('p', { class: 'muted' }, `${it.type || 'Other'} · ${it.duration ?? '?'} min`), it.notes && h('p', { class: 'post' }, it.notes)],
    },
  };

  let me = null; // current user, loaded once at boot
  const owner = (it) => it.userId ?? it.authorId ?? it.ownerId;
  // Show Edit/Delete only on your own items. If the API sends no owner info, assume yours.
  const owned = (it) => it.isMine ?? (owner(it) === undefined || owner(it) === me?.id);

  function collectionView(r) {
    const spec = contract(r.path, r.fields.map((f) => f.name));
    const body = h('div', { class: r.noun === 'post' ? 'feed' : 'grid' });
    const root = h('div', { class: 'stack' },
      h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, r.title), h('p', { class: 'muted' }, r.sub)), h('button', { class: 'btn', onclick: add }, r.btn)),
      body);

    const card = (it) => h('article', { class: 'card' },
      r.render(it),
      h('footer', { class: 'card-foot' },
        h('span', { class: 'muted' }, [it.author || it.authorName, it.createdAt && fmt(it.createdAt)].filter(Boolean).join(' · ')),
        owned(it) && h('span', { class: 'row' },
          h('button', { class: 'link', onclick: () => edit(it) }, 'Edit'),
          h('button', { class: 'link bad', onclick: () => del(it) }, 'Delete'))));

    async function load() {                                   // READ (list)
      body.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
      try {
        const items = many(await api('GET', r.path));
        body.replaceChildren(...(items.length ? items.map(card) : [h('div', { class: 'empty' }, h('h3', {}, `No ${r.noun}s yet`), h('p', { class: 'muted' }, 'Use the button above to create the first one.'))]));
      } catch (e) { body.replaceChildren(errorBox(e, spec, load)); }
    }
    async function add() {                                    // CREATE
      const v = await ask({ title: r.btn.replace('+ ', ''), fields: r.fields, submit: 'Create' });
      if (!v) return;
      try { await api('POST', r.path, v); toast(`${r.noun} created`); load(); } catch (e) { toast(e.message, 'bad'); }
    }
    async function edit(it) {                                 // READ (one) + UPDATE
      let cur = it;
      try { cur = one(await api('GET', `${r.path}/${it.id}`), r.noun); } catch (e) { if (!e.missing) return toast(e.message, 'bad'); }
      const v = await ask({ title: `Edit ${r.noun}`, fields: r.fields, values: cur });
      if (!v) return;
      try { await api('PUT', `${r.path}/${it.id}`, v); toast('Saved'); load(); } catch (e) { toast(e.message, 'bad'); }
    }
    async function del(it) {                                  // DELETE
      if (!(await ask({ title: `Delete this ${r.noun}?`, confirm: 'This cannot be undone.', danger: true, submit: 'Delete' }))) return;
      try { await api('DELETE', `${r.path}/${it.id}`); toast('Deleted'); load(); } catch (e) { toast(e.message, 'bad'); }
    }
    load();
    return root;
  }

  /* ============ 7. OVERVIEW ============ */
  function overviewView() {
    const stats = h('div', { class: 'grid stats' });
    const checks = h('section', { class: 'card' }, h('h3', {}, 'Backend route status'), h('p', { class: 'muted' }, 'Live GET probes. Write routes (POST/PUT/DELETE) are not probed so nothing gets changed.'));
    const root = h('div', { class: 'stack' },
      h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, `Welcome${me?.name ? `, ${me.name.split(' ')[0]}` : ''}`), h('p', { class: 'muted' }, 'Every action here is a real request to your Node server. Open "API log" (bottom right) to watch them.'))),
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
      stats.append(
        stat('Posts in feed', posts ? posts.length : '–'),
        stat('Workouts logged', wk ? wk.length : '–'),
        stat('Minutes trained', wk ? wk.reduce((s, w) => s + (Number(w.duration) || 0), 0) : '–'));
    });
    return root;
  }

  /* ============ 8. PROFILE (read / update / password / delete account) ============ */
  async function loadMe() {
    const d = await api('GET', ROUTES.profile);
    me = d.data ?? d.user ?? d;
    $('#me-name').textContent = me.name || 'You';
    $('#me-email').textContent = me.email || '';
    $('#avatar').textContent = (me.name || me.email || '?')[0].toUpperCase();
  }

  // Read-only snapshot of what the server currently has on you. Anything new you add to the
  // profile response later (bio, phone, createdAt...) shows up here automatically.
  const HIDDEN = ['password', 'salt', 'token', 'hash']; // never display these, even if the API leaks them
  const labelOf = (k) => k.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/^./, (c) => c.toUpperCase());
  function detailsCard() {
    const first = ['name', 'email', 'id'];
    const keys = [...first.filter((k) => k in me), ...Object.keys(me).filter((k) => !first.includes(k))]
      .filter((k) => !HIDDEN.includes(k.toLowerCase()) && typeof me[k] !== 'object');
    return h('section', { class: 'card', id: 'details' },
      h('h3', {}, 'Your details'),
      h('dl', { class: 'details' }, keys.flatMap((k) => [
        h('dt', {}, labelOf(k)),
        h('dd', {}, /at$/i.test(k) && Number(me[k]) ? fmt(Number(me[k])) : String(me[k])),
      ])));
  }

  function profileView() {
    const root = h('div', { class: 'stack' }, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Profile'), h('p', { class: 'muted' }, 'Manage your account details.'))));
    const spec = `GET    ${ROUTES.profile}   -> { success:true, user:{ name, email } }\nPATCH  ${ROUTES.profile}   <- { name, email }\nDELETE ${ROUTES.profile}\nPATCH  ${ROUTES.password}  <- { currentPassword, newPassword }`;

    (async () => {
      try { await loadMe(); } catch (e) { root.append(errorBox(e, spec)); return; }
      root.append(
        detailsCard(),
        formCard('Edit your details', [
          { name: 'name', label: 'Full name', required: true, auto: 'name' },
          { name: 'email', label: 'Email', type: 'email', required: true, auto: 'email' },
        ], me, async (v) => {                                  // UPDATE
          const d = await api('PATCH', ROUTES.profile, v);
          me = { ...me, ...(d.data ?? d.user ?? v) };
          $('#me-name').textContent = me.name; $('#me-email').textContent = me.email; $('#avatar').textContent = me.name[0].toUpperCase();
          $('#details')?.replaceWith(detailsCard());
          toast('Profile updated');
        }),
        formCard('Change password', [
          { name: 'currentPassword', label: 'Current password', type: 'password', required: true, auto: 'current-password' },
          { name: 'newPassword', label: 'New password', type: 'password', required: true, auto: 'new-password' },
          { name: 'confirmPassword', label: 'Confirm new password', type: 'password', required: true, auto: 'new-password' },
        ], null, async (v, form) => {
          if (v.newPassword !== v.confirmPassword) throw new Error('New passwords do not match.');
          await api('PATCH', ROUTES.password, { currentPassword: v.currentPassword, newPassword: v.newPassword });
          form.reset(); toast('Password changed');
        }, 'Update password'),
        h('section', { class: 'card danger-zone' },
          h('h3', { class: 'bad' }, 'Delete account'),
          h('p', { class: 'muted' }, 'Permanently removes your account and signs you out everywhere.'),
          h('div', { class: 'row' }, h('button', { class: 'btn danger', onclick: async () => {   // DELETE
            if (!(await ask({ title: 'Delete your account?', confirm: 'This cannot be undone.', danger: true, submit: 'Delete account' }))) return;
            try { await api('DELETE', ROUTES.profile); location.assign('signup.html'); } catch (e) { toast(e.missing ? 'Route not built yet (delete account)' : e.message, 'bad'); }
          } }, 'Delete my account'))));
    })();
    return root;
  }

  /* ============ 9. ROUTER + BOOT ============ */
  const VIEWS = { overview: overviewView, feed: () => collectionView(RES.posts), workouts: () => collectionView(RES.workouts), profile: profileView };
  function route() {
    const key = location.hash.replace('#/', '') || 'overview';
    const name = VIEWS[key] ? key : 'overview';
    document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
    $('#view').replaceChildren(VIEWS[name]());
    scrollTo(0, 0);
  }
  addEventListener('hashchange', route);

  $('#log-toggle').addEventListener('click', () => { $('#log').hidden = !$('#log').hidden; });
  $('#logout').addEventListener('click', async () => {
    try { await api('POST', ROUTES.logout); } catch { /* leave anyway */ }
    location.assign('login.html');
  });

  if (!TOKEN) location.replace('login.html');
  else loadMe().catch(() => { /* profile route may not exist yet; the UI still works */ }).finally(route);
})();