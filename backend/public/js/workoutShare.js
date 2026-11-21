// workoutShare.js — "Share" dialog for ONE workout: find a person, add them to its sharedWith list, or take them off it.
//
// The client only ever sends a user id; the server decides what sharing means and enforces it:
//   GET    /api/workouts/:id/share            -> the people it is shared with
//   POST   /api/workouts/:id/share            <- { userId, lifespan }   (lifespan = how long access lasts, in milliseconds)
//   DELETE /api/workouts/:id/share/:userId
// How the client learns an id: GET /api/users?q=... (id + name only for regular users).
// Until the server allows that (it answers 403 or has no such route) the dialog falls back to people who appear in the feed,
// so it works with only the share routes.
import { api, many } from "./api.js";
import { ROUTES, USER_ID } from "./config.js";
import { h, toast } from "./dom.js";
import { authorOf, authorPic, avatarNode, avatarOf, owner } from "./helpers.js";
import { dlg, errorBox } from "./ui.js";
import { DEFAULT_LIFESPAN, LIFESPANS, expiresMs, fmtRemaining } from "./workouts.js";

export const SHARE_SPEC = `GET    ${ROUTES.workouts}/:id/share            -> { success:true, data:[ { id, name, avatar?, expiresAt } ] }   (owner only; expired shares are left out)
POST   ${ROUTES.workouts}/:id/share            <- { userId, lifespan }   (owner only)
         lifespan = milliseconds, and must be EXACTLY one of: ${LIFESPANS.map((o) => `${o.ms} (${o.label})`).join(", ")}
         The server stores expiresAt = Date.now() + lifespan on ITS clock (never a timestamp from the client) and answers { success:true, data:{ expiresAt } }.
         400 bad id, yourself or bad lifespan, 404 unknown user, 409 already shared.
DELETE ${ROUTES.workouts}/:id/share/:userId   (owner only; 404 if that user is not in the list)
GET    ${ROUTES.users}?q=ada                   -> { success:true, data:[ { id, name, avatar? } ] }
         Any logged-in user may call it WITH q (2+ characters, max ~8 matches, id + name + avatar only, never email).
         Without q it stays master-admin only (403 for everyone else), so the Users page keeps working.

A share only counts while expiresAt is in the future. Check that on EVERY read of a shared workout (grant exists AND expiresAt > now), not only with a cleanup timer.
Each workout from GET ${ROUTES.workouts} also carries sharedWith: [ ...active shares ] (owner only) so its card can say "Shared with N".`;

const MAX_RESULTS = 8;
// Anything a server might call a user -> { id, name, avatar }
const person = (u) => ({
  id: String(u.id ?? u._id ?? ""),
  name: String(u.name || u.username || "Member"),
  avatar: avatarOf(u),
  exp: expiresMs(u.expiresAt), // epoch ms the share ends, or null (search results have none)
});

