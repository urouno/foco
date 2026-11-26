// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: bullseye;

/* =====================================================================
   Foco · widgets, registro rápido y avisos para iPhone (Scriptable)

   Nombre del script en Scriptable: «Foco» (exactamente así; la app lo
   abre por ese nombre para programar el aviso exacto de un enfoque).

   Tamaños y «Parameter» del widget (opcional):
     · Pequeño  → ahora      Lo que va ahora y cuánto le queda.
     · Mediano  → hoy        Ahora + avance del día + lo que sigue + «+».
     · Grande   → agenda     Línea del día, racha, vista previa de mañana.
     · Cualquier tamaño → pendientes  Lo que no tiene plan y qué atender.
     · Cualquier tamaño → captura     Registro rápido (Bandeja, Hoy,
                                      Con hora y Mente; también en bloqueo).
       (Alias aceptados: rapido, registro, inbox, add.)
     · Pantalla de bloqueo: rectangular, circular y en línea.

   Acciones desde los widgets:
     · Toca «+» o el widget «captura» para registrar tareas o pensamientos
       al instante (incluso sin internet: se guarda en cola y se sincroniza
       en cuanto vuelve la conexión).
     · Toca una tarea en los widgets para marcarla como hecha o pasarla a Hoy.
     · También funciona desde Atajos / Siri / Botón de acción enviando un
       texto como entrada del atajo.
   ===================================================================== */

const K = { url:'foco.url', clave:'foco.clave', avisos:'foco.avisos' };
const fm = FileManager.local();
const RUTA_CACHE = fm.joinPath(fm.documentsDirectory(), 'foco-widget.json');
const RUTA_COLA = fm.joinPath(fm.documentsDirectory(), 'foco-cola.json');
const REUSAR_MS = 60 * 1000; // varios widgets a la vez comparten una sola consulta
const SCRIPT_NOM = (typeof Script !== 'undefined' && Script.name && Script.name()) || 'Foco';

/* ---------- Colores: sistema «Calma» + Terracota (claro / oscuro) ---------- */
const dyn = (l, d) => Color.dynamic(new Color(l), new Color(d));
const C = {
  bg:dyn('#FAF8F5', '#151412'), card:dyn('#FFFFFF', '#1E1D1B'), card2:dyn('#F3EFEA', '#292825'),
  track:dyn('#E9E4DD', '#34322E'), ln:dyn('#ECE7DF', '#2E2C28'),
  ink:dyn('#201F1E', '#EEEAE4'), mut:dyn('#5C5955', '#ABA59C'), mut2:dyn('#7D7973', '#8D877F'),
  ac:dyn('#3E5C52', '#8DB5A5'), acS:dyn('#EAF1ED', '#1D2C26'), onAc:dyn('#FFFFFF', '#10201A'),
  foco:dyn('#B85D38', '#E08A67'), focoS:dyn('#FBF0EB', '#2D1D17'), onFoco:dyn('#FFFFFF', '#2A1208'),
  ok:dyn('#2F5D4C', '#9CCBB6'), okf:dyn('#4E7F6C', '#6FA48F'), okS:dyn('#E8F1EC', '#1C2B24'),
  warn:dyn('#80531F', '#E9B67C'), warnS:dyn('#FAF3EA', '#2B2218'),
  hot:dyn('#A8332A', '#F2A29A'),
  vio:dyn('#4A5371', '#BAC2E3'), vioS:dyn('#EEF0F6', '#212430'),
  azul:dyn('#3B668C', '#8AB4D8'), azulS:dyn('#EDF3F8', '#1A2632')
};
// Misma paleta serena que la app: los colores vivos de áreas antiguas se muestran con su par tranquilo.
const VIVA = ['#5856D6','#007AFF','#32ADE6','#30B0C7','#34C759','#A2845E','#FF9500','#FF6B22','#FF3B30','#FF2D55','#AF52DE','#8E8E93'];
const CALMA = ['#545D7C','#5B7FA3','#5E9AA8','#4F8A80','#5E8C6A','#9A7B5B','#C08A4E','#C2724A','#B5544B','#B0607A','#8A6BA8','#7D7973'];
const tono = h => { const i = VIVA.indexOf(String(h || '').toUpperCase()); return i < 0 ? h : CALMA[i]; };
const hex = h => { try { return new Color(tono(h) || '#7D7973'); } catch (e) { return new Color('#7D7973'); } };

/* ---------- Utilidades ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const masDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const inicioDia = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const hm = m => `${Math.floor(m / 60)}:${pad(Math.round(m % 60))}`;
const horaDe = ms => { const d = new Date(ms); return `${d.getHours()}:${pad(d.getMinutes())}`; };
const mmss = s => `${pad(Math.floor(s / 60))}:${pad(Math.round(s % 60))}`;
const durTxt = m => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`;
const isTrue = v => v === true || v === 'sí' || v === 'si' || v === 'true' || v === 'TRUE' || v === '1' || v === 1;
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const corta = (s, n) => s && s.length > n ? s.slice(0, n - 1) + '…' : (s || '');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const urlAccion = p => 'scriptable:///run?scriptName=' + encodeURIComponent(SCRIPT_NOM) +
  Object.entries(p || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('');

/* ---------- Configuración ---------- */
const cfgAvisos = () => { try { return Object.assign({ on:1, fase:1, inicio:1, antes:5, fin:0, rev:1 }, JSON.parse(Keychain.get(K.avisos))); } catch (e) { return { on:1, fase:1, inicio:1, antes:5, fin:0, rev:1 }; } };
const guardarAvisos = c => Keychain.set(K.avisos, JSON.stringify(c));
const conectado = () => Keychain.contains(K.url) && !!Keychain.get(K.url);

async function configurar() {
  const a = new Alert();
  a.title = 'Conectar con Foco';
  a.message = 'Usa la misma URL de la aplicación web y la misma clave que pusiste en Foco › Ajustes › Conexión con Google Sheets.';
  a.addTextField('https://script.google.com/macros/s/…/exec', Keychain.contains(K.url) ? Keychain.get(K.url) : '');
  a.addSecureTextField('Clave', Keychain.contains(K.clave) ? Keychain.get(K.clave) : '');
  a.addAction('Guardar'); a.addCancelAction('Cancelar');
  if (await a.presentAlert() === -1) return false;
  const url = a.textFieldValue(0).trim(), clave = a.textFieldValue(1).trim();
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) { await aviso('URL no válida', 'Debe empezar con https://script.google.com/macros/s/…'); return false; }
  Keychain.set(K.url, url); Keychain.set(K.clave, clave);
  if (fm.fileExists(RUTA_CACHE)) fm.remove(RUTA_CACHE);
  const r = await cargar(true);
  if (r.error) { await aviso('No se pudo leer tu hoja', r.error); return false; }
  await aviso('Listo', r.snap && r.snap.respaldo
    ? 'Conectado. Abre Foco una vez (con la versión nueva) para que envíe el resumen completo para los widgets.'
    : 'Conectado. Ya puedes agregar los widgets (incluyendo «captura» para registro rápido).');
  return true;
}
async function aviso(t, m) { const a = new Alert(); a.title = t; a.message = m || ''; a.addAction('OK'); await a.presentAlert(); }

