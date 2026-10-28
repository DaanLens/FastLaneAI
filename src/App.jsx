import { useState, useEffect, useRef, useCallback } from "react";
import { Flag, Target, Compass, Rocket, Monitor, RefreshCw, Trash2, Download, ChevronDown, Check } from "lucide-react";
import { VERVERS_ACTIEMUUR } from "./config.js";
import {
  getUser, getDeelnemer, saveDeelnemer,
  kansenSaver, loadKansen, kansPayload,
  toewijzingSaver, vanNaarSaver, loadRol, toewijzingPayload, vanNaarPayload,
  loadActies, addActie, deleteActie, wipeAll,
} from "./data.js";

/* ---------- vaste gegevens ---------- */
const NAVY = "#0B1F3A", RED = "#E10600", INK = "#101828", MUTE = "#667085", LINE = "#D0D5DD", PAPER = "#F4F6F9";
const FONT = { fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", color: INK };

const PHASES = [
  { id: "Discover", color: "#2E90FA", cap: "ideation" },
  { id: "Explore", color: "#7A5AF8", cap: "datamodel en mockup" },
  { id: "Build", color: "#F79009", cap: "sprints" },
  { id: "Release", color: "#12B76A", cap: "UAT en uitrol" },
  { id: "Support", color: "#EE46BC", cap: "beheer en groei" },
];
const PH = Object.fromEntries(PHASES.map((p) => [p.id, p]));

const TASKS = [
  { id: 1, fase: "Discover", t: "Ideeën en kansen ophalen met de klant (ideation)" },
  { id: 2, fase: "Discover", t: "Probleem, baseline en verwachte waarde vastleggen" },
  { id: 3, fase: "Explore", t: "Processen doorlopen en requirements uitwerken in user stories" },
  { id: 4, fase: "Explore", t: "Datamodel ontwerpen" },
  { id: 5, fase: "Explore", t: "Mockup of prototype maken en laten valideren" },
  { id: 6, fase: "Explore", t: "Security, governance en guardrails voor agents ontwerpen (wat mag de agent, wanneer stopt hij)" },
  { id: 7, fase: "Build", t: "Oplossing inrichten of bouwen per sprint (app, flow, agent of Dynamics 365)" },
  { id: 8, fase: "Build", t: "Integraties bouwen en data migreren" },
  { id: 9, fase: "Build", t: "Maatwerk ontwikkelen (plug-ins, PCF, code), alleen als standaard niet past" },
  { id: 10, fase: "Build", t: "Sprintreview met de klant en feedback verwerken" },
  { id: 11, fase: "Release", t: "Testen en UAT begeleiden" },
  { id: 12, fase: "Release", t: "Gebruikers trainen en adoptie begeleiden" },
  { id: 13, fase: "Support", t: "Beheer, monitoring en wijzigingen na go-live" },
  { id: 14, fase: "Support", t: "Klantmedewerkers coachen om zelf agents te bouwen" },
];
const LEVELS = [
  { id: "agent", label: "Agent", desc: "De agent doet het grotendeels zelf" },
  { id: "samen", label: "Human + Agent", desc: "De agent maakt het, wij sturen bij en controleren" },
  { id: "human", label: "Human", desc: "Blijft aan ons" },
];
const COLS = ["30 dagen", "90 dagen", "Dit jaar"];
const COL_HINT = { "30 dagen": "Eerst klein beginnen", "90 dagen": "Pilot of proof of concept", "Dit jaar": "Structureel verankeren" };
const COL_COLOR = { "30 dagen": "#2E90FA", "90 dagen": "#7A5AF8", "Dit jaar": "#12B76A" };

/* ---------- opslag: Supabase (zie data.js) ---------- */
const LS_KEY = "aifl-me";
const readCache = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { return null; } };
const writeCache = (v) => { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch (e) { /* geen opslag beschikbaar */ } };

function LoadError({ msg, retry }) {
  return (
    <div className="p-4 space-y-2">
      <div style={{ color: RED }}>Laden is niet gelukt. Controleer je verbinding.</div>
      <div className="text-sm" style={{ color: MUTE }}>{msg}</div>
      <button onClick={retry} className="rounded-md border px-3 py-2 font-medium" style={{ borderColor: NAVY, color: NAVY }}>Opnieuw proberen</button>
    </div>
  );
}

/* Bewaart wijzigingen kort na het typen en zorgt dat niets verloren gaat bij wisselen van tabblad */
function useSaver(delay = 700) {
  const pending = useRef({});
  const timer = useRef(null);
  const alive = useRef(true);
  const [status, setStatus] = useState("idle");
  const flush = useCallback(async () => {
    const jobs = Object.values(pending.current);
    pending.current = {};
    if (!jobs.length) return;
    const res = await Promise.all(jobs.map((j) => j()));
    if (alive.current) setStatus(res.every(Boolean) ? "saved" : "error");
  }, []);
  const save = useCallback((key, fn) => {
    pending.current[key] = fn;
    clearTimeout(timer.current);
    setStatus("saving");
    timer.current = setTimeout(flush, delay);
  }, [delay, flush]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; clearTimeout(timer.current); const jobs = Object.values(pending.current); pending.current = {}; jobs.forEach((j) => j()); };
  }, []);
  return [status, save];
}

