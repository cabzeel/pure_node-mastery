// views/profile.js — Profile page: details, picture, edit, password, delete account; also loadMe/paintMe for the sidebar.
import { api } from "../api.js";
import { PICTURE_SET, ROUTES, endSession, setToken } from "../config.js";
import { $, fmt, h, toast } from "../dom.js";
import {
  AVATAR_KEYS,
  IMG_MAX_MB,
  IMG_TYPES,
  avatarOf,
  hasCustomAvatar,
  imageError,
  initialOf,
} from "../helpers.js";
import { state } from "../state.js";
import { ask, errorBox, formCard } from "../ui.js";

export const paintMe = () => {
  // sidebar user chip
  $("#me-name").textContent = state.me.name || "You";
  $("#me-email").textContent = state.me.email || "";
  $("#nav-users").hidden = !(
    state.me.role === "admin" || state.me.isAdmin === true
  ); // the Users page is for the master admin
  const pic = avatarOf(state.me);
  $("#avatar").replaceChildren(
    pic ? h("img", { src: pic, alt: "" }) : initialOf(state.me),
  );
};
export async function loadMe() {
  const d = await api("GET", ROUTES.profile);
  state.me = d.data ?? d.user ?? d;
  if (!avatarOf(state.me))
    console.info(
      "[dashboard] no usable picture path in the profile response, so no image is requested.",
      "\nKeys received:",
      Object.keys(state.me).join(", "),
      "\nPicture-like values received:",
      JSON.stringify(
        Object.fromEntries(
          AVATAR_KEYS.filter((k) => k in state.me).map((k) => [k, state.me[k]]),
        ),
      ),
    );
  paintMe();
}

// Read-only snapshot of what the server currently has on you. Anything new you add to the
// profile response later (bio, phone, createdAt...) shows up here automatically.
export const HIDDEN = [
  "password",
  "salt",
  "token",
  "hash",
  ...AVATAR_KEYS.map((k) => k.toLowerCase()),
]; // never display these, even if the API leaks them
export const labelOf = (k) =>
  k
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
export function detailsCard() {
  const first = ["name", "email", "id"];
  const keys = [
    ...first.filter((k) => k in state.me),
    ...Object.keys(state.me).filter((k) => !first.includes(k)),
  ].filter(
    (k) => !HIDDEN.includes(k.toLowerCase()) && typeof state.me[k] !== "object",
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
          /at$/i.test(k) && Number(state.me[k])
            ? fmt(Number(state.me[k]))
            : String(state.me[k]),
        ),
      ]),
    ),
  );
}

// Profile picture: PICTURE_SET (PATCH) sets it, DELETE resets it to the default avatar (/api/users/<id>/picture).
export function avatarCard() {
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
    const src = blobUrl || avatarOf(state.me);
    pic.replaceChildren(
      src ? h("img", { src, alt: "Profile picture" }) : initialOf(state.me),
    );
    chooseTxt.textContent = hasCustomAvatar(state.me)
      ? "Change picture"
      : "Upload picture";
    save.hidden = !file;
    remove.hidden = !hasCustomAvatar(state.me) || Boolean(file);
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
      h("small", { class: "muted" }, `JPG, PNG or WebP · max ${IMG_MAX_MB} MB`),
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
        state.me = {
          ...Object.fromEntries(
            Object.entries(state.me).filter(([k]) => !AVATAR_KEYS.includes(k)),
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

export function profileView() {
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
        state.me,
        async (v) => {
          // UPDATE
          const d = await api("PATCH", ROUTES.profile, v);
          // if the server rotated the token (the old one is gone), keep using the new one
          const fresh = d.user?.token ?? d.token ?? d.data?.token;
          if (typeof fresh === "string" && fresh) setToken(fresh);
          state.me = { ...state.me, ...(d.data ?? d.user ?? v) };
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