/* ---------- Cola local sin conexión + caché ---------- */
function leerCache() {
  if (!fm.fileExists(RUTA_CACHE)) return null;
  try { return JSON.parse(fm.readString(RUTA_CACHE)); } catch (e) { return null; }
}
function guardarCache(obj) {
  try { fm.writeString(RUTA_CACHE, JSON.stringify(obj)); } catch (e) {}
}
function leerCola() {
  if (!fm.fileExists(RUTA_COLA)) return [];
  try { const a = JSON.parse(fm.readString(RUTA_COLA)); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function guardarCola(cola) {
  try {
    if (!cola.length) { if (fm.fileExists(RUTA_COLA)) fm.remove(RUTA_COLA); }
    else fm.writeString(RUTA_COLA, JSON.stringify(cola));
  } catch (e) {}
}

/* ---------- Datos: hoja de Google ↔ Scriptable ---------- */
async function syncHoja(ops = []) {
  if (!conectado()) throw new Error('sin-config');
  const req = new Request(Keychain.get(K.url));
  req.method = 'POST'; req.timeoutInterval = 20;
  req.headers = { 'Content-Type':'text/plain;charset=utf-8' };
  req.body = JSON.stringify({ clave:Keychain.contains(K.clave) ? Keychain.get(K.clave) : '', accion:'sync', ops });
  const j = await req.loadJSON();
  if (!j || !j.ok) throw new Error(j && j.error === 'Clave incorrecta' ? 'La clave no coincide con la de tu Apps Script.' : (j && j.error) || 'La URL no devolvió datos de Foco.');
  return j;
}
async function cargar(forzar) {
  const cache = leerCache(), cola = leerCola();
  if (!forzar && !cola.length && cache && Date.now() - cache.leido < REUSAR_MS) return { ...cache, cola:0 };
  if (!conectado()) return cache ? { ...cache, cola:cola.length, error:'sin-config' } : { cola:cola.length, error:'sin-config' };
  try {
    const j = await syncHoja(cola);
    if (cola.length) guardarCola([]);
    // Si enviamos operaciones propias (capturas/completadas), reconstruimos con los datos frescos de la hoja.
    const snap = cola.length ? fusionarSnap(resumen(j), j) : resumen(j);
    const out = { leido:Date.now(), snap };
    guardarCache(out);
    return { ...out, cola:0 };
  } catch (e) {
    const msg = String(e && e.message || e);
    return cache ? { ...cache, cola:cola.length, error:msg } : { cola:cola.length, error:msg };
  }
}
async function enviarOps(nuevasOps, metaOptimista) {
  const cola = [...leerCola(), ...nuevasOps];
  guardarCola(cola);
  aplicarOptimista(metaOptimista);
  if (!conectado()) return { ok:false, enCola:cola.length, error:'sin-config' };
  try {
    const j = await syncHoja(cola);
    guardarCola([]);
    const snap = fusionarSnap(resumen(j), j);
    guardarCache({ leido:Date.now(), snap });
    try { await programarAvisos(snap); } catch (e) {}
    return { ok:true, enCola:0, snap };
  } catch (e) {
    return { ok:false, enCola:cola.length, error:String(e && e.message || e) };
  }
}
function aplicarOptimista(meta) {
  if (!meta) return;
  const cache = leerCache();
  if (!cache || !cache.snap) return;
  const s = cache.snap;
  if (meta.tipo === 'bandeja') {
    s.bandeja = (s.bandeja || 0) + 1;
    s.recientes = [{ id:meta.id, t:meta.titulo, c:meta.c || '#7D7973' }, ...(s.recientes || [])].slice(0, 4);
    if (s.sinPlan) s.sinPlan.total = (s.sinPlan.total || 0) + 1;
  } else if (meta.tipo === 'hoy') {
    if (s.hoy) s.hoy.total = (s.hoy.total || 0) + 1;
    s.lista = [{ id:meta.id, t:meta.titulo, c:meta.c || '#7D7973', a:meta.a || '', h:meta.hora || '', d:meta.dur || 0, run:0 }, ...(s.lista || [])].slice(0, 8);
    if (meta.hora) {
      const dia = meta.fecha || ymd(new Date()), [hh, mm] = meta.hora.split(':').map(Number), st = hh * 60 + (mm || 0);
      s.dias = s.dias || {}; s.dias[dia] = [...(s.dias[dia] || []), { id:meta.id, t:meta.titulo, s:st, e:Math.min(st + Math.max(meta.dur || 30, 15), 1440), c:meta.c || '#7D7973', a:meta.a || '', ok:0, run:0 }].sort((a, b) => a.s - b.s);
    }
  } else if (meta.tipo === 'mente') {
    s.mente = (s.mente || 0) + 1;
  } else if (meta.tipo === 'hecho') {
    if (s.hoy) s.hoy.hechas = Math.min(s.hoy.total || s.hoy.hechas + 1, (s.hoy.hechas || 0) + 1);
    s.lista = (s.lista || []).filter(x => x.id !== meta.id);
    s.recientes = (s.recientes || []).filter(x => x.id !== meta.id);
    if (s.dias) Object.values(s.dias).forEach(arr => arr.forEach(b => { if (b.id === meta.id) b.ok = 1; }));
    if (s.sinPlan && s.sinPlan.top) s.sinPlan.top = s.sinPlan.top.filter(x => x.id !== meta.id);
  } else if (meta.tipo === 'aHoy') {
    s.recientes = (s.recientes || []).filter(x => x.id !== meta.id);
    if (s.bandeja > 0 && meta.eraBandeja) s.bandeja--;
    if (s.hoy) s.hoy.total = (s.hoy.total || 0) + 1;
    if (meta.titulo) s.lista = [...(s.lista || []), { id:meta.id, t:meta.titulo, c:meta.c || '#7D7973', a:'', h:'', d:0, run:0 }].slice(0, 8);
    if (s.sinPlan && s.sinPlan.top) s.sinPlan.top = s.sinPlan.top.filter(x => x.id !== meta.id);
  }
  s.gen = new Date().toISOString();
  cache.leido = Date.now();
  guardarCache(cache);
}
// Cuando Scriptable escribe en la hoja, el resumen «widget» de Foco aún no se regeneró:
// mezclamos los bloques/lista/bandeja frescos desde j.tareas conservando el timer y racha del resumen.
function fusionarSnap(snap, j) {
  const b = respaldo(j, j.ajustes || []);
  if (!snap || snap.respaldo) return b;
  return { ...snap, gen:new Date().toISOString(), dia:b.dia,
    hoy:{ ...b.hoy, prio:snap.hoy ? snap.hoy.prio : 0, racha:snap.hoy ? snap.hoy.racha : 0, focoMin:snap.hoy ? snap.hoy.focoMin : 0 },
    lista:b.lista, bandeja:b.bandeja, recientes:b.recientes, mente:b.mente, areas:b.areas,
    dias:b.dias, sinPlan:b.sinPlan };
}
function resumen(j) {
  const aj = j.ajustes || [];
  const w = aj.find(a => a.clave === 'widget');
  if (w) { try { return JSON.parse(w.valor); } catch (e) {} }
  return respaldo(j, aj);
}
// Si la app aún no envía el resumen «widget», se arma uno aproximado con las tareas y el reloj.
function respaldo(j, aj) {
  const val = k => { const a = aj.find(x => x.clave === k); try { return a ? JSON.parse(a.valor) : null; } catch (e) { return null; } };
  const cfg = val('config') || {}, areas = cfg.areas || [];
  const ar = id => areas.find(a => a.id === id) || {};
  const hoyS = ymd(new Date()), manS = ymd(masDias(new Date(), 1));
  const diaISO = iso => iso ? ymd(new Date(iso)) : '';
  const ts = (j.tareas || []).filter(t => t.id && !isTrue(t.borrado));
  const toMin = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0); };
  const bloques = d => ts.filter(t => t.hora && (t.estado === 'hecho' ? diaISO(t.hecho) === d && t.fecha === d : t.fecha === d && !['bandeja', 'algun'].includes(t.estado)))
    .map(t => { const s = toMin(t.hora); return { id:t.id, t:String(t.titulo).slice(0, 90), s, e:Math.min(s + Math.max(+t.dur || 30, 15), 1440), c:ar(t.area).c || '#7D7973', a:ar(t.area).n || '', ok:t.estado === 'hecho' ? 1 : 0, run:t.estado === 'proceso' ? 1 : 0, rec:t.rec ? 1 : 0 }; })
    .sort((a, b) => a.s - b.s);
  const vivas = ts.filter(t => t.estado === 'proceso' || (t.estado === 'hoy' && (!t.fecha || t.fecha >= hoyS)))
    .sort((a, b) => (a.estado === 'proceso' ? -1 : 0) - (b.estado === 'proceso' ? -1 : 0) || (+a.orden || 0) - (+b.orden || 0));
  const hechas = ts.filter(t => t.estado === 'hecho' && diaISO(t.hecho) === hoyS).length;
  const bandejaList = ts.filter(t => t.estado === 'bandeja').sort((a, b) => String(b.creado || '').localeCompare(String(a.creado || '')));
  const mente = aj.filter(a => String(a.clave).startsWith('mente:')).reduce((n, a) => {
    try { const m = JSON.parse(a.valor); return !m.borrado && (m.estado === 'abierto' || (m.estado === 'retomar' && m.retomar <= hoyS)) ? n + 1 : n; } catch (e) { return n; }
  }, 0);
  const tm = val('timer') || {};
  const x = ts.find(t => t.id === tm.tareaId);
  return { v:2, respaldo:1, gen:new Date().toISOString(), dia:hoyS,
    hoy:{ hechas, total:hechas + vivas.length, prio:0, racha:0, focoMin:0 },
    bandeja:bandejaList.length, recientes:bandejaList.slice(0, 4).map(t => ({ id:t.id, t:String(t.titulo).slice(0, 90), c:ar(t.area).c || '#7D7973' })),
    mente, areas:areas.map(a => ({ id:a.id, n:a.n, c:a.c })),
    lista:vivas.slice(0, 8).map(t => ({ id:t.id, t:String(t.titulo).slice(0, 90), c:ar(t.area).c || '#7D7973', a:ar(t.area).n || '', h:t.hora || '', d:+t.dur || 0, run:t.estado === 'proceso' ? 1 : 0, rec:t.rec ? 1 : 0 })),
    timer:{ ...tm, c:x ? ar(x.area).c || '#B85D38' : '#B85D38', fases:tm.corriendo && tm.fin ? [{ f:tm.fase, ini:tm.fin - (tm.total || 0) * 1000, fin:tm.fin }] : [] },
    dias:{ [hoyS]:bloques(hoyS), [manS]:bloques(manS) }, sinPlan:sinPlanRespaldo(ts, ar, hoyS, cfg) };
}
// Misma regla que la vista Pendientes de Foco, simplificada.
function sinPlanRespaldo(ts, ar, hoyS, cfg) {
  const dias = iso => iso ? Math.max(0, Math.round((inicioDia(new Date()) - inicioDia(new Date(iso))) / 864e5)) : 0;
  const tipo = t => t.estado === 'bandeja' ? 'bandeja' : t.estado === 'algun' ? 'algun' : t.estado === 'espera' ? (!t.seg || t.seg <= hoyS ? 'espera' : null)
    : ['prox', 'hoy', 'proceso'].includes(t.estado) && t.fecha && t.fecha < hoyS ? 'atrasada' : t.estado === 'prox' && !t.fecha ? 'prox' : null;
  const xs = ts.map(t => { const k = tipo(t); if (!k) return null; const d = dias(t.actualizado || t.creado), o = d >= (k === 'algun' ? 60 : 14);
    const pr = isTrue(t.urgente) && isTrue(t.importante) ? 30 : isTrue(t.importante) ? 20 : isTrue(t.urgente) ? 10 : 0;
    const lim = t.limite && t.limite <= ymd(masDias(new Date(), 7));
    return { t, k, o, d, u:lim || k === 'atrasada' ? 1 : 0, sc:Math.min(d, 60) / 2 + pr + (lim ? 50 : 0) + (k === 'atrasada' ? 25 : k === 'espera' ? 20 : k === 'bandeja' ? 8 : k === 'algun' ? -40 : 0),
      m:lim ? `Vence ${t.limite.slice(5).split('-').reverse().join('/')}` : k === 'atrasada' ? `Era para el ${t.fecha.slice(8)}` : k === 'espera' ? 'Toca dar seguimiento' : k === 'bandeja' ? 'Sin organizar' : o ? `${d} días sin moverse` : 'Sin día' }; })
    .filter(Boolean).sort((a, b) => b.sc - a.sc);
  const acc = xs.filter(x => x.k !== 'algun'), por = {};
  xs.forEach(x => { por[x.k] = (por[x.k] || 0) + 1; });
  return { total:acc.length, olvidadas:acc.filter(x => x.o).length, por, rev:cfg.ultRevision || '', umbral:14,
    top:acc.slice(0, 6).map(x => ({ id:x.t.id, t:String(x.t.titulo).slice(0, 90), c:ar(x.t.area).c || '#7D7973', m:x.m, k:x.k, o:x.o ? 1 : 0, u:x.u })) };
}

