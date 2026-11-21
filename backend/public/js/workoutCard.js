// workoutCard.js — One workout as a card: date badge + title, headline numbers, then each exercise with its sets as pills.
import { h } from "./dom.js";
import { dayOf, parseDay, relDay, setPills, totals } from "./workouts.js";

const MAX_PILLS = 8; // a 20-set exercise shouldn't make the card huge

const tile = (label, value, extra) =>
  h("div", { class: "wk-tile" }, h("small", {}, label), h("b", {}, value), extra);

export function workoutCard(it, { onEdit, onDel, onShare } = {}) {
  const exs = Array.isArray(it.exercises) ? it.exercises : [];
  const dayStr = dayOf(it);
  const day = dayStr ? parseDay(dayStr) : null;
  const t = totals(it);
  const sharedN = Array.isArray(it.sharedWith) ? it.sharedWith.length : 0; // set by the server, only for the owner

  // Headline numbers. Only tiles that have data are drawn; the third one adapts to the kind of training.
  const effort = Number(it.effort) || 0;
  const tiles = [
    it.duration && tile("Duration", `${it.duration} min`),
    effort > 0 &&
      tile(
        "Effort",
        `${effort}/10`,
        h("div", { class: "eff-bar", "aria-hidden": "true" }, Array.from({ length: 10 }, (_, k) => h("i", { class: k < effort ? "on" : "" }))),
      ),
    t.volume > 0
      ? tile("Volume", `${Math.round(t.volume).toLocaleString()} kg`)
      : t.km > 0
        ? tile("Distance", `${Math.round(t.km * 100) / 100} km`)
        : t.reps > 0 && tile("Total reps", t.reps.toLocaleString()),
  ].filter(Boolean);

  const sub = [dayStr && relDay(dayStr), !exs.length && it.type].filter(Boolean).join(" · "); // old workouts keep their type

  return h(
    "article",
    { class: "card workout" },
    h(
      "header",
      { class: "wk-head" },
      day &&
        h(
          "div",
          { class: "wk-date", "aria-hidden": "true" },
          h("small", {}, day.toLocaleDateString([], { month: "short" })),
          h("b", {}, String(day.getDate())),
        ),
      h("div", { class: "wk-headtext" }, h("h3", { class: "wk-title" }, it.title), sub && h("p", { class: "muted" }, sub)),
    ),
    tiles.length > 0 && h("div", { class: "wk-tiles" }, tiles),
    exs.length > 0 &&
      h(
        "ul",
        { class: "ex-list" },
        exs.map((ex) => {
          const pills = setPills(ex);
          const shown = pills.slice(0, MAX_PILLS);
          return h(
            "li",
            {},
            h("strong", {}, ex.name),
            h(
              "div",
              { class: "setps" },
              shown.map((p) => h("span", { class: "setp" }, /^\d+$/.test(p) ? `${p} reps` : p)), // bare numbers are bodyweight reps
              pills.length > shown.length && h("span", { class: "setp more" }, `+${pills.length - shown.length} more`),
            ),
          );
        }),
      ),
    it.notes && h("p", { class: "wk-note" }, it.notes),
    h(
      "footer",
      { class: "card-foot" },
      h("span", { class: "muted" }, [exs.length > 0 && `${exs.length} exercise${exs.length > 1 ? "s" : ""}`, sharedN > 0 && `Shared with ${sharedN}`].filter(Boolean).join(" · ")),
      (onEdit || onDel || onShare) &&
        h(
          "span",
          { class: "row" },
          onShare && h("button", { class: "link", onclick: onShare }, "Share"),
          onEdit && h("button", { class: "link", onclick: onEdit }, "Edit"),
          onDel && h("button", { class: "link bad", onclick: onDel }, "Delete"),
        ),
    ),
  );
}
