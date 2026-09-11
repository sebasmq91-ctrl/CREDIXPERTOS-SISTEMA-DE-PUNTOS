// config.js — Conexión a Supabase compartida por todas las pantallas
//
// ════════════════════════════════════════════════════════════════
// ÚNICO LUGAR QUE HAY QUE EDITAR A MANO. Pega aquí los dos datos
// que te da Supabase cuando creas el proyecto (Project Settings →
// API): la "Project URL" y la "anon public key". Ninguno de los dos
// es secreto — están hechos para vivir en el navegador.
// ════════════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://fwiiuewsoxmqxvujinft.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_JCezfuKQpyWEj9RO8iBBKg_WAnZl2Ty';

const supabase = (function(){
  if(!window.supabase || !window.supabase.createClient){
    alert('No se pudo cargar la conexión a Supabase. Revisa tu conexión a internet y recarga la página (Ctrl+Shift+R). Si el problema sigue, avísale a Sebas.');
    throw new Error('window.supabase no está disponible — la librería de Supabase no cargó correctamente.');
  }
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();

// ---- Ayudas de formato, iguales a las que ya usan las otras herramientas ----
function fmtMoney(n){ return '$' + Math.round(n||0).toLocaleString('es-CO'); }
function fmtNum(n){ return Math.round(n||0).toLocaleString('es-CO'); }
function parseMonto(v){
  if(v===null||v===undefined) return 0;
  const limpio = String(v).trim().replace(/[$.,\s]/g, '');
  const n = parseInt(limpio, 10);
  return isNaN(n) ? 0 : n;
}
// Un input de texto que MUESTRA "$1.234.567" pero guarda/lee el
// número limpio — se usa en todos los campos que son plata (monto,
// entidad paga, valor del punto, garantizados). Reformatea el campo
// apenas el usuario sale de él, y devuelve el número limpio para
// guardar en la base de datos.
function reformatearInputDinero(el){
  const limpio = parseMonto(el.value);
  el.value = fmtMoney(limpio);
  return limpio;
}
function millonesEnteros(monto){ return Math.floor(parseMonto(monto) / 1000000); }
function hoyISO(){ return new Date().toISOString().slice(0,10); }
function mesActualISO(){ return new Date().toISOString().slice(0,7); } // "2026-09"
const NOMBRES_ORIGEN = { mercado_natural:'Mercado natural', campana_manual:'Campaña manual', campana_ia:'Campaña IA' };

// ---- Guardia de sesión: cada pantalla la llama al cargar ----
// Verifica que haya sesión y que el rol coincida con la pantalla;
// si no, redirige a donde corresponda. Devuelve {user, perfil}.
async function exigirSesion(rolesPermitidos){
  const { data: { session } } = await supabase.auth.getSession();
  if(!session){ window.location.href = 'login.html'; return null; }
  const { data: perfil, error } = await supabase
    .from('perfiles').select('*').eq('id', session.user.id).single();
  if(error || !perfil || !perfil.activo){
    await supabase.auth.signOut();
    window.location.href = 'login.html';
    return null;
  }
  if(!rolesPermitidos.includes(perfil.rol)){
    // Cada quien tiene su propia pantalla — si entra a la que no le
    // corresponde, lo mandamos a la suya en vez de mostrar un error feo.
    window.location.href = perfil.rol + '.html';
    return null;
  }
  return { user: session.user, perfil };
}
async function cerrarSesion(){
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}

// ---- Trae la configuración de niveles/tarifas vigente HOY ----
// (la más reciente cuya fecha de vigencia ya llegó). Así todas las
// pantallas usan siempre la misma "foto" del presente.
// Ordena también por created_at como desempate: si guardaste dos
// versiones el mismo día (por ejemplo corrigiendo algo), sin este
// desempate el orden entre ellas queda indefinido y a veces "gana"
// la vieja por error — con created_at siempre gana la más reciente.
async function configVigente(){
  const { data, error } = await supabase
    .from('config_niveles_historial').select('*')
    .lte('vigente_desde', hoyISO())
    .order('vigente_desde', { ascending:false })
    .order('created_at', { ascending:false })
    .limit(1).single();
  if(error) return null;
  return data;
}
async function tarifasOrigenVigentes(){
  // Trae, para cada uno de los 3 orígenes, la fila más reciente ya vigente.
  const { data, error } = await supabase
    .from('tarifas_origen_historial').select('*')
    .lte('vigente_desde', hoyISO())
    .order('vigente_desde', { ascending:false })
    .order('created_at', { ascending:false });
  if(error) return {};
  const resultado = {};
  data.forEach(fila=>{ if(!(fila.origen in resultado)) resultado[fila.origen] = fila; });
  return resultado;
}

// ---- Cálculo del bono del asesor a partir de sus puntos del mes ----
// Misma regla que ya usaban las herramientas anteriores: la comisión
// variable se paga completa desde el primer punto; el garantizado se
// suma al llegar a cada nivel (no es acumulativo entre niveles).
function calcBonoAsesor(totalPuntos, cfg){
  const comisionVariable = totalPuntos * cfg.valor_punto;
  let garantizado = 0, nivelAlcanzado = 0;
  if(totalPuntos >= cfg.nivel3_pts){ garantizado = cfg.nivel3_bono; nivelAlcanzado = 3; }
  else if(totalPuntos >= cfg.nivel2_pts){ garantizado = cfg.nivel2_bono; nivelAlcanzado = 2; }
  else if(totalPuntos >= cfg.nivel1_pts){ garantizado = cfg.nivel1_bono; nivelAlcanzado = 1; }
  return { comisionVariable, garantizado, bono: comisionVariable+garantizado, nivelAlcanzado };
}