/* ---------- Qué va ahora (calculado con la hora actual) ---------- */
function calcular(snap, now = new Date()) {
  const ms = now.getTime(), dia = ymd(now), manS = ymd(masDias(now, 1)), base = inicioDia(now).getTime();
  const nm = (ms - base) / 60000;
  const bloques = (snap.dias && snap.dias[dia]) || [];
  const manana = ((snap.dias && snap.dias[manS]) || []).filter(b => !b.ok);
  const tm = snap.timer || {};
  const fase = (tm.fases || []).find(f => f.ini <= ms && ms < f.fin);
  const actual = bloques.find(b => !b.ok && b.s <= nm && nm < b.e);
  const siguiente = bloques.find(b => !b.ok && b.s > nm && b !== actual);
  const pausa = !tm.corriendo && tm.fase === 'foco' && tm.restante > 0 && tm.restante < tm.total;
  const delDia = snap.dia === dia;
  let ahora;
  if (fase) {
    const foco = fase.f === 'foco';
    ahora = { k:'timer', id:tm.tareaId || '', desc:!foco, etiqueta:foco ? (tm.modo === 'pomo' ? 'Pomodoro' : 'Enfoque') : (fase.f === 'largo' ? 'Descanso largo' : 'Descanso'),
      titulo:foco ? (tm.tarea || 'Enfoque libre') : (tm.tarea ? `Después: ${tm.tarea}` : 'Respira, estírate'), ini:fase.ini, fin:fase.fin, c:foco ? C.foco : C.okf, sym:foco ? 'flame.fill' : 'cup.and.saucer.fill' };
  } else if (actual) {
    ahora = { k:'bloque', id:actual.id, rec:actual.rec, etiqueta:`Ahora · ${hm(actual.s)}–${hm(actual.e)}`, titulo:actual.t, ini:base + actual.s * 60000, fin:base + actual.e * 60000, c:hex(actual.c), sym:'clock.fill' };
  } else if (pausa) {
    ahora = { k:'pausa', id:tm.tareaId || '', etiqueta:'En pausa', titulo:tm.tarea || 'Enfoque libre', restante:tm.restante, total:tm.total, c:C.foco, sym:'pause.circle.fill' };
  } else if (delDia && snap.lista && snap.lista.length) {
    const x = snap.lista[0];
    ahora = { k:'tarea', id:x.id, rec:x.rec, etiqueta:x.run ? 'En curso' : 'Ahora', titulo:x.t, c:hex(x.c), dur:x.d, h:x.h, sym:'sun.max.fill' };
  } else ahora = { k:'libre', id:'', etiqueta:'Hoy', titulo:delDia && snap.hoy && snap.hoy.total ? 'Lista terminada' : 'Nada en curso', c:C.ac, sym:'checkmark.circle.fill' };
  const prog = ahora.fin ? Math.min(1, Math.max(0, (ms - ahora.ini) / (ahora.fin - ahora.ini))) : ahora.k === 'pausa' ? 1 - ahora.restante / ahora.total : 0;
  const pend = bloques.filter(b => !b.ok && b.e > nm && !(ahora.k === 'bloque' && b === actual));
  const sinHora = delDia ? (snap.lista || []).filter((x, i) => !x.h && !(i === 0 && ahora.k === 'tarea')) : [];
  const avance = delDia ? snap.hoy || { hechas:0, total:0 } : null;
  // Próximo momento en que cambia lo que se muestra: ahí se pide redibujar.
  const cambios = [ahora.fin, siguiente && base + siguiente.s * 60000, base + 86400000 + 60000, ms + 30 * 60000].filter(x => x && x > ms + 30000);
  return { ahora, prog, siguiente, pend, sinHora, manana, avance, bandeja:snap.bandeja || 0, recientes:snap.recientes || [], mente:snap.mente || 0,
    base, ms, dia, refrescar:new Date(Math.min(...cambios) + 5000), viejo:!delDia || ms - new Date(snap.gen).getTime() > 12 * 3600e3 };
}

/* ---------- Piezas visuales ---------- */
function texto(st, s, font, color, lineas = 1) { const t = st.addText(s); t.font = font; t.textColor = color; t.lineLimit = lineas; return t; }
function barra(st, frac, w, h, color) {
  const s = st.addStack(); s.size = new Size(w, h); s.cornerRadius = h / 2; s.backgroundColor = C.track; s.layoutHorizontally();
  const f = Math.max(0, Math.min(1, frac || 0));
  if (f > 0.005) { const i = s.addStack(); i.size = new Size(Math.max(h, w * f), h); i.cornerRadius = h / 2; i.backgroundColor = color; }
  s.addSpacer();
}
function segmentos(st, hechas, total, w) {
  if (!total) return;
  if (total > 12) { barra(st, hechas / total, w, 6, C.okf); return; }
  const gap = 3, sw = (w - gap * (total - 1)) / total, s = st.addStack(); s.spacing = gap;
  for (let i = 0; i < total; i++) { const x = s.addStack(); x.size = new Size(sw, 6); x.cornerRadius = 3; x.backgroundColor = i < hechas ? C.okf : C.track; }
}
function simbolo(st, nombre, size, color) {
  const sf = SFSymbol.named(nombre) || SFSymbol.named('circle'); sf.applyFont(Font.boldSystemFont(size));
  const i = st.addImage(sf.image); i.imageSize = new Size(size + 2, size + 2); i.tintColor = color; return i;
}
function pill(st, txt, bg, fg, sym, url) {
  const p = st.addStack(); p.centerAlignContent(); p.spacing = 3;
  p.backgroundColor = bg; p.cornerRadius = 9; p.setPadding(3, 7, 3, 7);
  if (url) p.url = url;
  if (sym) simbolo(p, sym, 9, fg);
  if (txt) texto(p, txt, Font.boldSystemFont(10), fg);
  return p;
}
function btnMas(st, destino = '') {
  const b = st.addStack(); b.centerAlignContent(); b.size = new Size(24, 24); b.cornerRadius = 12;
  b.backgroundColor = C.ac; b.url = urlAccion({ accion:'captura', destino });
  b.addSpacer(); simbolo(b, 'plus', 11, C.onAc); b.addSpacer();
  return b;
}
// Cuenta regresiva que iOS avanza sola. Ojo: al llegar a 0 iOS sigue contando hacia arriba,
// por eso siempre va acompañada de la hora de término y se pide redibujar en ese momento.
function cuenta(st, finMs, font, color) { const d = st.addDate(new Date(finMs)); d.applyTimerStyle(); d.font = font; d.textColor = color; d.lineLimit = 1; d.minimumScaleFactor = 0.6; return d; }
function etiqueta(st, a, size = 11) {
  const r = st.addStack(); r.centerAlignContent(); r.spacing = 4;
  const col = a.k === 'timer' && !a.desc ? C.foco : a.k === 'libre' ? C.mut : C.ac;
  simbolo(r, a.sym, size - 1, a.c);
  texto(r, a.etiqueta.toUpperCase(), Font.boldSystemFont(size), col);
  if (a.rec) simbolo(r, 'repeat', size - 2, C.mut2);
  return r;
}
function pie(st, d, extra) {
  const msg = d.error === 'sin-config' ? 'Abre Scriptable › Foco para conectar'
    : d.cola ? `${d.cola} ${d.cola === 1 ? 'cambio' : 'cambios'} en cola · sin señal`
    : d.viejo ? 'Abre Foco para actualizar el día' : extra;
  if (msg) texto(st, msg, Font.mediumSystemFont(10), d.viejo || d.error || d.cola ? C.warn : C.mut);
}
function anchos() {
  const w = Device.screenSize().width, k = w >= 428 ? 364 / 338 : w <= 375 ? 321 / 338 : 1;
  return { pequeno:158 * k - 28, mediano:338 * k - 28 };
}

/* ---------- Bloque «Ahora» (reutilizado en todos los tamaños) ---------- */
function bloqueAhora(st, d, w, grande) {
  const a = d.ahora, enFoco = a.k === 'timer' && !a.desc;
  etiqueta(st, a, grande ? 12 : 10);
  st.addSpacer(4);
  texto(st, a.titulo, Font.boldSystemFont(grande ? 17 : 14), C.ink, grande ? 2 : 3);
  if (grande) st.addSpacer(8); else st.addSpacer();
  if (a.k === 'timer' || a.k === 'bloque') {
    cuenta(st, a.fin, Font.boldRoundedSystemFont(grande ? 34 : 28), enFoco ? C.foco : C.ink);
    st.addSpacer(4); barra(st, d.prog, w, 6, a.desc ? C.okf : enFoco ? C.foco : a.c); st.addSpacer(4);
    texto(st, `quedan · termina ${horaDe(a.fin)}`, Font.mediumSystemFont(10), C.mut);
  } else if (a.k === 'pausa') {
    texto(st, mmss(a.restante), Font.boldRoundedSystemFont(grande ? 34 : 28), C.mut);
    st.addSpacer(4); barra(st, d.prog, w, 6, C.mut2); st.addSpacer(4);
    texto(st, 'en pausa · reanuda en Foco', Font.mediumSystemFont(10), C.mut);
  } else if (d.siguiente) {
    const s = d.siguiente, r = st.addStack(); r.centerAlignContent(); r.spacing = 4;
    texto(r, 'Sigue', Font.semiboldSystemFont(11), C.mut);
    const rel = r.addDate(new Date(d.base + s.s * 60000)); rel.applyRelativeStyle(); rel.font = Font.semiboldSystemFont(11); rel.textColor = C.ac; rel.lineLimit = 1;
    texto(st, `${hm(s.s)} ${s.t}`, Font.mediumSystemFont(11), C.mut, 1);
  } else if (a.k === 'tarea') {
    texto(st, [a.h ? `Era a las ${a.h}` : 'Sin hora', a.dur ? `≈ ${durTxt(a.dur)}` : ''].filter(Boolean).join(' · '), Font.mediumSystemFont(11), C.mut);
  } else if (d.avance && d.avance.total) {
    texto(st, `${d.avance.hechas} de ${d.avance.total} hechas hoy`, Font.mediumSystemFont(11), C.ok);
  }
}