/* ---------- kleine bouwstenen ---------- */
function SaveStatus({ s }) {
  const map = { idle: "", saving: "Bezig met opslaan...", saved: "Opgeslagen", error: "Opslaan mislukt. Probeer het opnieuw." };
  if (!map[s]) return <div className="h-5" />;
  return (
    <div className="h-5 text-sm flex items-center gap-1" style={{ color: s === "error" ? RED : MUTE }}>
      {s === "saved" && <Check size={14} />}{map[s]}
    </div>
  );
}

function Field({ label, value, onChange, readOnly, rows = 2, placeholder, single, type = "text" }) {
  if (readOnly) {
    if (!value) return null;
    return (<div><div className="text-sm" style={{ color: MUTE }}>{label}</div><div className="whitespace-pre-wrap">{value}</div></div>);
  }
  const common = {
    value, placeholder,
    onChange: (e) => onChange(e.target.value),
    className: "mt-1 w-full rounded-md border px-3 py-2 text-base focus:outline-none focus:ring-2",
    style: { borderColor: LINE, background: "#fff", color: INK },
  };
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {/* Enkele regels zijn in de database max. 255 tekens */}
      {single ? <input type={type} maxLength={255} {...common} /> : <textarea rows={rows} {...common} />}
    </label>
  );
}

function Acc({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg bg-white" style={{ borderColor: LINE }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-left font-semibold" aria-expanded={open}>
        {title}
        <ChevronDown size={18} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {open && <div className="px-4 pb-4 space-y-3 text-base leading-relaxed">{children}</div>}
    </div>
  );
}

function PageTitle({ title, sub }) {
  return (
    <div className="pl-3" style={{ borderLeft: `6px solid ${RED}` }}>
      <h1 className="text-2xl font-bold leading-tight" style={{ color: NAVY }}>{title}</h1>
      {sub && <p className="mt-1" style={{ color: MUTE }}>{sub}</p>}
    </div>
  );
}

