// views/workoutForm.js — Create / edit a workout: a date plus a list of exercises, each with its own measure.
//
// How it works:
//  * `st` is the single draft object. Every input writes into it; the exercise list is drawn FROM it.
//    Typing only updates `st` (so inputs keep focus). Structural changes (add/remove set, change measure…) redraw the list.
//  * Values in `st` are the strings the inputs show. They become numbers only in buildPayload().
//  * Every change is copied to sessionStorage, so a refresh mid-session loses nothing. Save / Cancel clears it.
import { api, many, one } from "../api.js";
import { ROUTES, USER_ID } from "../config.js";
import { h, iconBtn, toast } from "../dom.js";
import { ask, errorBox } from "../ui.js";
import {
  MEASURES,
  STARTERS,
  dayOf,
  guessMeasure,
  newestFirst,
  parseTime,
  suggestTitle,
  summarizeSets,
  timeInput,
  ymd,
} from "../workouts.js";
import { RES } from "./feed.js";

const blankSet = () => ({ reps: "", weight: "", time: "", distance: "" });
const str = (v) => (v == null ? "" : String(v));
const EFFORT_WORDS = ["", "Very easy", "Very easy", "Easy", "Easy", "Moderate", "Moderate", "Hard", "Hard", "Very hard", "All-out"];

// saved exercise -> draft exercise (numbers become the strings the inputs show)
const exToDraft = (ex) => {
  const sets = (Array.isArray(ex.sets) ? ex.sets : []).map((s) => ({
    reps: str(s.reps),
    weight: str(s.weight),
    time: timeInput(s.seconds),
    distance: str(s.distance),
  }));
  return {
    name: str(ex.name),
    measure: Object.hasOwn(MEASURES, ex.measure) ? ex.measure : "reps",
    weighted: sets.some((s) => s.weight !== ""),
    sets: sets.length ? sets : [blankSet()],
  };
};
const toDraft = (w) => ({
  date: dayOf(w) || ymd(),
  title: str(w.title),
  duration: str(w.duration),
  effort: Number(w.effort) || 0,
  notes: str(w.notes),
  exercises: (Array.isArray(w.exercises) ? w.exercises : []).map(exToDraft),
});
const fresh = () => ({ date: ymd(), title: "", duration: "", effort: 0, notes: "", exercises: [] });

// lowercase exercise name -> that exercise as last saved. Map keeps insertion order, and we insert newest first,
// so the first keys are the "recent" exercises and the values give the measure + "last time" sets.
function buildHistory(workouts) {
  const seen = new Map();
  for (const w of [...workouts].sort(newestFirst))
    for (const ex of w.exercises || []) {
      const k = str(ex.name).toLowerCase();
      if (k && !seen.has(k)) seen.set(k, ex);
    }
  return seen;
}

// Draft set (strings) -> saved set. Returns null for an untouched row; throws a short message for a half-filled one.
const num = (v) => Number(str(v).trim().replace(",", ".")); // "5,5" works too
const blank = (v) => str(v).trim() === "";
const round2 = (n) => Math.round(n * 100) / 100;
function toSet(measure, s) {
  if (measure === "reps") {
    if (blank(s.reps) && blank(s.weight)) return null;
    const reps = num(s.reps);
    if (blank(s.reps) || !Number.isInteger(reps) || reps < 1 || reps > 1000) throw new Error("needs reps (a whole number, 1–1000)");
    if (blank(s.weight)) return { reps };
    const weight = num(s.weight);
    if (!(weight > 0 && weight <= 1000)) throw new Error("has an invalid weight (0–1000 kg)");
    return { reps, weight: round2(weight) };
  }
  if (measure === "time") {
    if (blank(s.time)) return null;
    const seconds = parseTime(s.time);
    if (!(seconds >= 1 && seconds <= 86400)) throw new Error("needs a time like 45 or 1:30");
    return { seconds };
  }
  // distance: distance is required, time is optional
  if (blank(s.distance) && blank(s.time)) return null;
  const distance = num(s.distance);
  if (blank(s.distance) || !(distance > 0 && distance <= 1000)) throw new Error("needs a distance in km (up to 1000)");
  if (blank(s.time)) return { distance: round2(distance) };
  const seconds = parseTime(s.time);
  if (!(seconds >= 1 && seconds <= 86400)) throw new Error("needs a time like 28:30");
  return { distance: round2(distance), seconds };
}