/* ---------- Widgets de la pantalla de inicio ---------- */
function wAhora(w, d) {
  const an = anchos(), enFoco = d.ahora.k === 'timer' && !d.ahora.desc;
  if (enFoco) w.backgroundColor = C.focoS;
  w.url = urlAccion(d.ahora.id ? { accion:'tarea', id:d.ahora.id, titulo:corta(d.ahora.titulo, 60) } : { accion:'captura' });
  bloqueAhora(w, d, d.fam === 'small' ? an.pequeno : an.mediano, d.fam === 'large');
  const extra = d.avance && d.avance.total && d.ahora.k !== 'libre'
    ? `${d.avance.hechas}/${d.avance.total} hoy${d.bandeja ? ` · ${d.bandeja} bandeja` : ''}`
    : (d.bandeja ? `${d.bandeja} en bandeja` : '');
  if (d.error || d.viejo || d.cola || extra) { w.addSpacer(4); pie(w, d, extra); }
}
function filaItem(st, x, base, ancho, nm, conUrl = true) {
  const r = st.addStack(); r.centerAlignContent(); r.spacing = 7;
  if (conUrl && x.id) r.url = urlAccion({ accion:'tarea', id:x.id, titulo:corta(x.t, 60) });
  const p = r.addStack(); p.size = new Size(3.5, 16); p.cornerRadius = 2; p.backgroundColor = hex(x.c);
  const h = r.addStack(); h.size = new Size(38, 16); h.centerAlignContent();
  texto(h, x.s != null ? hm(x.s) : '—', Font.semiboldMonospacedSystemFont(11.5), C.mut);
  texto(r, x.t, Font.mediumSystemFont(13), C.ink, 1);
  if (x.rec) simbolo(r, 'repeat', 9, C.mut2);
  r.addSpacer();
  // La actividad que ya empezó muestra lo que le queda; las demás, su duración.
  if (x.s != null && nm != null && x.s <= nm && nm < x.e) cuenta(r, base + x.e * 60000, Font.semiboldRoundedSystemFont(12), C.foco).rightAlignText();
  else if (x.s != null) texto(r, durTxt(x.e - x.s), Font.systemFont(11), C.mut2);
}
function wHoy(w, d) {
  const an = anchos(), col = (an.mediano - 12) / 2, enFoco = d.ahora.k === 'timer' && !d.ahora.desc;
  const fila = w.addStack(); fila.layoutHorizontally(); fila.spacing = 12;
  // Tarjeta izquierda «Ahora»
  const izq = fila.addStack(); izq.layoutVertically(); izq.size = new Size(col, 0);
  izq.backgroundColor = enFoco ? C.focoS : C.card; izq.cornerRadius = 14; izq.setPadding(10, 11, 10, 11);
  izq.url = urlAccion(d.ahora.id ? { accion:'tarea', id:d.ahora.id, titulo:corta(d.ahora.titulo, 60) } : { accion:'captura' });
  bloqueAhora(izq, d, col - 22, false);
  // Columna derecha «Hoy» + acceso rápido «+»
  const der = fila.addStack(); der.layoutVertically(); der.size = new Size(col, 0);
  const cab = der.addStack(); cab.centerAlignContent(); cab.spacing = 5;
  texto(cab, 'Hoy', Font.boldSystemFont(15), C.ink);
  if (d.avance) texto(cab, `${d.avance.hechas}/${d.avance.total}`, Font.semiboldSystemFont(12), C.mut);
  cab.addSpacer();
  btnMas(cab, 'hoy');
  der.addSpacer(6);
  if (d.avance) segmentos(der, d.avance.hechas, d.avance.total, col);
  der.addSpacer(7);
  const items = [...d.pend.map(b => ({ ...b })), ...d.sinHora.map(x => ({ ...x, s:null }))].slice(0, 3);
  if (!items.length) texto(der, d.avance && d.avance.total ? 'Nada más por hoy' : 'Sin tareas para hoy', Font.mediumSystemFont(12), C.mut);
  items.forEach((x, i) => {
    if (i) der.addSpacer(5);
    const r = der.addStack(); r.centerAlignContent(); r.spacing = 5;
    if (x.id) r.url = urlAccion({ accion:'tarea', id:x.id, titulo:corta(x.t, 60) });
    const p = r.addStack(); p.size = new Size(3, 14); p.cornerRadius = 1.5; p.backgroundColor = hex(x.c);
    if (x.s != null) texto(r, hm(x.s), Font.semiboldMonospacedSystemFont(10.5), C.mut);
    texto(r, x.t, Font.mediumSystemFont(12), C.ink, 1);
  });
  der.addSpacer();
  const extra = d.avance && d.avance.racha ? `🔥 ${d.avance.racha}d${d.bandeja ? ` · ${d.bandeja} bandeja` : ''}` : (d.bandeja ? `${d.bandeja} en bandeja` : '');
  pie(der, d, extra);
}
function wAgenda(w, d) {
  const an = anchos(), grande = d.fam === 'large', W = an.mediano, enFoco = d.ahora.k === 'timer' && !d.ahora.desc;
  const fecha = new Date();
  const cab = w.addStack(); cab.centerAlignContent(); cab.spacing = 6;
  texto(cab, 'Hoy', Font.boldSystemFont(17), C.ink);
  texto(cab, `${DIAS[fecha.getDay()]} ${fecha.getDate()}`, Font.mediumSystemFont(13), C.mut);
  cab.addSpacer();
  if (d.avance && d.avance.racha) pill(cab, `${d.avance.racha}d`, C.focoS, C.foco, 'flame.fill');
  else if (d.avance && d.avance.focoMin) pill(cab, durTxt(d.avance.focoMin), C.acS, C.ac, 'timer');
  if (d.avance) texto(cab, `${d.avance.hechas}/${d.avance.total}`, Font.semiboldSystemFont(12), C.mut);
  btnMas(cab, 'hoy');
  w.addSpacer(6);
  if (d.avance) segmentos(w, d.avance.hechas, d.avance.total, W);
  w.addSpacer(9);
  if (grande) {
    const card = w.addStack(); card.layoutVertically(); card.backgroundColor = enFoco ? C.focoS : C.card;
    card.cornerRadius = 14; card.setPadding(10, 12, 10, 12); card.size = new Size(W, 0);
    card.url = urlAccion(d.ahora.id ? { accion:'tarea', id:d.ahora.id, titulo:corta(d.ahora.titulo, 60) } : { accion:'captura' });
    bloqueAhora(card, d, W - 24, false);
    w.addSpacer(10);
  }
  const max = grande ? 5 : 3, nm = (d.ms - d.base) / 60000;
  const items = [...d.pend, ...d.sinHora.map(x => ({ ...x, s:null }))].slice(0, max);
  if (!grande && d.ahora.fin) {
    const r = w.addStack(); r.centerAlignContent(); r.spacing = 8;
    if (d.ahora.id) r.url = urlAccion({ accion:'tarea', id:d.ahora.id, titulo:corta(d.ahora.titulo, 60) });
    const p = r.addStack(); p.size = new Size(4, 16); p.cornerRadius = 2; p.backgroundColor = d.ahora.c;
    texto(r, d.ahora.titulo, Font.boldSystemFont(13), C.ink, 1); r.addSpacer();
    cuenta(r, d.ahora.fin, Font.boldRoundedSystemFont(13), enFoco ? C.foco : C.ac).rightAlignText();
    w.addSpacer(6);
  }
  const mostrados = items.slice(0, !grande && d.ahora.fin ? max - 1 : max);
  if (!mostrados.length) {
    if (d.manana && d.manana.length) {
      texto(w, 'MAÑANA', Font.boldSystemFont(10), C.ac); w.addSpacer(5);
      d.manana.slice(0, grande ? 4 : 2).forEach((x, i) => { if (i) w.addSpacer(6); filaItem(w, x, d.base, W, null, false); });
    } else texto(w, 'Nada más con hora por hoy', Font.mediumSystemFont(13), C.mut);
  } else {
    mostrados.forEach((x, i) => { if (i) w.addSpacer(7); filaItem(w, x, d.base, W, nm, true); });
    if (grande && mostrados.length <= 2 && d.manana && d.manana.length) {
      w.addSpacer(9); texto(w, 'MAÑANA', Font.boldSystemFont(10), C.ac); w.addSpacer(5);
      d.manana.slice(0, Math.min(2, 4 - mostrados.length)).forEach((x, i) => { if (i) w.addSpacer(6); filaItem(w, x, d.base, W, null, false); });
    }
  }
  w.addSpacer();
  const extra = [d.bandeja ? `${d.bandeja} en bandeja` : '', d.snapGen ? `Act. ${horaDe(new Date(d.snapGen).getTime())}` : ''].filter(Boolean).join(' · ');
  pie(w, d, extra);
}