/* ---------- start ---------- */
function Start({ go, isBeheer }) {
  const [sure, setSure] = useState(false);
  const [msg, setMsg] = useState("");
  const [code, setCode] = useState("");
  const wipe = async () => {
    setMsg("Bezig met wissen...");
    try {
      const n = await wipeAll(code, setMsg);
      setCode("");
      setSure(false); setMsg(`Alles is gewist (${n} rijen). Iedereen moet zich opnieuw inschrijven.`);
    } catch (e) {
      setSure(false); setMsg("Wissen is niet helemaal gelukt: " + e.message);
    }
  };
  const steps = [
    { tab: "kansen", t: "Kansen bij onze klanten", d: "Drie klanten, per klant een kans voor AI, Copilot of een agent.", m: "15 min" },
    { tab: "rol", t: "Onze rol", d: "Sorteer de taken: wat doet de agent, wat de human? Vul daarna van ... naar ... in.", m: "15 min" },
    { tab: "acties", t: "Mijn acties", d: "Zet je eigen acties op de gezamenlijke actiemuur.", m: "15 min" },
  ];
  return (
    <div className="p-4 space-y-5">
      <p className="text-xl font-semibold leading-snug" style={{ color: NAVY }}>
        We weten waar AI bij onze klanten kansen biedt, hoe onze rol verandert en wat ik zelf als eerste ga doen.
      </p>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.tab}>
            <button onClick={() => go(s.tab)} className="w-full text-left flex gap-3 items-start border rounded-lg bg-white p-3" style={{ borderColor: LINE }}>
              <span className="flex-none w-7 h-7 rounded-full flex items-center justify-center text-white font-bold" style={{ background: RED }}>{i + 1}</span>
              <span className="flex-1">
                <span className="block font-semibold">{s.t}</span>
                <span className="block text-sm" style={{ color: MUTE }}>{s.d}</span>
              </span>
              <span className="text-sm font-medium" style={{ color: MUTE }}>{s.m}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="text-sm" style={{ color: MUTE }}>Daarna volgt de pitch per team (2 minuten plus 1 minuut vragen). Gebruik het tabblad Pitch om het scherm van een team te tonen.</p>

      <div className="space-y-2">
        <Acc title="Frontier in 1 minuut">
          <div><b>Frontier Firm</b><br />Een organisatie gebouwd rond intelligence on tap, human-agent teams en een nieuwe rol voor iedereen: agent boss.</div>
          <div><b>Agent boss</b><br />Iemand die agents bouwt, er werk aan delegeert en ze beheert. Voor ons: van zelf bouwen naar specificeren, sturen en controleren.</div>
          <div><b>Human-agent ratio</b><br />De balans tussen menselijk toezicht en uitvoering door agents. Per taak: wat doet de agent, wat beslist de human?</div>
          <div>
            <b>De ladder: waar staat de klant?</b>
            <ul className="mt-1 space-y-1">
              <li><b>Intelligence on tap.</b> AI helpt jou. Bij ons: Copilot in Dynamics 365 en Power Apps, GitHub Copilot.</li>
              <li><b>Human-agent teams.</b> De agent is een collega. Bij ons: een Copilot Studio-agent op Dataverse en kennisbronnen.</li>
              <li><b>Human-led, agent-operated.</b> Human stuurt, agents draaien het proces. Bij ons: agents voor leads of klantvragen in Dynamics 365.</li>
            </ul>
          </div>
          <div>
            <b>Vier Frontier-kansen in onze wereld</b>
            <ul className="mt-1 space-y-1">
              <li><b>Medewerkerservaring verrijken.</b> Copilot Studio-agent voor HR of IT-helpdesk op SharePoint en Dataverse.</li>
              <li><b>Klantcontact vernieuwen.</b> Agents in Dynamics 365 Sales en Service: leads, cases, klantvragen, Field Service-planning.</li>
              <li><b>Bedrijfsprocessen herinrichten.</b> Power Automate met een agent-stap, goedkeuringen, documentverwerking, Power Apps met Copilot.</li>
              <li><b>Innovatie en bouwen versnellen.</b> Coding agents voor plug-ins, PCF, Power Fx, tests en documentatie.</li>
            </ul>
          </div>
          <div className="text-sm" style={{ color: MUTE }}>Bron: Microsoft Work Trend Index 2025.</div>
        </Acc>

        <Acc title="De vijf fases">
          <div className="flex flex-wrap gap-2">
            {PHASES.map((p) => (
              <span key={p.id} className="rounded-full px-3 py-1 text-white text-sm font-semibold" style={{ background: p.color }}>
                {p.id}: {p.cap}
              </span>
            ))}
          </div>
        </Acc>

        <Acc title="Marktbeeld Nederland">
          <div className="grid grid-cols-2 gap-3">
            {[["84%", "gebruikt AI bij softwareontwikkeling"], ["34%", "noemt AI-gebruik standaard"], ["8%", "heeft AI-governance formeel verankerd"], ["31%", "houdt actief toezicht op agents"]].map(([n, d]) => (
              <div key={n}><div className="text-3xl font-bold" style={{ color: NAVY }}>{n}</div><div className="text-sm" style={{ color: MUTE }}>{d}</div></div>
            ))}
          </div>
          <p>AI versnelt coding, review en testen. De bottleneck verschuift naar requirements, architectuur, uitrol en beheer.</p>
          <p className="text-sm" style={{ color: MUTE }}>Bron: Info Support Agentic Engineering-onderzoek 2026, 330 Nederlandse IT-beslissers. Een door Info Support opgedragen onderzoek over softwareontwikkeling.</p>
        </Acc>

        {isBeheer && <Acc title="Beheer (facilitator)">
          <p className="text-sm" style={{ color: MUTE }}>Wist alle teamgegevens, acties en inschrijvingen, voor iedereen. Gebruik dit alleen na een test of aan het einde.</p>
          <Field single type="password" label="Beheercode" value={code} onChange={setCode} />
          {!sure ? (
            <button disabled={!code} onClick={() => { setSure(true); setMsg(""); }} className="rounded-md border px-3 py-2 font-medium" style={{ borderColor: code ? RED : LINE, color: code ? RED : MUTE }}>Alles wissen</button>
          ) : (
            <div className="flex gap-2 items-center flex-wrap">
              <span className="font-medium">Weet je het zeker?</span>
              <button onClick={wipe} className="rounded-md px-3 py-2 text-white font-medium" style={{ background: RED }}>Ja, wis alles</button>
              <button onClick={() => setSure(false)} className="rounded-md border px-3 py-2" style={{ borderColor: LINE }}>Annuleren</button>
            </div>
          )}
          {msg && <div className="text-sm" style={{ color: MUTE }}>{msg}</div>}
        </Acc>}
      </div>
    </div>
  );
}

