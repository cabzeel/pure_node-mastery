/* dashboard.js — the whole dashboard front end (pure JS, no libraries).
 *
 * How it works:
 *  - All "pages" are views swapped inside this one page using the #hash (dashboard.html#/feed).
 *  - The login token lives in sessionStorage (cleared when the tab closes) and is sent on every
 *    request in the Authorization header as "Bearer <token>". It is never put in a URL.
 *  - Every request goes through api(), which adds that header.
 *  - Backend paths live ONLY in ROUTES below. Change them there if your routes differ.
 */
(() => {
  "use strict";

  /* ============ 1. ROUTE MAP (edit to match your server) ============ */
  const BASE = location.origin;
  // auth.js stores the token in sessionStorage when you log in or sign up.
  const TOKEN = sessionStorage.getItem("token");
  const endSession = () => sessionStorage.removeItem("token");
  const ROUTES = {
    profile: "/api/user/profile", // GET | PATCH {name,email} | DELETE
    password: "/api/user/password", // PATCH {currentPassword,newPassword}
    posts: "/api/posts", // GET | POST ; /:id -> GET | PATCH | DELETE
    workouts: "/api/workouts", // GET | POST ; /:id -> GET | PUT | DELETE
    uploads: "/api/uploads", // POST raw image bytes -> { success:true, url:'/uploads/xyz.jpg' }
    logout: "/api/logout", // POST (already built)
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
    let res, raw;
    try {
      const isFile = body instanceof Blob; // images go as raw bytes, everything else as JSON
      res = await fetch(url, {
        method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${TOKEN}`,
          ...(body && {
            "content-type": isFile ? body.type : "application/json",
          }),
        },
        body: isFile ? body : body && JSON.stringify(body),
      });
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
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      /* not JSON */
    }
    // Your static handler replies to unknown URLs with the HTML 404 page, so "not JSON" == route not built yet.
    if (!data) throw new ApiError(res.status, "Route not built yet", true);
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
    Array.isArray(d) ? d : (d.data ?? d.items ?? d.posts ?? d.workouts ?? []);

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
  const CATEGORIES = [
    "General",
    "Workout",
    "Nutrition",
    "Progress",
    "Question",
    "Event",
  ];
  const okUrl = (u) => /^(https?:\/\/\S+|\/(?!\/)\S+)$/i.test(u || ""); // absolute http(s) or a /path on this server
  const authorOf = (it) =>
    (typeof it.author === "object" ? it.author?.name : it.author) ||
    it.authorName;
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
  const postBody = (p, img = okUrl(p.imageUrl) && makeImg(p.imageUrl)) => [
    img,
    p.category && h("span", { class: "chip" }, p.category),
    h("h3", {}, p.title || "Untitled"),
    h("p", { class: "post" }, p.body),
    p.tags?.length > 0 &&
      h(
        "div",
        { class: "tags" },
        p.tags.map((t) => h("span", { class: "tag" }, `#${t}`)),
      ),
  ];

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
      fields: [
        "title",
        "body",
        "imageUrl",
        "tags",
        "category",
        "allowComments",
      ].map((name) => ({ name })),
      render: (it) => postBody(it),
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
  const owner = (it) => it.userId ?? it.authorId ?? it.ownerId ?? it.author?.id;
  // Show Edit/Delete only on your own items. If the API sends no owner info, assume yours.
  const owned = (it) =>
    it.isMine ?? (owner(it) === undefined || owner(it) === me?.id);

  function collectionView(r) {
    const spec = contract(
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

    const card = (it) =>
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
              Number.isFinite(it.likes) && `${it.likes} likes`,
              Number.isFinite(it.comments) && `${it.comments} comments`,
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

    async function load() {
      // READ (list)
      body.replaceChildren(h("p", { class: "muted" }, "Loading…"));
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
    const spec = contract(
      ROUTES.posts,
      RES.posts.fields.map((f) => f.name),
      "PATCH",
    );

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
      st.allowComments = st.allowComments !== false;
      st.category ||= "General";
      st.title ||= "";
      st.body ||= "";
      st.imageUrl ||= "";
      st.tags = [...(st.tags || [])];

      // live preview: re-uses the exact same postBody() the feed cards use
      const preview = h("article", { class: "card preview" });
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
            postBody(st, imgEl),
            h(
              "footer",
              { class: "card-foot" },
              h("span", { class: "muted" }, `${me?.name || "You"} · just now`),
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
      const ALLOWED = ["image/jpeg", "image/png", "image/webp"],
        MAX_MB = 2;
      const fileIn = h("input", {
        id: "p-img",
        type: "file",
        accept: ALLOWED.join(","),
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
        if (f && !ALLOWED.includes(f.type))
          return toast("Choose a JPG, PNG or WebP image.", "bad");
        if (f && f.size > MAX_MB * 1024 * 1024)
          return toast(`Image must be under ${MAX_MB} MB.`, "bad");
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
        h("strong", {}, "Click to choose an image"),
        "or drag it here",
        h("small", { class: "muted" }, `JPG, PNG or WebP · max ${MAX_MB} MB`),
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
          if (file) {
            // step 1: upload the image, the server answers with its URL
            const up = await api("POST", ROUTES.uploads, file).catch((err) => {
              throw err.missing
                ? new Error(
                    "Image upload route is not built yet. Remove the image to post without one.",
                  )
                : err;
            });
            const url = up.url ?? up.imageUrl ?? up.data?.url ?? up.data;
            if (typeof url !== "string" || !okUrl(url))
              throw new Error(
                "Upload worked but the server did not return an image URL.",
              );
            st.imageUrl = url;
            file = null; // a retry after a failed post will not upload twice
          }
          // step 2: only these fields are sent. The server decides author, id, dates and counts.
          const payload = {
            title: t,
            body: b,
            tags: st.tags,
            category: st.category,
            allowComments: st.allowComments,
            ...((editing || st.imageUrl) && { imageUrl: st.imageUrl }),
          };
          await api(
            editing ? "PATCH" : "POST",
            editing
              ? `${ROUTES.posts}/${encodeURIComponent(id)}`
              : ROUTES.posts,
            payload,
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

  /* ============ 8. PROFILE (read / update / password / delete account) ============ */
  const paintMe = () => {
    // sidebar user chip
    $("#me-name").textContent = me.name || "You";
    $("#me-email").textContent = me.email || "";
    $("#avatar").textContent = (me.name || me.email || "?")[0].toUpperCase();
  };
  async function loadMe() {
    const d = await api("GET", ROUTES.profile);
    me = d.data ?? d.user ?? d;
    paintMe();
  }

  // Read-only snapshot of what the server currently has on you. Anything new you add to the
  // profile response later (bio, phone, createdAt...) shows up here automatically.
  const HIDDEN = ["password", "salt", "token", "hash"]; // never display these, even if the API leaks them
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
    const spec = `GET    ${ROUTES.profile}   -> { success:true, user:{ name, email } }\nPATCH  ${ROUTES.profile}   <- { name, email }\nDELETE ${ROUTES.profile}\nPATCH  ${ROUTES.password}  <- { currentPassword, newPassword }`;

    (async () => {
      try {
        await loadMe();
      } catch (e) {
        root.append(errorBox(e, spec));
        return;
      }
      root.append(
        detailsCard(),
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
          a.dataset.route === (name.endsWith("-post") ? "feed" : name),
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
  else
    loadMe()
      .catch(() => {
        /* profile route may not exist yet; the UI still works */
      })
      .finally(route);
})();