/* ---------- Widget «Captura / Registro rápido» ---------- */
function btnCaptura(st, destino, titulo, sub, sym, bg, fg, ancho, alto) {
  const b = st.addStack(); b.layoutHorizontally(); b.centerAlignContent(); b.spacing = 8;
  b.backgroundColor = bg; b.cornerRadius = 13; b.setPadding(8, 10, 8, 10);
  if (ancho) b.size = new Size(ancho, alto || 46);
  b.url = urlAccion({ accion:'captura', destino });
  simbolo(b, sym, 15, fg);
  const col = b.addStack(); col.layoutVertically(); col.spacing = 1;
  texto(col, titulo, Font.boldSystemFont(12.5), fg, 1);
  if (sub) texto(col, sub, Font.mediumSystemFont(10), C.mut, 1);
  b.addSpacer();
  return b;
}
function wCaptura(w, d) {
  const an = anchos(), fam = d.fam;
  if (fam === 'small') {
    w.url = urlAccion({ accion:'captura' });
    const top = w.addStack(); top.centerAlignContent();
    const ic = top.addStack(); ic.size = new Size(36, 36); ic.cornerRadius = 18; ic.backgroundColor = C.ac; ic.centerAlignContent();
    ic.addSpacer(); simbolo(ic, 'plus', 17, C.onAc); ic.addSpacer();
    top.addSpacer();
    if (d.bandeja) pill(top, String(d.bandeja), C.card2, C.mut, 'tray');
    w.addSpacer(10);
    texto(w, 'Registro rápido', Font.boldSystemFont(15), C.ink, 1);
    w.addSpacer(2);
    texto(w, 'Captura una tarea, cita o idea al instante', Font.mediumSystemFont(11.5), C.mut, 2);
    w.addSpacer();
    const extra = d.avance ? `Hoy ${d.avance.hechas}/${d.avance.total}${d.mente ? ` · ${d.mente} mente` : ''}` : 'Toca para capturar';
    pie(w, d, extra);
    return;
  }
  const W = an.mediano, bw = (W - 8) / 2, grande = fam === 'large';
  const cab = w.addStack(); cab.centerAlignContent(); cab.spacing = 6;
  simbolo(cab, 'plus.circle.fill', 14, C.ac);
  texto(cab, 'Registro rápido', Font.boldSystemFont(grande ? 16 : 14), C.ink);
  cab.addSpacer();
  if (d.bandeja) pill(cab, `${d.bandeja}`, C.card2, C.mut, 'tray.fill');
  if (d.avance) pill(cab, `${d.avance.hechas}/${d.avance.total}`, C.acS, C.ac, 'checkmark.circle.fill');
  w.addSpacer(grande ? 10 : 8);

  // Cuadrícula 2×2 con destinos directos
  const bh = grande ? 50 : 44;
  const r1 = w.addStack(); r1.spacing = 8;
  btnCaptura(r1, 'bandeja', 'Bandeja', d.bandeja ? `${d.bandeja} sin ordenar` : 'Capturar rápido', 'tray.and.arrow.down.fill', C.acS, C.ac, bw, bh);
  btnCaptura(r1, 'hoy', 'Para hoy', d.avance ? `${d.avance.hechas} de ${d.avance.total} hoy` : 'Sumar al día', 'sun.max.fill', C.focoS, C.foco, bw, bh);
  w.addSpacer(8);
  const r2 = w.addStack(); r2.spacing = 8;
  btnCaptura(r2, 'hora', 'Con hora', 'Agendar bloque', 'clock.badge.plus', C.azulS, C.azul, bw, bh);
  btnCaptura(r2, 'mente', 'Mente', d.mente ? `${d.mente} abiertos` : 'Sacar de la cabeza', 'sparkles', C.vioS, C.vio, bw, bh);

  if (grande) {
    w.addSpacer(12);
    const lista = d.recientes && d.recientes.length ? d.recientes : d.sinHora.slice(0, 4);
    const esBand = !!(d.recientes && d.recientes.length);
    const subCab = w.addStack(); subCab.centerAlignContent();
    texto(subCab, esBand ? 'ÚLTIMOS EN BANDEJA' : 'PRÓXIMAS DE HOY', Font.boldSystemFont(10.5), C.ac);
    subCab.addSpacer();
    texto(subCab, 'Toca para actuar', Font.mediumSystemFont(10), C.mut2);
    w.addSpacer(6);
    if (!lista.length) {
      texto(w, 'Bandeja despejada. Toca arriba para registrar algo.', Font.mediumSystemFont(12.5), C.mut, 2);
    } else {
      lista.slice(0, 4).forEach((x, i) => {
        if (i) w.addSpacer(7);
        const r = w.addStack(); r.centerAlignContent(); r.spacing = 8;
        if (x.id) r.url = urlAccion({ accion:'tarea', id:x.id, titulo:corta(x.t, 60), desde:esBand ? 'bandeja' : 'hoy' });
        const p = r.addStack(); p.size = new Size(3.5, 16); p.cornerRadius = 2; p.backgroundColor = hex(x.c);
        texto(r, x.t, Font.mediumSystemFont(13), C.ink, 1);
        r.addSpacer();
        simbolo(r, esBand ? 'arrow.up.right.circle' : 'checkmark.circle', 13, C.mut2);
      });
    }
    w.addSpacer();
    pie(w, d, d.snapGen ? `Sincronizado ${horaDe(new Date(d.snapGen).getTime())}` : '');
  } else {
    w.addSpacer();
    const ult = d.recientes && d.recientes[0];
    pie(w, d, ult ? `Último: ${corta(ult.t, 36)}` : 'Toca un botón para registrar al instante');
  }
}
function accCaptura(w, d, fam) {
  w.url = urlAccion({ accion:'captura' });
  if (fam === 'accessoryInline') {
    const s = SFSymbol.named('plus.circle.fill'); if (s) w.addImage(s.image);
    w.addText(d && d.bandeja ? `Capturar · ${d.bandeja} bandeja` : 'Capturar en Foco');
    return;
  }
  if (fam === 'accessoryCircular') {
    w.addAccessoryWidgetBackground = true;
    w.addSpacer();
    const r = w.addStack(); r.addSpacer();
    const c = r.addStack(); c.layoutVertically(); c.centerAlignContent(); c.spacing = 1;
    simbolo(c, 'plus', 20, Color.white());
    texto(c, d && d.bandeja ? String(d.bandeja) : 'Foco', Font.boldRoundedSystemFont(10), Color.white()).centerAlignText();
    r.addSpacer(); w.addSpacer();
    return;
  }
  const l1 = w.addStack(); l1.centerAlignContent(); l1.spacing = 4;
  simbolo(l1, 'plus.circle.fill', 11, Color.white());
  texto(l1, 'Registro rápido', Font.boldSystemFont(13), Color.white());
  const sub = d && d.avance ? `Bandeja: ${d.bandeja} · Hoy: ${d.avance.hechas}/${d.avance.total}` : 'Foco · captura al instante';
  texto(w, sub, Font.mediumSystemFont(12), new Color('#ffffff', 0.85), 1);
  texto(w, 'Toca para agregar tarea o idea', Font.mediumSystemFont(11), new Color('#ffffff', 0.65), 1);
}

/* ---------- Widgets de la pantalla de bloqueo ---------- */
function anillo(frac) {
  const s = 120, dc = new DrawContext(); dc.size = new Size(s, s); dc.opaque = false; dc.respectScreenScale = true;
  const r = s / 2 - 7, cx = s / 2, cy = s / 2;
  dc.setLineWidth(10); dc.setStrokeColor(new Color('#ffffff', 0.25)); dc.strokeEllipse(new Rect(cx - r, cy - r, 2 * r, 2 * r));
  const f = Math.max(0, Math.min(1, frac));
  if (f > 0.01) {
    const p = new Path(), n = Math.max(2, Math.round(90 * f)), pts = [];
    for (let i = 0; i <= n; i++) { const t = -Math.PI / 2 + 2 * Math.PI * f * i / n; pts.push(new Point(cx + r * Math.cos(t), cy + r * Math.sin(t))); }
    p.addLines(pts); dc.addPath(p); dc.setStrokeColor(Color.white()); dc.setLineWidth(10); dc.strokePath();
  }
  return dc.getImage();
}
function wCircular(w, d) {
  const a = d.ahora; w.addAccessoryWidgetBackground = true;
  w.url = urlAccion(a.id ? { accion:'tarea', id:a.id, titulo:corta(a.titulo, 60) } : { accion:'captura' });
  const frac = a.fin || a.k === 'pausa' ? d.prog : d.avance && d.avance.total ? d.avance.hechas / d.avance.total : 0;
  w.backgroundImage = anillo(frac);
  w.addSpacer();
  const r = w.addStack(); r.addSpacer();
  if (a.fin) cuenta(r, a.fin, Font.boldRoundedSystemFont(12), Color.white()).centerAlignText();
  else if (a.k === 'pausa') texto(r, mmss(a.restante), Font.boldRoundedSystemFont(12), Color.white()).centerAlignText();
  else texto(r, d.avance ? `${d.avance.hechas}/${d.avance.total}` : '—', Font.boldRoundedSystemFont(15), Color.white()).centerAlignText();
  r.addSpacer(); w.addSpacer();
}
function wRectangular(w, d) {
  const a = d.ahora; w.addAccessoryWidgetBackground = false;
  w.url = urlAccion(a.id ? { accion:'tarea', id:a.id, titulo:corta(a.titulo, 60) } : { accion:'captura' });
  const l1 = w.addStack(); l1.centerAlignContent(); l1.spacing = 4;
  simbolo(l1, a.sym, 10, Color.white());
  texto(l1, a.etiqueta, Font.semiboldSystemFont(12), Color.white());
  texto(w, a.titulo, Font.boldSystemFont(14), Color.white(), 1);
  const l3 = w.addStack(); l3.centerAlignContent(); l3.spacing = 4;
  if (a.fin) { cuenta(l3, a.fin, Font.boldRoundedSystemFont(13), Color.white()); texto(l3, `· ${horaDe(a.fin)}`, Font.mediumSystemFont(12), new Color('#ffffff', 0.7)); }
  else if (a.k === 'pausa') texto(l3, `${mmss(a.restante)} en pausa`, Font.mediumSystemFont(12), Color.white());
  else if (d.siguiente) texto(l3, `Sigue ${hm(d.siguiente.s)} · ${d.siguiente.t}`, Font.mediumSystemFont(12), new Color('#ffffff', 0.8));
  else if (d.avance) texto(l3, `${d.avance.hechas} de ${d.avance.total} hechas hoy`, Font.mediumSystemFont(12), new Color('#ffffff', 0.8));
}
function wLinea(w, d) {
  const a = d.ahora;
  w.url = urlAccion(a.id ? { accion:'tarea', id:a.id, titulo:corta(a.titulo, 60) } : { accion:'captura' });
  // En línea iOS solo muestra un texto: se usa la hora de término (siempre correcta, sin contar).
  const t = a.fin ? `${corta(a.titulo, 22)} · hasta ${horaDe(a.fin)}`
    : d.siguiente ? `Sigue ${hm(d.siguiente.s)} · ${corta(d.siguiente.t, 20)}`
    : d.avance ? `Hoy ${d.avance.hechas} de ${d.avance.total}` : 'Foco';
  const s = SFSymbol.named(a.fin ? 'timer' : 'sun.max'); if (s) w.addImage(s.image);
  w.addText(t);
}

