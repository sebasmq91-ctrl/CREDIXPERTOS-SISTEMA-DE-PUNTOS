// asistencia.js — Asistencia lunes a viernes + garantizado del primer mes
//
// Lo usan admin.html y coordinador.html (misma lógica, un solo lugar).
//   montarAsistencia(elemento, { puedeConfigurar: true|false, perfilId })
//
// Regla del garantizado (primer mes = el mes calendario en que ingresa):
//   - Total $500.000, en dos mitades de $250.000:
//       mitad 1 = del día 1 al 15 (se paga el 15)
//       mitad 2 = del día 16 al último día del mes (se paga al final)
//   - Cada mitad se divide entre los días de ese tramo (15, y 15 o 16 en
//     la segunda). El asesor gana la parte de cada día desde su ingreso.
//     Ej.: ingresó el 5 -> en la mitad 1 gana 11 de 15 partes, o sea
//     $250.000 x 11 / 15, si no falta ningún día.
//   - Cada día hábil (lunes a viernes, sin festivo) en que NO fue a la
//     oficina le resta su parte. Sábados, domingos y festivos no restan.
//   - El coordinador confirma cada mitad al terminar; al confirmar se
//     guarda como "acelerador" (tipo garantizado) del mes, así suma solo
//     al total del asesor y a su cuenta de cobro.

/* ---------- Fechas (siempre en hora local, formato AAAA-MM-DD) ---------- */
function asFechaISO(d){
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return d.getFullYear() + '-' + m + '-' + dd;
}
function asHoyLocal(){ return asFechaISO(new Date()); }
function asParse(iso){ const [y,m,d] = iso.split('-').map(Number); return new Date(y, m-1, d, 12, 0, 0); }
function asSumarDias(iso, n){ const d = asParse(iso); d.setDate(d.getDate()+n); return asFechaISO(d); }
function asDiffDias(a,b){ return Math.round((asParse(b)-asParse(a))/86400000); }
function asEsFinDeSemana(iso){ const g = asParse(iso).getDay(); return g===0 || g===6; }
function asSumarUnMes(iso){
  const d = asParse(iso);
  const dia = d.getDate();
  const r = new Date(d.getFullYear(), d.getMonth()+1, dia, 12, 0, 0);
  if(r.getDate() !== dia) r.setDate(0); // 31-ene + 1 mes -> último día de febrero
  return asFechaISO(r);
}
// Primer mes del asesor: desde el ingreso hasta el último día de ese mes
function ventanaPrimerMes(fechaIngreso){
  const d = asParse(fechaIngreso);
  const ultimo = new Date(d.getFullYear(), d.getMonth()+1, 0, 12, 0, 0);
  return { inicio: fechaIngreso, fin: asFechaISO(ultimo) };
}
function esDiaHabil(iso, festivos){ return !asEsFinDeSemana(iso) && !festivos.has(iso); }
function diasHabilesVentana(inicio, fin, festivos){
  const lista = [];
  for(let f = inicio; f <= fin; f = asSumarDias(f, 1)){ if(esDiaHabil(f, festivos)) lista.push(f); }
  return lista;
}
// marcas: { 'AAAA-MM-DD': true|false } de ese asesor
// Devuelve las dos mitades del primer mes, cada una con su cálculo.
function calcGarantizado(fechaIngreso, marcas, festivos, monto, hoy){
  const v = ventanaPrimerMes(fechaIngreso);
  const mes = fechaIngreso.slice(0,7);
  const defs = [
    { n:1, inicio: mes+'-01', fin: mes+'-15' },
    { n:2, inicio: mes+'-16', fin: v.fin },
  ];
  const mitad = monto / 2;
  const tramos = defs.map(d=>{
    const diasTramo = asDiffDias(d.inicio, d.fin) + 1;
    const desde = fechaIngreso > d.inicio ? fechaIngreso : d.inicio;
    let activos = 0, presentes = 0, ausentes = 0, sinMarcar = 0, pendientes = 0;
    if(desde <= d.fin){
      for(let f = desde; f <= d.fin; f = asSumarDias(f, 1)){
        activos++;
        if(!esDiaHabil(f, festivos)) continue;     // fin de semana o festivo: no resta
        if(f > hoy){ pendientes++; continue; }
        if(marcas[f] === true) presentes++;
        else if(marcas[f] === false) ausentes++;
        else sinMarcar++;
      }
    }
    const ganan = activos - ausentes - sinMarcar - pendientes;
    return { n:d.n, inicio:d.inicio, fin:d.fin, diasTramo, activos, presentes, ausentes, sinMarcar, pendientes,
             ganado: diasTramo ? mitad * ganan / diasTramo : 0, maximo: diasTramo ? mitad * activos / diasTramo : 0,
             terminado: hoy > d.fin };
  }).filter(t=>t.activos>0);
  return { inicio: v.inicio, fin: v.fin, tramos, ganado: tramos.reduce((x,t)=>x+t.ganado,0) };
}

