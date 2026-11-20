import { useEffect, useState } from "react";
import raw from "./courses.json"; // needs "resolveJsonModule": true in tsconfig

type Term = { stanford_term_id: number; season: string; start_year: number };
type Sched = { days: string[]; start_time: string | null; end_time: string | null; location: string | null; instructors: { name: string }[] };
type Offering = { id: string; component: string; section_number: string; notes: string | null; term: Term; schedules: Sched[] };
type Rating = { instructor_name: string; term: Term; average_rating: string; num_ratings: number };
type Course = {
  id: string; title: string; description: string; min_units: number; max_units: number; grading: string;
  average_hours_spent: string | null; course_codes: string[]; general_requirements: string[];
  offerings: Offering[]; ratings: Rating[];
};
type Placed = { courseId: string; color: string; picks: Record<string, string> };
type Plan = Record<number, Placed[]>;

const courses = raw as unknown as Course[];
const byId = (id: string) => courses.find((c) => c.id === id)!;
const QUARTERS = [
  { id: 1222, label: "Autumn 2021" }, { id: 1224, label: "Winter 2022" },
  { id: 1226, label: "Spring 2022" }, { id: 1228, label: "Summer 2022" },
];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const PALETTE = ["#4f8ef7", "#f7954f", "#4fc98f", "#c04ff7", "#f74f7a", "#d4b72f", "#2fb8d4", "#8a8f99"];
const WAYS = ["A-II", "AQR", "CE", "ED", "ER", "FR", "SI", "SMA"];
const WAYS_NEEDED = 1; // adjust to the real per-WAY requirement
const H0 = 8, H1 = 21, PX = 20; // calendar 8am-9pm, px per hour

const code = (c: Course) => c.course_codes[0];
const ways = (c: Course) => c.general_requirements.map((r) => r.replace(/[, ]/g, "")).filter((r) => r.startsWith("WAY-")).map((r) => r.slice(4));
const hours = (c: Course) => (c.average_hours_spent ? parseFloat(c.average_hours_spent) : null);
const live = (c: Course, t: number) => c.offerings.filter((o) => o.term.stanford_term_id === t && !/cancel/i.test(o.notes || ""));
const offered = (c: Course, t: number) => live(c, t).length > 0;
const mins = (t: string) => {
  const m = t.match(/(\d+):(\d+):\d+ (AM|PM)/)!;
  return ((+m[1] % 12) + (m[3] === "PM" ? 12 : 0)) * 60 + +m[2];
};
const short = (t: string | null) => (t ? t.replace(":00 ", " ") : "?");
const secLabel = (o: Offering) =>
  o.schedules.filter((s) => s.days.length && s.start_time).map((s) => `${s.days.map((d) => d.slice(0, 3)).join("/")} ${short(s.start_time)}–${short(s.end_time)}${s.location ? " · " + s.location : ""}`).join(", ") || "TBA";
const groups = (c: Course, t: number) => {
  const g: Record<string, Offering[]> = {};
  live(c, t).forEach((o) => (g[o.component] ||= []).push(o));
  return g;
};
const defaultPicks = (c: Course, t: number) => Object.fromEntries(Object.entries(groups(c, t)).map(([k, v]) => [k, v[0].id]));
const trend = (c: Course) => {
  const m = new Map<number, number>();
  c.ratings.forEach((r) => m.set(r.term.stanford_term_id, parseFloat(r.average_rating)));
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
};
const latest = (c: Course) => { const t = trend(c); return t.length ? t[t.length - 1][1] : null; };
const reviews = (c: Course) => c.ratings.reduce((n, r) => Math.max(n, r.num_ratings), 0);
const profs = (c: Course) => [...new Set(c.offerings.flatMap((o) => o.schedules.flatMap((s) => s.primary_instructors?.map((i) => i.name) ?? s.instructors.map((i) => i.name))))];

function load(): Plan {
  try { return JSON.parse(localStorage.getItem("plan-v1") || "{}"); } catch { return {}; }
}

function Bar({ v, max, color, label }: { v: number | null; max: number; color: string; label: string }) {
  return (
    <div className="bar"><span>{label}</span>
      <div className="track"><div style={{ width: `${Math.min(100, ((v ?? 0) / max) * 100)}%`, background: color }} /></div>
      <b>{v === null ? "n/a" : v.toFixed(1)}</b></div>
  );
}

