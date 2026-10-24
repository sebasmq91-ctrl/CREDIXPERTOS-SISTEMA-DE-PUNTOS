// movil.js — Convierte las pantallas en app instalable y ayuda a verlas bien en el celular.
//  - Enlaza el manifest y registra el service worker.
//  - Etiqueta las celdas de las tablas (para mostrarlas como tarjetas en pantallas pequeñas).
//  - Muestra una barra con instrucciones para instalar la app.
(function(){
  var head = document.head;
  function meta(n,c){ if(!document.querySelector('meta[name="'+n+'"]')){ var m=document.createElement('meta'); m.name=n; m.content=c; head.appendChild(m); } }
  function link(rel,href,extra){ if(!document.querySelector('link[rel="'+rel+'"]')){ var l=document.createElement('link'); l.rel=rel; l.href=href; if(extra) for(var k in extra) l.setAttribute(k,extra[k]); head.appendChild(l); } }
  link('manifest','manifest.webmanifest');
  link('apple-touch-icon','apple-touch-icon.png');
  meta('theme-color','#16293A');
  meta('mobile-web-app-capable','yes');
  meta('apple-mobile-web-app-capable','yes');
  meta('apple-mobile-web-app-title','Credixpertos');
  meta('apple-mobile-web-app-status-bar-style','black-translucent');

  if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')){
    window.addEventListener('load', function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); });
  }

  // ---- Etiquetas de celdas: cada td toma el nombre de su columna ----
  function etiquetar(){
    document.querySelectorAll('table').forEach(function(t){
      var ths = Array.prototype.map.call(t.querySelectorAll('thead th'), function(th){ return th.textContent.trim(); });
      if(!ths.length) return;
      t.querySelectorAll('tbody tr').forEach(function(tr){
        var col = 0;
        Array.prototype.forEach.call(tr.children, function(td){
          if(td.tagName!=='TD') return;
          if(td.colSpan>1){ col += td.colSpan; return; }
          var et = ths[col] || '';
          if(td.getAttribute('data-label')!==et) td.setAttribute('data-label', et);
          col++;
        });
      });
    });
  }
  var pendiente = false;
  function programar(){ if(pendiente) return; pendiente = true; requestAnimationFrame(function(){ pendiente=false; etiquetar(); }); }
  document.addEventListener('DOMContentLoaded', function(){
    etiquetar();
    new MutationObserver(programar).observe(document.body, { childList:true, subtree:true });
  });

  // ---- Barra de instalación ----
  var instalada = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if(instalada){ document.documentElement.classList.add('app-instalada'); return; }
  var esMovil = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  if(!esMovil) return;
  var CLAVE = 'cx_instalar_oculto';
  try{ var t = parseInt(localStorage.getItem(CLAVE)||'0',10); if(t && Date.now()-t < 14*24*3600*1000) return; }catch(e){}

  var promptInstalar = null;
  window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); promptInstalar = e; pintar(); });
  var barra = null;
  function pintar(){
    if(!document.body) return;
    if(!barra){ barra = document.createElement('div'); barra.className = 'cx-instalar'; document.body.insertBefore(barra, document.body.firstChild); }
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    var texto, boton = '';
    if(promptInstalar){ texto = '<b>Instala la app</b> de Credixpertos en tu celular.'; boton = '<button class="cx-ok" id="cxInst">Instalar</button>'; }
    else if(ios){ texto = '<b>Instala la app:</b> toca el botón Compartir y luego "Agregar a pantalla de inicio".'; }
    else { texto = '<b>Instala la app:</b> abre el menú del navegador (tres puntos) y elige "Instalar app" o "Agregar a pantalla de inicio".'; }
    barra.innerHTML = '<div class="cx-txt">'+texto+'</div>'+boton+'<button class="cx-x" id="cxCerrar" aria-label="Cerrar">&times;</button>';
    var b = document.getElementById('cxInst');
    if(b) b.onclick = function(){ promptInstalar.prompt(); promptInstalar.userChoice.finally(function(){ promptInstalar=null; quitar(false); }); };
    document.getElementById('cxCerrar').onclick = function(){ quitar(true); };
  }
  function quitar(recordar){
    if(barra){ barra.remove(); barra = null; }
    if(recordar){ try{ localStorage.setItem(CLAVE, String(Date.now())); }catch(e){} }
  }
  document.addEventListener('DOMContentLoaded', pintar);
})();