/* ---------- Estilos propios ---------- */
(function(){
  if(document.getElementById('asStyle')) return;
  const s = document.createElement('style'); s.id = 'asStyle';
  s.textContent = `
  .as-btn{font-family:inherit;font-weight:700;font-size:12px;border:1px solid var(--border);background:#fff;color:var(--muted);border-radius:999px;padding:7px 16px;cursor:pointer;}
  .as-btn.si.on{background:#E3F5EA;color:#1F9254;border-color:#1F9254;}
  .as-btn.no.on{background:#FDE8E8;color:#991B1B;border-color:#991B1B;}
  .as-btn:disabled{opacity:.45;cursor:not-allowed;}
  .as-fila{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;}
  .as-fila:last-child{border-bottom:none;}
  .as-estado{display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;}
  .as-ok{background:#E3F5EA;color:#1F9254;} .as-pend{background:#FBF3E2;color:#8A6D23;} .as-gris{background:#EEF2F5;color:#6B7A89;}
  `;
  document.head.appendChild(s);
})();

/* ---------- Módulo ---------- */
const AS = { el:null, opts:{}, festivos:new Set(), festivosLista:[], monto:500000, asesores:[], marcas:{}, garantizados:{}, fecha:null, perfilId:null };
function asEsc(t){ return String(t==null?'':t).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function asFmtFecha(iso){
  const d = asParse(iso);
  return d.toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' });
}

async function montarAsistencia(el, opts){
  AS.el = el; AS.opts = opts || {}; AS.perfilId = AS.opts.perfilId || null;
  if(!AS.fecha) AS.fecha = asHoyLocal();
  el.innerHTML = '<div class="card"><p class="sub">Cargando asistencia…</p></div>';
  await asCargar();
  asRender();
}

async function asCargar(){
  const [rAs, rFe, rPa, rMa, rGa] = await Promise.all([
    supabase.from('perfiles').select('id,nombre,fecha_ingreso').eq('rol','asesor').eq('activo',true).order('nombre'),
    supabase.from('festivos').select('*').order('fecha'),
    supabase.from('parametros').select('valor').eq('clave','garantizado_primer_mes').maybeSingle(),
    supabase.from('asistencia').select('asesor_id,fecha,presente'),
    supabase.from('aceleradores').select('*').eq('tipo','garantizado'),
  ]);
  AS.asesores = rAs.data || [];
  AS.festivosLista = rFe.data || [];
  AS.festivos = new Set(AS.festivosLista.map(f=>f.fecha));
  AS.monto = rPa.data ? +rPa.data.valor : 500000;
  AS.marcas = {};
  (rMa.data||[]).forEach(r=>{ (AS.marcas[r.asesor_id] = AS.marcas[r.asesor_id] || {})[r.fecha] = r.presente; });
  AS.garantizados = {};
  (rGa.data||[]).forEach(a=>{ AS.garantizados[a.perfil_id + '|' + (a.tramo||1)] = a; });
}

function asRender(){
  const hoy = asHoyLocal();
  const conIngreso = AS.asesores.filter(a=>a.fecha_ingreso);
  const sinIngreso = AS.asesores.filter(a=>!a.fecha_ingreso);
  const f = AS.fecha;
  const habil = esDiaHabil(f, AS.festivos);
  const festivoDia = AS.festivosLista.find(x=>x.fecha===f);
  const motivoNoHabil = asEsFinDeSemana(f) ? 'Fin de semana: no se marca asistencia.' : (festivoDia ? 'Festivo' + (festivoDia.nombre ? ' ('+asEsc(festivoDia.nombre)+')' : '') + ': no se marca asistencia.' : '');

  // Asesores cuyo primer mes incluye el día elegido
  const delDia = conIngreso.filter(a=>{ const v = ventanaPrimerMes(a.fecha_ingreso); return f >= v.inicio && f <= v.fin; });

  const filasDia = delDia.map(a=>{
    const v = ventanaPrimerMes(a.fecha_ingreso);
    const marca = (AS.marcas[a.id]||{})[f];
    const confirmado = !!AS.garantizados[a.id+'|1'] && !!AS.garantizados[a.id+'|2'];
    const dis = (!habil || confirmado) ? 'disabled' : '';
    return `<div class="as-fila">
      <div><b>${asEsc(a.nombre)}</b>
        <div style="font-size:11px;color:var(--muted)">Primer mes: ${asFmtFecha(v.inicio)} a ${asFmtFecha(v.fin)}${confirmado?' · garantizado ya confirmado':''}</div></div>
      <div style="display:flex;gap:8px">
        <button class="as-btn si ${marca===true?'on':''}" ${dis} onclick="asMarcar('${a.id}', true)">Presente</button>
        <button class="as-btn no ${marca===false?'on':''}" ${dis} onclick="asMarcar('${a.id}', false)">Ausente</button>
      </div></div>`;
  }).join('') || '<p class="sub" style="margin:8px 0 0">Ningún asesor está en su primer mes en esta fecha.</p>';

  // Resumen de garantizado: una fila por asesor y por tramo
  const filasResumen = conIngreso.slice().sort((a,b)=> b.fecha_ingreso.localeCompare(a.fecha_ingreso)).map(a=>{
    const c = calcGarantizado(a.fecha_ingreso, AS.marcas[a.id]||{}, AS.festivos, AS.monto, hoy);
    return c.tramos.map(t=>{
      const conf = AS.garantizados[a.id+'|'+t.n];
      let accion;
      if(conf){
        accion = `<span class="as-estado as-ok">Confirmado ${fmtMoney(conf.monto)}</span>`;
      } else if(!t.terminado){
        accion = `<span class="as-estado as-gris">En curso</span>`;
      } else if(t.sinMarcar>0){
        accion = `<span class="as-estado as-pend">Faltan ${t.sinMarcar} día(s) por marcar</span>`;
      } else if(Math.round(t.ganado)===0){
        accion = `<span class="as-estado as-gris">Sin garantizado</span>`;
      } else {
        accion = `<button class="btn btn-primary" style="padding:7px 14px;font-size:12px" onclick="asConfirmar('${a.id}', ${t.n})">Confirmar ${fmtMoney(t.ganado)}</button>`;
      }
      return `<tr>
        <td><b>${asEsc(a.nombre)}</b></td>
        <td>${t.n===1?'Mitad 1 (días 1 a 15)':'Mitad 2 (día 16 a fin de mes)'}</td>
        <td>${asFmtFecha(t.inicio)} a ${asFmtFecha(t.fin)}</td>
        <td>${t.activos} de ${t.diasTramo}</td><td>${t.presentes}</td><td>${t.ausentes}</td><td>${t.sinMarcar}</td><td>${t.pendientes}</td>
        <td style="font-weight:700">${fmtMoney(t.ganado)} <span style="color:var(--muted);font-weight:500">máx. ${fmtMoney(t.maximo)}</span></td>
        <td>${accion}</td></tr>`;
    }).join('');
  }).join('') || `<tr><td colspan="10" style="text-align:center;color:var(--muted)">Ningún asesor tiene fecha de ingreso todavía. Se pone en la pestaña Usuarios.</td></tr>`;

  const avisoSinIngreso = sinIngreso.length ? `<div class="note">Sin fecha de ingreso (no entran al garantizado): <b style="display:inline">${sinIngreso.map(a=>asEsc(a.nombre)).join(', ')}</b>. Se les pone en la pestaña Usuarios.</div>` : '';

  const config = AS.opts.puedeConfigurar ? `
    <div class="card">
      <h2>Garantizado y festivos</h2>
      <p class="sub">Los festivos no cuentan como día hábil. Agrega las fechas y el sistema recalcula todo solo.</p>
      <div class="grid3">
        <div><label>Garantizado del primer mes ($)</label>
          <input type="text" inputmode="decimal" id="asMonto" value="${fmtMoney(AS.monto)}" onblur="reformatearInputDinero(this)">
          <div class="row-actions"><button class="btn btn-ghost" onclick="asGuardarMonto()">Guardar valor</button></div></div>
        <div><label>Festivo (fecha)</label><input type="date" id="asFestFecha"></div>
        <div><label>Nombre (opcional)</label><input type="text" id="asFestNombre" placeholder="Ej: Día de la Raza">
          <div class="row-actions"><button class="btn btn-primary" onclick="asAgregarFestivo()">+ Agregar festivo</button></div></div>
      </div>
      <div style="margin-top:14px">${AS.festivosLista.length ? AS.festivosLista.map(x=>`
        <span class="as-estado as-gris" style="margin:0 6px 6px 0">${asFmtFecha(x.fecha)}${x.nombre?' · '+asEsc(x.nombre):''}
          <a href="#" onclick="asBorrarFestivo('${x.fecha}');return false" style="color:#991B1B;margin-left:6px;text-decoration:none">x</a></span>`).join('') : '<span class="sub">Sin festivos cargados.</span>'}</div>
      <div class="msg" id="asMsg"></div>
    </div>` : (AS.festivosLista.length ? `
    <div class="card"><h2>Festivos cargados</h2><p class="sub">Estos días no cuentan como hábiles.</p>
      ${AS.festivosLista.map(x=>`<span class="as-estado as-gris" style="margin:0 6px 6px 0">${asFmtFecha(x.fecha)}${x.nombre?' · '+asEsc(x.nombre):''}</span>`).join('')}</div>` : '');

  AS.el.innerHTML = `
    <div class="card">
      <h2>Asistencia del día</h2>
      <p class="sub">Lunes a viernes. Marca quién fue hoy a la oficina; cada día ausente le resta su parte proporcional al garantizado.</p>
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:6px">
        <button class="btn btn-ghost" onclick="asCambiarDia(-1)">&larr; Día anterior</button>
        <div style="max-width:200px"><label>Fecha</label><input type="date" id="asFecha" value="${f}" onchange="asIrAFecha(this.value)"></div>
        <button class="btn btn-ghost" onclick="asCambiarDia(1)">Día siguiente &rarr;</button>
        <button class="btn btn-ghost" onclick="asIrAFecha('${hoy}')">Hoy</button>
        ${habil && delDia.length ? `<button class="btn btn-primary" onclick="asTodosPresentes()">Marcar todos presentes</button>` : ''}
      </div>
      ${motivoNoHabil ? `<div class="note" style="margin-top:8px">${motivoNoHabil}</div>` : ''}
      <div style="margin-top:10px">${filasDia}</div>
    </div>
    ${avisoSinIngreso}
    <div class="card" style="margin-top:18px">
      <h2>Garantizado del primer mes</h2>
      <p class="sub">Garantizado completo: ${fmtMoney(AS.monto)} en el primer mes, pagado en dos mitades de ${fmtMoney(AS.monto/2)} (la primera el día 15, la segunda al terminar el mes). Cada mitad se divide entre los días de su tramo y el asesor gana la parte de cada día desde su ingreso; cada día hábil sin asistir resta la suya. Al terminar el tramo y tener todos sus días marcados, se confirma y queda como acelerador del mes en que termina.</p>
      <div style="overflow-x:auto"><table>
        <thead><tr><th>Asesor</th><th>Tramo</th><th>Fechas</th><th>Días desde ingreso</th><th>Hábiles presente</th><th>Ausente</th><th>Sin marcar</th><th>Por venir</th><th>Garantizado</th><th></th></tr></thead>
        <tbody>${filasResumen}</tbody></table></div>
    </div>
    ${config}`;
}

function asIrAFecha(iso){ if(!iso) return; AS.fecha = iso; asRender(); }
function asCambiarDia(n){ asIrAFecha(asSumarDias(AS.fecha, n)); }

async function asMarcar(asesorId, presente){
  const fecha = AS.fecha;
  const actual = (AS.marcas[asesorId]||{})[fecha];
  if(actual === presente){
    // tocar de nuevo el mismo botón quita la marca
    const { error } = await supabase.from('asistencia').delete().eq('asesor_id', asesorId).eq('fecha', fecha);
    if(error){ alert('No se pudo quitar la marca: '+error.message); return; }
    delete AS.marcas[asesorId][fecha];
  } else {
    const { error } = await supabase.from('asistencia').upsert(
      { asesor_id: asesorId, fecha, presente, marcado_por: AS.perfilId, actualizado_en: new Date().toISOString() },
      { onConflict: 'asesor_id,fecha' });
    if(error){ alert('No se pudo guardar: '+error.message); return; }
    (AS.marcas[asesorId] = AS.marcas[asesorId] || {})[fecha] = presente;
  }
  asRender();
}
async function asTodosPresentes(){
  const fecha = AS.fecha;
  const filas = AS.asesores.filter(a=>{
    if(!a.fecha_ingreso || AS.garantizados[a.id]) return false;
    const v = ventanaPrimerMes(a.fecha_ingreso);
    return fecha >= v.inicio && fecha <= v.fin && (AS.marcas[a.id]||{})[fecha] === undefined;
  }).map(a=>({ asesor_id:a.id, fecha, presente:true, marcado_por:AS.perfilId, actualizado_en:new Date().toISOString() }));
  if(!filas.length) return;
  const { error } = await supabase.from('asistencia').upsert(filas, { onConflict:'asesor_id,fecha' });
  if(error){ alert('No se pudo guardar: '+error.message); return; }
  filas.forEach(r=>{ (AS.marcas[r.asesor_id] = AS.marcas[r.asesor_id] || {})[fecha] = true; });
  asRender();
}

async function asConfirmar(asesorId, n){
  const a = AS.asesores.find(x=>x.id===asesorId); if(!a) return;
  const c = calcGarantizado(a.fecha_ingreso, AS.marcas[a.id]||{}, AS.festivos, AS.monto, asHoyLocal());
  const t = c.tramos.find(x=>x.n===n); if(!t) return;
  const monto = Math.round(t.ganado);
  if(!t.terminado || t.sinMarcar>0 || monto<=0) return;
  if(!confirm(`Confirmar garantizado de ${a.nombre} (mitad ${n}): ${fmtMoney(monto)} (${t.activos-t.ausentes} de ${t.diasTramo} partes). Se suma como acelerador de ${t.fin.slice(0,7)}.`)) return;
  const { error } = await supabase.from('aceleradores').insert({
    perfil_id: asesorId, monto, mes: t.fin.slice(0,7), tipo: 'garantizado', tramo: n, fecha: asHoyLocal(),
    motivo: `Garantizado primer mes, mitad ${n} (${t.activos-t.ausentes} de ${t.diasTramo} partes)`,
  });
  if(error){ alert('No se pudo confirmar: '+error.message); return; }
  await asCargar(); asRender();
}

function asMsg(texto, ok){
  const m = document.getElementById('asMsg'); if(!m) return;
  m.className = 'msg ' + (ok?'ok':'err'); m.textContent = texto; m.style.display = 'block';
}
async function asGuardarMonto(){
  const v = parseMonto(document.getElementById('asMonto').value);
  if(v<=0){ asMsg('Pon un valor mayor a cero.', false); return; }
  const { error } = await supabase.from('parametros').upsert({ clave:'garantizado_primer_mes', valor:v, actualizado_en:new Date().toISOString() }, { onConflict:'clave' });
  if(error){ asMsg('No se pudo guardar: '+error.message, false); return; }
  AS.monto = v; asRender(); asMsg('Valor guardado. Aplica a los garantizados que aún no se han confirmado.', true);
}
async function asAgregarFestivo(){
  const fecha = document.getElementById('asFestFecha').value;
  const nombre = document.getElementById('asFestNombre').value.trim() || null;
  if(!fecha){ asMsg('Elige la fecha del festivo.', false); return; }
  const { error } = await supabase.from('festivos').upsert({ fecha, nombre }, { onConflict:'fecha' });
  if(error){ asMsg('No se pudo agregar: '+error.message, false); return; }
  await asCargar(); asRender();
}
async function asBorrarFestivo(fecha){
  if(!confirm('¿Quitar este festivo? Ese día volverá a contar como hábil.')) return;
  const { error } = await supabase.from('festivos').delete().eq('fecha', fecha);
  if(error){ alert('No se pudo quitar: '+error.message); return; }
  await asCargar(); asRender();
}