export function workoutFormView(id) {
  const editing = Boolean(id);
  const KEY = `workoutDraft:${USER_ID}:${id ?? "new"}`;
  const root = h("div", { class: "stack" });
  const spec = RES.workouts.spec;
  let history = new Map();
  let st = fresh();

  const readDraft = () => {
    try {
      const d = JSON.parse(sessionStorage.getItem(KEY));
      return Array.isArray(d?.exercises) ? d : null;
    } catch {
      return null;
    }
  };
  const saveDraft = () => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(st));
    } catch {
      /* storage blocked: the form still works, it just won't survive a refresh */
    }
  };
  const clearDraft = () => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* nothing to clear */
    }
  };

  async function init(useDraft = true) {
    root.replaceChildren();
    // History is a bonus (recents, measures, "last time"). If the route isn't built or fails, the form still works.
    try {
      const all = many(await api("GET", ROUTES.workouts));
      history = buildHistory(all.filter((w) => String(w.id) !== String(id)));
    } catch {
      history = new Map();
    }
    st = fresh();
    if (editing) {
      try {
        st = toDraft(one(await api("GET", `${ROUTES.workouts}/${encodeURIComponent(id)}`), "workout"));
      } catch (e) {
        root.append(errorBox(e, spec));
        return;
      }
    }
    const saved = useDraft && readDraft();
    if (saved) st = { ...fresh(), ...saved };
    build(Boolean(saved));
  }

  function build(restored) {
    const changed = () => {
      saveDraft();
      titleIn.placeholder = suggestTitle(st.exercises);
    };
    const bind = (el, key) => {
      el.value = st[key];
      el.addEventListener("input", () => {
        st[key] = el.value;
        changed();
      });
      return el;
    };

    /* ---- exercises ---- */
    const exBox = h("div", { class: "stack-sm" });
    const chips = h("div", { class: "row" });

    const drawExercises = () => {
      exBox.replaceChildren(
        ...(st.exercises.length
          ? st.exercises.map(exCard)
          : [h("p", { class: "muted" }, "No exercises yet. Add your first one below.")]),
      );
      drawChips();
    };

    function drawChips() {
      const inWorkout = new Set(st.exercises.map((e) => e.name.toLowerCase()));
      const names = [...[...history.values()].map((e) => str(e.name)), ...STARTERS]
        .filter((n, i, a) => a.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === i && !inWorkout.has(n.toLowerCase()))
        .slice(0, 8);
      chips.replaceChildren(
        ...(names.length ? [h("small", { class: "muted" }, history.size ? "Recent:" : "Quick add:")] : []),
        ...names.map((n) => h("button", { type: "button", class: "pick", onclick: () => addExercise(n) }, `+ ${n}`)),
      );
    }

    function addExercise(raw) {
      const name = raw.trim().replace(/\s+/g, " ").slice(0, 40);
      if (!name) return;
      const prev = history.get(name.toLowerCase()); // known exercise: reuse its measure, casing and last sets
      st.exercises.push(
        prev ? exToDraft(prev) : { name: name[0].toUpperCase() + name.slice(1), measure: guessMeasure(name), weighted: false, sets: [blankSet()] },
      );
      changed();
      drawExercises();
      exBox.lastElementChild.querySelector(".set-row input")?.focus();
    }

    async function setMeasure(ex, m) {
      if (ex.measure === m) return;
      const dirty = ex.sets.some((s) => s.reps || s.weight || s.time || s.distance);
      if (
        dirty &&
        !(await ask({
          title: `Switch ${ex.name} to ${MEASURES[m].toLowerCase()}?`,
          confirm: "The sets you entered for this exercise will be cleared.",
          submit: "Switch",
        }))
      )
        return;
      Object.assign(ex, { measure: m, weighted: false, sets: [blankSet()] });
      changed();
      drawExercises();
    }

    function addSet(ex) {
      ex.sets.push({ ...(ex.sets.at(-1) ?? blankSet()) }); // most sets repeat the previous one, so copy it
      changed();
      drawExercises();
      const rows = exBox.children[st.exercises.indexOf(ex)].querySelectorAll(".set-row");
      rows[rows.length - 1].querySelector("input")?.select();
    }

    function removeSet(ex, j) {
      ex.sets.splice(j, 1);
      if (!ex.sets.length) ex.sets.push(blankSet()); // an exercise always keeps one row
      changed();
      drawExercises();
    }

    function setRow(ex, s, j) {
      const field = (key, label, mode, unit, ph = unit) => {
        const el = h("input", {
          class: "set-in",
          type: "text",
          inputmode: mode,
          placeholder: ph,
          autocomplete: "off",
          maxlength: 9,
          "aria-label": `${ex.name} set ${j + 1} ${label}`,
        });
        el.value = s[key];
        el.addEventListener("input", () => {
          s[key] = el.value;
          changed();
        });
        return h("span", { class: "set-f" }, el, unit && h("span", { class: "unit" }, unit));
      };
      const cols =
        ex.measure === "reps"
          ? [field("reps", "reps", "numeric", "reps"), ex.weighted && field("weight", "weight", "decimal", "kg")]
          : ex.measure === "time"
            ? [field("time", "time", "text", "", "45 or 1:30")]
            : [field("distance", "distance", "decimal", "km"), field("time", "time", "text", "", "time (m:ss)")];
      return h(
        "div",
        { class: "set-row" },
        h("span", { class: "set-n" }, String(j + 1)),
        cols,
        iconBtn("close", `Remove set ${j + 1}`, () => removeSet(ex, j), "bad"),
      );
    }

    function exCard(ex) {
      const last = history.get(ex.name.toLowerCase());
      return h(
        "section",
        { class: "ex" },
        h(
          "div",
          { class: "between ex-head" },
          h("strong", { class: "ex-name" }, ex.name),
          iconBtn(
            "close",
            `Remove ${ex.name}`,
            () => {
              st.exercises.splice(st.exercises.indexOf(ex), 1);
              changed();
              drawExercises();
            },
            "bad",
          ),
        ),
        h(
          "div",
          { class: "seg-group", role: "group", "aria-label": `Measure for ${ex.name}` },
          Object.entries(MEASURES).map(([m, label]) =>
            h("button", { type: "button", class: "seg", "aria-pressed": String(ex.measure === m), onclick: () => setMeasure(ex, m) }, label),
          ),
        ),
        last && h("small", { class: "muted" }, `Last time: ${summarizeSets(last)}`),
        h("div", { class: "stack-sm" }, ex.sets.map((s, j) => setRow(ex, s, j))),
        h(
          "div",
          { class: "row" },
          h("button", { type: "button", class: "link", onclick: () => addSet(ex) }, "+ Add set (copies previous)"),
          ex.measure === "reps" &&
            h(
              "button",
              {
                type: "button",
                class: "link",
                onclick: () => {
                  ex.weighted = !ex.weighted;
                  if (!ex.weighted) ex.sets.forEach((s) => (s.weight = "")); // dropping weight drops the values too
                  changed();
                  drawExercises();
                },
              },
              ex.weighted ? "Remove weight" : "+ Add weight",
            ),
        ),
      );
    }

    // add by typing: the datalist offers every name seen before
    const nameIn = h("input", { id: "w-ex", list: "w-names", maxlength: 40, autocomplete: "off", placeholder: "Exercise name, e.g. Push-ups" });
    const datalist = h(
      "datalist",
      { id: "w-names" },
      [...new Set([...[...history.values()].map((e) => str(e.name)), ...STARTERS])].map((n) => h("option", { value: n })),
    );
    const addFromInput = () => {
      addExercise(nameIn.value);
      nameIn.value = "";
    };
    nameIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addFromInput();
      }
    });

    /* ---- effort 1-10: one tap, tap again to clear ---- */
    const effortHint = h("small", { class: "muted" });
    const effortBtns = Array.from({ length: 10 }, (_, k) =>
      h(
        "button",
        {
          type: "button",
          class: "eff",
          onclick: () => {
            st.effort = st.effort === k + 1 ? 0 : k + 1;
            paintEffort();
            changed();
          },
        },
        String(k + 1),
      ),
    );
    const paintEffort = () => {
      effortBtns.forEach((b, k) => {
        b.setAttribute("aria-pressed", String(st.effort === k + 1));
        b.classList.toggle("on", k + 1 < st.effort);
      });
      effortHint.textContent = EFFORT_WORDS[st.effort];
    };

    /* ---- top + bottom fields ---- */
    const titleIn = bind(h("input", { id: "w-title", maxlength: 80, autocomplete: "off", placeholder: suggestTitle(st.exercises) }), "title");
    const dateIn = bind(h("input", { id: "w-date", type: "date", required: true, max: ymd() }), "date");
    const durIn = bind(h("input", { id: "w-dur", type: "text", inputmode: "numeric", maxlength: 4, placeholder: "e.g. 45", autocomplete: "off" }), "duration");
    const notesIn = bind(h("textarea", { id: "w-notes", rows: 3, maxlength: 300, placeholder: "How did it feel? Anything to remember next time?" }), "notes");

    const submit = h("button", { class: "btn", type: "submit" }, editing ? "Save changes" : "Save workout");
    const discard = async () => {
      clearDraft();
      await init(false);
    };
    const form = h(
      "form",
      { class: "card form wk-form", novalidate: true },
      restored &&
        h(
          "div",
          { class: "wk-banner" },
          h("span", {}, "Your unsaved draft was restored."),
          h("button", { type: "button", class: "link bad", onclick: discard }, "Discard draft"),
        ),
      h(
        "div",
        { class: "wk-top" },
        h("div", { class: "field" }, h("label", { for: "w-date" }, "Date"), dateIn),
        h("div", { class: "field" }, h("label", { for: "w-title" }, "Title (optional)"), titleIn),
      ),
      h("div", { class: "field" }, h("label", {}, "Exercises"), exBox),
      h(
        "div",
        { class: "stack-sm" },
        h("div", { class: "add-ex" }, nameIn, datalist, h("button", { type: "button", class: "btn ghost", onclick: addFromInput }, "Add exercise")),
        chips,
      ),
      h(
        "div",
        { class: "field" },
        h("div", { class: "between" }, h("label", {}, "Effort (optional)"), effortHint),
        h("div", { class: "effort", role: "group", "aria-label": "Effort from 1 to 10" }, effortBtns),
      ),
      h("div", { class: "field wk-dur" }, h("label", { for: "w-dur" }, "Duration in minutes (optional)"), durIn),
      h("div", { class: "field" }, h("label", { for: "w-notes" }, "Notes (optional)"), notesIn),
      h("div", { class: "row end" }, h("a", { class: "btn ghost", href: "#/workouts", onclick: clearDraft }, "Cancel"), submit),
    );
    // Enter inside a number box must not submit the whole workout by accident
    form.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.matches("input")) e.preventDefault();
    });

    /* ---- save: validate, clean, send JSON ---- */
    function buildPayload() {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(st.date) || st.date > ymd()) throw new Error("Pick a date that is today or earlier.");
      const exercises = [];
      for (const ex of st.exercises) {
        const sets = [];
        for (const [j, s] of ex.sets.entries()) {
          try {
            const clean = toSet(ex.measure, s);
            if (clean) sets.push(clean); // untouched rows are simply dropped
          } catch (e) {
            throw new Error(`${ex.name}, set ${j + 1} ${e.message}.`);
          }
        }
        if (sets.length) exercises.push({ name: ex.name, measure: ex.measure, sets });
      }
      if (!exercises.length) throw new Error("Add at least one exercise with a filled-in set.");
      const payload = { title: st.title.trim().slice(0, 80) || suggestTitle(exercises), date: st.date, exercises };
      // Optional fields. On create an empty one is simply left out. On edit the request is a PATCH, where a missing key means
      // "leave as it was", so a field the user cleared must be sent as null or the old value would survive.
      const empty = editing ? null : undefined;
      if (!blank(st.duration)) {
        const d = num(st.duration);
        if (!Number.isInteger(d) || d < 1 || d > 1440) throw new Error("Duration must be a whole number of minutes (1–1440).");
        payload.duration = d;
      } else if (editing) payload.duration = empty;
      if (st.effort) payload.effort = st.effort;
      else if (editing) payload.effort = empty;
      if (st.notes.trim()) payload.notes = st.notes.trim();
      else if (editing) payload.notes = empty;
      return payload;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      let payload;
      try {
        payload = buildPayload();
      } catch (err) {
        return toast(err.message, "bad");
      }
      submit.disabled = true;
      try {
        await api(
          editing ? RES.workouts.update : "POST", // one source of truth for the method: RES.workouts.update (PATCH)
          editing ? `${ROUTES.workouts}/${encodeURIComponent(id)}` : ROUTES.workouts,
          payload,
        );
        clearDraft();
        toast(editing ? "Workout updated" : "Workout logged");
        location.hash = "#/workouts";
      } catch (err) {
        toast(err.missing ? "Route not built yet (workouts)" : err.message, "bad");
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
          h("h1", {}, editing ? "Edit workout" : "Log workout"),
          h("p", { class: "muted" }, editing ? "Update your session." : "Record what you actually did."),
        ),
      ),
      form,
    );
    drawExercises();
    paintEffort();
  }

  init();
  return root;
}