/* ---------- Widget «Pendientes»: lo que no tiene plan ---------- */
const TIPOS = { atrasada:['Atrasadas', '#C4493E'], espera:['Espera', '#C08A4E'], prox:['Sin día', '#3E5C52'], bandeja:['Bandeja', '#9DB5AB'] };
const diasRev = sp => sp && sp.rev ? Math.max(0, Math.round((inicioDia(new Date()) - inicioDia(new Date(sp.rev))) / 864e5)) : null;
const txtRev = sp => { const d = diasRev(sp); return d == null ? 'Sin revisión todavía' : d === 0 ? 'Revisaste hoy' : `Revisión hace ${d} ${d === 1 ? 'día' : 'días'}`; };
const revVencida = sp => { const d = diasRev(sp); return sp && sp.total > 0 && (d == null || d >= 7); };
function resumenPend(st, sp, grande) {
  const r = st.addStack(); r.centerAlignContent(); r.spacing = 4;
  simbolo(r, 'square.stack.3d.up', 10, C.ac); texto(r, 'SIN PLAN', Font.boldSystemFont(10.5), C.ac);
  st.addSpacer(2);
  const n = st.addStack(); n.bottomAlignContent(); n.spacing = 5;
  texto(n, String(sp.total), Font.boldRoundedSystemFont(grande ? 42 : 36), C.ink);
  texto(n, sp.total === 1 ? 'pendiente' : 'pendientes', Font.mediumSystemFont(11.5), C.mut);
  st.addSpacer();
  if (sp.olvidadas) texto(st, `${sp.olvidadas} ${sp.olvidadas === 1 ? 'olvidado' : 'olvidados'} · +${sp.umbral || 14}d`, Font.semiboldSystemFont(11), C.warn);
  texto(st, txtRev(sp), Font.mediumSystemFont(10.5), revVencida(sp) ? C.warn : C.mut);
}
function barraTipos(st, sp, w) {
  const tot = Object.keys(TIPOS).reduce((a, k) => a + ((sp.por || {})[k] || 0), 0); if (!tot) return;
  const s = st.addStack(); s.size = new Size(w, 8); s.cornerRadius = 4; s.spacing = 2; s.backgroundColor = C.track;
  Object.keys(TIPOS).forEach(k => { const n = (sp.por || {})[k]; if (!n) return; const i = s.addStack(); i.size = new Size(Math.max(4, (w - 6) * n / tot), 8); i.backgroundColor = new Color(TIPOS[k][1]); });
  st.addSpacer(6);
  const l = st.addStack(); l.spacing = 8; l.centerAlignContent();
  Object.keys(TIPOS).forEach(k => { const n = (sp.por || {})[k]; if (!n) return; const x = l.addStack(); x.spacing = 3; x.centerAlignContent();
    const dot = x.addStack(); dot.size = new Size(6, 6); dot.cornerRadius = 2; dot.backgroundColor = new Color(TIPOS[k][1]); texto(x, `${TIPOS[k][0]} ${n}`, Font.mediumSystemFont(10), C.mut); });
}
function itemPend(st, x, conMotivo = true) {
  const r = st.addStack(); r.spacing = 8; r.centerAlignContent();
  if (x.id) r.url = urlAccion({ accion:'tarea', id:x.id, titulo:corta(x.t, 60), desde:'pendientes' });
  const p = r.addStack(); p.size = new Size(3, conMotivo ? 28 : 14); p.cornerRadius = 1.5; p.backgroundColor = hex(x.c);
  const c = r.addStack(); c.layoutVertically();
  texto(c, x.t, Font.semiboldSystemFont(13), C.ink, 1);
  if (conMotivo) texto(c, x.m, Font.mediumSystemFont(11), x.u || x.o ? C.warn : C.mut, 1);
  r.addSpacer();
}
function wPendientes(w, sp, fam) {
  const an = anchos();
  if (!sp) { texto(w, 'Pendientes', Font.boldSystemFont(15), C.ink); w.addSpacer(6); texto(w, 'Abre Foco una vez para enviar tus pendientes al widget.', Font.mediumSystemFont(12), C.mut, 4); return; }
  if (fam === 'small') { w.url = urlAccion({ accion:'captura', destino:'bandeja' }); resumenPend(w, sp, false); return; }
  if (fam === 'medium') {
    const col = (an.mediano - 12) / 2, f = w.addStack(); f.spacing = 12;
    const izq = f.addStack(); izq.layoutVertically(); izq.size = new Size(col * 0.85, 0);
    izq.backgroundColor = C.card; izq.cornerRadius = 14; izq.setPadding(10, 10, 10, 10);
    resumenPend(izq, sp, false);
    const der = f.addStack(); der.layoutVertically(); der.size = new Size(col * 1.15, 0);
    const cab = der.addStack(); cab.centerAlignContent();
    texto(cab, 'Primero atiende', Font.boldSystemFont(13), C.ink); cab.addSpacer(); btnMas(cab, 'bandeja');
    der.addSpacer(6);
    if (!sp.top.length) texto(der, 'Todo tiene plan', Font.mediumSystemFont(12), C.mut);
    sp.top.slice(0, 3).forEach((x, i) => {
      if (i) der.addSpacer(5);
      const b = der.addStack(); b.layoutVertically();
      if (x.id) b.url = urlAccion({ accion:'tarea', id:x.id, titulo:corta(x.t, 60), desde:'pendientes' });
      itemPend(b, x, false);
      const m = b.addStack(); m.addSpacer(11); texto(m, x.m, Font.mediumSystemFont(10), x.u || x.o ? C.warn : C.mut, 1);
    });
    der.addSpacer();
    return;
  }
  const W = an.mediano, cab = w.addStack(); cab.centerAlignContent(); cab.spacing = 6;
  texto(cab, 'Pendientes', Font.boldSystemFont(17), C.ink);
  texto(cab, `${sp.total} sin plan`, Font.mediumSystemFont(13), C.mut); cab.addSpacer();
  if (sp.olvidadas) pill(cab, `${sp.olvidadas} olvid.`, C.warnS, C.warn);
  btnMas(cab, 'bandeja');
  w.addSpacer(10); barraTipos(w, sp, W); w.addSpacer(12);
  texto(w, 'PRIMERO ATIENDE', Font.boldSystemFont(10.5), C.ac); w.addSpacer(8);
  if (!sp.top.length) texto(w, 'Todo tiene un siguiente paso.', Font.mediumSystemFont(13), C.mut);
  sp.top.slice(0, 5).forEach((x, i) => { if (i) w.addSpacer(8); itemPend(w, x); });
  w.addSpacer();
  const pie_ = w.addStack(); pie_.centerAlignContent();
  texto(pie_, txtRev(sp), Font.mediumSystemFont(11), revVencida(sp) ? C.warn : C.mut); pie_.addSpacer();
  texto(pie_, 'Toca una tarea para actuar', Font.mediumSystemFont(10.5), C.mut2);
}
function accPendientes(w, sp, fam) {
  const n = sp ? sp.total : 0, o = sp ? sp.olvidadas : 0;
  w.url = urlAccion({ accion:'captura', destino:'bandeja' });
  if (fam === 'accessoryInline') { const s = SFSymbol.named('square.stack.3d.up'); if (s) w.addImage(s.image); w.addText(sp ? `${n} sin plan${o ? ` · ${o} olvidados` : ''}` : 'Pendientes: abre Foco'); return; }
  if (fam === 'accessoryCircular') {
    w.addAccessoryWidgetBackground = true; w.backgroundImage = anillo(n ? o / n : 0);
    w.addSpacer(); const r = w.addStack(); r.addSpacer(); const c = r.addStack(); c.layoutVertically(); c.centerAlignContent();
    texto(c, String(n), Font.boldRoundedSystemFont(18), Color.white()).centerAlignText();
    texto(c, 'sin plan', Font.mediumSystemFont(9), Color.white()).centerAlignText(); r.addSpacer(); w.addSpacer(); return;
  }
  const l1 = w.addStack(); l1.centerAlignContent(); l1.spacing = 4;
  simbolo(l1, 'square.stack.3d.up', 10, Color.white()); texto(l1, `Sin plan · ${n}${o ? ` · ${o} olvidados` : ''}`, Font.semiboldSystemFont(12), Color.white());
  const top = sp && sp.top[0];
  texto(w, top ? top.t : 'Todo tiene plan', Font.boldSystemFont(14), Color.white(), 1);
  texto(w, top ? top.m : (sp ? txtRev(sp) : 'Abre Foco'), Font.mediumSystemFont(12), new Color('#ffffff', 0.8), 1);
}

