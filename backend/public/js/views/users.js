// views/users.js — Users page (master admin only).
import { api, many } from "../api.js";
import { ROUTES, USER_ID } from "../config.js";
import { h, toast } from "../dom.js";
import { ask, errorBox } from "../ui.js";

export function usersView() {
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
  const spec = `GET    ${ROUTES.users}       -> { success:true, data:[ { id, name, email } ] }   (no q: master admin only, 403 for everyone else. With ?q=, any logged-in user gets { id, name } matches only, used by the workout Share dialog)\nDELETE ${ROUTES.users}/:id`;

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