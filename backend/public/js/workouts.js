// workouts.js — Pure workout helpers (no DOM): measures, time + pace formatting, set summaries, dates, stats.
//
// A workout is { id, title, date: "YYYY-MM-DD", duration?, effort?, notes?, exercises: [ { name, measure, sets } ] }
// and each exercise carries its own measure, so one workout can mix gym lifts, bodyweight work and a run:
//   measure "reps"     -> sets: { reps, weight? }          (no weight = bodyweight)
//   measure "time"     -> sets: { seconds }                (planks, wall sits)
//   measure "distance" -> sets: { distance (km), seconds? }

export const MEASURES = { reps: "Reps", time: "Time", distance: "Distance" };
export const STARTERS = ["Push-ups", "Squat", "Plank", "Run"]; // quick-add chips until the user has history

// Only a first guess for a brand-new exercise name. After that the measure comes from the user's own history.
const TIME_HINT = /plank|hold|hang|wall sit|stretch|bridge/i;
const DIST_HINT =
  /\b(run|running|jog|jogging|sprints?|cycling|bike|biking|swim|swimming|hike|hiking|walk)\b/i;
export const guessMeasure = (name) =>
  TIME_HINT.test(name) ? "time" : DIST_HINT.test(name) ? "distance" : "reps";

/* ---- time ---- */
// "45" -> 45, "1:30" -> 90, "1:02:03" -> 3723. Anything else -> NaN (callers check for a blank first).
export const parseTime = (v) => {
  const parts = String(v ?? "")
    .trim()
    .split(":");
  if (parts.length > 3 || !parts.every((p) => /^\d{1,5}$/.test(p))) return NaN;
  if (!parts.slice(1).every((p) => Number(p) < 60)) return NaN; // "1:75" is not a time
  return parts.reduce((t, p) => t * 60 + Number(p), 0);
};
const pad = (n) => String(n).padStart(2, "0");
export const fmtClock = (sec) => {
  const s = Math.round(sec);
  const hh = Math.floor(s / 3600),
    mm = Math.floor((s % 3600) / 60),
    ss = s % 60;
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
};
export const fmtDur = (sec) => (sec < 60 ? `${sec}s` : fmtClock(sec)); // "45s", "1:30"
export const timeInput = (sec) => (sec ? (sec < 60 ? String(sec) : fmtClock(sec)) : ""); // what the time box shows when editing
export const pace = (km, sec) => (km > 0 && sec > 0 ? `${fmtClock(sec / km)}/km` : "");

/* ---- one set / one exercise as text ---- */
export const setLabel = (measure, s) => {
  if (measure === "time") return fmtDur(s.seconds);
  if (measure === "distance") {
    const p = pace(s.distance, s.seconds);
    return `${s.distance} km${s.seconds ? ` in ${fmtDur(s.seconds)}${p ? ` (${p})` : ""}` : ""}`;
  }
  return `${s.reps}${s.weight ? ` @ ${s.weight}kg` : ""}`;
};
// Identical sets collapse into one label: 3×8 @ 60kg. Different sets stay separate: 15, 12, 10
export const setPills = ({ measure, sets = [] }) => {
  const labels = sets.map((s) => setLabel(measure, s));
  if (measure !== "distance" && labels.length && labels.every((l) => l === labels[0]))
    return [`${labels.length}×${labels[0]}`];
  return labels;
};
export const summarizeSets = (ex) => setPills(ex).join(" · ");

// Suggested title when the user leaves it blank
export const suggestTitle = (exs) => {
  const n = exs.map((e) => e.name);
  const t = !n.length ? "Workout" : n.length === 1 ? n[0] : n.length === 2 ? `${n[0]} & ${n[1]}` : `${n[0]}, ${n[1]} +${n.length - 2}`;
  return t.slice(0, 80);
};

/* ---- dates: a workout's day is the "YYYY-MM-DD" the user picked, never a timestamp, so time zones can't move it ---- */
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
// Old workouts (before this form) have no date: fall back to when they were created.
export const dayOf = (w) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(w.date ?? "")) return w.date;
  const d = new Date(w.createdAt);
  return w.createdAt && !Number.isNaN(+d) ? ymd(d) : "";
};
export const newestFirst = (a, b) =>
  dayOf(b).localeCompare(dayOf(a)) || new Date(b.createdAt || 0) - new Date(a.createdAt || 0);

// "Today", "Yesterday", "3 days ago", then just the weekday ("Tuesday"), with the year added when it isn't this year.
// The date itself is already on the card's badge, so it isn't repeated here.
export const relDay = (day, today = new Date()) => {
  const d = parseDay(day);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((t0 - d) / 864e5);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  const weekday = d.toLocaleDateString([], { weekday: "long" });
  return d.getFullYear() === t0.getFullYear() ? weekday : `${weekday}, ${d.getFullYear()}`;
};

/* ---- stats ---- */
export const totals = (w) => {
  let volume = 0,
    reps = 0,
    km = 0;
  for (const ex of w.exercises || [])
    for (const s of ex.sets || []) {
      if (ex.measure === "reps") {
        const r = Number(s.reps) || 0;
        reps += r;
        volume += r * (Number(s.weight) || 0);
      } else if (ex.measure === "distance") km += Number(s.distance) || 0;
    }
  return { volume, reps, km };
};
export const volumeOf = (w) => totals(w).volume;

// week = sessions in the last 7 days (today included); streak = consecutive days with a workout.
// A day you haven't logged yet today doesn't break the streak; a full missed day does.
export function workoutStats(list, today = new Date()) {
  const days = new Set(list.map(dayOf).filter(Boolean));
  const back = (n) => ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n));
  const week = new Set(Array.from({ length: 7 }, (_, i) => back(i)));
  let sessions = 0,
    volume = 0,
    reps = 0;
  for (const w of list)
    if (week.has(dayOf(w))) {
      const t = totals(w);
      sessions++;
      volume += t.volume;
      reps += t.reps;
    }
  let streak = 0,
    i = days.has(back(0)) ? 0 : 1;
  while (days.has(back(i))) {
    streak++;
    i++;
  }
  return { sessions, volume, reps, streak };
}

/* ---- how long a shared workout stays shared ---- */
// All values are milliseconds. "1 month" is a fixed 30 days, so the server and the client always agree on the number.
const MIN = 60_000,
  HOUR = 60 * MIN,
  DAY = 24 * HOUR;
export const LIFESPANS = [
  { label: "15 minutes", ms: 15 * MIN }, //      900000
  { label: "30 minutes", ms: 30 * MIN }, //     1800000
  { label: "1 hour", ms: HOUR }, //             3600000
  { label: "1 day", ms: DAY }, //              86400000
  { label: "7 days", ms: 7 * DAY }, //        604800000
  { label: "1 month", ms: 30 * DAY }, //     2592000000
];
export const DEFAULT_LIFESPAN = DAY;

// expiresAt from a server -> epoch milliseconds, or null. Accepts a number or an ISO string.
export const expiresMs = (v) => {
  const t = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
// Time left as a short label. A fresh "1 day" share reads "1 day", not "24 h" (one minute of tolerance per unit).
export const fmtRemaining = (ms) => {
  if (ms <= 0) return "Expired";
  if (ms >= DAY - MIN) {
    const d = Math.round(ms / DAY);
    return `${d} day${d > 1 ? "s" : ""}`;
  }
  if (ms >= HOUR - MIN) return `${Math.round(ms / HOUR)} h`;
  return `${Math.max(1, Math.ceil(ms / MIN))} min`;
};