function Calendar({ items, onOpen }: { items: Placed[]; onOpen: (id: string) => void }) {
  return (
    <div className="cal" style={{ height: (H1 - H0) * PX + 16 }}>
      {DAYS.map((d, i) => (
        <div key={d} className="col" style={{ left: `${(i / 5) * 100}%`, width: "20%" }}><div className="dh">{d.slice(0, 3)}</div></div>
      ))}
      {items.flatMap((p) => {
        const c = byId(p.courseId);
        return Object.values(p.picks).flatMap((oid) => {
          const o = c.offerings.find((x) => x.id === oid);
          if (!o) return [];
          return o.schedules.filter((s) => s.start_time && s.end_time).flatMap((s) =>
            s.days.filter((d) => DAYS.includes(d)).map((d) => {
              const a = mins(s.start_time!), b = mins(s.end_time!);
              return (
                <div key={oid + d + a} className="blk" onClick={() => onOpen(c.id)}
                  style={{ background: p.color, left: `${(DAYS.indexOf(d) / 5) * 100}%`, width: "19.5%", top: 16 + ((a - H0 * 60) / 60) * PX, height: Math.max(14, ((b - a) / 60) * PX - 1) }}>
                  {code(c)} {o.component}{ways(c).length ? " · " + ways(c).join(",") : ""}
                </div>
              );
            })
          );
        });
      })}
    </div>
  );
}

