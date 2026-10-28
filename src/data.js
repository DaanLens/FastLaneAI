/*
  Datalaag: alle Supabase-toegang zit in dit bestand.
  Elk toestel logt anoniem in; inschrijven met de eventcode geeft toegang (zie supabase/schema.sql).
  URL en key komen uit VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY (lokaal in .env.local).
*/
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !KEY) console.error("VITE_SUPABASE_URL of VITE_SUPABASE_ANON_KEY ontbreekt");
const db = createClient(SUPABASE_URL || "http://localhost", KEY || "ontbreekt");

/* ---------- hulpjes ---------- */
const txt = (v) => (v == null ? "" : String(v));

function check(res, wat) {
  if (!res || res.error) {
    const msg = res?.error?.message || "onbekende fout";
    console.error(`${wat} mislukt:`, res);
    throw new Error(`${wat}: ${msg}`);
  }
  return res.data;
}

async function list(tabel, team) {
  let qb = db.from(tabel).select("*").order("id");
  if (team != null) qb = qb.eq("team", Number(team));
  return check(await qb, "Laden") || [];
}

/* Zorgt voor een (anonieme) sessie op dit toestel */
let sessie = null;
function ensureSession() {
  sessie ??= (async () => {
    const { data } = await db.auth.getSession();
    if (data.session) return data.session.user.id;
    const user = check(await db.auth.signInAnonymously(), "Inloggen")?.user;
    return user?.id;
  })().catch((e) => { sessie = null; throw e; });
  return sessie;
}

/*
  Slaat rijen op met een upsert op de unieke sleutel (bijv. team + rij).
  Alles loopt na elkaar, zodat de laatste wijziging altijd als laatste aankomt.
*/
export function makeUpserter(tabel, sleutel) {
  let chain = Promise.resolve(true);
  return {
    seed() { /* niet nodig: de database kent de unieke sleutel */ },
    save(_key, payload) {
      chain = chain.then(async () => {
        check(await db.from(tabel).upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: sleutel }), "Opslaan");
        return true;
      }).catch((e) => { console.error(e); return false; });
      return chain;
    },
  };
}

/* ---------- gebruiker ---------- */
export async function getUser() {
  try {
    await ensureSession();
    const d = await getDeelnemer();
    return { upn: d?.email || "", fullName: d?.naam || "" };
  } catch (e) {
    console.error(e);
    return { upn: "", fullName: "" };
  }
}

/* ---------- deelnemers (inschrijving) ---------- */
/* Zoekt de inschrijving van dit toestel; het argument is er voor de compatibiliteit */
export async function getDeelnemer() {
  const uid = await ensureSession();
  const rows = check(await db.from("deelnemers").select("*").eq("id", uid), "Laden") || [];
  if (!rows.length) return null;
  const r = rows[0];
  return { id: r.id, naam: txt(r.naam), team: Number(r.team), email: txt(r.email).toLowerCase(), beheerder: !!r.beheerder };
}

export async function saveDeelnemer(_existingId, upn, naam, team, eventcode = "") {
  await ensureSession();
  const res = await db.rpc("inschrijven", { p_code: eventcode, p_naam: naam, p_email: txt(upn).toLowerCase(), p_team: Number(team) });
  for (const fout of ["Onjuiste eventcode", "Team wijzigen niet toegestaan"]) {
    if (res.error?.message?.includes(fout)) throw new Error(fout);
  }
  return check(res, "Opslaan");
}

/* Maakt dit toestel beheerder: ziet daarna de resultaten van alle teams */
export async function wordBeheerder(beheercode) {
  const res = await db.rpc("beheerder_worden", { p_code: beheercode });
  if (res.error?.message?.includes("Onjuiste beheercode")) throw new Error("onjuiste beheercode");
  return check(res, "Beheerder worden");
}

/* ---------- kansen ---------- */
export const kansenSaver = () => makeUpserter("kansen", "team,rij");

/* Er staan altijd 3 klantkaartjes klaar; een team kan er tot 12 gebruiken */
export const MIN_KANSEN = 3;
export const MAX_KANSEN = 12;

