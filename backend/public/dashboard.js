/* dashboard.js — the whole dashboard front end (pure JS, no libraries).
 *
 * How it works:
 *  - All "pages" are views swapped inside this one page using the #hash (dashboard.html#/feed).
 *  - The login token lives in sessionStorage (cleared when the tab closes) and is sent on every
 *    request in the Authorization header as "Bearer <token>". It is never put in a URL.
 *  - Every request goes through api(), which adds that header.
 *  - The user id saved at login builds the /api/users/<id> routes (see ROUTES).
 *  - Backend paths live ONLY in ROUTES below. Change them there if your routes differ.
 */
(() => {
  "use strict";

  /* ============ 1. ROUTE MAP (edit to match your server) ============ */
  const BASE = location.origin;
  // auth.js stores the token and the user's id in sessionStorage when you log in or sign up.
  // Anything that is not real (missing, or the text "undefined"/"null") counts as logged out.
  const clean = (v) => (v && v !== "undefined" && v !== "null" ? v : null);
  let TOKEN = clean(sessionStorage.getItem("token"));
  const USER_ID = clean(sessionStorage.getItem("userId"));
  const endSession = () => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("userId");
  };
  if (!TOKEN) endSession(); // drop any leftover junk
  const PICTURE_SET = "PATCH"; // how a picture is set: PATCH, because every user already has a picture (the default one), so setting one is an update
  const ROUTES = {
    users: "/api/users", // GET (master admin only) -> all users ; /:id -> DELETE
    profile: `/api/users/${USER_ID}`, // GET | PATCH {name,email} | DELETE
    password: `/api/users/${USER_ID}/password`, // PATCH {currentPassword,newPassword}
    picture: `/api/users/${USER_ID}/picture`, // POST multipart {avatar} | DELETE (back to default). Reading it = the path on GET /api/users/:id
    posts: "/api/posts", // GET | POST (multipart) ; /:id -> GET | PATCH (multipart) | DELETE
    workouts: "/api/workouts", // GET | POST ; /:id -> GET | PUT | DELETE
    comments: (id) => `/api/posts/${id}/comments`, // GET list | POST { text }
    comment: (id, cid) => `/api/posts/${id}/comments/${cid}`, // DELETE
    like: (id) => `/api/posts/${id}/like`, // POST toggles: likes, or unlikes if you already liked it -> { success, likesCount }
    logout: "/api/logout", // POST
  };

  /* ============ 2. TINY HELPERS ============ */
  const $ = (s, r = document) => r.querySelector(s);
  // h('div', {class:'x', onclick:fn}, child, 'text') -> element. Strings become text nodes, so user content can't inject HTML.
  const h = (tag, a = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(a)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    el.append(...kids.flat().filter((k) => k != null && k !== false));
    return el;
  };
  const fmt = (t) =>
    new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const toast = (msg, kind = "ok") => {
    const t = h("div", { class: `toast ${kind}` }, msg);
    $("#toasts").append(t);
    setTimeout(() => t.remove(), 3500);
  };

  /* ============ 3. API LAYER + LOG ============ */
  class ApiError extends Error {
    constructor(status, msg, missing = false) {
      super(msg);
      this.status = status;
      this.missing = missing;
    }
  }
  const logList = $("#log-list");
  const log = (method, path, status, ms) => {
    logList.prepend(
      h(
        "li",
        { class: status && status < 400 ? "ok" : "bad" },
        h("span", {}, `${method} ${path}`),
        h("span", {}, `${status || "ERR"} · ${ms}ms`),
      ),
    );
    while (logList.children.length > 40) logList.lastChild.remove();
  };

  async function api(method, path, body) {
    const url = BASE + path;
    const t0 = performance.now();
    let res,
      raw,
      type = "";
    try {
      const isForm = body instanceof FormData; // multipart/form-data: the browser adds the content-type AND the boundary itself, so it must not be set here
      res = await fetch(url, {
        method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${TOKEN}`,
          ...(body && !isForm && { "content-type": "application/json" }),
        },
        body: isForm ? body : body && JSON.stringify(body),
        cache: "no-store", // never reuse a stale API response
      });
      type = res.headers.get("content-type") || "";
      raw = await res.text();
    } catch {
      log(method, path, 0, Math.round(performance.now() - t0));
      throw new ApiError(0, "Could not reach the server. Is it running?");
    }
    log(method, path, res.status, Math.round(performance.now() - t0));

    if (res.status === 401) {
      // your backend answers bad/expired tokens with 401 (sessions last 15 min)
      endSession();
      toast("Session expired. Sending you to log in…", "bad");
      setTimeout(() => location.assign("login.html"), 1200);
      throw new ApiError(401, "Unauthorized");
    }
    if (res.ok && raw === "") return { success: true }; // empty 2xx (e.g. 204 after a delete)
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      /* not JSON */
    }
    // Your static handler replies to unknown URLs with the HTML 404 page, so "not JSON" == route not built yet.
    if (!data)
      throw new ApiError(
        res.status,
        `Route not built yet (HTTP ${res.status}, ${type || "no content-type"})`,
        true,
      ); // the detail shows what the server really sent
    if (!res.ok || data.success === false)
      throw new ApiError(
        res.status,
        data.message || `Request failed (${res.status})`,
      );
    return data;
  }
  // Accept either {data:...} or {user:...}/{post:...} etc.
  const one = (d, noun) => d.data ?? d[noun] ?? d;
  const many = (d) =>
    Array.isArray(d)
      ? d
      : (d.data ??
        d.items ??
        d.comments ??
        d.users ??
        d.posts ??
        d.workouts ??
        []);

  /* ============ 4. MODAL (forms + confirms) ============ */
  const dlg = $("#modal");
  function fieldEl(f, val = "") {
    const id = `f-${f.name}`;
    let input;
    if (f.type === "textarea")
      input = h("textarea", {
        id,
        name: f.name,
        rows: 4,
        required: f.required,
        maxlength: f.max,
      });
    else if (f.type === "select")
      input = h(
        "select",
        { id, name: f.name },
        f.options.map((o) => h("option", { value: o, selected: o === val }, o)),
      );
    else
      input = h("input", {
        id,
        name: f.name,
        type: f.type || "text",
        required: f.required,
        min: f.min,
        autocomplete: f.auto || "off",
      });
    if (f.type !== "select") input.value = val ?? "";
    return h(
      "div",
      { class: "field" },
      h("label", { for: id }, f.label),
      input,
    );
  }
  // Resolves to the form values (an object), or null if cancelled.
  const ask = ({
    title,
    fields = [],
    values = {},
    confirm,
    danger,
    submit = "Save",
  }) =>
    new Promise((resolve) => {
      const form = h(
        "form",
        { class: "stack" },
        h("h2", {}, title),
        confirm && h("p", { class: "muted" }, confirm),
        fields.map((f) => fieldEl(f, values[f.name])),
        h(
          "div",
          { class: "row end" },
          h(
            "button",
            { type: "button", class: "btn ghost", onclick: () => dlg.close() },
            "Cancel",
          ),
          h(
            "button",
            { type: "submit", class: `btn${danger ? " danger" : ""}` },
            submit,
          ),
        ),
      );
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(form));
        fields.forEach((f) => {
          if (f.type === "number" && v[f.name] !== "")
            v[f.name] = Number(v[f.name]);
        });
        resolve(v);
        dlg.close();
      });
      dlg.replaceChildren(form);
      dlg.addEventListener("close", () => resolve(null), { once: true });
      dlg.showModal();
    });

  /* ============ 5. SHARED UI PIECES ============ */
  const contract = (path, fields, upd = "PUT") =>
    [
      `GET    ${path}        -> { success:true, data:[ ... ] }`,
      `POST   ${path}        <- { ${fields.join(", ")} }`,
      `GET    ${path}/:id    -> { success:true, data:{ ... } }`,
      `${upd.padEnd(6)} ${path}/:id    <- { ${fields.join(", ")} }`,
      `DELETE ${path}/:id`,
    ].join("\n");

  function errorBox(e, spec, retry) {
    if (!e.missing) {
      return h(
        "div",
        { class: "empty" },
        h("p", { class: "bad" }, e.message),
        retry && h("button", { class: "btn ghost", onclick: retry }, "Retry"),
      );
    }
    return h(
      "div",
      { class: "empty" },
      h("h3", {}, "This route is not built yet"),
      h(
        "p",
        { class: "muted" },
        "The server replied with its 404 page instead of JSON. Build these routes and this page comes alive:",
      ),
      h("pre", {}, spec),
    );
  }

  function formCard(
    title,
    fields,
    values,
    run,
    label = "Save changes",
    cls = "",
  ) {
    const form = h(
      "form",
      { class: "stack" },
      fields.map((f) => fieldEl(f, values?.[f.name])),
      h(
        "div",
        { class: "row" },
        h("button", { class: "btn", type: "submit" }, label),
      ),
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("button", form);
      btn.disabled = true;
      try {
        await run(Object.fromEntries(new FormData(form)), form);
      } catch (err) {
        toast(
          err.missing ? `Route not built yet (${title})` : err.message,
          "bad",
        );
      } finally {
        btn.disabled = false;
      }
    });
    return h("section", { class: `card ${cls}` }, h("h3", {}, title), form);
  }

  /* ============ 5b. POST HELPERS (shared by feed cards and the form's live preview) ============ */
  const IMG_TYPES = ["image/jpeg", "image/png", "image/webp"],
    IMG_MAX_MB = 2;
  // returns a message when the file is not acceptable, '' when it is fine
  const imageError = (f) =>
    !IMG_TYPES.includes(f.type)
      ? "Choose a JPG, PNG or WebP image."
      : f.size > IMG_MAX_MB * 1024 * 1024
        ? `Image must be under ${IMG_MAX_MB} MB.`
        : "";
  // The profile picture is a file on the server, so the user object carries its path and the browser loads it
  // like any other static file. Any of these keys is accepted for that path.
  const AVATAR_KEYS = [
    "avatar",
    "avatarUrl",
    "avatarPath",
    "picture",
    "picturePath",
    "profilePicture",
    "profilePic",
    "imagePath",
    "imageUrl",
  ];
  const avatarOf = (u) =>
    publicSrc(
      AVATAR_KEYS.map((k) => u[k]).find((v) => typeof v === "string" && v),
    );
  // true when the user uploaded their own picture (not the shared default-avatar file)
  const hasCustomAvatar = (u) => {
    const a = avatarOf(u);
    return (
      Boolean(a) && u.isDefaultAvatar !== true && !/(^|\/)default[-_.]/i.test(a)
    );
  };
  const initialOf = (u) => (u.name || u.email || "?")[0].toUpperCase();
  const CATEGORIES = [
    "General",
    "Workout",
    "Nutrition",
    "Progress",
    "Question",
    "Event",
  ];
  const okUrl = (u) => /^(https?:\/\/\S+|\/(?!\/)\S+)$/i.test(u || ""); // absolute http(s) or a /path on this server
  // An address THIS server really serves (a path on disk will not load). 'uploads/a.webp' and '/uploads/a.webp'
  // both become '/uploads/a.webp'; full https links are kept as they are.
  const publicSrc = (v) => {
    if (typeof v !== "string" || !v) return "";
    const src = /^https?:\/\//i.test(v) ? v : `/${v.replace(/^\/+/, "")}`;
    return okUrl(src) ? src : "";
  };
  const imageSrc = (p) => publicSrc(p.imagePath ?? p.imageUrl);
  // Your posts store the author as { authorId, authorName }.
  const authorOf = (it) =>
    (typeof it.author === "object"
      ? (it.author?.authorName ?? it.author?.name)
      : it.author) || it.authorName;
  const makeImg = (u) =>
    h("img", {
      class: "post-img",
      src: u,
      alt: "",
      loading: "lazy",
      onerror: (e) =>
        e.target.replaceWith(
          h("p", { class: "muted" }, "Image could not be loaded"),
        ),
    });
  // tags should be an array, but a multipart form delivers text, so a server may store the raw string '["a","b"]'.
  // Accept an array, JSON text or "a, b" text and always return an array of strings.
  const tagsOf = (p) => {
    let t = p.tags;
    if (typeof t === "string") {
      try {
        t = JSON.parse(t);
      } catch {
        t = t.split(",");
      }
    }
    return Array.isArray(t)
      ? t.map((x) => String(x).trim()).filter(Boolean)
      : [];
  };
  /* ---- icons: 24px line icons, one path each ---- */
  const ICONS = {
    heart:
      "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
    comment:
      "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
    bookmark: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
    edit: "M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z",
    trash:
      "M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2",
    close: "M18 6L6 18M6 6l12 12",
    image:
      "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21",
  };
  const ico = (name) => {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg"),
      path = document.createElementNS(NS, "path");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "ico");
    svg.setAttribute("aria-hidden", "true");
    path.setAttribute("d", ICONS[name]);
    svg.append(path);
    return svg;
  };
  const iconBtn = (name, label, onclick, cls = "") =>
    h(
      "button",
      {
        type: "button",
        class: `icon-btn ${cls}`,
        "aria-label": label,
        title: label,
        onclick,
      },
      ico(name),
    );
  // "5m", "3h", "2d" ... like a social feed
  const ago = (t) => {
    const s = Math.max(0, (Date.now() - new Date(t)) / 1000);
    for (const [n, l] of [
      [31536000, "y"],
      [2592000, "mo"],
      [604800, "w"],
      [86400, "d"],
      [3600, "h"],
      [60, "m"],
    ])
      if (s >= n) return `${Math.floor(s / n)}${l}`;
    return "now";
  };

  // The author's picture: the server sends it with each post (authorImage, or inside the author object).
  // Falls back to the initial letter if there is none or the file fails to load.
  const authorPic = (p) =>
    publicSrc(
      p.authorImage ?? p.author?.authorImage ?? p.author?.image ?? p.authorPic,
    );
  const avatarNode = (name, src) => {
    const initial = name[0].toUpperCase();
    return h(
      "span",
      { class: "avatar sm" },
      src
        ? h("img", {
            src,
            alt: "",
            onerror: (e) => e.target.replaceWith(initial),
          })
        : initial,
    );
  };

  // Comments panel: opens in the shared dialog. n = how many comments the post has; onCount(n) keeps the card's number in step.
  const COMMENTS_SPEC = `GET    /api/posts/:id/comments   -> { success:true, data:[ { id, text, author:{ authorId, authorName }, createdAt, canDelete } ] }\nPOST   /api/posts/:id/comments   <- { "text": "..." } (1-500 chars) -> 201 with the new comment\nDELETE /api/posts/:id/comments/:commentId`;
  function openComments(p, count, onCount) {
    let n = count;
    const off = p.allowComments === false || p.allowComments === "false";
    const list = h("div", { class: "comments-list" });
    const emptyNote = () =>
      h("p", { class: "muted empty-note" }, "No comments yet. Be the first.");
    const input = h("input", {
      type: "text",
      maxlength: 500,
      autocomplete: "off",
      placeholder: "Add a comment…",
      "aria-label": "Add a comment",
    });
    const send = h(
      "button",
      { class: "link", type: "submit", disabled: true },
      "Post",
    );
    const form = h("form", { class: "comment-form" }, input, send);
    input.addEventListener("input", () => {
      send.disabled = !input.value.trim();
    });

    const row = (c) => {
      const name = String(c.author?.authorName ?? c.authorName ?? "Someone");
      const mineC = String(c.author?.authorId ?? c.authorId) === USER_ID;
      const pic =
        publicSrc(c.author?.authorImage ?? c.authorImage ?? c.author?.image) ||
        (mineC && me ? avatarOf(me) : "");
      const el = h(
        "div",
        { class: "comment" },
        avatarNode(name, pic),
        h(
          "div",
          { class: "comment-body" },
          h("p", {}, h("strong", {}, name), " ", String(c.text ?? "")),
          c.createdAt && h("small", { class: "muted" }, ago(c.createdAt)),
        ),
        (c.canDelete ?? mineC) &&
          iconBtn("trash", "Delete comment", () => remove(c, el), "bad"),
      );
      return el;
    };
    async function load() {
      list.replaceChildren(
        ...[1, 2].map(() => h("div", { class: "skeleton comment-skel" })),
      );
      try {
        const items = many(await api("GET", ROUTES.comments(p.id)));
        list.replaceChildren(
          ...(items.length ? items.map(row) : [emptyNote()]),
        );
        n = items.length;
        onCount(n); // the list is the truth
      } catch (e) {
        list.replaceChildren(errorBox(e, COMMENTS_SPEC, load));
      }
    }
    async function remove(c, el) {
      try {
        await api("DELETE", ROUTES.comment(p.id, c.id));
        el.remove();
        n = Math.max(0, n - 1);
        onCount(n);
        if (!list.children.length) list.append(emptyNote());
      } catch (e) {
        toast(e.missing ? "Comments are not built yet" : e.message, "bad");
      }
    }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      send.disabled = input.disabled = true;
      try {
        const d = await api("POST", ROUTES.comments(p.id), { text });
        const c = d.data ?? d.comment ?? d;
        list.querySelector(".empty-note")?.remove();
        if (c && c.id) {
          list.append(row(c));
          n += 1;
          onCount(n);
        } else await load(); // no comment in the reply? reload the list
        input.value = "";
        list.scrollTop = list.scrollHeight;
      } catch (err) {
        toast(err.missing ? "Comments are not built yet" : err.message, "bad");
      } finally {
        input.disabled = false;
        send.disabled = !input.value.trim();
        input.focus();
      }
    });

    dlg.replaceChildren(
      h(
        "div",
        { class: "sheet-body" },
        h(
          "header",
          { class: "sheet-head" },
          h("h2", {}, "Comments"),
          iconBtn("close", "Close", () => dlg.close()),
        ),
        list,
        off
          ? h(
              "p",
              { class: "muted sheet-note" },
              "Comments are turned off for this post.",
            )
          : form,
      ),
    );
    dlg.classList.add("sheet");
    const backdrop = (e) => {
      if (e.target === dlg) dlg.close();
    }; // a click outside the panel closes it
    dlg.addEventListener("click", backdrop);
    dlg.addEventListener(
      "close",
      () => {
        dlg.classList.remove("sheet");
        dlg.removeEventListener("click", backdrop);
      },
      { once: true },
    );
    dlg.showModal();
    load();
    if (!off) input.focus();
  }

  // One Instagram-style post: header (who + when + owner actions), square picture, actions, likes, caption, tags.
  // Used by the Feed and by the live preview in the post form (o.img / o.preview).
  const postCard = (p, o = {}) => {
    const src =
      o.img !== undefined ? o.img : imageSrc(p) && makeImg(imageSrc(p));
    const name = String(authorOf(p) || "Someone");
    const mine =
      o.preview || (owner(p) !== undefined && String(owner(p)) === USER_ID);
    const pic = authorPic(p) || (mine && me ? avatarOf(me) : "");
    let likes = p.likesCount ?? p.likes;
    // likedByMe (a boolean for the requesting user) is the right field to send. A hasLiked list of user ids also works,
    // which is how the heart stays red if the server sends its stored posts as they are.
    let liked =
      p.likedByMe === true ||
      (Array.isArray(p.hasLiked) && p.hasLiked.includes(USER_ID));
    let busy = false;
    let comments =
      p.commentCount ?? (Number.isFinite(p.comments) ? p.comments : undefined);
    const canComment = p.allowComments !== false && p.allowComments !== "false";
    const cLink = h("button", {
      type: "button",
      class: "link muted-link",
      onclick: () => open(),
    });
    const drawC = () => {
      cLink.hidden = Boolean(o.preview) || !(comments > 0 || canComment);
      cLink.textContent =
        comments > 0 ? `View all ${comments} comments` : "Add a comment…";
    };
    const open = () => {
      if (p.id)
        openComments(p, comments ?? 0, (n) => {
          comments = n;
          drawC();
        });
    }; // the live preview has no post to comment on
    drawC();
    const likeTxt = h("p", { class: "post-likes" });
    const draw = () => {
      likeTxt.hidden = !Number.isFinite(likes);
      likeTxt.textContent = `${likes} ${likes === 1 ? "like" : "likes"}`;
      likeBtn.classList.toggle("liked", liked);
    };
    const flip = () => {
      liked = !liked;
      if (Number.isFinite(likes)) likes += liked ? 1 : -1;
      draw();
    };
    const likeBtn = iconBtn("heart", "Like", async () => {
      if (!p.id || busy) return; // the live preview has nothing to like; one request at a time
      busy = true;
      const prev = likes;
      flip(); // instant feedback, undone if the server says no
      try {
        const d = await api("POST", ROUTES.like(p.id)); // one route toggles: like, or unlike if already liked
        const n = d.likesCount ?? d.data?.likesCount,
          l = d.liked ?? d.data?.liked;
        // the server's count is the truth; without a liked flag, the count going up or down shows which way it toggled
        if (Number.isFinite(n)) {
          likes = n;
          if (typeof l !== "boolean" && Number.isFinite(prev) && n !== prev)
            liked = n > prev;
        }
        if (typeof l === "boolean") liked = l;
        draw();
      } catch (e) {
        flip();
        toast(e.missing ? "Likes are not built yet" : e.message, "bad");
      } finally {
        busy = false;
      }
    });
    draw();
    const tags = tagsOf(p);
    return h(
      "article",
      { class: "post-card" },
      h(
        "header",
        { class: "post-head" },
        avatarNode(name, pic),
        h(
          "div",
          { class: "post-who" },
          h("strong", {}, name),
          p.createdAt && h("small", { class: "muted" }, ago(p.createdAt)),
        ),
        (o.onEdit || o.onDel) &&
          h(
            "div",
            { class: "row" },
            o.onEdit && iconBtn("edit", "Edit post", o.onEdit),
            o.onDel && iconBtn("trash", "Delete post", o.onDel, "bad"),
          ),
      ),
      src && h("div", { class: "post-media" }, src),
      h(
        "div",
        { class: "post-actions" },
        likeBtn,
        iconBtn("comment", "Comments", open),
        h("span", { class: "grow" }),
        iconBtn("bookmark", "Save", () => toast("Saving posts is coming soon")),
      ),
      likeTxt,
      h(
        "div",
        { class: "post-text" },
        h("h3", {}, p.title || "Untitled"),
        h("p", { class: "post" }, p.body),
      ),
      tags.length > 0 &&
        h(
          "div",
          { class: "tags" },
          tags.map((t) => h("span", { class: "tag" }, `#${t}`)),
        ),
      h(
        "div",
        { class: "post-meta" },
        p.category && h("span", { class: "chip" }, p.category),
        cLink,
      ),
    );
  };

  /* ============ 6. RESOURCES (Feed + Workouts share one CRUD view) ============ */
  const RES = {
    posts: {
      title: "Feed",
      sub: "Share updates with the community.",
      noun: "post",
      btn: "+ New post",
      path: ROUTES.posts,
      form: true,
      update: "PATCH", // posts use the full-page form (#/new-post), not the modal
      spec: `GET    ${ROUTES.posts}        -> { success:true, data:[ { id, title, body, imagePath, tags, category, allowComments, author:{ authorId, authorName }, likesCount, commentCount, createdAt } ] }
POST   ${ROUTES.posts}        <- multipart/form-data: title, body, category, allowComments ("true"/"false"),
                                 tags (JSON text, e.g. ["leg-day","strength"]), image (file, optional)
GET    ${ROUTES.posts}/:id    -> { success:true, data:{ ... } }
PATCH  ${ROUTES.posts}/:id    <- same fields, all optional, plus removeImage ("true") to delete the image
DELETE ${ROUTES.posts}/:id
POST   ${ROUTES.posts}/:id/like   (toggles: likes, or unlikes if already liked) -> { success, likesCount, liked }
GET    ${ROUTES.posts}/:id/comments   -> { success:true, data:[ { id, text, author:{ authorId, authorName }, createdAt, canDelete } ] }
POST   ${ROUTES.posts}/:id/comments   <- { "text": "..." } (1-500 chars) -> 201 with the new comment
DELETE ${ROUTES.posts}/:id/comments/:commentId`,
      card: (it, a) => postCard(it, a),
    },
    workouts: {
      title: "Workouts",
      sub: "Log and manage your sessions.",
      noun: "workout",
      btn: "+ Log workout",
      path: ROUTES.workouts,
      fields: [
        { name: "title", label: "Title", required: true, max: 80 },
        {
          name: "type",
          label: "Type",
          type: "select",
          options: ["Strength", "Cardio", "Mobility", "Other"],
        },
        {
          name: "duration",
          label: "Duration (minutes)",
          type: "number",
          required: true,
          min: 1,
        },
        { name: "notes", label: "Notes", type: "textarea", max: 300 },
      ],
      render: (it) => [
        h("h3", {}, it.title),
        h(
          "p",
          { class: "muted" },
          `${it.type || "Other"} · ${it.duration ?? "?"} min`,
        ),
        it.notes && h("p", { class: "post" }, it.notes),
      ],
    },
  };

  let me = null; // current user, loaded once at boot
  const owner = (it) =>
    it.author?.authorId ??
    it.authorId ??
    it.userId ??
    it.ownerId ??
    it.author?.id;
  // Show Edit/Delete only on your own items. If the API sends no owner info, assume yours.
  const owned = (it) =>
    it.isMine ?? (owner(it) === undefined || String(owner(it)) === USER_ID);

  function collectionView(r) {
    const spec =
      r.spec ??
      contract(
        r.path,
        r.fields.map((f) => f.name),
        r.update || "PUT",
      );
    const body = h("div", { class: r.noun === "post" ? "feed" : "grid" });
    const root = h(
      "div",
      { class: "stack" },
      h(
        "div",
        { class: "page-head" },
        h("div", {}, h("h1", {}, r.title), h("p", { class: "muted" }, r.sub)),
        h("button", { class: "btn", onclick: add }, r.btn),
      ),
      body,
    );

    const plainCard = (it) =>
      h(
        "article",
        { class: "card" },
        r.render(it),
        h(
          "footer",
          { class: "card-foot" },
          h(
            "span",
            { class: "muted" },
            [
              authorOf(it),
              it.createdAt && fmt(it.createdAt),
              Number.isFinite(it.likesCount ?? it.likes) &&
                `${it.likesCount ?? it.likes} likes`,
              Number.isFinite(it.commentCount ?? it.comments) &&
                `${it.commentCount ?? it.comments} comments`,
            ]
              .filter(Boolean)
              .join(" · "),
          ),
          owned(it) &&
            h(
              "span",
              { class: "row" },
              h("button", { class: "link", onclick: () => edit(it) }, "Edit"),
              h(
                "button",
                { class: "link bad", onclick: () => del(it) },
                "Delete",
              ),
            ),
        ),
      );
    const card = (it) =>
      r.card
        ? r.card(
            it,
            owned(it) ? { onEdit: () => edit(it), onDel: () => del(it) } : {},
          )
        : plainCard(it);

    async function load() {
      // READ (list)
      body.replaceChildren(
        ...[1, 2, 3].map(() => h("div", { class: "card skeleton" })),
      );
      try {
        const items = many(await api("GET", r.path));
        body.replaceChildren(
          ...(items.length
            ? items.map(card)
            : [
                h(
                  "div",
                  { class: "empty" },
                  h("h3", {}, `No ${r.noun}s yet`),
                  h(
                    "p",
                    { class: "muted" },
                    "Use the button above to create the first one.",
                  ),
                ),
              ]),
        );
      } catch (e) {
        body.replaceChildren(errorBox(e, spec, load));
      }
    }
    async function add() {
      if (r.form) {
        location.hash = "#/new-post";
        return;
      } // CREATE
      const v = await ask({
        title: r.btn.replace("+ ", ""),
        fields: r.fields,
        submit: "Create",
      });
      if (!v) return;
      try {
        await api("POST", r.path, v);
        toast(`${r.noun} created`);
        load();
      } catch (e) {
        toast(e.message, "bad");
      }
    }
    async function edit(it) {
      if (r.form) {
        location.hash = `#/edit-post/${it.id}`;
        return;
      } // READ (one) + UPDATE
      let cur = it;
      try {
        cur = one(await api("GET", `${r.path}/${it.id}`), r.noun);
      } catch (e) {
        if (!e.missing) return toast(e.message, "bad");
      }
      const v = await ask({
        title: `Edit ${r.noun}`,
        fields: r.fields,
        values: cur,
      });
      if (!v) return;
      try {
        await api(r.update || "PUT", `${r.path}/${it.id}`, v);
        toast("Saved");
        load();
      } catch (e) {
        toast(e.message, "bad");
      }
    }
    async function del(it) {
      // DELETE
      if (
        !(await ask({
          title: `Delete this ${r.noun}?`,
          confirm: "This cannot be undone.",
          danger: true,
          submit: "Delete",
        }))
      )
        return;
      try {
        await api("DELETE", `${r.path}/${it.id}`);
        toast("Deleted");
        load();
      } catch (e) {
        toast(e.message, "bad");
      }
    }
    load();
    return root;
  }

  /* ============ 6b. POST FORM PAGE (create + edit, with live preview) ============ */
  function postFormView(id) {
    const editing = Boolean(id);
    const st = {
      title: "",
      body: "",
      imageUrl: "",
      category: "General",
      allowComments: true,
      tags: [],
    };
    const root = h("div", { class: "stack" });
    const spec = RES.posts.spec;

    (async () => {
      if (editing) {
        try {
          Object.assign(
            st,
            one(
              await api("GET", `${ROUTES.posts}/${encodeURIComponent(id)}`),
              "post",
            ),
          );
        } catch (e) {
          root.append(errorBox(e, spec));
          return;
        }
      }
      build();
    })();

    function build() {
      st.allowComments =
        st.allowComments !== false && st.allowComments !== "false"; // multipart text may be stored as the string 'false'
      st.category ||= "General";
      st.title ||= "";
      st.body ||= "";
      st.imageUrl = imageSrc(st);
      st.tags = tagsOf(st);
      const hadImage = Boolean(st.imageUrl); // editing: did the post already have an image?

      // live preview: re-uses the exact same postCard() the feed cards use
      const preview = h("div", { class: "preview" });
      let imgEl = null,
        imgFor = "",
        file = null,
        blobUrl = ""; // file = picked image waiting to upload
      const paint = () => {
        const u = blobUrl || st.imageUrl.trim();
        if (!u || (!blobUrl && !okUrl(u))) {
          imgEl = null;
          imgFor = "";
        } else if (u !== imgFor) {
          imgFor = u;
          imgEl = makeImg(u);
        }
        preview.replaceChildren(
          h(
            "div",
            { class: "stack-sm" },
            h("small", { class: "muted" }, "Live preview"),
            postCard(
              {
                ...st,
                id: undefined,
                author: { authorName: me?.name || "You" },
                createdAt: Date.now(),
                likesCount: 0,
                commentCount: 0,
              },
              { img: imgEl, preview: true },
            ),
          ),
        );
      };

      const mk = (tag, a, val) => {
        const el = h(tag, a);
        el.value = val;
        return el;
      };
      const bind = (el, key) => {
        el.addEventListener("input", () => {
          st[key] = el.type === "checkbox" ? el.checked : el.value;
          paint();
        });
        return el;
      };
      const count = (el, max) => {
        const c = h("small", { class: "muted" });
        const upd = () => {
          c.textContent = `${el.value.length}/${max}`;
        };
        el.addEventListener("input", upd);
        upd();
        return c;
      };

      // image: file picker + drag and drop. Preview is instant (local blob); upload happens on submit.
      const fileIn = h("input", {
        id: "p-img",
        type: "file",
        accept: IMG_TYPES.join(","),
        class: "sr-only",
      });
      const fileName = h(
        "span",
        { class: "muted" },
        st.imageUrl ? "Current image is kept unless you choose another." : "",
      );
      const removeBtn = h(
        "button",
        {
          type: "button",
          class: "link bad",
          hidden: !st.imageUrl,
          onclick: () => setFile(null),
        },
        "Remove image",
      );
      const setFile = (f) => {
        const bad = f && imageError(f);
        if (bad) return toast(bad, "bad");
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        file = f || null;
        blobUrl = f ? URL.createObjectURL(f) : "";
        if (!f) st.imageUrl = ""; // Remove image clears a saved image too
        fileIn.value = "";
        fileName.textContent = f
          ? `${f.name} (${Math.round(f.size / 1024)} KB)`
          : "";
        removeBtn.hidden = !(f || st.imageUrl);
        paint();
      };
      const drop = h(
        "label",
        { class: "drop" },
        fileIn,
        h("span", { class: "drop-ico" }, ico("image")),
        h("strong", {}, "Click to choose an image"),
        "or drag it here",
        h(
          "small",
          { class: "muted" },
          `JPG, PNG or WebP · max ${IMG_MAX_MB} MB`,
        ),
      );
      fileIn.addEventListener("change", () => setFile(fileIn.files[0]));
      drop.addEventListener("dragover", (e) => {
        e.preventDefault();
        drop.classList.add("over");
      });
      drop.addEventListener("dragleave", () => drop.classList.remove("over"));
      drop.addEventListener("drop", (e) => {
        e.preventDefault();
        drop.classList.remove("over");
        setFile(e.dataTransfer.files[0]);
      });
      const title = bind(
        mk(
          "input",
          {
            id: "p-title",
            required: true,
            minlength: 3,
            maxlength: 100,
            placeholder: "Give your post a clear title",
            autocomplete: "off",
          },
          st.title,
        ),
        "title",
      );
      const body = bind(
        mk(
          "textarea",
          {
            id: "p-body",
            rows: 9,
            required: true,
            minlength: 10,
            maxlength: 2000,
            placeholder: "Share your story, tips or question…",
          },
          st.body,
        ),
        "body",
      );
      const cat = bind(
        h(
          "select",
          { id: "p-cat" },
          CATEGORIES.map((c) =>
            h("option", { value: c, selected: c === st.category }, c),
          ),
        ),
        "category",
      );
      const comments = bind(
        h("input", { id: "p-cm", type: "checkbox", checked: st.allowComments }),
        "allowComments",
      );

      // tags: type + Enter/comma makes a chip, Backspace removes the last one (max 5)
      const tagIn = h("input", {
        id: "p-tags",
        maxlength: 20,
        autocomplete: "off",
        placeholder: "e.g. leg-day",
      });
      const tagBox = h("div", { class: "tagbox" });
      const drawTags = () =>
        tagBox.replaceChildren(
          ...st.tags.map((t) =>
            h(
              "span",
              { class: "tag" },
              `#${t}`,
              h(
                "button",
                {
                  type: "button",
                  "aria-label": `Remove tag ${t}`,
                  onclick: () => {
                    st.tags = st.tags.filter((x) => x !== t);
                    drawTags();
                    paint();
                  },
                },
                "×",
              ),
            ),
          ),
          tagIn,
        );
      const addTag = () => {
        const t = tagIn.value
          .trim()
          .replace(/^#+/, "")
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "");
        tagIn.value = "";
        if (t && !st.tags.includes(t) && st.tags.length < 5) {
          st.tags.push(t);
          drawTags();
          paint();
        }
      };
      tagIn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === ",") {
          e.preventDefault();
          addTag();
          tagIn.focus();
        } else if (e.key === "Backspace" && !tagIn.value && st.tags.length) {
          st.tags.pop();
          drawTags();
          paint();
          tagIn.focus();
        }
      });
      tagIn.addEventListener("blur", addTag);
      tagBox.addEventListener("click", () => tagIn.focus());

      const submit = h(
        "button",
        { class: "btn", type: "submit" },
        editing ? "Save changes" : "Publish post",
      );
      const form = h(
        "form",
        { class: "card form" },
        h(
          "div",
          { class: "field" },
          h("label", { for: "p-img" }, "Cover image (optional)"),
          drop,
          h("div", { class: "row" }, fileName, removeBtn),
        ),
        h(
          "div",
          { class: "field" },
          h(
            "div",
            { class: "between" },
            h("label", { for: "p-title" }, "Title *"),
            count(title, 100),
          ),
          title,
        ),
        h(
          "div",
          { class: "field" },
          h("label", { for: "p-cat" }, "Category"),
          cat,
        ),
        h(
          "div",
          { class: "field" },
          h(
            "div",
            { class: "between" },
            h("label", { for: "p-body" }, "Write-up *"),
            count(body, 2000),
          ),
          body,
        ),
        h(
          "div",
          { class: "field" },
          h("label", { for: "p-tags" }, "Tags (up to 5)"),
          tagBox,
          h(
            "small",
            { class: "muted" },
            "Press Enter or comma after each tag.",
          ),
        ),
        h(
          "label",
          { class: "check-row" },
          comments,
          " Allow comments on this post",
        ),
        h(
          "div",
          { class: "row end" },
          h("a", { class: "btn ghost", href: "#/feed" }, "Cancel"),
          submit,
        ),
      );

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        addTag();
        const t = st.title.trim(),
          b = st.body.trim();
        if (t.length < 3 || b.length < 10)
          return toast(
            "Add a title (3+ characters) and a write-up (10+ characters).",
            "bad",
          );
        submit.disabled = true;
        try {
          // ONE multipart request: the text fields and the optional image travel together,
          // so the server can validate everything before it stores anything.
          const fd = new FormData();
          fd.append("title", t);
          fd.append("body", b);
          fd.append("category", st.category);
          fd.append("allowComments", String(st.allowComments));
          fd.append("tags", JSON.stringify(st.tags));
          if (file) fd.append("image", file);
          else if (editing && hadImage && !st.imageUrl)
            fd.append("removeImage", "true"); // the user removed the image
          await api(
            editing ? "PATCH" : "POST",
            editing
              ? `${ROUTES.posts}/${encodeURIComponent(id)}`
              : ROUTES.posts,
            fd,
          );
          toast(editing ? "Post updated" : "Post published");
          location.hash = "#/feed";
        } catch (err) {
          toast(
            err.missing ? "Route not built yet (posts)" : err.message,
            "bad",
          );
          submit.disabled = false;
        }
      });

      root.append(
        h(
          "div",
          { class: "page-head" },
          h(
            "div",
            {},
            h("h1", {}, editing ? "Edit post" : "New post"),
            h(
              "p",
              { class: "muted" },
              editing
                ? "Update your post."
                : "Share something with the community.",
            ),
          ),
        ),
        h("div", { class: "post-layout" }, form, preview),
      );
      drawTags();
      paint();
    }
    return root;
  }

  /* ============ 7. OVERVIEW ============ */
  function overviewView() {
    const stats = h("div", { class: "grid stats" });
    const checks = h(
      "section",
      { class: "card" },
      h("h3", {}, "Backend route status"),
      h(
        "p",
        { class: "muted" },
        "Live GET probes. Write routes (POST/PUT/DELETE) are not probed so nothing gets changed.",
      ),
    );
    const root = h(
      "div",
      { class: "stack" },
      h(
        "div",
        { class: "page-head" },
        h(
          "div",
          {},
          h("h1", {}, `Welcome${me?.name ? `, ${me.name.split(" ")[0]}` : ""}`),
          h(
            "p",
            { class: "muted" },
            'Every action here is a real request to your Node server. Open "API log" (bottom right) to watch them.',
          ),
        ),
      ),
      stats,
      checks,
    );

    const probes = [
      ["Profile", ROUTES.profile],
      ["Feed", ROUTES.posts],
      ["Workouts", ROUTES.workouts],
    ];
    Promise.allSettled(probes.map(([, p]) => api("GET", p))).then((res) => {
      res.forEach((r, i) => {
        const [name, path] = probes[i];
        const state =
          r.status === "fulfilled"
            ? ["live", ""]
            : r.reason.missing
              ? ["not built", "off"]
              : ["error", "err"];
        checks.append(
          h(
            "div",
            { class: "check" },
            h("span", {}, `${name} `, h("code", {}, `GET ${path}`)),
            h("span", { class: `pill ${state[1]}` }, state[0]),
          ),
        );
      });
      const stat = (label, val) =>
        h(
          "div",
          { class: "card stat" },
          h("b", {}, val),
          h("span", { class: "muted" }, label),
        );
      const posts = res[1].status === "fulfilled" ? many(res[1].value) : null;
      const wk = res[2].status === "fulfilled" ? many(res[2].value) : null;
      stats.append(
        stat("Posts in feed", posts ? posts.length : "–"),
        stat("Workouts logged", wk ? wk.length : "–"),
        stat(
          "Minutes trained",
          wk ? wk.reduce((s, w) => s + (Number(w.duration) || 0), 0) : "–",
        ),
      );
    });
    return root;
  }

  /* ============ 7b. USERS (master admin only) ============ */
  function usersView() {
    const body = h("div", { class: "stack-sm" });
    const root = h(
      "div",
      { class: "stack" },
      h(
        "div",
        { class: "page-head" },
        h(
          "div",
          {},
          h("h1", {}, "Users"),
          h(
            "p",
            { class: "muted" },
            "Everyone on the platform. Only the master admin can open this list.",
          ),
        ),
      ),
      body,
    );
    const spec = `GET    ${ROUTES.users}       -> { success:true, data:[ { id, name, email } ] }   (master admin only, 403 for everyone else)\nDELETE ${ROUTES.users}/:id`;

    const row = (u) =>
      h(
        "div",
        { class: "check" },
        h(
          "span",
          {},
          h("strong", {}, u.name || "—"),
          " ",
          h("span", { class: "muted" }, u.email || ""),
        ),
        h(
          "span",
          { class: "row" },
          h("code", {}, String(u.id).slice(0, 8)),
          String(u.id) !== USER_ID &&
            h("button", { class: "link bad", onclick: () => del(u) }, "Delete"),
        ),
      );

    async function load() {
      body.replaceChildren(
        ...[1, 2, 3].map(() => h("div", { class: "card skeleton" })),
      );
      try {
        const users = many(await api("GET", ROUTES.users));
        body.replaceChildren(
          h(
            "section",
            { class: "card" },
            h(
              "p",
              { class: "muted" },
              `${users.length} user${users.length === 1 ? "" : "s"}`,
            ),
            users.map(row),
          ),
        );
      } catch (e) {
        body.replaceChildren(
          e.status === 403
            ? h(
                "div",
                { class: "empty" },
                h("h3", {}, "Admins only"),
                h(
                  "p",
                  { class: "muted" },
                  "Only the master admin can see this list.",
                ),
              )
            : errorBox(e, spec, load),
        );
      }
    }
    async function del(u) {
      if (
        !(await ask({
          title: `Delete ${u.name || u.email}?`,
          confirm: "This cannot be undone.",
          danger: true,
          submit: "Delete user",
        }))
      )
        return;
      try {
        await api("DELETE", `${ROUTES.users}/${u.id}`);
        toast("User deleted");
        load();
      } catch (e) {
        toast(e.message, "bad");
      }
    }
    load();
    return root;
  }

  /* ============ 8. PROFILE (read / update / password / delete account) ============ */
  const paintMe = () => {
    // sidebar user chip
    $("#me-name").textContent = me.name || "You";
    $("#me-email").textContent = me.email || "";
    $("#nav-users").hidden = !(me.role === "admin" || me.isAdmin === true); // the Users page is for the master admin
    const pic = avatarOf(me);
    $("#avatar").replaceChildren(
      pic ? h("img", { src: pic, alt: "" }) : initialOf(me),
    );
  };
  async function loadMe() {
    const d = await api("GET", ROUTES.profile);
    me = d.data ?? d.user ?? d;
    if (!avatarOf(me))
      console.info(
        "[dashboard] no usable picture path in the profile response, so no image is requested.",
        "\nKeys received:",
        Object.keys(me).join(", "),
        "\nPicture-like values received:",
        JSON.stringify(
          Object.fromEntries(
            AVATAR_KEYS.filter((k) => k in me).map((k) => [k, me[k]]),
          ),
        ),
      );
    paintMe();
  }

  // Read-only snapshot of what the server currently has on you. Anything new you add to the
  // profile response later (bio, phone, createdAt...) shows up here automatically.
  const HIDDEN = [
    "password",
    "salt",
    "token",
    "hash",
    ...AVATAR_KEYS.map((k) => k.toLowerCase()),
  ]; // never display these, even if the API leaks them
  const labelOf = (k) =>
    k
      .replace(/([A-Z])/g, " $1")
      .replace(/[_-]/g, " ")
      .replace(/^./, (c) => c.toUpperCase());
  function detailsCard() {
    const first = ["name", "email", "id"];
    const keys = [
      ...first.filter((k) => k in me),
      ...Object.keys(me).filter((k) => !first.includes(k)),
    ].filter(
      (k) => !HIDDEN.includes(k.toLowerCase()) && typeof me[k] !== "object",
    );
    return h(
      "section",
      { class: "card", id: "details" },
      h("h3", {}, "Your details"),
      h(
        "dl",
        { class: "details" },
        keys.flatMap((k) => [
          h("dt", {}, labelOf(k)),
          h(
            "dd",
            {},
            /at$/i.test(k) && Number(me[k])
              ? fmt(Number(me[k]))
              : String(me[k]),
          ),
        ]),
      ),
    );
  }

  // Profile picture: PICTURE_SET (PATCH) sets it, DELETE resets it to the default avatar (/api/users/<id>/picture).
  function avatarCard() {
    let file = null,
      blobUrl = "";
    const pic = h("div", { class: "avatar big" });
    const fileIn = h("input", {
      id: "pf-img",
      type: "file",
      accept: IMG_TYPES.join(","),
      class: "sr-only",
    });
    const chooseTxt = h("span");
    const save = h(
      "button",
      { class: "btn", type: "submit", hidden: true },
      "Save picture",
    );
    const remove = h(
      "button",
      {
        class: "btn ghost bad",
        type: "button",
        hidden: true,
        onclick: () => del(),
      },
      "Remove",
    );
    const sync = () => {
      const src = blobUrl || avatarOf(me);
      pic.replaceChildren(
        src ? h("img", { src, alt: "Profile picture" }) : initialOf(me),
      );
      chooseTxt.textContent = hasCustomAvatar(me)
        ? "Change picture"
        : "Upload picture";
      save.hidden = !file;
      remove.hidden = !hasCustomAvatar(me) || Boolean(file);
    };
    fileIn.addEventListener("change", () => {
      const f = fileIn.files[0];
      fileIn.value = "";
      if (!f) return;
      const bad = imageError(f);
      if (bad) return toast(bad, "bad");
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      file = f;
      blobUrl = URL.createObjectURL(f);
      sync();
    });
    const form = h(
      "form",
      { class: "row avatar-row" },
      pic,
      h(
        "div",
        { class: "stack-sm" },
        h(
          "div",
          { class: "row" },
          h("label", { class: "btn ghost" }, fileIn, chooseTxt),
          save,
          remove,
        ),
        h(
          "small",
          { class: "muted" },
          `JPG, PNG or WebP · max ${IMG_MAX_MB} MB`,
        ),
      ),
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!file) return;
      save.disabled = true;
      try {
        const fd = new FormData();
        fd.append("avatar", file);
        const d = await api(PICTURE_SET, ROUTES.picture, fd);
        const path = d.imagePath ?? d.data?.imagePath; // the upload reply carries the new picture's public path
        if (typeof path === "string" && path) {
          me = {
            ...Object.fromEntries(
              Object.entries(me).filter(([k]) => !AVATAR_KEYS.includes(k)),
            ),
            imagePath: path,
          };
          paintMe();
        } else await loadMe();
        URL.revokeObjectURL(blobUrl);
        file = null;
        blobUrl = "";
        sync();
        toast("Profile picture saved");
      } catch (err) {
        toast(err.message, "bad");
      } finally {
        save.disabled = false;
      }
    });
    async function del() {
      if (
        !(await ask({
          title: "Remove your profile picture?",
          confirm: "Your initial will be shown instead.",
          danger: true,
          submit: "Remove",
        }))
      )
        return;
      try {
        await api("DELETE", ROUTES.picture);
        await loadMe();
        sync(); // the profile now points at the default picture again
        toast("Profile picture removed");
      } catch (err) {
        toast(err.message, "bad");
      }
    }
    sync();
    return h(
      "section",
      { class: "card" },
      h("h3", {}, "Profile picture"),
      h("p", { class: "muted" }, "Shown in the sidebar and on your posts."),
      form,
    );
  }

  function profileView() {
    const root = h(
      "div",
      { class: "stack" },
      h(
        "div",
        { class: "page-head" },
        h(
          "div",
          {},
          h("h1", {}, "Profile"),
          h("p", { class: "muted" }, "Manage your account details."),
        ),
      ),
    );
    const spec = `GET    ${ROUTES.profile}   -> { success:true, user:{ id, name, email, picture: "/uploads/users/abc.webp" } }\nPATCH  ${ROUTES.profile}   <- { name, email }\nDELETE ${ROUTES.profile}\nPATCH  ${ROUTES.password}  <- { currentPassword, newPassword }\n${PICTURE_SET.padEnd(6)} ${ROUTES.picture}   <- multipart/form-data { avatar: <file> }\nDELETE ${ROUTES.picture}   (back to the default)`;

    (async () => {
      try {
        await loadMe();
      } catch (e) {
        root.append(errorBox(e, spec));
        return;
      }
      root.append(
        detailsCard(),
        avatarCard(),
        formCard(
          "Edit your details",
          [
            { name: "name", label: "Full name", required: true, auto: "name" },
            {
              name: "email",
              label: "Email",
              type: "email",
              required: true,
              auto: "email",
            },
          ],
          me,
          async (v) => {
            // UPDATE
            const d = await api("PATCH", ROUTES.profile, v);
            // if the server rotated the token (the old one is gone), keep using the new one
            const fresh = d.user?.token ?? d.token ?? d.data?.token;
            if (typeof fresh === "string" && fresh) {
              TOKEN = fresh;
              sessionStorage.setItem("token", fresh);
            }
            me = { ...me, ...(d.data ?? d.user ?? v) };
            paintMe();
            $("#details")?.replaceWith(detailsCard());
            toast("Profile updated");
          },
        ),
        formCard(
          "Change password",
          [
            {
              name: "currentPassword",
              label: "Current password",
              type: "password",
              required: true,
              auto: "current-password",
            },
            {
              name: "newPassword",
              label: "New password",
              type: "password",
              required: true,
              auto: "new-password",
            },
            {
              name: "confirmPassword",
              label: "Confirm new password",
              type: "password",
              required: true,
              auto: "new-password",
            },
          ],
          null,
          async (v, form) => {
            if (v.newPassword !== v.confirmPassword)
              throw new Error("New passwords do not match.");
            await api("PATCH", ROUTES.password, {
              currentPassword: v.currentPassword,
              newPassword: v.newPassword,
            });
            form.reset();
            toast("Password changed");
          },
          "Update password",
        ),
        h(
          "section",
          { class: "card danger-zone" },
          h("h3", { class: "bad" }, "Delete account"),
          h(
            "p",
            { class: "muted" },
            "Permanently removes your account and signs you out everywhere.",
          ),
          h(
            "div",
            { class: "row" },
            h(
              "button",
              {
                class: "btn danger",
                onclick: async () => {
                  // DELETE
                  if (
                    !(await ask({
                      title: "Delete your account?",
                      confirm: "This cannot be undone.",
                      danger: true,
                      submit: "Delete account",
                    }))
                  )
                    return;
                  try {
                    await api("DELETE", ROUTES.profile);
                    endSession();
                    location.assign("signup.html");
                  } catch (e) {
                    toast(
                      e.missing
                        ? "Route not built yet (delete account)"
                        : e.message,
                      "bad",
                    );
                  }
                },
              },
              "Delete my account",
            ),
          ),
        ),
      );
    })();
    return root;
  }

  /* ============ 9. ROUTER + BOOT ============ */
  const VIEWS = {
    overview: overviewView,
    feed: () => collectionView(RES.posts),
    workouts: () => collectionView(RES.workouts),
    profile: profileView,
    users: usersView,
    "new-post": () => postFormView(),
    "edit-post": (id) => postFormView(id),
  };
  function route() {
    const [key, arg] = (location.hash.replace("#/", "") || "overview").split(
      "/",
    );
    const name = Object.hasOwn(VIEWS, key) ? key : "overview";
    document
      .querySelectorAll("nav a")
      .forEach((a) =>
        a.classList.toggle(
          "active",
          a.dataset.route === (name === "edit-post" ? "feed" : name),
        ),
      );
    $("#view").replaceChildren(VIEWS[name](arg));
    scrollTo(0, 0);
  }
  addEventListener("hashchange", route);

  $("#log-toggle").addEventListener("click", () => {
    $("#log").hidden = !$("#log").hidden;
  });
  $("#logout").addEventListener("click", async () => {
    try {
      await api("POST", ROUTES.logout);
    } catch {
      /* leave anyway */
    }
    endSession();
    location.assign("login.html");
  });

  if (!TOKEN) location.replace("login.html");
  else if (!USER_ID) {
    $("#view").replaceChildren(
      h(
        "div",
        { class: "empty" },
        h("h3", {}, "Your login did not include a user id"),
        h(
          "p",
          { class: "muted" },
          "Every route is now /api/users/<id>, so the login and signup responses must contain user.id. Add it on the server, then log in again.",
        ),
        h(
          "button",
          {
            class: "btn",
            onclick: () => {
              endSession();
              location.assign("login.html");
            },
          },
          "Back to login",
        ),
      ),
    );
  } else
    loadMe()
      .catch((e) => console.warn("Startup request failed:", e.message))
      .finally(route);
})();
