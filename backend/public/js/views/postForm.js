// views/postForm.js — Create / edit a post (one multipart request) with a live preview.
import { api, one } from "../api.js";
import { ROUTES } from "../config.js";
import { h, ico, toast } from "../dom.js";
import {
  CATEGORIES,
  IMG_MAX_MB,
  IMG_TYPES,
  imageError,
  imageSrc,
  makeImg,
  okUrl,
  tagsOf,
} from "../helpers.js";
import { postCard } from "../postCard.js";
import { state } from "../state.js";
import { errorBox } from "../ui.js";
import { RES } from "./feed.js";

export function postFormView(id) {
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
              author: { authorName: state.me?.name || "You" },
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
      if (!f && !file) st.imageUrl = ""; // "Remove image" with no new pick drops the saved image; with a pick it only discards the pick
      file = f || null;
      blobUrl = f ? URL.createObjectURL(f) : "";
      removeBtn.textContent = f ? "Discard new image" : "Remove image";
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
      h("small", { class: "muted" }, `JPG, PNG or WebP · max ${IMG_MAX_MB} MB`),
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
        h("small", { class: "muted" }, "Press Enter or comma after each tag."),
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
          editing ? `${ROUTES.posts}/${encodeURIComponent(id)}` : ROUTES.posts,
          fd,
        );
        toast(editing ? "Post updated" : "Post published");
        location.hash = "#/feed";
      } catch (err) {
        toast(err.missing ? "Route not built yet (posts)" : err.message, "bad");
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
