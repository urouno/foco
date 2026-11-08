// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: bullseye;

/* =====================================================================
   Foco · widgets y avisos para iPhone (Scriptable)

   Nombre del script en Scriptable: «Foco» (exactamente así; la app lo
   abre por ese nombre para programar el aviso exacto de un enfoque).

   Tamaños y «Parameter» del widget (opcional):
     · Pequeño  → ahora   Lo que va ahora y cuánto le queda.
     · Mediano  → hoy     Ahora + avance del día + lo que sigue.
     · Grande   → agenda  Línea del día con cada actividad y su tiempo.
     · Pantalla de bloqueo: rectangular, circular y en línea.
   Escribe ahora, hoy o agenda en «Parameter» para forzar un diseño.

   Cómo se mantiene correcto:
     · Las cuentas regresivas las avanza iOS cada segundo (no dependen
       de que el widget se vuelva a dibujar).
     · El script hace las cuentas con la hora actual a partir del plan
       del día, así que «ahora / sigue» cambian solos con el reloj.
     · Pide a iOS redibujar justo cuando termina la actividad en curso
       o empieza la siguiente.
     · Cada vez que corre, programa avisos locales (fin de enfoque,
       inicio y fin de tareas) aunque Foco esté cerrado.
   ===================================================================== */

const K = { url:'foco.url', clave:'foco.clave', avisos:'foco.avisos' };
const fm = FileManager.local();
const RUTA_CACHE = fm.joinPath(fm.documentsDirectory(), 'foco-widget.json');
const REUSAR_MS = 60 * 1000; // varios widgets a la vez comparten una sola consulta

/* ---------- Colores (claro / oscuro automático) ---------- */
const dyn = (l, d) => Color.dynamic(new Color(l), new Color(d));
const C = {
  bg:dyn('#FBFBFD', '#1C1C1E'), card:dyn('#F0F0F3', '#2C2C2E'), track:dyn('#E3E3E8', '#3A3A3C'),
  ink:dyn('#1D1D1F', '#F5F5F7'), mut:dyn('#626267', '#A1A1A6'), mut2:dyn('#8E8E93', '#8E8E93'),
  ac:dyn('#5856D6', '#8E8CFF'), ok:dyn('#1F7F37', '#4BD97A'), okf:new Color('#34C759'), warn:dyn('#B04A00', '#FFB547')
};
const hex = h => { try { return new Color(h || '#8E8E93'); } catch (e) { return new Color('#8E8E93'); } };

/* ---------- Utilidades de fecha ---------- */
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

/* ---------- Configuración ---------- */
const cfgAvisos = () => { try { return Object.assign({ on:1, fase:1, inicio:1, antes:5, fin:0 }, JSON.parse(Keychain.get(K.avisos))); } catch (e) { return { on:1, fase:1, inicio:1, antes:5, fin:0 }; } };
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
    : 'Conectado. Ya puedes agregar los widgets.');
  return true;
}
async function aviso(t, m) { const a = new Alert(); a.title = t; a.message = m || ''; a.addAction('OK'); await a.presentAlert(); }