export function shareDialog(workout, { onChange } = {}) {
  let shared = null; // null while loading, then [{ id, name, avatar }]
  let found = []; // current search results
  let busy = false; // one request at a time, so a double-click can't add twice
  let changed = false;
  let latest = 0; // search counter: a slow answer to an old search is ignored
  let feedMode = false; // true once /api/users?q= turned out not to be available to this user
  let feedPeople; // cached feed authors for the fallback
  let timer;

  const heading = h("h3", {});
  const current = h("div", { class: "sh-list scroll" });
  const results = h("div", { class: "sh-list scroll" });
  const note = h("small", { class: "muted", "aria-live": "polite" });
  const search = h("input", {
    id: "sh-q",
    type: "search",
    placeholder: "Search people by name",
    autocomplete: "off",
    maxlength: 60,
  });
  const life = h("select", { id: "sh-life" }, LIFESPANS.map((o) => h("option", { value: String(o.ms) }, o.label)));
  life.value = String(DEFAULT_LIFESPAN);
  const done = h("div", { class: "row end" }, h("button", { type: "button", class: "btn", onclick: () => dlg.close() }, "Done"));
  const body = h(
    "div",
    { class: "stack" },
    h(
      "div",
      {},
      h("h2", {}, "Share workout"),
      h("p", { class: "muted" }, `${workout.title}. People you add can view it, but not edit or delete it. Access ends on its own.`),
    ),
    h("div", { class: "field" }, h("label", { for: "sh-q" }, "Add someone"), search, note),
    h("div", { class: "field" }, h("label", { for: "sh-life" }, "Access lasts for"), life),
    results,
    h("div", { class: "stack-sm" }, heading, current),
    done,
  );

  const row = (u, action, sub) =>
    h(
      "div",
      { class: "sh-row" },
      avatarNode(u.name, u.avatar),
      h("span", { class: "sh-who" }, h("span", { class: "sh-name" }, u.name), sub && h("small", { class: "muted" }, sub)),
      action,
    );
  const expiryLabel = (u) => {
    if (u.exp == null) return "";
    const left = u.exp - Date.now();
    return left <= 0 ? "Expired" : `Expires in ${fmtRemaining(left)}`;
  };

  function draw() {
    heading.textContent = shared ? `Shared with (${shared.length})` : "Shared with";
    current.replaceChildren(
      ...(shared === null
        ? [h("p", { class: "muted" }, "Loading…")]
        : shared.length
          ? shared.map((u) => row(u, h("button", { type: "button", class: "link bad", disabled: busy, onclick: () => remove(u) }, "Remove"), expiryLabel(u)))
          : [h("p", { class: "muted" }, "Not shared with anyone yet.")]),
    );
    results.replaceChildren(
      ...found.map((u) => row(u, h("button", { type: "button", class: "btn ghost", disabled: busy, onclick: () => add(u) }, "Add"))),
    );
  }

  /* ---- finding people ---- */
  async function feedAuthors() {
    if (!feedPeople) {
      const seen = new Map();
      for (const p of many(await api("GET", ROUTES.posts))) {
        const id = owner(p);
        if (id != null && !seen.has(String(id))) seen.set(String(id), person({ id, name: authorOf(p), avatar: authorPic(p) }));
      }
      feedPeople = [...seen.values()];
    }
    return feedPeople;
  }
  async function findPeople(q) {
    let list = [];
    if (!feedMode) {
      try {
        list = many(await api("GET", `${ROUTES.users}?q=${encodeURIComponent(q)}`)).map(person);
      } catch (e) {
        if (!e.missing && e.status !== 403) throw e; // 403 = the server still keeps /api/users admin-only
        feedMode = true; // not available yet: use the feed instead
      }
    }
    if (feedMode) list = await feedAuthors();
    // Filter here too: if a server ignores ?q= and answers with everyone, only real matches may show.
    // person() keeps just id, name and avatar, so an email the server sends is never read or displayed.
    const low = q.toLowerCase();
    list = list.filter((u) => u.name.toLowerCase().includes(low));
    const skip = new Set([String(USER_ID), ...(shared ?? []).map((u) => u.id)]); // not yourself, not someone already on the list
    return list.filter((u) => u.id && !skip.has(u.id)).slice(0, MAX_RESULTS);
  }
  async function runSearch() {
    const q = search.value.trim();
    const mine = ++latest;
    if (q.length < 2) {
      found = [];
      note.textContent = q ? "Keep typing…" : "";
      return draw();
    }
    note.textContent = "Searching…";
    try {
      const people = await findPeople(q);
      if (mine !== latest) return; // a newer search is already running
      found = people;
      note.textContent = feedMode
        ? `${people.length ? "" : "No one found. "}User search isn't available yet, so this only lists people from the feed.`
        : people.length
          ? ""
          : "No one found.";
    } catch (e) {
      if (mine !== latest) return;
      found = [];
      note.textContent = e.message;
    }
    draw();
  }
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(runSearch, 250);
  });

  /* ---- add / remove ---- */
  async function add(u) {
    if (busy) return;
    const lifespan = Number(life.value); // milliseconds, always one of LIFESPANS
    if (!LIFESPANS.some((o) => o.ms === lifespan)) return toast("Pick how long access lasts.", "bad");
    busy = true;
    draw();
    try {
      const res = await api("POST", ROUTES.share(workout.id), { userId: u.id, lifespan });
      const entry = { ...u, exp: expiresMs(res?.data?.expiresAt) ?? Date.now() + lifespan }; // the server's clock wins when it answers with one
      const i = shared.findIndex((x) => x.id === u.id);
      if (i < 0) shared.push(entry);
      else shared[i] = entry;
      changed = true;
      found = [];
      search.value = "";
      note.textContent = "";
      toast(`Shared with ${u.name}`);
    } catch (e) {
      toast(e.missing ? "Route not built yet (share)" : e.message, "bad");
    } finally {
      busy = false;
      draw();
    }
  }
  async function remove(u) {
    if (busy) return;
    busy = true;
    draw();
    try {
      await api("DELETE", ROUTES.unshare(workout.id, u.id));
      shared = shared.filter((x) => x.id !== u.id);
      changed = true;
      toast(`${u.name} can no longer see it`);
    } catch (e) {
      toast(e.missing ? "Route not built yet (share)" : e.message, "bad");
    } finally {
      busy = false;
      draw();
    }
  }

  /* ---- open ---- */
  dlg.replaceChildren(body);
  dlg.addEventListener("close", () => changed && onChange?.(), { once: true }); // refresh the list so the card shows "Shared with N"
  draw();
  dlg.showModal();
  search.focus();
  (async () => {
    try {
      shared = many(await api("GET", ROUTES.share(workout.id))).map(person);
      draw();
    } catch (e) {
      body.replaceChildren(errorBox(e, SHARE_SPEC), done);
    }
  })();
}