export async function loadKansen(team) {
  const rows = await list("kansen", team);
  const out = Array.from({ length: MAX_KANSEN }, () => ({ id: null, klant: "", kans: "", agent: "", human: "" }));
  for (const r of rows) {
    const i = Number(r.rij) - 1;
    if (i < 0 || i >= MAX_KANSEN) continue;
    out[i] = { id: r.id, klant: txt(r.klant), kans: txt(r.kans), agent: txt(r.agent_doet), human: txt(r.human_beslist) };
  }
  return out;
}

export function kansPayload(team, i, row) {
  return {
    team: Number(team), rij: i + 1,
    klant: row.klant, kans: row.kans, agent_doet: row.agent, human_beslist: row.human,
  };
}

/* ---------- onze rol ---------- */
export const LEVEL_LABEL = { agent: "Agent", samen: "Human + Agent", human: "Human" };
/* Taak 1-14 staan vast in App.jsx; 15-20 zijn eigen taken van het team */
export const EIGEN_TAKEN = [15, 16, 17, 18, 19, 20];
const LABEL_LEVEL = Object.fromEntries(Object.entries(LEVEL_LABEL).map(([k, v]) => [v, k]));

export const toewijzingSaver = () => makeUpserter("toewijzingen", "team,taak_nr");
export const vanNaarSaver = () => makeUpserter("van_naar", "team,doelgroep");

export async function loadRol(team) {
  const [taken, vn] = await Promise.all([list("toewijzingen", team), list("van_naar", team)]);
  const d = { assign: {}, customs: {}, cv: "", cn: "", dv: "", dn: "", ids: { taak: {}, vn: {} } };
  for (const nr of EIGEN_TAKEN) d.customs[nr] = { t: "", fase: "Build" };
  for (const r of taken) {
    const nr = Number(r.taak_nr);
    d.ids.taak[nr] = r.id;
    const lvl = LABEL_LEVEL[txt(r.niveau)];
    if (lvl) d.assign[nr] = lvl;
    if (EIGEN_TAKEN.includes(nr)) d.customs[nr] = { t: txt(r.eigen_taak_tekst), fase: txt(r.eigen_taak_fase) || "Build" };
  }
  for (const r of vn) {
    const doel = txt(r.doelgroep);
    d.ids.vn[doel] = r.id;
    if (doel === "Consultants") { d.cv = txt(r.van); d.cn = txt(r.naar); }
    if (doel === "Developers") { d.dv = txt(r.van); d.dn = txt(r.naar); }
  }
  return d;
}

export function toewijzingPayload(team, nr, level, custom) {
  const p = { team: Number(team), taak_nr: nr, niveau: level ? LEVEL_LABEL[level] : null };
  if (EIGEN_TAKEN.includes(nr)) { p.eigen_taak_tekst = custom?.t || ""; p.eigen_taak_fase = custom?.fase || "Build"; }
  return p;
}

export function vanNaarPayload(team, doelgroep, van, naar) {
  return { team: Number(team), doelgroep, van, naar };
}

/* ---------- acties ---------- */
export async function loadActies() {
  const uid = await ensureSession();
  const rows = check(await db.from("acties").select("*").order("created_at"), "Laden") || [];
  return rows.map((r) => ({
    id: r.id,
    naam: txt(r.naam), email: txt(r.email).toLowerCase(), team: Number(r.team),
    kolom: txt(r.kolom), actie: txt(r.actie), klant: txt(r.klant), datum: txt(r.datum),
    eigen: r.user_id === uid,
  }));
}

export async function addActie(a) {
  const rows = check(await db.from("acties").insert({
    naam: a.naam, email: a.email, team: Number(a.team),
    kolom: a.kolom, actie: a.actie, klant: a.klant, datum: a.datum,
  }).select("id"), "Toevoegen");
  return { ...a, id: rows?.[0]?.id, eigen: true };
}

export async function deleteActie(id) {
  const rows = check(await db.from("acties").delete().eq("id", id).select("id"), "Verwijderen");
  if (!rows?.length) throw new Error("Verwijderen: geen eigen actie");
}

/* ---------- beheer: alles wissen ---------- */
export async function wipeAll(beheercode, onProgress) {
  onProgress?.("Bezig met wissen...");
  const res = await db.rpc("alles_wissen", { p_code: beheercode });
  if (res.error?.message?.includes("Onjuiste beheercode")) throw new Error("onjuiste beheercode");
  return check(res, "Wissen");
}
