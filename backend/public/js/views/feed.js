// views/feed.js — Feed + Workouts list pages (one generic CRUD view) and the RES config.
import { api, many, one } from "../api.js";
import { ROUTES } from "../config.js";
import { fmt, h, toast } from "../dom.js";
import { authorOf, owned } from "../helpers.js";
import { postCard } from "../postCard.js";
import { ask, contract, errorBox } from "../ui.js";
import { workoutCard } from "../workoutCard.js";
import { SHARE_SPEC, shareDialog } from "../workoutShare.js";
import { newestFirst } from "../workouts.js";

export const RES = {
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
PATCH  ${ROUTES.posts}/:id/comments/:commentId   <- { "text": "..." } (the comment's author only)
DELETE ${ROUTES.posts}/:id/comments/:commentId`,
    card: (it, a) => postCard(it, a),
  },
  workouts: {
    title: "Workouts",
    sub: "Log and manage your sessions.",
    noun: "workout",
    btn: "+ Log workout",
    path: ROUTES.workouts,
    form: true, // full-page form (#/new-workout), not the modal
    update: "PATCH",
    routes: { add: "#/new-workout", edit: (id) => `#/edit-workout/${id}` },
    sort: newestFirst,
    gridClass: "wk-grid",
    share: true, // owners get a Share button on each card
    spec: `GET    ${ROUTES.workouts}        -> { success:true, data:[ { id, title, date, duration, effort, notes, exercises, createdAt } ] }
POST   ${ROUTES.workouts}        <- JSON: { title, date, duration?, effort?, notes?, exercises }
GET    ${ROUTES.workouts}/:id    -> { success:true, data:{ ... } }
PATCH  ${ROUTES.workouts}/:id    <- JSON with any of the fields below. A missing key leaves that field as it was; null clears an optional
                                   field (duration, effort, notes); exercises, when sent, replaces the whole list. Never writable here: id, authorId, createdAt, sharedWith.
DELETE ${ROUTES.workouts}/:id

  title     string 1-80      (the form fills one in if the user leaves it blank)
  date      "YYYY-MM-DD", not in the future
  duration  integer minutes 1-1440, optional
  effort    integer 1-10, optional
  notes     string up to 300, optional
  exercises array, at least 1: { name (1-40), measure: "reps" | "time" | "distance", sets: [ ... ] }, every set matching its measure:
      reps      -> { reps: int 1-1000, weight?: number kg > 0 }     (no weight = bodyweight)
      time      -> { seconds: int 1-86400 }
      distance  -> { distance: number km > 0, seconds?: int 1-86400 }

sharedWith (a list of user ids on each workout) is changed ONLY by the share routes: POST and PATCH ignore it, even if a client sends it (whitelist the fields you accept).

${SHARE_SPEC}`,
    card: (it, a) => workoutCard(it, a),
  },
};

export function collectionView(r) {
  const spec =
    r.spec ??
    contract(
      r.path,
      r.fields.map((f) => f.name),
      r.update || "PATCH",
    );
  const body = h("div", { class: r.noun === "post" ? "feed" : `grid ${r.gridClass ?? ""}` });
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
          owned(it)
            ? { onEdit: () => edit(it), onDel: () => del(it), onShare: r.share ? () => shareDialog(it, { onChange: load }) : undefined }
            : {},
        )
      : plainCard(it);

  async function load() {
    // READ (list)
    body.replaceChildren(
      ...[1, 2, 3].map(() => h("div", { class: "card skeleton" })),
    );
    try {
      const items = many(await api("GET", r.path));
      if (r.sort) items.sort(r.sort);
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
      location.hash = r.routes?.add ?? "#/new-post";
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
      location.hash = r.routes?.edit(it.id) ?? `#/edit-post/${it.id}`;
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
      await api(r.update || "PATCH", `${r.path}/${it.id}`, v);
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