/* ---------- opdracht 1: kansen ---------- */
function Kansen({ team, readOnly }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [status, save] = useSaver();
  const saver = useRef(null);
  const load = useCallback(async () => {
    setErr("");
    try {
      const r = await loadKansen(team);
      const sv = kansenSaver();
      r.forEach((x, i) => sv.seed(i, x.id));
      saver.current = sv;
      setRows(r);
    } catch (e) { setErr(e.message); }
  }, [team]);
  useEffect(() => { setRows(null); load(); }, [load]);
  if (err && !rows) return <LoadError msg={err} retry={load} />;
  if (!rows) return <div className="p-4" style={{ color: MUTE }}>Laden...</div>;
  const upd = (i, f, v) => {
    const next = rows.map((r, j) => (j === i ? { ...r, [f]: v } : r));
    setRows(next);
    const sv = saver.current;
    save(`k${i}`, () => sv.save(i, kansPayload(team, i, next[i])));
  };
  return (
    <div className={readOnly ? "grid md:grid-cols-3 gap-3 items-start" : "p-4 space-y-4"}>
      {!readOnly && (
        <>
          <PageTitle title="Kansen bij onze klanten" sub="Kies drie klanten of prospects. Bedenk bij elke klant een kans voor AI, Copilot of een agent." />
          <Acc title="Zoekvragen">
            <ul className="list-disc pl-5 space-y-1">
              <li>Waar doen mensen nu veel handmatig werk?</li>
              <li>Waar wachten klanten of medewerkers te lang? Waar zit kennis alleen in hoofden of documenten?</li>
              <li>Reality check: waar wordt AI bij deze klant al gebruikt, welke controle is er (governance, toezicht) en wat ontbreekt nog (vaardigheden, afspraken)?</li>
            </ul>
          </Acc>
          <div className="flex items-center justify-between"><SaveStatus s={status} />
            <button onClick={load} className="flex items-center gap-1 text-sm" style={{ color: MUTE }}><RefreshCw size={14} />Vernieuwen</button>
          </div>
          <p className="text-sm" style={{ color: MUTE }}>Tip: laat een teamlid voor het hele team invullen. Wijzigingen van teamgenoten zie je na Vernieuwen.</p>
        </>
      )}
      {rows.map((r, i) => (
        <section key={i} className="border rounded-lg bg-white p-4 space-y-3" style={{ borderColor: LINE, borderTop: `4px solid ${NAVY}` }}>
          <div className="font-bold text-lg" style={{ color: NAVY }}>
            {readOnly ? (r.klant || `Klant ${i + 1}`) : `Klant ${i + 1}`}
          </div>
          {!readOnly && <Field single label="Klant of prospect" value={r.klant} onChange={(v) => upd(i, "klant", v)} placeholder="Naam of codenaam" />}
          <Field label="Kans: wat gaan we doen?" value={r.kans} onChange={(v) => upd(i, "kans", v)} readOnly={readOnly} placeholder="Bijv. leads automatisch kwalificeren en opvolgen" />
          <Field label="De agent doet ..." value={r.agent} onChange={(v) => upd(i, "agent", v)} readOnly={readOnly} />
          <Field label="De human beslist ..." value={r.human} onChange={(v) => upd(i, "human", v)} readOnly={readOnly} />
        </section>
      ))}
    </div>
  );
}