/* ---------- Datos: hoja de Google → resumen del widget ---------- */
async function cargar(forzar) {
  let cache = null;
  if (fm.fileExists(RUTA_CACHE)) { try { cache = JSON.parse(fm.readString(RUTA_CACHE)); } catch (e) {} }
  if (!forzar && cache && Date.now() - cache.leido < REUSAR_MS) return cache;
  if (!conectado()) return cache ? { ...cache, error:'sin-config' } : { error:'sin-config' };
  try {
    const req = new Request(Keychain.get(K.url));
    req.method = 'POST'; req.timeoutInterval = 20;
    req.headers = { 'Content-Type':'text/plain;charset=utf-8' };
    // Misma petición que hace la app para leer sin enviar cambios.
    req.body = JSON.stringify({ clave:Keychain.contains(K.clave) ? Keychain.get(K.clave) : '', accion:'sync', ops:[] });
    const j = await req.loadJSON();
    if (!j || !j.ok) throw new Error(j && j.error === 'Clave incorrecta' ? 'La clave no coincide con la de tu Apps Script.' : (j && j.error) || 'La URL no devolvió datos de Foco.');
    const out = { leido:Date.now(), snap:resumen(j) };
    fm.writeString(RUTA_CACHE, JSON.stringify(out));
    return out;
  } catch (e) {
    const msg = String(e && e.message || e);
    return cache ? { ...cache, error:msg } : { error:msg };
  }
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
    .map(t => { const s = toMin(t.hora); return { id:t.id, t:String(t.titulo).slice(0, 90), s, e:Math.min(s + Math.max(+t.dur || 30, 15), 1440), c:ar(t.area).c || '#8E8E93', a:ar(t.area).n || '', ok:t.estado === 'hecho' ? 1 : 0, run:t.estado === 'proceso' ? 1 : 0 }; })
    .sort((a, b) => a.s - b.s);
  const vivas = ts.filter(t => t.estado === 'proceso' || (t.estado === 'hoy' && (!t.fecha || t.fecha >= hoyS)))
    .sort((a, b) => (a.estado === 'proceso' ? -1 : 0) - (b.estado === 'proceso' ? -1 : 0) || (+a.orden || 0) - (+b.orden || 0));
  const hechas = ts.filter(t => t.estado === 'hecho' && diaISO(t.hecho) === hoyS).length;
  const tm = val('timer') || {};
  const x = ts.find(t => t.id === tm.tareaId);
  return { v:0, respaldo:1, gen:new Date().toISOString(), dia:hoyS,
    hoy:{ hechas, total:hechas + vivas.length, prio:0 }, bandeja:ts.filter(t => t.estado === 'bandeja').length,
    lista:vivas.slice(0, 8).map(t => ({ id:t.id, t:String(t.titulo).slice(0, 90), c:ar(t.area).c || '#8E8E93', a:ar(t.area).n || '', h:t.hora || '', d:+t.dur || 0, run:t.estado === 'proceso' ? 1 : 0 })),
    timer:{ ...tm, c:x ? ar(x.area).c || '#5856D6' : '#5856D6', fases:tm.corriendo && tm.fin ? [{ f:tm.fase, ini:tm.fin - (tm.total || 0) * 1000, fin:tm.fin }] : [] },
    dias:{ [hoyS]:bloques(hoyS), [manS]:bloques(manS) } };
}