/* ---------- Registro rápido y acciones interactivas ---------- */
// Detecta atajos al escribir rápido: hora (15:30), duración (30m / 1h), «hoy» / «mañana» y urgencia (!).
function parsearRapido(txt) {
  let s = String(txt || '').trim(), hora = '', dur = 0, fecha = '', estado = '', urgente = false;
  if (/^!\s*/.test(s)) { urgente = true; s = s.replace(/^!\s*/, ''); }
  if (/(?:^|\s)[!#]urgente\b/i.test(s)) { urgente = true; s = s.replace(/(?:^|\s)[!#]urgente\b/ig, ' '); }
  const mh = s.match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?=\s|$)/);
  if (mh) { hora = `${pad(+mh[1])}:${mh[2]}`; s = s.replace(mh[0], ' '); }
  const md = s.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|m|min)\b/i);
  if (md) {
    const val = parseFloat(md[1].replace(',', '.'));
    dur = /^h/i.test(md[2]) ? Math.round(val * 60) : Math.round(val);
    s = s.replace(md[0], ' ');
  }
  if (/(?:^|\s)ma[ñn]ana(?=\s|$)/i.test(s)) { fecha = ymd(masDias(new Date(), 1)); estado = 'prox'; s = s.replace(/(?:^|\s)ma[ñn]ana(?=\s|$)/i, ' '); }
  else if (/(?:^|\s)hoy(?=\s|$)/i.test(s)) { fecha = ymd(new Date()); estado = 'hoy'; s = s.replace(/(?:^|\s)hoy(?=\s|$)/i, ' '); }
  const titulo = s.replace(/\s{2,}/g, ' ').trim() || String(txt || '').trim();
  return { titulo:titulo.slice(0, 140), hora, dur, fecha, estado, urgente };
}
function construirFilaTarea(p) {
  const ahora = new Date().toISOString();
  const id = uid();
  const estado = p.estado || 'bandeja';
  const fecha = p.fecha || ((estado === 'hoy' || p.hora) ? ymd(new Date()) : '');
  const u = fecha ? fecha + (p.hora ? ' ' + p.hora : '') : '';
  const meta = u ? JSON.stringify({ o:fecha, u }) : '';
  return {
    id, titulo:p.titulo, estado, area:p.area || '', proyecto:'',
    urgente:p.urgente ? 'sí' : '', importante:p.importante ? 'sí' : '', dur:p.dur ? String(p.dur) : '',
    fecha, hora:p.hora || '', rec:'', orden:String(Date.now() % 1e9), espera:'',
    notas:'', serie:'', pomos:'0', resultado:'',
    creado:ahora, actualizado:ahora, hecho:'', borrado:'', limite:'', pospuestas:meta
  };
}
function construirOpMente(texto) {
  const ahora = new Date().toISOString(), id = uid();
  const m = {
    id, texto:texto.slice(0, 1000), tipo:'pendiente', conf:'baja', sug:'', por:'local',
    tema:'general', area:'', urgente:false, importante:false, fecha:'', apoyo:0,
    pasos:[{ x:texto.slice(0, 140), t:'' }], estado:'abierto', retomar:'', vol:uid(),
    creado:ahora, actualizado:ahora, borrado:false
  };
  return { hoja:'Ajustes', fila:{ clave:'mente:' + id, valor:JSON.stringify(m), actualizado:ahora } };
}
async function elegirDetalles(base) {
  const cache = leerCache(), areas = (cache && cache.snap && cache.snap.areas) || [];
  let area = base.area || '', areaNom = '', areaCol = '#7D7973';
  if (areas.length) {
    const a = new Alert(); a.title = 'Área (opcional)'; a.message = base.titulo;
    a.addAction('Sin área');
    areas.forEach(ar => a.addAction(ar.n));
    a.addCancelAction('Cancelar');
    const i = await a.presentSheet();
    if (i === -1) return null;
    if (i > 0) { area = areas[i - 1].id; areaNom = areas[i - 1].n; areaCol = areas[i - 1].c; }
  }
  const d = new Alert(); d.title = 'Cuándo y prioridad'; d.message = base.titulo;
  d.addTextField('Hora opcional (ej. 14:30)', base.hora || '');
  d.addTextField('Duración en min (ej. 30)', base.dur ? String(base.dur) : '');
  d.addAction('Guardar en Bandeja');
  d.addAction('Guardar para Hoy');
  d.addAction('Guardar para Hoy · Urgente');
  d.addAction('Guardar para Mañana');
  d.addCancelAction('Cancelar');
  const j = await d.presentAlert();
  if (j === -1) return null;
  const hRaw = d.textFieldValue(0).trim(), dRaw = parseInt(d.textFieldValue(1).trim(), 10) || 0;
  const mh = hRaw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  const hora = mh ? `${pad(+mh[1])}:${mh[2]}` : base.hora;
  const dur = dRaw > 0 ? dRaw : base.dur;
  const hoyS = ymd(new Date()), manS = ymd(masDias(new Date(), 1));
  const estado = j === 0 && !hora ? 'bandeja' : j === 3 ? 'prox' : 'hoy';
  const fecha = j === 3 ? manS : (estado === 'hoy' || hora ? hoyS : '');
  return { ...base, area, areaNom, areaCol, hora, dur, estado, fecha, urgente:base.urgente || j === 2 };
}
async function guardarCaptura(datos, destino, silencioso) {
  if (destino === 'mente') {
    const op = construirOpMente(datos.titulo);
    const r = await enviarOps([op], { tipo:'mente', id:op.fila.clave, titulo:datos.titulo });
    const msg = r.ok ? 'Guardado en Mente.' : 'Guardado en cola local (se enviará al volver la conexión).';
    if (!silencioso) await aviso('Listo', msg);
    return msg;
  }
  const fila = construirFilaTarea(datos);
  const meta = {
    tipo:fila.estado === 'bandeja' ? 'bandeja' : 'hoy',
    id:fila.id, titulo:fila.titulo, c:datos.areaCol || '#7D7973', a:datos.areaNom || '',
    hora:fila.hora, dur:+fila.dur || 0, fecha:fila.fecha
  };
  const r = await enviarOps([{ hoja:'Tareas', fila }], meta);
  const donde = fila.estado === 'bandeja' ? 'Bandeja' : fila.fecha === ymd(masDias(new Date(), 1)) ? 'Mañana' : 'Hoy';
  const extra = [fila.hora ? `a las ${fila.hora}` : '', fila.dur ? `${fila.dur} min` : ''].filter(Boolean).join(' · ');
  const msg = r.ok
    ? `Guardado en ${donde}${extra ? ` (${extra})` : ''}.`
    : `Guardado localmente para ${donde}. Se enviará al volver la conexión.`;
  if (!silencioso) await aviso('Registrado', msg);
  return msg;
}
async function capturarRapido(destino = '', textoInicial = '', silencioso = false) {
  if (!conectado() && !(await configurar())) return;
  if (textoInicial) {
    const p = parsearRapido(textoInicial);
    if (destino === 'hoy') { p.estado = 'hoy'; p.fecha = p.fecha || ymd(new Date()); }
    else if (destino === 'bandeja' && !p.estado && !p.hora) p.estado = 'bandeja';
    else if (!p.estado) p.estado = p.hora ? 'hoy' : 'bandeja';
    return await guardarCaptura(p, destino === 'mente' ? 'mente' : 'tarea', silencioso);
  }
  const titulos = { bandeja:'Capturar en Bandeja', hoy:'Nueva tarea para Hoy', hora:'Agendar con hora', mente:'Sacar de la mente' };
  const a = new Alert();
  a.title = titulos[destino] || 'Registro rápido';
  a.message = destino === 'mente'
    ? 'Escribe la idea o pendiente tal cual salga.'
    : 'Tip: puedes incluir hora (15:30), duración (30m), «hoy», «mañana» o «!» para urgente.';
  a.addTextField(destino === 'mente' ? '¿Qué traes en la cabeza?' : '¿Qué quieres registrar?', '');
  if (destino === 'hora') a.addTextField('Hora y duración (ej. 14:30 30m)', '');
  let ops;
  if (destino === 'bandeja') ops = [['Guardar en Bandeja', 'bandeja'], ['Guardar para Hoy', 'hoy'], ['Con área / hora…', 'detalles']];
  else if (destino === 'hoy') ops = [['Guardar para Hoy', 'hoy'], ['Guardar en Bandeja', 'bandeja'], ['Con área / hora…', 'detalles']];
  else if (destino === 'hora') ops = [['Agendar', 'hora'], ['Con área / detalles…', 'detalles']];
  else if (destino === 'mente') ops = [['Guardar en Mente', 'mente'], ['Guardar en Bandeja', 'bandeja']];
  else ops = [['Guardar en Bandeja', 'bandeja'], ['Guardar para Hoy', 'hoy'], ['Con área / hora…', 'detalles'], ['Guardar en Mente', 'mente']];
  ops.forEach(o => a.addAction(o[0]));
  a.addCancelAction('Cancelar');
  const idx = await a.presentAlert();
  if (idx === -1) return;
  const raw = [a.textFieldValue(0), destino === 'hora' ? a.textFieldValue(1) : ''].filter(Boolean).join(' ').trim();
  if (!raw) return;
  const modo = ops[idx][1];
  if (modo === 'mente') { await guardarCaptura({ titulo:raw }, 'mente', false); return; }
  let datos = parsearRapido(raw);
  if (modo === 'detalles') {
    datos = await elegirDetalles(datos);
    if (!datos) return;
  } else if (modo === 'hoy' || modo === 'hora') {
    datos.estado = datos.estado || 'hoy';
    datos.fecha = datos.fecha || ymd(new Date());
  } else {
    datos.estado = datos.estado || (datos.hora ? 'hoy' : 'bandeja');
  }
  await guardarCaptura(datos, 'tarea', false);
}
async function actualizarTarea(id, mutar, metaOptimista, msgOk) {
  if (!conectado()) { await aviso('Sin conexión', 'Configura primero tu hoja en Scriptable › Foco.'); return; }
  try {
    const j = await syncHoja(leerCola());
    guardarCola([]);
    const t = (j.tareas || []).find(x => x.id === id && !isTrue(x.borrado));
    if (!t) { await aviso('No encontrada', 'Esa tarea ya no está activa en tu hoja.'); return; }
    const fila = { ...t, ...mutar(t), actualizado:new Date().toISOString() };
    const r = await enviarOps([{ hoja:'Tareas', fila }], { ...metaOptimista, id, titulo:t.titulo });
    await aviso('Listo', r.ok ? msgOk : 'Guardado en cola local; se enviará al volver la conexión.');
  } catch (e) {
    await aviso('No se pudo actualizar', String(e && e.message || e));
  }
}
async function accionTarea(id, titulo = '', desde = '') {
  if (!conectado() && !(await configurar())) return;
  const a = new Alert();
  a.title = titulo || 'Tarea';
  a.message = 'Acción rápida en Foco';
  const ops = [];
  if (desde === 'pendientes' || desde === 'bandeja') {
    ops.push(['Pasar a Hoy', () => actualizarTarea(id, () => ({ estado:'hoy', fecha:ymd(new Date()) }), { tipo:'aHoy', eraBandeja:desde === 'bandeja' }, 'Movida a Hoy.')]);
  }
  ops.push(['Marcar como hecha', () => actualizarTarea(id, () => ({ estado:'hecho', hecho:new Date().toISOString() }), { tipo:'hecho' }, '¡Tarea completada!')]);
  ops.push(['Capturar algo rápido', () => capturarRapido('')]);
  ops.push(['Abrir menú de Foco', menu]);
  ops.forEach(o => a.addAction(o[0]));
  a.addCancelAction('Cerrar');
  const i = await a.presentSheet();
  if (i >= 0) await ops[i][1]();
}