/* ---------- opdracht 2: rol ---------- */
function Matrix({ assign, custom }) {
  const tasks = [...TASKS];
  if (custom && custom.t) tasks.push({ id: 15, fase: custom.fase || "Build", t: custom.t });
  return (
    <div className="overflow-x-auto">
      <div className="grid gap-1" style={{ minWidth: 560, gridTemplateColumns: "92px repeat(5, 1fr)" }}>
        <div />
        {PHASES.map((p) => (
          <div key={p.id} className="rounded px-2 py-1 text-white text-sm font-semibold text-center" style={{ background: p.color }}>{p.id}</div>
        ))}
        {LEVELS.map((l) => (
          <div key={l.id} className="contents">
            <div className="rounded px-2 py-2 text-white text-sm font-semibold flex items-center" style={{ background: NAVY }}>{l.label}</div>
            {PHASES.map((p) => (
              <div key={p.id} className="rounded border p-1 flex flex-wrap gap-1 content-start" style={{ borderColor: LINE, background: "#fff", minHeight: 44 }}>
                {tasks.filter((t) => assign[t.id] === l.id && t.fase === p.id).map((t) => (
                  <span key={t.id} title={t.t} className="rounded px-2 py-0.5 text-white text-sm font-bold" style={{ background: p.color }}>{t.id}</span>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Rol({ team, readOnly }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [status, save] = useSaver();
  const savers = useRef(null);
  const load = useCallback(async () => {
    setErr("");
    try {
      const r = await loadRol(team);
      const tw = toewijzingSaver(), vn = vanNaarSaver();
      Object.entries(r.ids.taak).forEach(([nr, id]) => tw.seed(Number(nr), id));
      Object.entries(r.ids.vn).forEach(([doel, id]) => vn.seed(doel, id));
      savers.current = { tw, vn };
      setD(r);
    } catch (e) { setErr(e.message); }
  }, [team]);
  useEffect(() => { setD(null); load(); }, [load]);
  if (err && !d) return <LoadError msg={err} retry={load} />;
  if (!d) return <div className="p-4" style={{ color: MUTE }}>Laden...</div>;

  /* Elke taak en elk van-naar-blok is een eigen rij in SharePoint */
  const saveTaak = (nr, next) => {
    const { tw } = savers.current;
    save(`t${nr}`, () => tw.save(nr, toewijzingPayload(team, nr, next.assign[nr], next.custom)));
  };
  const saveVanNaar = (doel, next) => {
    const { vn } = savers.current;
    const [van, naar] = doel === "Consultants" ? [next.cv, next.cn] : [next.dv, next.dn];
    save(`v${doel}`, () => vn.save(doel, vanNaarPayload(team, doel, van, naar)));
  };
  const update = (patch) => {
    const next = { ...d, ...patch };
    setD(next);
    if ("custom" in patch) saveTaak(15, next);
    if ("cv" in patch || "cn" in patch) saveVanNaar("Consultants", next);
    if ("dv" in patch || "dn" in patch) saveVanNaar("Developers", next);
    return next;
  };
  const setLevel = (id, lvl) => {
    const a = { ...d.assign };
    if (a[id] === lvl) delete a[id]; else a[id] = lvl;
    const next = { ...d, assign: a };
    setD(next);
    saveTaak(id, next);
  };
  const sorted = TASKS.filter((t) => d.assign[t.id]).length + (d.custom.t && d.assign[15] ? 1 : 0);
  const total = TASKS.length + (d.custom.t ? 1 : 0);

  const vanNaar = (title, kv, kn) => (
    <section className="border rounded-lg bg-white p-4 space-y-3" style={{ borderColor: LINE, borderTop: `4px solid ${RED}` }}>
      <div className="font-bold text-lg" style={{ color: NAVY }}>{title}</div>
      <Field single label="Van ..." value={d[kv]} onChange={(v) => update({ [kv]: v })} readOnly={readOnly} />
      <Field single label="naar ..." value={d[kn]} onChange={(v) => update({ [kn]: v })} readOnly={readOnly} />
    </section>
  );

  if (readOnly) {
    return (
      <div className="space-y-3">
        <Matrix assign={d.assign} custom={d.custom} />
        <div className="grid md:grid-cols-2 gap-3">
          {vanNaar("Van ... naar ... voor consultants", "cv", "cn")}
          {vanNaar("Van ... naar ... voor developers", "dv", "dn")}
        </div>
      </div>
    );
  }

  const levelButtons = (id) => (
    <div className="grid grid-cols-3 gap-2 mt-2">
      {LEVELS.map((l) => {
        const on = d.assign[id] === l.id;
        return (
          <button key={l.id} onClick={() => setLevel(id, l.id)} aria-pressed={on}
            className="rounded-md border px-1 py-2 text-sm font-semibold"
            style={{ borderColor: on ? NAVY : LINE, background: on ? NAVY : "#fff", color: on ? "#fff" : INK }}>
            {l.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <PageTitle title="Onze rol" sub="Leg elke taak in Agent, Human + Agent of Human. Tik nogmaals om te wissen." />
      <div className="grid gap-1 text-sm" style={{ color: MUTE }}>
        {LEVELS.map((l) => <div key={l.id}><b style={{ color: INK }}>{l.label}:</b> {l.desc}</div>)}
      </div>
      <div className="flex items-center justify-between">
        <SaveStatus s={status} />
        <div className="text-sm font-medium" style={{ color: MUTE }}>{sorted} van {total} gesorteerd</div>
      </div>

      <ul className="space-y-2">
        {TASKS.map((t) => (
          <li key={t.id} className="border rounded-lg bg-white p-3" style={{ borderColor: LINE, borderLeft: `6px solid ${PH[t.fase].color}` }}>
            <div className="flex gap-2 items-start">
              <span className="font-bold" style={{ color: MUTE }}>{t.id}</span>
              <div>
                <div className="text-sm font-semibold" style={{ color: PH[t.fase].color }}>{t.fase}</div>
                <div className="font-medium">{t.t}</div>
              </div>
            </div>
            {levelButtons(t.id)}
          </li>
        ))}
        <li className="border rounded-lg bg-white p-3 space-y-2" style={{ borderColor: LINE, borderLeft: `6px solid ${PH[d.custom.fase].color}` }}>
          <Field single label="15. Eigen taak (optioneel)" value={d.custom.t} onChange={(v) => update({ custom: { ...d.custom, t: v } })} placeholder="Een taak die jullie missen" />
          {d.custom.t && (
            <>
              <div className="flex flex-wrap gap-2">
                {PHASES.map((p) => (
                  <button key={p.id} onClick={() => update({ custom: { ...d.custom, fase: p.id } })} aria-pressed={d.custom.fase === p.id}
                    className="rounded-full px-3 py-1 text-sm font-semibold border"
                    style={{ borderColor: p.color, background: d.custom.fase === p.id ? p.color : "#fff", color: d.custom.fase === p.id ? "#fff" : p.color }}>{p.id}</button>
                ))}
              </div>
              {levelButtons(15)}
            </>
          )}
        </li>
      </ul>

      <h2 className="text-lg font-bold" style={{ color: NAVY }}>Jullie overzicht</h2>
      <Matrix assign={d.assign} custom={d.custom} />

      <Acc title="Bespreekvragen" defaultOpen>
        <ul className="list-disc pl-5 space-y-1">
          <li>In welke fase komt de agent bij ons nu pas binnen? Waar zou hij er eerder bij moeten zijn?</li>
          <li>Wat als AI al in Discover en Explore meedraait (ideation, datamodel, mockup) en niet pas in Build?</li>
          <li>Als bouwen sneller gaat, waar ontstaat dan de bottleneck (requirements, architectuur, uitrol, beheer)? Wat betekent dat voor ons?</li>
          <li>Welke taken blijven bij de human, ook als de agent meer doet?</li>
        </ul>
      </Acc>

      {vanNaar("Van ... naar ... voor consultants", "cv", "cn")}
      {vanNaar("Van ... naar ... voor developers", "dv", "dn")}
    </div>
  );
}

/* ---------- opdracht 3: gezamenlijke actiemuur ---------- */
function Acties({ me, upn }) {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [naam, setNaam] = useState(me.naam);
  const [kolom, setKolom] = useState("30 dagen");
  const [actie, setActie] = useState("");
  const [klant, setKlant] = useState("");
  const [datum, setDatum] = useState("");
  const [msg, setMsg] = useState("");
  const [exp, setExp] = useState(false);

  const [adding, setAdding] = useState(false);
  const [loadErr, setLoadErr] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setItems(await loadActies());
      setLoadErr("");
    } catch (e) {
      setLoadErr("Vernieuwen is niet gelukt. Controleer je verbinding.");
    }
    setBusy(false);
  }, []);
  useEffect(() => { load(); const t = setInterval(load, VERVERS_ACTIEMUUR); return () => clearInterval(t); }, [load]);

  const add = async () => {
    if (!actie.trim() || !naam.trim()) { setMsg("Vul je naam en je actie in."); return; }
    if (adding) return;
    setAdding(true); setMsg("Bezig met toevoegen...");
    try {
      const item = await addActie({ naam: naam.trim(), email: upn, team: me.team, kolom, actie: actie.trim(), klant: klant.trim(), datum: datum.trim() });
      setItems((prev) => [...(prev || []), item]);
      setActie(""); setKlant(""); setDatum(""); setMsg("Toegevoegd aan de actiemuur.");
    } catch (e) {
      setMsg("Toevoegen is niet gelukt. Probeer het opnieuw.");
    }
    setAdding(false);
  };
  const remove = async (it) => {
    if (!window.confirm("Deze actie verwijderen?")) return;
    try {
      await deleteActie(it.id);
      setItems((prev) => (prev || []).filter((x) => x.id !== it.id));
    } catch (e) {
      setMsg("Verwijderen is niet gelukt. Probeer het opnieuw.");
    }
  };
  const exportText = () => COLS.map((c) => {
    const l = (items || []).filter((i) => i.kolom === c);
    return `${c}\n` + (l.length ? l.map((i) => `- ${i.naam} (team ${i.team}): ${i.actie}${i.klant ? ` | klant: ${i.klant}` : ""}${i.datum ? ` | voor: ${i.datum}` : ""}`).join("\n") : "- (leeg)");
  }).join("\n\n");

  return (
    <div className="p-4 space-y-4">
      <PageTitle title="Mijn acties" sub="Zet minstens een eigen actie op de actiemuur. Iedereen ziet hem direct." />

      <section className="border rounded-lg bg-white p-4 space-y-3" style={{ borderColor: LINE, borderTop: `4px solid ${RED}` }}>
        <Field single label="Je naam" value={naam} onChange={setNaam} />
        <div>
          <div className="text-sm font-medium">Kolom</div>
          <div className="grid grid-cols-3 gap-2 mt-1">
            {COLS.map((c) => (
              <button key={c} onClick={() => setKolom(c)} aria-pressed={kolom === c} className="rounded-md px-2 py-2 font-semibold border"
                style={{ borderColor: COL_COLOR[c], background: kolom === c ? COL_COLOR[c] : "#fff", color: kolom === c ? "#fff" : COL_COLOR[c] }}>{c}</button>
            ))}
          </div>
          <div className="text-sm mt-1" style={{ color: MUTE }}>{COL_HINT[kolom]}</div>
        </div>
        <Field label="Maandag ga ik ..." value={actie} onChange={setActie} placeholder="Bijv. een Copilot Studio-agent uitproberen op onze eigen kennisbank" />
        <Field single label="Ik bespreek dit met (klant of contact, optioneel)" value={klant} onChange={setKlant} />
        <Field single label="Voor (datum, optioneel)" value={datum} onChange={setDatum} placeholder="Bijv. 12 november" />
        <button onClick={add} disabled={adding} className="w-full rounded-md py-3 text-white font-bold text-base" style={{ background: adding ? "#98A2B3" : NAVY }}>Zet op de actiemuur</button>
        {msg && <div className="text-sm" style={{ color: MUTE }}>{msg}</div>}
        <p className="text-sm" style={{ color: MUTE }}>Wat je invult is zichtbaar voor alle deelnemers.</p>
      </section>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold" style={{ color: NAVY }}>Actiemuur{items ? ` (${items.length})` : ""}</h2>
        <button onClick={load} className="flex items-center gap-1 text-sm" style={{ color: MUTE }}><RefreshCw size={14} className={busy ? "animate-spin" : ""} />Vernieuwen</button>
      </div>

      {loadErr && <div className="text-sm" style={{ color: RED }}>{loadErr}</div>}
      {!items ? <div style={{ color: MUTE }}>{loadErr ? "" : "Laden..."}</div> : (
        <div className="grid md:grid-cols-3 gap-3 items-start">
          {COLS.map((c) => {
            const list = items.filter((i) => i.kolom === c);
            return (
              <div key={c} className="rounded-lg overflow-hidden border bg-white" style={{ borderColor: LINE }}>
                <div className="px-3 py-2 text-white" style={{ background: COL_COLOR[c] }}>
                  <div className="text-lg font-bold">{c}</div>
                  <div className="text-sm">{COL_HINT[c]}</div>
                </div>
                <div className="p-2 space-y-2" style={{ background: PAPER }}>
                  {list.length === 0 && <div className="text-sm p-2" style={{ color: MUTE }}>Nog geen acties. Zet de eerste neer.</div>}
                  {list.map((i) => (
                    <div key={i.id} className="rounded-md bg-white border p-3" style={{ borderColor: LINE }}>
                      <div className="whitespace-pre-wrap">{i.actie}</div>
                      {(i.klant || i.datum) && (
                        <div className="text-sm mt-1" style={{ color: MUTE }}>{i.klant && `Klant: ${i.klant}`}{i.klant && i.datum ? ", " : ""}{i.datum && `voor ${i.datum}`}</div>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-semibold" style={{ color: NAVY }}>{i.naam} (team {i.team})</span>
                        {i.eigen && (
                          <button onClick={() => remove(i)} aria-label="Verwijder deze actie" style={{ color: MUTE }}><Trash2 size={16} /></button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div>
        <button onClick={() => setExp(!exp)} className="flex items-center gap-1 text-sm font-medium" style={{ color: NAVY }}><Download size={14} />{exp ? "Verberg tekstversie" : "Toon tekstversie voor backlog of CRM"}</button>
        {exp && items && (
          <textarea readOnly rows={12} value={exportText()} onFocus={(e) => e.target.select()} className="mt-2 w-full rounded-md border p-3 text-sm" style={{ borderColor: LINE, fontFamily: "ui-monospace, Menlo, Consolas, monospace" }} />
        )}
      </div>
    </div>
  );
}

/* ---------- pitch: teamscherm ---------- */
function Pitch({ me }) {
  const [t, setT] = useState(me.team);
  const [n, setN] = useState(0);
  return (
    <div className="p-4 space-y-4">
      <PageTitle title="Pitch" sub="Kies een team en toon het overzicht op het grote scherm." />
      <div className="flex gap-2 flex-wrap">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setT(n)} aria-pressed={t === n} className="rounded-full px-4 py-2 font-semibold border"
            style={{ borderColor: NAVY, background: t === n ? NAVY : "#fff", color: t === n ? "#fff" : NAVY }}>Team {n}</button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold" style={{ color: NAVY }}>Team {t}</h2>
        <button onClick={() => setN(n + 1)} className="flex items-center gap-1 text-sm" style={{ color: MUTE }}><RefreshCw size={14} />Vernieuwen</button>
      </div>
      <Kansen key={`k${t}-${n}`} team={t} readOnly />
      <h2 className="text-lg font-bold" style={{ color: NAVY }}>Onze rol: van ... naar ...</h2>
      <Rol key={`r${t}-${n}`} team={t} readOnly />
    </div>
  );
}

/* ---------- inschrijven ---------- */
function Setup({ initial, nieuw, onDone, busy, error }) {
  const [team, setTeam] = useState(initial ? initial.team : null);
  const [naam, setNaam] = useState(initial ? initial.naam : "");
  const [email, setEmail] = useState(initial?.email || "");
  const [code, setCode] = useState("");
  const klaar = team && naam.trim() && (!nieuw || code.trim()) && !busy;
  return (
    <div className="min-h-screen" style={{ ...FONT, background: PAPER }}>
      <div style={{ background: NAVY }} className="text-white px-4 pt-8 pb-6">
        <div className="pl-3" style={{ borderLeft: `6px solid ${RED}` }}>
          <h1 className="text-3xl font-bold leading-tight">AI in the Fast Lane</h1>
          <p style={{ color: "#B8C0CC" }}>Teamevent CE en Power Platform</p>
        </div>
      </div>
      <div style={{ height: 12, background: "repeating-conic-gradient(#0B1F3A 0% 25%, #ffffff 0% 50%) 50% / 12px 12px" }} />
      <div className="p-4 space-y-5 max-w-xl">
        <div>
          <div className="font-semibold mb-2">In welk team zit je?</div>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setTeam(n)} aria-pressed={team === n} className="rounded-md py-3 text-lg font-bold border"
                style={{ borderColor: NAVY, background: team === n ? NAVY : "#fff", color: team === n ? "#fff" : NAVY }}>{n}</button>
            ))}
          </div>
        </div>
        <Field single label="Je naam" value={naam} onChange={setNaam} placeholder="Voornaam" />
        <Field single type="email" label="Je e-mailadres (optioneel)" value={email} onChange={setEmail} placeholder="naam@cegeka.com" />
        {nieuw && <Field single label="Eventcode" value={code} onChange={setCode} placeholder="Staat op het scherm in de zaal" />}
        <button disabled={!klaar} onClick={() => onDone({ team, naam: naam.trim(), email: email.trim().toLowerCase(), code: code.trim() })}
          className="w-full rounded-md py-3 text-white font-bold text-base" style={{ background: klaar ? RED : "#98A2B3" }}>
          {busy ? "Bezig met opslaan..." : "Naar de opdrachten"}
        </button>
        {error && <p className="text-sm" style={{ color: RED }}>{error}</p>}
        <p className="text-sm" style={{ color: MUTE }}>
          Wat je invult in deze app is zichtbaar voor alle deelnemers. Gebruik voor klanten zo nodig een codenaam.
        </p>
      </div>
    </div>
  );
}

/* ---------- hoofdapp ---------- */
const TABS = [
  { id: "start", label: "Start", Icon: Flag },
  { id: "kansen", label: "Kansen", Icon: Target },
  { id: "rol", label: "Onze rol", Icon: Compass },
  { id: "acties", label: "Acties", Icon: Rocket },
  { id: "pitch", label: "Pitch", Icon: Monitor },
];

export default function App() {
  const [me, setMe] = useState(null);
  const [user, setUser] = useState({ upn: "", fullName: "" });
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("start");

  useEffect(() => {
    (async () => {
      const u = await getUser();
      setUser(u);
      const cached = readCache();
      if (cached && cached.upn === u.upn) { setMe(cached); setReady(true); }
      try {
        const d = await getDeelnemer(u.upn);
        if (d) { const m = { ...d, upn: u.upn }; setMe(m); writeCache(m); }
        // Niet (meer) in de database, bijv. na "Alles wissen": opnieuw inschrijven
        else { setMe(null); writeCache(null); }
      } catch (e) { console.error(e); }
      setReady(true);
    })();
  }, []);

  const saveMe = async (m) => {
    setBusy(true); setError("");
    try {
      const id = await saveDeelnemer(me?.id ?? null, m.email, m.naam, m.team, m.code);
      const next = { id, naam: m.naam, team: m.team, email: m.email, upn: m.email };
      setUser({ upn: m.email, fullName: m.naam });
      setMe(next); writeCache(next); setEditing(false);
    } catch (e) {
      setError(e.message === "Onjuiste eventcode"
        ? "Deze eventcode klopt niet. Vraag de facilitator om de code."
        : "Opslaan is niet gelukt. Controleer je verbinding en probeer het opnieuw.");
    }
    setBusy(false);
  };

  if (!ready) return <div className="p-6" style={FONT}>Laden...</div>;
  if (!me || editing) {
    const initial = me || (user.fullName ? { team: null, naam: user.fullName.split(" ")[0] } : null);
    return <Setup initial={initial} nieuw={!me} onDone={saveMe} busy={busy} error={error} />;
  }
  // Beheer staat alleen in beeld met ?beheer in de link; de database controleert de beheercode
  const isBeheer = new URLSearchParams(window.location.search).has("beheer");

  return (
    <div className="min-h-screen flex flex-col" style={{ ...FONT, background: PAPER }}>
      <header style={{ background: NAVY }} className="text-white">
        <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3">
          <div className="pl-3" style={{ borderLeft: `6px solid ${RED}` }}>
            <div className="text-xl font-bold leading-tight">AI in the Fast Lane</div>
            <div className="text-sm" style={{ color: "#B8C0CC" }}>CE en Power Platform</div>
          </div>
          <button onClick={() => setEditing(true)} className="text-sm text-right" style={{ color: "#D0D5DD" }} aria-label="Wijzig team of naam">
            Team {me.team}<br />{me.naam}
          </button>
        </div>
        <div style={{ height: 12, background: "repeating-conic-gradient(#0B1F3A 0% 25%, #ffffff 0% 50%) 50% / 12px 12px" }} />
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto">
        {tab === "start" && <Start go={setTab} isBeheer={isBeheer} />}
        {tab === "kansen" && <Kansen team={me.team} />}
        {tab === "rol" && <Rol team={me.team} />}
        {tab === "acties" && <Acties me={me} upn={user.upn} />}
        {tab === "pitch" && <Pitch me={me} />}
      </main>

      <nav className="sticky bottom-0 grid grid-cols-5 bg-white border-t" style={{ borderColor: LINE }}>
        {TABS.map(({ id, label, Icon }) => {
          const on = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)} aria-current={on ? "page" : undefined}
              className="flex flex-col items-center gap-1 py-2 text-xs font-semibold"
              style={{ color: on ? NAVY : MUTE, borderTop: `3px solid ${on ? RED : "transparent"}` }}>
              <Icon size={20} />{label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