export default function App() {
  const [plan, setPlan] = useState<Plan>(load);
  const [q, setQ] = useState("");
  const [qf, setQf] = useState(0);
  const [drag, setDrag] = useState<string | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [cmp, setCmp] = useState<[string, string] | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => { localStorage.setItem("plan-v1", JSON.stringify(plan)); }, [plan]);

  const add = (courseId: string, t: number) => {
    const c = byId(courseId);
    if (!offered(c, t)) return alert(`${code(c)} isn't offered in ${QUARTERS.find((x) => x.id === t)!.label}.`);
    if ((plan[t] || []).some((p) => p.courseId === courseId)) return alert(`${code(c)} is already in this quarter.`);
    const other = QUARTERS.find((x) => x.id !== t && (plan[x.id] || []).some((p) => p.courseId === courseId));
    if (other && !confirm(`${code(c)} is already planned for ${other.label}. Add it again?`)) return;
    const color = PALETTE[Object.values(plan).flat().length % PALETTE.length];
    setPlan({ ...plan, [t]: [...(plan[t] || []), { courseId, color, picks: defaultPicks(c, t) }] });
  };
  const edit = (t: number, id: string, f: (p: Placed) => Placed) =>
    setPlan({ ...plan, [t]: plan[t].map((p) => (p.courseId === id ? f(p) : p)) });
  const remove = (t: number, id: string) => setPlan({ ...plan, [t]: plan[t].filter((p) => p.courseId !== id) });

  const results = courses.filter((c) => {
    const s = q.toLowerCase();
    return (!s || c.title.toLowerCase().includes(s) || c.course_codes.join(" ").toLowerCase().includes(s) || c.description.toLowerCase().includes(s)) && (!qf || offered(c, qf));
  });

  const wayCount: Record<string, number> = {};
  Object.values(plan).flat().forEach((p) => ways(byId(p.courseId)).forEach((w) => (wayCount[w] = (wayCount[w] || 0) + 1)));

  const comment = (a: Course, b: Course) => {
    const out: string[] = [];
    const ha = hours(a), hb = hours(b);
    if (ha !== null && hb !== null) out.push(`${ha > hb ? code(a) : code(b)} is heavier by ~${Math.abs(ha - hb).toFixed(1)} hrs/week.`);
    else out.push("Workload data is missing for one of these courses.");
    const ra = latest(a), rb = latest(b);
    if (ra !== null && rb !== null) out.push(ra === rb ? "Students rate them equally." : `${ra > rb ? code(a) : code(b)} is rated higher (${Math.max(ra, rb)} vs ${Math.min(ra, rb)}).`);
    if (a.max_units !== b.max_units) out.push(`${a.max_units > b.max_units ? code(a) : code(b)} carries more units.`);
    const wa = ways(a), wb = ways(b);
    out.push(wa.some((w) => wb.includes(w)) ? "They satisfy a shared WAY, so you'd only need one." : wa.length || wb.length ? "They cover different WAYS." : "Neither satisfies a WAY.");
    return out;
  };

  const Overview = ({ c }: { c: Course }) => (
    <div className="modal" onClick={() => setView(null)}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={() => setView(null)}>✕</button>
        <h2>{code(c)}: {c.title} <button title="Compare" className="ico" onClick={() => setPicking(true)}>⚖</button></h2>
        <p className="muted">{c.course_codes.join(" · ")}</p>
        <p><b>{c.min_units === c.max_units ? c.max_units : `${c.min_units}–${c.max_units}`} units</b> · {c.grading} · {hours(c) ?? "?"} hrs/week · {c.repeatable ? "repeatable" : "not repeatable"}</p>
        <p>{ways(c).map((w) => <span key={w} className="chip way">WAY-{w}</span>)}{!ways(c).length && <span className="muted">No WAYS</span>}</p>
        <p><b>Instructors:</b> {profs(c).join(", ") || "TBA"}</p>
        <p>{c.description}</p>
        <h4>Ratings</h4>
        {trend(c).length ? (
          <div className="spark">{trend(c).map(([t, r]) => <div key={t} title={`${t}: ${r}`} style={{ height: r * 14 }}><i>{r}</i></div>)}</div>
        ) : <p className="muted">No ratings yet.</p>}
        <h4>Offerings</h4>
        {QUARTERS.map((qt) => {
          const g = groups(c, qt.id);
          return (
            <div key={qt.id} className="off">
              <b>{qt.label}</b> {Object.keys(g).length ? <button onClick={() => add(c.id, qt.id)}>+ add</button> : <span className="muted">not offered</span>}
              {Object.entries(g).map(([k, v]) => (
                <div key={k} className="muted">{k}: {v.length > 2 ? `${v.length} sections` : v.map(secLabel).join(" | ")}</div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );

  const vc = view ? byId(view) : null;
  return (
    <div className="app">
      <style>{css}</style>
      <div className="left">
        {QUARTERS.map((qt) => {
          const items = plan[qt.id] || [];
          const units = items.reduce((n, p) => n + byId(p.courseId).max_units, 0);
          const hrs = items.reduce((n, p) => n + (hours(byId(p.courseId)) ?? 0), 0);
          const missing = items.filter((p) => hours(byId(p.courseId)) === null).length;
          const ok = drag ? offered(byId(drag), qt.id) : null;
          return (
            <section key={qt.id} className={"qtr " + (ok === true ? "ok" : ok === false ? "no" : "")}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("id"); setDrag(null); if (id) add(id, qt.id); }}>
              <h3>{qt.label}</h3>
              <Bar v={units} max={20} color={units > 20 ? "#e5484d" : "#4fc98f"} label={`Units /20`} />
              <Bar v={hrs} max={40} color={hrs > 30 ? "#e5484d" : "#4f8ef7"} label={`Hrs/wk${missing ? ` (+${missing} unknown)` : ""}`} />
              <Calendar items={items} onOpen={setView} />
              {items.map((p) => {
                const c = byId(p.courseId), g = groups(c, qt.id);
                return (
                  <details key={c.id} className="row">
                    <summary>
                      <span className="dot" style={{ background: p.color }} /> {code(c)} · {c.max_units}u {ways(c).map((w) => <span key={w} className="chip way">{w}</span>)}
                      <input type="color" value={p.color} onClick={(e) => e.stopPropagation()} onChange={(e) => edit(qt.id, c.id, (x) => ({ ...x, color: e.target.value }))} />
                      <button onClick={(e) => { e.preventDefault(); remove(qt.id, c.id); }}>🗑</button>
                    </summary>
                    {Object.entries(g).map(([k, v]) => (
                      <div key={k} className="picks"><b>{k}</b>
                        {v.map((o) => (
                          <label key={o.id}><input type="radio" name={qt.id + c.id + k} checked={p.picks[k] === o.id}
                            onChange={() => edit(qt.id, c.id, (x) => ({ ...x, picks: { ...x.picks, [k]: o.id } }))} /> {o.section_number}: {secLabel(o)}</label>
                        ))}
                      </div>
                    ))}
                  </details>
                );
              })}
            </section>
          );
        })}
        <div className="ways"><b>WAYS</b>{WAYS.map((w) => (
          <span key={w} className={"chip " + ((wayCount[w] || 0) >= WAYS_NEEDED ? "done" : "")}>{w} {Math.min(wayCount[w] || 0, WAYS_NEEDED)}/{WAYS_NEEDED}</span>
        ))}</div>
      </div>

      <div className="right">
        <input placeholder="Search courses…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={qf} onChange={(e) => setQf(+e.target.value)}>
          <option value={0}>All quarters</option>
          {QUARTERS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        {results.map((c) => (
          <div key={c.id} className="item" draggable onDragStart={(e) => { e.dataTransfer.setData("id", c.id); setDrag(c.id); }} onDragEnd={() => setDrag(null)} onClick={() => setView(c.id)}>
            <b>{code(c)}</b> {c.title}
            <div className="muted">{c.max_units}u · {hours(c) ?? "?"} hrs · ★ {latest(c) ?? "n/a"}</div>
            <div>{ways(c).map((w) => <span key={w} className="chip way">{w}</span>)}
              {QUARTERS.filter((x) => offered(c, x.id)).map((x) => <span key={x.id} className="chip">{x.label.split(" ")[0]}</span>)}
              {!c.offerings.length && <span className="muted">no offerings</span>}</div>
          </div>
        ))}
      </div>

      {vc && <Overview c={vc} />}

      {picking && vc && (
        <div className="modal" onClick={() => setPicking(false)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <h3>Compare {code(vc)} with…</h3>
            <select onChange={(e) => { if (e.target.value) { setCmp([vc.id, e.target.value]); setPicking(false); setView(null); } }}>
              <option value="">Choose a course</option>
              {courses.filter((c) => c.id !== vc.id).map((c) => <option key={c.id} value={c.id}>{code(c)}: {c.title}</option>)}
            </select>
          </div>
        </div>
      )}

      {cmp && (() => {
        const [a, b] = [byId(cmp[0]), byId(cmp[1])];
        const rows: [string, (c: Course) => number | null, number][] = [
          ["Units", (c) => c.max_units, 5], ["Hours/wk", hours, 10], ["Rating", latest, 5], ["Reviews", reviews, 400],
        ];
        return (
          <div className="modal" onClick={() => setCmp(null)}>
            <div className="card wide" onClick={(e) => e.stopPropagation()}>
              <button className="x" onClick={() => setCmp(null)}>✕</button>
              <h2>{code(a)} vs {code(b)}</h2>
              <div className="two">
                {[a, b].map((c, i) => (
                  <div key={c.id}><h4 style={{ color: i ? "#f7954f" : "#4f8ef7" }}>{c.title}</h4>
                    {rows.map(([l, f, m]) => <Bar key={l} v={f(c)} max={m} color={i ? "#f7954f" : "#4f8ef7"} label={l} />)}
                    <div className="spark">{trend(c).map(([t, r]) => <div key={t} style={{ height: r * 12, background: i ? "#f7954f" : "#4f8ef7" }}><i>{r}</i></div>)}</div>
                  </div>
                ))}
              </div>
              <h4>Notes</h4>
              <ul>{comment(a, b).map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const css = `
*{box-sizing:border-box}body{margin:0;font:14px system-ui,sans-serif}
.app{display:grid;grid-template-columns:1fr 1fr;height:100vh}
.left,.right{overflow:auto;padding:12px}.left{border-right:1px solid #ddd;background:#fafafa}
.qtr{background:#fff;border:2px solid #ddd;border-radius:10px;padding:10px;margin-bottom:12px}
.qtr.ok{border-color:#4fc98f;background:#f2fff8}.qtr.no{border-color:#e5484d;opacity:.6}
.bar{display:flex;align-items:center;gap:8px;margin:3px 0}.bar span{width:130px;font-size:12px}.bar b{width:40px;text-align:right;font-size:12px}
.track{flex:1;height:8px;background:#eee;border-radius:4px;overflow:hidden}.track div{height:100%}
.cal{position:relative;border:1px solid #eee;margin:8px 0;background:repeating-linear-gradient(#fff 0 ${PX - 1}px,#f3f3f3 ${PX - 1}px ${PX}px) 0 16px/100% ${PX}px}
.col{position:absolute;top:0;bottom:0;border-left:1px solid #eee}.dh{font-size:11px;text-align:center;color:#888;height:16px}
.blk{position:absolute;color:#fff;font-size:10px;padding:1px 3px;border-radius:4px;overflow:hidden;cursor:pointer;white-space:nowrap}
.row{border-top:1px solid #eee;padding:4px 0}.row summary{cursor:pointer;display:flex;gap:6px;align-items:center}
.dot{width:10px;height:10px;border-radius:50%}.picks{padding:4px 0 4px 16px;display:flex;flex-direction:column;gap:2px;font-size:12px}
.chip{display:inline-block;padding:1px 7px;margin:2px;border-radius:10px;background:#eee;font-size:11px}
.chip.way{background:#e8e0ff}.chip.done{background:#c8f5dd}
.ways{position:sticky;bottom:0;background:#fff;border:1px solid #ddd;border-radius:10px;padding:8px}
.right input,.right select{width:100%;padding:8px;margin-bottom:8px}
.item{border:1px solid #ddd;border-radius:8px;padding:8px;margin-bottom:6px;cursor:grab;background:#fff}.item:hover{border-color:#4f8ef7}
.muted{color:#777;font-size:12px}
.modal{position:fixed;inset:0;background:#0006;display:flex;align-items:center;justify-content:center;z-index:9}
.card{background:#fff;border-radius:12px;padding:20px;width:min(640px,92vw);max-height:88vh;overflow:auto;position:relative}.card.wide{width:min(820px,94vw)}
.x{position:absolute;top:10px;right:10px}.ico{font-size:18px;cursor:pointer;border:none;background:#eef;border-radius:6px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.spark{display:flex;align-items:flex-end;gap:4px;height:80px;margin:8px 0}.spark div{flex:1;background:#4fc98f;border-radius:3px 3px 0 0;position:relative;min-width:8px}.spark i{position:absolute;top:-14px;font-size:9px;font-style:normal;width:100%;text-align:center}
.off{margin:6px 0}
`;
