// ruleta.js — Ruleta de incentivos (ruleta fisica; aqui se registran los giros y se lleva el ranking)
//
//   montarRuletaGestion(elemento, { rol:'admin'|'coordinador', perfilId })   -> admin y coordinador
//   montarRuletaRanking(elemento, { perfilId })                              -> panel del asesor / analista
//
// Reglas (definidas por Sebastian):
//   - Asesor: 5 documentos del dia -> 1 giro, SOLO puntos (si cae en bono, pierde el tiro).
//   - Asesor: credito aprobado -> giro por puntos y bono; se repite por cada aprobado.
//   - Analista: cada 3 radicaciones aprobadas -> giro por puntos y bono.
//   - "Vuelve a lanzar": otro giro, de la misma modalidad.
//   - Un solo ranking (asesores y analistas). Gana el de mas puntos; si empatan,
//     gana el de mayor valor de creditos aprobados.
//   - Los bonos en efectivo salen de la caja menor (no entran al Consolidado).

const RL_CASILLAS = [
  { id:'p5',      label:'Gana 5 puntos',   puntos:5,  bono:0 },
  { id:'p10',     label:'Ganas 10 puntos', puntos:10, bono:0 },
  { id:'p20',     label:'Ganas 20 puntos', puntos:20, bono:0 },
  { id:'p50',     label:'Ganas 50 puntos', puntos:50, bono:0 },
  { id:'b10',     label:'Bono $10.000',    puntos:0,  bono:10000 },
  { id:'b30',     label:'Bono $30.000',    puntos:0,  bono:30000 },
  { id:'b50',     label:'Bono $50.000',    puntos:0,  bono:50000 },
  { id:'relanzar',label:'Vuelve a lanzar', puntos:0,  bono:0 },
  { id:'nada',    label:'Sigue intentando',puntos:0,  bono:0 },
];
const RL_MOTIVOS = {
  docs5:       { label:'5 documentos del dia (solo puntos)',        modalidad:'solo_puntos', valor:false, roles:['asesor'] },
  aprobado:    { label:'Credito aprobado (puntos y bono)',          modalidad:'puntos_bono', valor:true,  roles:['asesor'] },
  radic3:      { label:'3 radicaciones aprobadas (puntos y bono)',  modalidad:'puntos_bono', valor:true,  roles:['analista'] },
  relanzar_sp: { label:'Vuelve a lanzar - solo puntos',             modalidad:'solo_puntos', valor:false, roles:['asesor'] },
  relanzar_pb: { label:'Vuelve a lanzar - puntos y bono',           modalidad:'puntos_bono', valor:false, roles:['asesor','analista'] },
};
const RL_ROL = { asesor:'Asesor', analista:'Analista' };