/* ---------- Qué va ahora (calculado con la hora actual) ---------- */
function calcular(snap, now = new Date()) {
  const ms = now.getTime(), dia = ymd(now), base = inicioDia(now).getTime();
  const nm = (ms - base) / 60000;
  const bloques = (snap.dias && snap.dias[dia]) || [];
  const tm = snap.timer || {};
  const fase = (tm.fases || []).find(f => f.ini <= ms && ms < f.fin);
  const actual = bloques.find(b => !b.ok && b.s <= nm && nm < b.e);
  const siguiente = bloques.find(b => !b.ok && b.s > nm && b !== actual);
  const pausa = !tm.corriendo && tm.fase === 'foco' && tm.restante > 0 && tm.restante < tm.total;
  const delDia = snap.dia === dia;
  let ahora;
  if (fase) {
    const foco = fase.f === 'foco';
    ahora = { k:'timer', desc:!foco, etiqueta:foco ? (tm.modo === 'pomo' ? 'Pomodoro' : 'Enfoque') : (fase.f === 'largo' ? 'Descanso largo' : 'Descanso'),
      titulo:foco ? (tm.tarea || 'Enfoque libre') : (tm.tarea ? `Después: ${tm.tarea}` : 'Respira, estírate'), ini:fase.ini, fin:fase.fin, c:foco ? hex(tm.c) : C.okf, sym:foco ? 'timer' : 'cup.and.saucer' };
  } else if (actual) {
    ahora = { k:'bloque', etiqueta:`Ahora · ${hm(actual.s)}–${hm(actual.e)}`, titulo:actual.t, ini:base + actual.s * 60000, fin:base + actual.e * 60000, c:hex(actual.c), sym:'clock' };
  } else if (pausa) {
    ahora = { k:'pausa', etiqueta:'En pausa', titulo:tm.tarea || 'Enfoque libre', restante:tm.restante, total:tm.total, c:hex(tm.c), sym:'pause.circle' };
  } else if (delDia && snap.lista && snap.lista.length) {
    const x = snap.lista[0];
    ahora = { k:'tarea', etiqueta:x.run ? 'En curso' : 'Ahora', titulo:x.t, c:hex(x.c), dur:x.d, h:x.h, sym:'sun.max' };
  } else ahora = { k:'libre', etiqueta:'Hoy', titulo:delDia && snap.hoy && snap.hoy.total ? 'Lista terminada' : 'Nada en curso', c:C.ac, sym:'checkmark.circle' };
  const prog = ahora.fin ? Math.min(1, Math.max(0, (ms - ahora.ini) / (ahora.fin - ahora.ini))) : ahora.k === 'pausa' ? 1 - ahora.restante / ahora.total : 0;
  const pend = bloques.filter(b => !b.ok && b.e > nm && !(ahora.k === 'bloque' && b === actual));
  const sinHora = delDia ? (snap.lista || []).filter((x, i) => !x.h && !(i === 0 && ahora.k === 'tarea')) : [];
  const avance = delDia ? snap.hoy || { hechas:0, total:0 } : null;
  // Próximo momento en que cambia lo que se muestra: ahí se pide redibujar.
  const cambios = [ahora.fin, siguiente && base + siguiente.s * 60000, base + 86400000 + 60000, ms + 30 * 60000].filter(x => x && x > ms + 30000);
  return { ahora, prog, siguiente, pend, sinHora, avance, base, ms, dia, refrescar:new Date(Math.min(...cambios) + 5000), viejo:!delDia || ms - new Date(snap.gen).getTime() > 12 * 3600e3 };
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
// Cuenta regresiva que iOS avanza sola. Ojo: al llegar a 0 iOS sigue contando hacia arriba,
// por eso siempre va acompañada de la hora de término y se pide redibujar en ese momento.
function cuenta(st, finMs, font, color) { const d = st.addDate(new Date(finMs)); d.applyTimerStyle(); d.font = font; d.textColor = color; d.lineLimit = 1; d.minimumScaleFactor = 0.6; return d; }
function etiqueta(st, a, size = 11) {
  const r = st.addStack(); r.centerAlignContent(); r.spacing = 4;
  simbolo(r, a.sym, size - 1, a.c);
  texto(r, a.etiqueta.toUpperCase(), Font.boldSystemFont(size), a.k === 'libre' ? C.mut : C.ac);
  return r;
}
function pie(st, d, extra) {
  const msg = d.error === 'sin-config' ? 'Abre Scriptable › Foco para conectar' : d.viejo ? 'Abre Foco para actualizar el día' : extra;
  if (msg) texto(st, msg, Font.mediumSystemFont(10), d.viejo || d.error ? C.warn : C.mut);
}
function anchos() {
  const w = Device.screenSize().width, k = w >= 428 ? 364 / 338 : w <= 375 ? 321 / 338 : 1;
  return { pequeno:158 * k - 28, mediano:338 * k - 28 };
}

/* ---------- Bloque «Ahora» (reutilizado en todos los tamaños) ---------- */
function bloqueAhora(st, d, w, grande) {
  const a = d.ahora;
  etiqueta(st, a, grande ? 12 : 11);
  st.addSpacer(4);
  texto(st, a.titulo, Font.boldSystemFont(grande ? 17 : 15), C.ink, grande ? 2 : 3);
  if (grande) st.addSpacer(8); else st.addSpacer();
  if (a.k === 'timer' || a.k === 'bloque') {
    cuenta(st, a.fin, Font.boldRoundedSystemFont(grande ? 34 : 30), C.ink);
    st.addSpacer(4); barra(st, d.prog, w, 6, a.desc ? C.okf : a.c); st.addSpacer(4);
    texto(st, `quedan · termina ${horaDe(a.fin)}`, Font.mediumSystemFont(11), C.mut);
  } else if (a.k === 'pausa') {
    texto(st, mmss(a.restante), Font.boldRoundedSystemFont(grande ? 34 : 30), C.mut);
    st.addSpacer(4); barra(st, d.prog, w, 6, C.mut2); st.addSpacer(4);
    texto(st, 'en pausa · reanuda en Foco', Font.mediumSystemFont(11), C.mut);
  } else if (d.siguiente) {
    const s = d.siguiente, r = st.addStack(); r.centerAlignContent(); r.spacing = 4;
    texto(r, 'Sigue', Font.semiboldSystemFont(12), C.mut);
    const rel = r.addDate(new Date(d.base + s.s * 60000)); rel.applyRelativeStyle(); rel.font = Font.semiboldSystemFont(12); rel.textColor = C.ac; rel.lineLimit = 1;
    texto(st, `${hm(s.s)} ${s.t}`, Font.mediumSystemFont(11), C.mut, 1);
  } else if (a.k === 'tarea') {
    texto(st, [a.h ? `Era a las ${a.h}` : 'Sin hora', a.dur ? `≈ ${durTxt(a.dur)}` : ''].filter(Boolean).join(' · '), Font.mediumSystemFont(12), C.mut);
  }
}

/* ---------- Widgets de la pantalla de inicio ---------- */
function wAhora(w, d) {
  const an = anchos();
  bloqueAhora(w, d, d.fam === 'small' ? an.pequeno : an.mediano, d.fam === 'large');
  if (d.error || d.viejo) { w.addSpacer(4); pie(w, d); }
}
function filaItem(st, x, base, ancho, nm) {
  const r = st.addStack(); r.centerAlignContent(); r.spacing = 8;
  const p = r.addStack(); p.size = new Size(4, 16); p.cornerRadius = 2; p.backgroundColor = hex(x.c);
  const h = r.addStack(); h.size = new Size(38, 16); h.centerAlignContent();
  texto(h, x.s != null ? hm(x.s) : '—', Font.semiboldMonospacedSystemFont(12), C.mut);
  texto(r, x.t, Font.mediumSystemFont(13), C.ink, 1);
  r.addSpacer();
  // La actividad que ya empezó muestra lo que le queda; las demás, su duración.
  if (x.s != null && x.s <= nm && nm < x.e) cuenta(r, base + x.e * 60000, Font.semiboldRoundedSystemFont(12), C.ac).rightAlignText();
  else if (x.s != null) texto(r, durTxt(x.e - x.s), Font.systemFont(11), C.mut2);
}
function wHoy(w, d) {
  const an = anchos(), col = (an.mediano - 14) / 2;
  const fila = w.addStack(); fila.layoutHorizontally(); fila.spacing = 14;
  const izq = fila.addStack(); izq.layoutVertically(); izq.size = new Size(col, 0);
  bloqueAhora(izq, d, col, false);
  const der = fila.addStack(); der.layoutVertically(); der.size = new Size(col, 0);
  const cab = der.addStack(); cab.centerAlignContent();
  texto(cab, 'Hoy', Font.boldSystemFont(15), C.ink); cab.addSpacer();
  if (d.avance) texto(cab, `${d.avance.hechas} de ${d.avance.total}`, Font.semiboldSystemFont(12), C.mut);
  der.addSpacer(6);
  if (d.avance) segmentos(der, d.avance.hechas, d.avance.total, col);
  der.addSpacer(8);
  const items = [...d.pend.map(b => ({ ...b })), ...d.sinHora.map(x => ({ ...x, s:null }))].slice(0, 3);
  if (!items.length) texto(der, d.avance && d.avance.total ? 'Nada más por hoy' : 'Sin tareas para hoy', Font.mediumSystemFont(12), C.mut);
  items.forEach((x, i) => { if (i) der.addSpacer(5); const r = der.addStack(); r.centerAlignContent(); r.spacing = 6;
    const p = r.addStack(); p.size = new Size(3, 14); p.cornerRadius = 1.5; p.backgroundColor = hex(x.c);
    if (x.s != null) texto(r, hm(x.s), Font.semiboldMonospacedSystemFont(11), C.mut);
    texto(r, x.t, Font.mediumSystemFont(12), C.ink, 1); });
  der.addSpacer();
  pie(der, d);
}
function wAgenda(w, d) {
  const an = anchos(), grande = d.fam === 'large', W = an.mediano;
  const fecha = new Date();
  const cab = w.addStack(); cab.centerAlignContent();
  texto(cab, 'Hoy', Font.boldSystemFont(17), C.ink); cab.addSpacer(6);
  texto(cab, `${DIAS[fecha.getDay()]} ${fecha.getDate()}`, Font.mediumSystemFont(13), C.mut); cab.addSpacer();
  if (d.avance) texto(cab, `${d.avance.hechas} de ${d.avance.total} hechas`, Font.semiboldSystemFont(12), C.mut);
  w.addSpacer(6);
  if (d.avance) segmentos(w, d.avance.hechas, d.avance.total, W);
  w.addSpacer(10);
  if (grande) {
    const card = w.addStack(); card.layoutVertically(); card.backgroundColor = C.card; card.cornerRadius = 14; card.setPadding(10, 12, 10, 12); card.size = new Size(W, 0);
    bloqueAhora(card, d, W - 24, false);
    w.addSpacer(10);
  }
  const max = grande ? 5 : 3, nm = (d.ms - d.base) / 60000;
  const items = [...d.pend, ...d.sinHora.map(x => ({ ...x, s:null }))].slice(0, max);
  if (!grande && d.ahora.fin) {
    // En mediano, la actividad en curso va arriba con su cuenta regresiva.
    const r = w.addStack(); r.centerAlignContent(); r.spacing = 8;
    const p = r.addStack(); p.size = new Size(4, 16); p.cornerRadius = 2; p.backgroundColor = d.ahora.c;
    texto(r, d.ahora.titulo, Font.boldSystemFont(13), C.ink, 1); r.addSpacer();
    cuenta(r, d.ahora.fin, Font.boldRoundedSystemFont(13), C.ac).rightAlignText();
    w.addSpacer(6);
  }
  if (!items.length) texto(w, 'Nada más con hora por hoy', Font.mediumSystemFont(13), C.mut);
  items.slice(0, !grande && d.ahora.fin ? max - 1 : max).forEach((x, i) => { if (i) w.addSpacer(7); filaItem(w, x, d.base, W, nm); });
  w.addSpacer();
  pie(w, d, d.snapGen ? `Datos de las ${horaDe(new Date(d.snapGen).getTime())}` : '');
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
  // En línea iOS solo muestra un texto: se usa la hora de término (siempre correcta, sin contar).
  const t = a.fin ? `${corta(a.titulo, 22)} · hasta ${horaDe(a.fin)}`
    : d.siguiente ? `Sigue ${hm(d.siguiente.s)} · ${corta(d.siguiente.t, 20)}`
    : d.avance ? `Hoy ${d.avance.hechas} de ${d.avance.total}` : 'Foco';
  const s = SFSymbol.named(a.fin ? 'timer' : 'sun.max'); if (s) w.addImage(s.image);
  w.addText(t);
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
async function crear(familia, tipo) {
  const r = await cargar();
  const w = new ListWidget();
  const acc = familia && familia.startsWith('accessory');
  if (!acc) { w.backgroundColor = C.bg; w.setPadding(14, 14, 14, 14); }
  if (!r.snap) {
    const msg = r.error === 'sin-config' ? 'Abre Scriptable y ejecuta «Foco» para conectarlo.' : `No se pudo leer tu hoja: ${r.error}`;
    if (acc) w.addText(familia === 'accessoryInline' ? 'Foco: sin conexión' : 'Foco · abre Scriptable');
    else { texto(w, 'Foco', Font.boldSystemFont(15), C.ink); w.addSpacer(6); texto(w, msg, Font.mediumSystemFont(12), C.mut, 4); }
    w.refreshAfterDate = new Date(Date.now() + 15 * 60000);
    return w;
  }
  const d = { ...calcular(r.snap), fam:familia, error:r.error && r.error !== 'sin-config' ? r.error : '', snapGen:r.snap.gen };
  if (familia === 'accessoryCircular') wCircular(w, d);
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
  const c = cfgAvisos();
  const a = new Alert(); a.title = 'Foco';
  a.message = `Avisos: ${c.on ? 'activados' : 'desactivados'}. Agrega los widgets desde la pantalla de inicio o la de bloqueo.`;
  const ops = [['Ver «Ahora» (pequeño)', () => vista('small', 'ahora')], ['Ver «Hoy» (mediano)', () => vista('medium', 'hoy')], ['Ver «Agenda» (grande)', () => vista('large', 'agenda')],
    ['Ver pantalla de bloqueo (rectangular)', () => vista('accessoryRectangular')], ['Ver pantalla de bloqueo (circular)', () => vista('accessoryCircular')],
    ['Avisos…', menuAvisos], ['Actualizar ahora', async () => { const r = await cargar(true); if (r.snap) { const n = await programarAvisos(r.snap); await aviso('Actualizado', `${n} avisos programados.`); } else await aviso('No se pudo leer tu hoja', r.error); }],
    ['Cambiar conexión', configurar]];
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
    [`Fin del tiempo de cada tarea: ${si(c.fin)}`, () => { c.fin = c.fin ? 0 : 1; }]];
  ops.forEach(o => a.addAction(o[0])); a.addCancelAction('Listo');
  const i = await a.presentSheet();
  if (i < 0) { const r = await cargar(); if (r.snap) await programarAvisos(r.snap); return; }
  ops[i][1](); guardarAvisos(c); await menuAvisos();
}

/* ---------- Entrada ---------- */
const q = args.queryParameters || {};
if (q.avisos) await desdeFoco(q.avisos);
else if (config.runsInWidget || config.runsInAccessoryWidget) Script.setWidget(await crear(config.widgetFamily, (args.widgetParameter || '').trim().toLowerCase()));
else await menu();
Script.complete();
