// ui.js — Shared UI pieces: the modal (ask), form fields, route-not-built box, form cards.
import { $, h, toast } from "./dom.js";

export const dlg = $("#modal");
export function fieldEl(f, val = "") {
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
  return h("div", { class: "field" }, h("label", { for: id }, f.label), input);
}
// Resolves to the form values (an object), or null if cancelled.
export const ask = ({
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

export const contract = (path, fields, upd = "PUT") =>
  [
    `GET    ${path}        -> { success:true, data:[ ... ] }`,
    `POST   ${path}        <- { ${fields.join(", ")} }`,
    `GET    ${path}/:id    -> { success:true, data:{ ... } }`,
    `${upd.padEnd(6)} ${path}/:id    <- { ${fields.join(", ")} }`,
    `DELETE ${path}/:id`,
  ].join("\n");

export function errorBox(e, spec, retry) {
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

export function formCard(
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