/* ---------- Utilidades ---------- */
function rlEsc(t){ return String(t==null?'':t).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function rlPesos(n){ return '$' + Math.round(n||0).toLocaleString('es-CO'); }
function rlNum(n){ return Math.round(n||0).toLocaleString('es-CO'); }
function rlHoy(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function rlParseMonto(v){ const n = parseInt(String(v==null?'':v).replace(/[^0-9]/g,''), 10); return isNaN(n) ? 0 : n; }
function rlFecha(iso){
  if(!iso) return '';
  const [y,m,d] = iso.split('-').map(Number);
  return new Date(y, m-1, d, 12).toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' });
}
function rlCasilla(id){ return RL_CASILLAS.find(c=>c.id===id) || { label:id, puntos:0, bono:0 }; }
// El juego "actual": el que incluye hoy y sigue abierto; si no hay, el mas reciente.
function rlJuegoActual(juegos){
  const hoy = rlHoy();
  return juegos.find(j=>!j.cerrado_en && j.fecha_inicio <= hoy && hoy <= j.fecha_fin) || juegos[0] || null;
}

(function(){
  if(document.getElementById('rlStyle')) return;
  const s = document.createElement('style'); s.id = 'rlStyle';
  s.textContent = `
  .rl-card{background:#fff;border-radius:20px;padding:24px 28px;margin-bottom:18px;box-shadow:0 2px 14px rgba(22,41,58,0.06);}
  .rl-card h2{font-family:'Manrope',sans-serif;font-size:18px;margin:0 0 4px;font-weight:800;color:var(--text,#16293A);}
  .rl-sub{font-size:13px;color:var(--muted,#6B7A89);margin:0 0 14px;}
  .rl-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));}
  .rl-lbl{display:block;font-size:10.5px;font-weight:700;color:var(--muted,#6B7A89);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;}
  .rl-in{font-family:inherit;font-size:13.5px;padding:9px 10px;border:1px solid var(--border,#E6EAEE);border-radius:10px;width:100%;box-sizing:border-box;background:#fff;}
  .rl-btn{font-family:inherit;font-weight:700;font-size:13px;border:none;border-radius:999px;padding:10px 20px;cursor:pointer;background:var(--brand,#16293A);color:#fff;}
  .rl-btn.sec{background:var(--cyan-light,#E6FBFC);color:#0a5c6e;}
  .rl-btn.peq{padding:6px 12px;font-size:12px;}
  .rl-btn:disabled{opacity:.5;cursor:not-allowed;}
  .rl-tabla{width:100%;border-collapse:collapse;font-size:12.5px;}
  .rl-tabla th{background:var(--brand,#16293A);color:#fff;padding:10px;text-align:left;font-size:10.5px;text-transform:uppercase;}
  .rl-tabla td{padding:9px 10px;border-bottom:1px solid var(--border,#E6EAEE);}
  .rl-tabla tr.yo td{background:#E6FBFC;font-weight:700;}
  .rl-casillas{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;}
  .rl-cas{font-family:inherit;font-weight:700;font-size:12.5px;padding:12px 8px;border:2px solid var(--border,#E6EAEE);background:#fff;border-radius:12px;cursor:pointer;color:var(--text,#16293A);}
  .rl-cas.on{border-color:var(--brand,#16293A);background:var(--brand,#16293A);color:#fff;}
  .rl-msg{padding:10px 12px;border-radius:10px;font-size:12.5px;margin-top:10px;}
  .rl-msg.ok{background:#E3F5EA;color:#1F9254;} .rl-msg.err{background:#FDE8E8;color:#991B1B;} .rl-msg.info{background:#FBF3E2;color:#8A6D23;}
  .rl-chip{display:inline-block;font-size:10px;font-weight:700;padding:3px 10px;border-radius:999px;text-transform:uppercase;background:#EEF2F5;color:#6B7A89;}
  .rl-chip.ok{background:#E3F5EA;color:#1F9254;} .rl-chip.pend{background:#FBF3E2;color:#8A6D23;}
  .rl-pos{font-weight:800;font-size:15px;}
  `;
  document.head.appendChild(s);
})();

/* =====================================================================
   RANKING (panel del asesor / analista)
   ===================================================================== */
async function montarRuletaRanking(el, opts){
  if(!el) return;
  const perfilId = (opts||{}).perfilId;
  try{
    const { data: juegos } = await supabase.from('ruleta_juegos').select('*').order('fecha_inicio', { ascending:false });
    const juego = rlJuegoActual(juegos || []);
    if(!juego){ el.innerHTML = ''; return; }
    const [{ data: rank }, { data: mios }] = await Promise.all([
      supabase.rpc('ruleta_ranking', { p_juego: juego.id }),
      supabase.from('ruleta_giros').select('*').eq('juego_id', juego.id).eq('perfil_id', perfilId).order('fecha', { ascending:false }).order('creado_en', { ascending:false }),
    ]);
    const lista = rank || [];
    const yo = lista.find(r=>r.perfil_id===perfilId);
    const hoy = rlHoy();
    const estado = juego.cerrado_en ? 'Juego cerrado'
      : (hoy < juego.fecha_inicio ? 'Empieza el ' + rlFecha(juego.fecha_inicio)
      : (hoy > juego.fecha_fin ? 'Terminó el ' + rlFecha(juego.fecha_fin) : 'En juego'));
    const top = lista.slice(0, 10);
    const yoFuera = yo && !top.some(r=>r.perfil_id===perfilId);
    const fila = (r)=>`<tr class="${r.perfil_id===perfilId?'yo':''}"><td><span class="rl-pos">${r.posicion}</span></td><td>${rlEsc(r.nombre)}${r.perfil_id===perfilId?' (tú)':''}</td><td>${RL_ROL[r.rol]||r.rol}</td><td>${rlNum(r.puntos)}</td></tr>`;
    const ganador = juego.ganador_id ? (lista.find(r=>r.perfil_id===juego.ganador_id)||{}).nombre : null;
    el.innerHTML = `
      <div class="rl-card">
        <h2>Ruleta de incentivos</h2>
        <p class="rl-sub">${rlEsc(juego.nombre)} · del ${rlFecha(juego.fecha_inicio)} al ${rlFecha(juego.fecha_fin)} · ${estado}${juego.premio?' · Premio: '+rlEsc(juego.premio):''}${ganador?' · Ganador: <b>'+rlEsc(ganador)+'</b>':''}</p>
        ${yo ? `<div class="rl-grid" style="margin-bottom:14px">
          <div style="border:1px solid var(--border,#E6EAEE);border-radius:14px;padding:14px"><span class="rl-lbl">Tu posición</span><div style="font-size:26px;font-weight:800">${yo.posicion}</div></div>
          <div style="border:1px solid var(--border,#E6EAEE);border-radius:14px;padding:14px"><span class="rl-lbl">Tus puntos</span><div style="font-size:26px;font-weight:800">${rlNum(yo.puntos)}</div></div>
          <div style="border:1px solid var(--border,#E6EAEE);border-radius:14px;padding:14px"><span class="rl-lbl">Tus giros</span><div style="font-size:26px;font-weight:800">${yo.giros}</div></div>
        </div>` : ''}
        <div style="overflow-x:auto"><table class="rl-tabla">
          <thead><tr><th>#</th><th>Nombre</th><th>Rol</th><th>Puntos</th></tr></thead>
          <tbody>${top.map(fila).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--muted,#6B7A89)">Aún no hay puntos.</td></tr>'}${yoFuera?'<tr><td colspan="4" style="text-align:center;color:var(--muted,#6B7A89)">…</td></tr>'+fila(yo):''}</tbody>
        </table></div>
        <p class="rl-sub" style="margin:12px 0 0">Si dos personas empatan en puntos, gana quien tenga mayor valor de créditos aprobados.</p>
        ${(mios||[]).length ? `
        <h3 style="font-family:'Manrope',sans-serif;font-size:14px;margin:18px 0 8px;font-weight:800">Tus giros</h3>
        <div style="overflow-x:auto"><table class="rl-tabla">
          <thead><tr><th>Fecha</th><th>Motivo</th><th>Casilla</th><th>Puntos</th><th>Bono</th></tr></thead>
          <tbody>${mios.map(g=>`<tr><td>${rlFecha(g.fecha)}</td><td>${rlEsc((RL_MOTIVOS[g.motivo]||{}).label||g.motivo)}</td><td>${rlEsc(rlCasilla(g.resultado).label)}</td><td>${g.puntos>0?rlNum(g.puntos):'—'}</td><td>${g.bono>0?rlPesos(g.bono)+(g.pagado?' (pagado)':' (por pagar)'):'—'}</td></tr>`).join('')}</tbody>
        </table></div>` : ''}
      </div>`;
  } catch(e){
    el.innerHTML = '';
  }
}

/* =====================================================================
   GESTION (admin y coordinador)
   ===================================================================== */
const RLG = { el:null, rol:'coordinador', perfilId:null, juegos:[], juegoId:null, participantes:[], giros:[], ranking:[], seleccion:null, sugerido:null };

async function montarRuletaGestion(el, opts){
  RLG.el = el; RLG.rol = (opts||{}).rol || 'coordinador'; RLG.perfilId = (opts||{}).perfilId || null;
  el.innerHTML = '<div class="rl-card"><p class="rl-sub">Cargando ruleta…</p></div>';
  await rlgCargar();
  rlgRender();
}

async function rlgCargar(){
  const { data: juegos } = await supabase.from('ruleta_juegos').select('*').order('fecha_inicio', { ascending:false });
  RLG.juegos = juegos || [];
  if(!RLG.juegoId || !RLG.juegos.some(j=>j.id===RLG.juegoId)){
    const a = rlJuegoActual(RLG.juegos); RLG.juegoId = a ? a.id : null;
  }
  const { data: part } = await supabase.from('perfiles').select('id,nombre,rol').in('rol', ['asesor','analista']).eq('activo', true).order('nombre');
  RLG.participantes = part || [];
  if(RLG.juegoId){
    const [{ data: giros }, { data: rank }] = await Promise.all([
      supabase.from('ruleta_giros').select('*').eq('juego_id', RLG.juegoId).order('fecha', { ascending:false }).order('creado_en', { ascending:false }),
      supabase.rpc('ruleta_ranking', { p_juego: RLG.juegoId }),
    ]);
    RLG.giros = giros || []; RLG.ranking = rank || [];
  } else { RLG.giros = []; RLG.ranking = []; }
}
function rlgJuego(){ return RLG.juegos.find(j=>j.id===RLG.juegoId) || null; }
function rlgNombre(id){ return (RLG.participantes.find(p=>p.id===id)||(RLG.ranking.find(r=>r.perfil_id===id)&&{nombre:RLG.ranking.find(r=>r.perfil_id===id).nombre})||{}).nombre || '—'; }

function rlgRender(){
  const j = rlgJuego();
  const esAdmin = RLG.rol === 'admin';
  const hoy = rlHoy();
  const cerrado = j && j.cerrado_en;

  // valor de creditos aprobados por persona (desempate), calculado con los giros del juego
  const valor = {}; RLG.giros.forEach(g=>{ valor[g.perfil_id] = (valor[g.perfil_id]||0) + (+g.valor_aprobado||0); });

  const selector = `<div><span class="rl-lbl">Juego</span><select class="rl-in" id="rlJuego" onchange="rlgCambiarJuego(this.value)">
      ${RLG.juegos.map(x=>`<option value="${x.id}" ${x.id===RLG.juegoId?'selected':''}>${rlEsc(x.nombre)} (${rlFecha(x.fecha_inicio)} - ${rlFecha(x.fecha_fin)})${x.cerrado_en?' - cerrado':''}</option>`).join('') || '<option value="">Sin juegos</option>'}
    </select></div>`;

  const estado = !j ? '' : (cerrado ? 'Cerrado' : (hoy < j.fecha_inicio ? 'Aún no empieza' : (hoy > j.fecha_fin ? 'Terminó (falta cerrarlo)' : 'En juego')));

  const cardJuego = `
    <div class="rl-card">
      <h2>Juego de la ruleta</h2>
      <p class="rl-sub">${j ? 'Estado: <b>'+estado+'</b>' + (j.premio?' · Premio: '+rlEsc(j.premio):'') : 'Todavía no hay ningún juego creado.'}${esAdmin?'':' · Las fechas y el premio los define el administrador.'}</p>
      <div class="rl-grid">${selector}</div>
      ${esAdmin ? `
      <div class="rl-grid" style="margin-top:14px">
        <div><span class="rl-lbl">Nombre</span><input class="rl-in" id="rlNombre" value="${j?rlEsc(j.nombre):''}" ${cerrado?'disabled':''}></div>
        <div><span class="rl-lbl">Fecha de inicio</span><input class="rl-in" type="date" id="rlIni" value="${j?j.fecha_inicio:''}" ${cerrado?'disabled':''}></div>
        <div><span class="rl-lbl">Fecha de fin</span><input class="rl-in" type="date" id="rlFin" value="${j?j.fecha_fin:''}" ${cerrado?'disabled':''}></div>
        <div><span class="rl-lbl">Premio mayor</span><input class="rl-in" id="rlPremio" value="${j&&j.premio?rlEsc(j.premio):''}" placeholder="Ej: cena para dos" ${cerrado?'disabled':''}></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
        <button class="rl-btn" onclick="rlgGuardarJuego()" ${(!j||cerrado)?'disabled':''}>Guardar cambios</button>
        <button class="rl-btn sec" onclick="rlgNuevoJuego()">Crear juego nuevo</button>
        <button class="rl-btn sec" onclick="rlgCerrarJuego()" ${(!j||cerrado)?'disabled':''}>Cerrar juego y declarar ganador</button>
      </div>` : ''}
      <div id="rlMsgJuego"></div>
    </div>`;

  // ---- registrar giro ----
  const dentro = j && !cerrado;
  const cardRegistro = !j ? '' : `
    <div class="rl-card">
      <h2>Registrar giro</h2>
      <p class="rl-sub">${cerrado ? 'Este juego está cerrado: ya no se pueden registrar giros.' : 'Anota quién giró, por qué ganó el giro y en qué casilla cayó. Los puntos y el bono se calculan solos.'}</p>
      ${dentro ? `
      <div class="rl-grid">
        <div><span class="rl-lbl">Persona</span><select class="rl-in" id="rlPersona" onchange="rlgPersonaCambio()">
          ${RLG.participantes.map(p=>`<option value="${p.id}">${rlEsc(p.nombre)} · ${RL_ROL[p.rol]}</option>`).join('')}</select></div>
        <div><span class="rl-lbl">Motivo del giro</span><select class="rl-in" id="rlMotivo" onchange="rlgMotivoCambio()"></select></div>
        <div id="rlValorWrap"><span class="rl-lbl" id="rlValorLbl">Valor del crédito aprobado ($)</span><input class="rl-in" id="rlValor" inputmode="numeric" placeholder="$0" onblur="this.value=this.value?rlPesos(rlParseMonto(this.value)):''"></div>
        <div><span class="rl-lbl">Fecha</span><input class="rl-in" type="date" id="rlFecha" value="${hoy < j.fecha_inicio ? j.fecha_inicio : (hoy > j.fecha_fin ? j.fecha_fin : hoy)}" min="${j.fecha_inicio}" max="${j.fecha_fin}"></div>
      </div>
      <span class="rl-lbl" style="margin-top:16px">Casilla donde cayó</span>
      <div class="rl-casillas" id="rlCasillas">
        ${RL_CASILLAS.map(c=>`<button type="button" class="rl-cas" data-id="${c.id}" onclick="rlgElegirCasilla('${c.id}')">${c.label}</button>`).join('')}
      </div>
      <div id="rlPreview" class="rl-msg info" style="display:none"></div>
      <div style="margin-top:14px"><button class="rl-btn" onclick="rlgRegistrar()">Registrar giro</button></div>
      <div id="rlMsgGiro"></div>` : ''}
    </div>`;

  // ---- ranking ----
  const cardRanking = !j ? '' : `
    <div class="rl-card">
      <h2>Ranking</h2>
      <p class="rl-sub">Asesores y analistas juntos. Gana el que tenga más puntos; si empatan, el de mayor valor de créditos aprobados.</p>
      <div style="overflow-x:auto"><table class="rl-tabla">
        <thead><tr><th>#</th><th>Nombre</th><th>Rol</th><th>Puntos</th><th>Giros</th><th>Valor créditos aprobados</th><th>Bonos ganados</th></tr></thead>
        <tbody>${RLG.ranking.map(r=>{
          const bonos = RLG.giros.filter(g=>g.perfil_id===r.perfil_id).reduce((s,g)=>s+(+g.bono||0),0);
          return `<tr><td><span class="rl-pos">${r.posicion}</span></td><td>${rlEsc(r.nombre)}</td><td>${RL_ROL[r.rol]||r.rol}</td><td><b>${rlNum(r.puntos)}</b></td><td>${r.giros}</td><td>${valor[r.perfil_id]?rlPesos(valor[r.perfil_id]):'—'}</td><td>${bonos?rlPesos(bonos):'—'}</td></tr>`;
        }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--muted,#6B7A89)">Sin participantes.</td></tr>'}</tbody>
      </table></div>
    </div>`;

  // ---- bonos por pagar (caja menor) ----
  const conBono = RLG.giros.filter(g=>(+g.bono||0) > 0);
  const porPagar = conBono.filter(g=>!g.pagado);
  const totalPorPagar = porPagar.reduce((s,g)=>s+(+g.bono||0),0);
  const totalPagado = conBono.filter(g=>g.pagado).reduce((s,g)=>s+(+g.bono||0),0);
  const cardBonos = !j ? '' : `
    <div class="rl-card">
      <h2>Bonos en efectivo</h2>
      <p class="rl-sub">Se pagan de la caja menor de Credixpertos y no entran al Consolidado. Por pagar: <b>${rlPesos(totalPorPagar)}</b> · Ya pagado: <b>${rlPesos(totalPagado)}</b></p>
      <div style="overflow-x:auto"><table class="rl-tabla">
        <thead><tr><th>Fecha</th><th>Persona</th><th>Bono</th><th>Estado</th><th></th></tr></thead>
        <tbody>${conBono.map(g=>`<tr><td>${rlFecha(g.fecha)}</td><td>${rlEsc(rlgNombre(g.perfil_id))}</td><td><b>${rlPesos(g.bono)}</b></td>
          <td>${g.pagado?'<span class="rl-chip ok">Pagado '+rlFecha(g.pagado_en)+'</span>':'<span class="rl-chip pend">Por pagar</span>'}</td>
          <td>${g.pagado?`<button class="rl-btn sec peq" onclick="rlgMarcarPagado('${g.id}', false)">Deshacer</button>`:`<button class="rl-btn peq" onclick="rlgMarcarPagado('${g.id}', true)">Marcar pagado</button>`}</td></tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--muted,#6B7A89)">Todavía no hay bonos en este juego.</td></tr>'}</tbody>
      </table></div>
    </div>`;

  // ---- historial ----
  const cardHistorial = !j ? '' : `
    <div class="rl-card">
      <h2>Historial de giros</h2>
      <p class="rl-sub">Si te equivocaste al registrar un giro, elimínalo y regístralo de nuevo.</p>
      <div style="overflow-x:auto"><table class="rl-tabla">
        <thead><tr><th>Fecha</th><th>Persona</th><th>Motivo</th><th>Casilla</th><th>Puntos</th><th>Bono</th><th>Valor aprobado</th><th></th></tr></thead>
        <tbody>${RLG.giros.map(g=>`<tr><td>${rlFecha(g.fecha)}</td><td>${rlEsc(rlgNombre(g.perfil_id))}</td><td>${rlEsc((RL_MOTIVOS[g.motivo]||{}).label||g.motivo)}</td>
          <td>${rlEsc(rlCasilla(g.resultado).label)}${g.nota?'<div style="font-size:11px;color:var(--muted,#6B7A89)">'+rlEsc(g.nota)+'</div>':''}</td>
          <td>${g.puntos>0?rlNum(g.puntos):'—'}</td><td>${g.bono>0?rlPesos(g.bono):'—'}</td><td>${g.valor_aprobado>0?rlPesos(g.valor_aprobado):'—'}</td>
          <td>${cerrado?'':`<button class="rl-btn sec peq" onclick="rlgEliminarGiro('${g.id}')">Eliminar</button>`}</td></tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--muted,#6B7A89)">Todavía no hay giros en este juego.</td></tr>'}</tbody>
      </table></div>
    </div>`;

  RLG.el.innerHTML = cardJuego + cardRegistro + cardRanking + cardBonos + cardHistorial;
  RLG.seleccion = null;
  if(dentro && RLG.participantes.length){
    if(RLG.sugerido){ document.getElementById('rlPersona').value = RLG.sugerido.persona; }
    rlgPersonaCambio(RLG.sugerido ? RLG.sugerido.motivo : null);
    RLG.sugerido = null;
  }
}

function rlgPersonaCambio(motivoPreferido){
  const sel = document.getElementById('rlPersona'); if(!sel) return;
  const p = RLG.participantes.find(x=>x.id===sel.value); if(!p) return;
  const opciones = Object.entries(RL_MOTIVOS).filter(([,m])=>m.roles.includes(p.rol));
  const mot = document.getElementById('rlMotivo');
  mot.innerHTML = opciones.map(([id,m])=>`<option value="${id}">${m.label}</option>`).join('');
  if(motivoPreferido && opciones.some(([id])=>id===motivoPreferido)) mot.value = motivoPreferido;
  rlgMotivoCambio();
}
function rlgMotivoCambio(){
  const m = RL_MOTIVOS[document.getElementById('rlMotivo').value]; if(!m) return;
  const sel = document.getElementById('rlPersona');
  const p = RLG.participantes.find(x=>x.id===sel.value) || {};
  document.getElementById('rlValorWrap').style.display = m.valor ? '' : 'none';
  document.getElementById('rlValorLbl').textContent = p.rol==='analista' ? 'Valor de los 3 créditos aprobados ($)' : 'Valor del crédito aprobado ($)';
  rlgPreview();
}
function rlgElegirCasilla(id){
  RLG.seleccion = id;
  document.querySelectorAll('#rlCasillas .rl-cas').forEach(b=>b.classList.toggle('on', b.dataset.id===id));
  rlgPreview();
}
// Calcula lo que se va a guardar para la combinacion elegida
function rlgCalculo(){
  const m = RL_MOTIVOS[document.getElementById('rlMotivo').value];
  const c = rlCasilla(RLG.seleccion);
  let puntos = c.puntos, bono = c.bono, nota = null;
  if(m.modalidad === 'solo_puntos' && bono > 0){ nota = 'Cayó en bono pero este giro es solo por puntos: pierde el tiro'; bono = 0; }
  if(c.id === 'relanzar') nota = 'Vuelve a lanzar: registra el nuevo giro';
  return { m, c, puntos, bono, nota };
}
function rlgPreview(){
  const box = document.getElementById('rlPreview'); if(!box) return;
  if(!RLG.seleccion){ box.style.display = 'none'; return; }
  const { c, puntos, bono, nota } = rlgCalculo();
  const partes = [];
  if(puntos>0) partes.push(rlNum(puntos) + ' puntos');
  if(bono>0) partes.push('bono de ' + rlPesos(bono));
  box.style.display = '';
  box.textContent = c.label + ': ' + (partes.join(' y ') || 'sin premio') + (nota ? ' — ' + nota : '');
}
function rlgMsg(id, texto, tipo){
  const el = document.getElementById(id); if(!el) return;
  el.className = 'rl-msg ' + tipo; el.textContent = texto; el.style.display = '';
}

async function rlgRegistrar(){
  const j = rlgJuego(); if(!j) return;
  const persona = document.getElementById('rlPersona').value;
  const motivoId = document.getElementById('rlMotivo').value;
  const fecha = document.getElementById('rlFecha').value;
  if(!persona){ rlgMsg('rlMsgGiro','Elige la persona.','err'); return; }
  if(!RLG.seleccion){ rlgMsg('rlMsgGiro','Elige la casilla donde cayó.','err'); return; }
  if(!fecha || fecha < j.fecha_inicio || fecha > j.fecha_fin){ rlgMsg('rlMsgGiro','La fecha debe estar entre el '+rlFecha(j.fecha_inicio)+' y el '+rlFecha(j.fecha_fin)+'.','err'); return; }
  const { m, c, puntos, bono, nota } = rlgCalculo();
  const valor = m.valor ? rlParseMonto(document.getElementById('rlValor').value) : 0;
  if(m.valor && valor <= 0){ rlgMsg('rlMsgGiro','Escribe el valor del crédito aprobado (sirve para desempatar el ranking).','err'); return; }
  const { error } = await supabase.from('ruleta_giros').insert({
    juego_id: j.id, perfil_id: persona, fecha, motivo: motivoId, modalidad: m.modalidad, resultado: c.id,
    puntos, bono, valor_aprobado: valor, nota, registrado_por: RLG.perfilId,
  });
  if(error){ rlgMsg('rlMsgGiro','No se pudo registrar: '+error.message,'err'); return; }
  const volver = (c.id === 'relanzar')
    ? { persona, motivo: (m.modalidad === 'solo_puntos' ? 'relanzar_sp' : 'relanzar_pb') } : null;
  await rlgCargar();
  RLG.sugerido = volver;
  rlgRender();
  rlgMsg('rlMsgGiro', volver ? 'Giro registrado. Sale a lanzar de nuevo: ya quedó listo el siguiente giro para esa persona.' : 'Giro registrado.', 'ok');
}
async function rlgEliminarGiro(id){
  if(!confirm('¿Eliminar este giro?')) return;
  const { error } = await supabase.from('ruleta_giros').delete().eq('id', id);
  if(error){ alert('No se pudo eliminar: '+error.message); return; }
  await rlgCargar(); rlgRender();
}
async function rlgMarcarPagado(id, pagado){
  const { error } = await supabase.from('ruleta_giros').update({ pagado, pagado_en: pagado ? rlHoy() : null }).eq('id', id);
  if(error){ alert('No se pudo actualizar: '+error.message); return; }
  await rlgCargar(); rlgRender();
}
async function rlgCambiarJuego(id){ RLG.juegoId = id; await rlgCargar(); rlgRender(); }

/* ---- Administracion del juego (solo admin) ---- */
async function rlgGuardarJuego(){
  const j = rlgJuego(); if(!j) return;
  const nombre = document.getElementById('rlNombre').value.trim();
  const ini = document.getElementById('rlIni').value, fin = document.getElementById('rlFin').value;
  const premio = document.getElementById('rlPremio').value.trim() || null;
  if(!nombre || !ini || !fin){ rlgMsg('rlMsgJuego','Completa nombre y fechas.','err'); return; }
  if(fin < ini){ rlgMsg('rlMsgJuego','La fecha de fin no puede ser anterior a la de inicio.','err'); return; }
  const { error } = await supabase.from('ruleta_juegos').update({ nombre, fecha_inicio: ini, fecha_fin: fin, premio }).eq('id', j.id);
  if(error){ rlgMsg('rlMsgJuego','No se pudo guardar: '+error.message,'err'); return; }
  await rlgCargar(); rlgRender(); rlgMsg('rlMsgJuego','Cambios guardados.','ok');
}
async function rlgNuevoJuego(){
  const nombre = prompt('Nombre del juego nuevo (ej. Ruleta noviembre - diciembre 2026):');
  if(!nombre) return;
  const hoy = rlHoy();
  const { data, error } = await supabase.from('ruleta_juegos').insert({ nombre: nombre.trim(), fecha_inicio: hoy, fecha_fin: hoy }).select().single();
  if(error){ rlgMsg('rlMsgJuego','No se pudo crear: '+error.message,'err'); return; }
  RLG.juegoId = data.id; await rlgCargar(); rlgRender();
  rlgMsg('rlMsgJuego','Juego creado. Ahora pon sus fechas de inicio y fin y guarda.','info');
}
async function rlgCerrarJuego(){
  const j = rlgJuego(); if(!j || j.cerrado_en) return;
  const lider = RLG.ranking[0];
  if(!lider || !(+lider.puntos > 0)){ rlgMsg('rlMsgJuego','Todavía nadie tiene puntos: no hay ganador.','err'); return; }
  const empatados = RLG.ranking.filter(r=>r.posicion===1);
  const valor = {}; RLG.giros.forEach(g=>{ valor[g.perfil_id] = (valor[g.perfil_id]||0) + (+g.valor_aprobado||0); });
  if(empatados.length > 1){
    rlgMsg('rlMsgJuego','Hay empate total entre '+empatados.map(r=>r.nombre).join(' y ')+' (mismos puntos y mismo valor de créditos aprobados). Defínelo tú antes de cerrar.','err'); return;
  }
  if(!confirm('Cerrar "'+j.nombre+'" y declarar ganador a '+lider.nombre+' con '+rlNum(lider.puntos)+' puntos. Después no se podrán registrar más giros. ¿Seguro?')) return;
  const { error } = await supabase.from('ruleta_juegos').update({ ganador_id: lider.perfil_id, cerrado_en: new Date().toISOString() }).eq('id', j.id);
  if(error){ rlgMsg('rlMsgJuego','No se pudo cerrar: '+error.message,'err'); return; }
  await rlgCargar(); rlgRender(); rlgMsg('rlMsgJuego','Juego cerrado. Ganador: '+lider.nombre+'.','ok');
}