/* ---------- Avisos locales (funcionan con Foco cerrado) ---------- */
function planAvisos(snap, cfg) {
  const out = [], ahora = Date.now(), lim = ahora + 20 * 3600e3, tm = snap.timer || {};
  const nom = tm.tarea ? `«${tm.tarea}»` : 'Enfoque libre';
  if (cfg.fase) (tm.fases || []).forEach((f, i, arr) => {
    const sig = arr[i + 1];
    if (f.f === 'foco') out.push({ id:`foco-fase-${f.fin}`, ms:f.fin, t:tm.modo === 'pomo' ? 'Terminó el pomodoro' : 'Terminó el bloque', b:sig ? `${nom} · Descanso de ${Math.round((sig.fin - sig.ini) / 60000)} min` : nom });
    else out.push({ id:`foco-fase-${f.fin}`, ms:f.fin, t:'Fin del descanso', b:tm.tarea ? `Vuelve a «${tm.tarea}» cuando quieras.` : 'Cuando quieras, vuelve a enfocarte.' });
  });
  [0, 1].forEach(k => {
    const dia = masDias(new Date(), k), base = inicioDia(dia).getTime();
    ((snap.dias || {})[ymd(dia)] || []).filter(b => !b.ok).forEach(b => {
      const ini = base + b.s * 60000, fin = base + b.e * 60000, rango = `${hm(b.s)}–${hm(b.e)}${b.a ? ' · ' + b.a : ''}`;
      if (cfg.inicio) {
        if (cfg.antes) out.push({ id:`foco-a-${b.id}-${ini}`, ms:ini - cfg.antes * 60000, t:`En ${cfg.antes} min: ${b.t}`, b:rango });
        out.push({ id:`foco-i-${b.id}-${ini}`, ms:ini, t:`Es hora: ${b.t}`, b:rango });
      }
      if (cfg.fin) out.push({ id:`foco-f-${b.id}-${fin}`, ms:fin, t:`Terminó el tiempo de «${b.t}»`, b:'Márcala como hecha en Foco o dale más tiempo.' });
    });
  });
  // Revisión semanal: si pasaron 7 días (o nunca la hiciste), un recordatorio a las 9:30.
  if (cfg.rev && revVencida(snap.sinPlan)) {
    const sp = snap.sinPlan, d = new Date(); d.setHours(9, 30, 0, 0); if (d.getTime() < ahora + 60000) d.setDate(d.getDate() + 1);
    out.push({ id:`foco-rev-${ymd(d)}`, ms:d.getTime(), t:'Revisión de pendientes', b:`${sp.total} sin planificar${sp.olvidadas ? `, ${sp.olvidadas} olvidados` : ''}. Dale un siguiente paso a cada uno en Planifica › Pendientes.` });
  }
  return out.filter(p => p.ms > ahora + 20000 && p.ms < lim);
}
async function programarAvisos(snap, soloFases) {
  const cfg = cfgAvisos();
  let pend = []; try { pend = await Notification.allPending(); } catch (e) {}
  const nuestras = pend.map(n => n.identifier).filter(id => id && id.startsWith('foco-'));
  const plan = cfg.on ? planAvisos(snap, soloFases ? { ...cfg, inicio:0, fin:0 } : cfg) : [];
  const ids = new Set(plan.map(p => p.id));
  // Lo que cambió en Foco (pausa, otra hora, tarea hecha) quita el aviso viejo.
  const quitar = nuestras.filter(id => !ids.has(id) && !(soloFases && !id.startsWith('foco-fase-')));
  if (quitar.length) { try { await Notification.removePending(quitar); } catch (e) {} }
  const ya = new Set(nuestras);
  for (const p of plan) {
    if (ya.has(p.id)) continue;
    const n = new Notification(); n.identifier = p.id; n.threadIdentifier = 'foco'; n.title = p.t; n.body = p.b; n.sound = 'default';
    n.setTriggerDate(new Date(p.ms));
    try { await n.schedule(); } catch (e) {}
  }
  return plan.length;
}
// Llamado desde Foco al iniciar un enfoque: programa el aviso exacto sin esperar a la red.
async function desdeFoco(json) {
  let x; try { x = JSON.parse(json); } catch (e) { return; }
  const snap = { timer:{ tarea:x.tarea || '', modo:x.modo, fases:x.fases || [] }, dias:{} };
  const n = await programarAvisos(snap, true);
  const fin = (x.fases || [])[0];
  await aviso(n ? 'Aviso programado' : 'Sin aviso', n && fin ? `Te aviso a las ${horaDe(fin.fin)}. Ya puedes volver a Foco.` : 'Los avisos están desactivados en Scriptable › Foco.');
}

/* ---------- Armar el widget ---------- */
const ES_CAPTURA = t => ['captura', 'rapido', 'rápido', 'registro', 'inbox', 'add'].includes(t);
async function crear(familia, tipo) {
  const r = await cargar();
  const w = new ListWidget();
  const acc = familia && familia.startsWith('accessory');
  if (!acc) { w.backgroundColor = C.bg; w.setPadding(13, 14, 13, 14); }
  if (ES_CAPTURA(tipo)) {
    const d = r.snap
      ? { ...calcular(r.snap), fam:familia, cola:r.cola || 0, error:r.error && r.error !== 'sin-config' ? r.error : '', snapGen:r.snap.gen }
      : { fam:familia, bandeja:0, recientes:[], sinHora:[], mente:0, avance:null, cola:r.cola || 0, error:r.error || '' };
    if (acc) accCaptura(w, d, familia); else wCaptura(w, d);
    w.refreshAfterDate = new Date(Date.now() + 30 * 60000);
    if (r.snap) { try { await programarAvisos(r.snap); } catch (e) {} }
    return w;
  }
  if (!r.snap) {
    const msg = r.error === 'sin-config' ? 'Abre Scriptable y ejecuta «Foco» para conectarlo.' : `No se pudo leer tu hoja: ${r.error}`;
    if (acc) w.addText(familia === 'accessoryInline' ? 'Foco: sin conexión' : 'Foco · abre Scriptable');
    else { texto(w, 'Foco', Font.boldSystemFont(15), C.ink); w.addSpacer(6); texto(w, msg, Font.mediumSystemFont(12), C.mut, 4); }
    w.refreshAfterDate = new Date(Date.now() + 15 * 60000);
    return w;
  }
  const d = { ...calcular(r.snap), fam:familia, cola:r.cola || 0, error:r.error && r.error !== 'sin-config' ? r.error : '', snapGen:r.snap.gen };
  if (tipo === 'pendientes' || tipo === 'sinplan') {
    if (acc) accPendientes(w, r.snap.sinPlan, familia); else wPendientes(w, r.snap.sinPlan, familia);
    const m = inicioDia(masDias(new Date(), 1)); m.setMinutes(1);
    d.refrescar = new Date(Math.min(m.getTime(), Date.now() + 60 * 60000));
  }
  else if (familia === 'accessoryCircular') wCircular(w, d);
  else if (familia === 'accessoryRectangular') wRectangular(w, d);
  else if (familia === 'accessoryInline') wLinea(w, d);
  else {
    const t = tipo || (familia === 'small' ? 'ahora' : familia === 'medium' ? 'hoy' : 'agenda');
    if (t === 'hoy' && familia !== 'small') wHoy(w, d);
    else if (t === 'agenda' && familia !== 'small') wAgenda(w, d);
    else wAhora(w, d);
  }
  w.refreshAfterDate = d.refrescar;
  try { await programarAvisos(r.snap); } catch (e) {}
  return w;
}

async function menu() {
  if (!conectado() && !(await configurar())) return;
  const c = cfgAvisos(), nCola = leerCola().length;
  const a = new Alert(); a.title = 'Foco';
  a.message = `Avisos: ${c.on ? 'activados' : 'desactivados'}${nCola ? ` · ${nCola} en cola local` : ''}. Agrega widgets con Parameter: ahora, hoy, agenda, pendientes o captura.`;
  const ops = [
    ['+ Registro rápido…', () => capturarRapido('')],
    ['Ver «Captura» (mediano)', () => vista('medium', 'captura')],
    ['Ver «Captura» (pequeño)', () => vista('small', 'captura')],
    ['Ver «Captura» (grande)', () => vista('large', 'captura')],
    ['Ver «Ahora» (pequeño)', () => vista('small', 'ahora')],
    ['Ver «Hoy» (mediano)', () => vista('medium', 'hoy')],
    ['Ver «Agenda» (grande)', () => vista('large', 'agenda')],
    ['Ver «Pendientes» (mediano)', () => vista('medium', 'pendientes')],
    ['Ver «Pendientes» (grande)', () => vista('large', 'pendientes')],
    ['Ver bloqueo (rectangular)', () => vista('accessoryRectangular')],
    ['Ver bloqueo (captura circular)', () => vista('accessoryCircular', 'captura')],
    ['Avisos…', menuAvisos],
    ['Sincronizar ahora', async () => { const r = await cargar(true); if (r.snap) { const n = await programarAvisos(r.snap); await aviso('Sincronizado', `${n} avisos programados.`); } else await aviso('No se pudo leer tu hoja', r.error); }],
    ['Cambiar conexión', configurar]
  ];
  ops.forEach(o => a.addAction(o[0])); a.addCancelAction('Cerrar');
  const i = await a.presentSheet(); if (i >= 0) await ops[i][1]();
}
async function vista(fam, tipo) {
  const w = await crear(fam, tipo);
  const p = { small:'presentSmall', medium:'presentMedium', large:'presentLarge', accessoryRectangular:'presentAccessoryRectangular', accessoryCircular:'presentAccessoryCircular' }[fam];
  if (w[p]) await w[p](); else await w.presentMedium();
}
async function menuAvisos() {
  const c = cfgAvisos(), si = v => v ? 'Sí' : 'No';
  const a = new Alert(); a.title = 'Avisos'; a.message = 'Se programan en el iPhone cada vez que el widget se actualiza, así llegan aunque Foco esté cerrado.';
  const ops = [[`Avisos: ${c.on ? 'activados' : 'desactivados'}`, () => { c.on = c.on ? 0 : 1; }], [`Fin de enfoque y descanso: ${si(c.fase)}`, () => { c.fase = c.fase ? 0 : 1; }],
    [`Inicio de tareas con hora: ${si(c.inicio)}`, () => { c.inicio = c.inicio ? 0 : 1; }], [`Avisar antes: ${c.antes ? c.antes + ' min' : 'No'}`, () => { c.antes = { 0:5, 5:10, 10:15, 15:0 }[c.antes] ?? 5; }],
    [`Fin del tiempo de cada tarea: ${si(c.fin)}`, () => { c.fin = c.fin ? 0 : 1; }], [`Recordar la revisión semanal: ${si(c.rev)}`, () => { c.rev = c.rev ? 0 : 1; }]];
  ops.forEach(o => a.addAction(o[0])); a.addCancelAction('Listo');
  const i = await a.presentSheet();
  if (i < 0) { const r = await cargar(); if (r.snap) await programarAvisos(r.snap); return; }
  ops[i][1](); guardarAvisos(c); await menuAvisos();
}

/* ---------- Entrada ---------- */
const q = args.queryParameters || {};
if (q.avisos) await desdeFoco(q.avisos);
else if (q.accion === 'captura') {
  const out = await capturarRapido(q.destino || '', q.texto || '', !!q.silencioso);
  if (out && config.runsWithSiri) Script.setShortcutOutput(out);
}
else if (q.accion === 'tarea' && q.id) await accionTarea(q.id, q.titulo || '', q.desde || '');
else if (args.shortcutParameter) {
  const p = typeof args.shortcutParameter === 'string' ? { texto:args.shortcutParameter } : args.shortcutParameter;
  const out = await capturarRapido(p.destino || '', p.texto || '', true);
  Script.setShortcutOutput(out || 'Listo');
}
else if (config.runsInWidget || config.runsInAccessoryWidget) Script.setWidget(await crear(config.widgetFamily, (args.widgetParameter || '').trim().toLowerCase()));
else await menu();
Script.complete();
