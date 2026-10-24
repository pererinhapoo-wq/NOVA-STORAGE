/**
 * Código e instruções do Bookmarklet "NOVA Sniffer" para navegadores móveis (Brave / Chrome / Kiwi / Firefox no Android).
 *
 * Princípios de Segurança e Conformidade:
 * 1. Opera exclusivamente em memória na página aberta pelo usuário.
 * 2. Inspeciona apenas tags <video>, <source>, iframes (<iframe src/data-src>) e entradas de rede HTTP(S) no window.performance.
 * 3. Valida rigorosamente apenas protocolos 'http:' e 'https:'.
 * 4. Não lê nem armazena cookies (document.cookie), senhas, tokens de autorização ou dados de sessão.
 * 5. Não contorna DRM, CAPTCHAs nem firewalls anti-bot.
 * 6. Não faz requisições automáticas a servidores de terceiros.
 */

export interface SnifferCapturedMediaMetadata {
  streamUrl?: string;
  downloadUrl?: string;
  type?: string;
  originUrl: string;
  originTitle: string;
  capturedAt: string;
}

export const BOOKMARKLET_MINIFIED_CODE =
  "javascript:(function(){const I='nova-storage-sniffer-modal';const prev=document.getElementById(I);if(prev){prev.remove();return;}const u=new Set(),ifr=new Set();function pU(l){if(!l||typeof l!=='string')return null;const t=l.trim();if(!t.startsWith('http://')&&!t.startsWith('https://'))return null;try{const p=new URL(t,window.location.href);return(p.protocol==='http:'||p.protocol==='https:')?p:null;}catch(x){return null;}}function isM(s){s=(s||'').toLowerCase();return s.includes('.m3u8')||s.includes('.mp4')||s.includes('.webm')||s.includes('.mkv')||s.includes('.mpd')||s.includes('mime=video')||s.includes('format=hls');}function a(l){const p=pU(l);if(p)u.add(p.href);}function addIfr(l){const p=pU(l);if(!p)return;const h=p.hostname.toLowerCase();if(h.includes('doubleclick')||h.includes('googlesyndication')||h.includes('googleads')||h.includes('facebook')||h.includes('disqus'))return;if(isM(p.pathname)||isM(p.search))u.add(p.href);else ifr.add(p.href);}document.querySelectorAll('video').forEach(function(v){if(v.src)a(v.src);if(v.currentSrc)a(v.currentSrc);});document.querySelectorAll('video source,source').forEach(function(s){if(s.src)a(s.src);});try{if(window.performance&&typeof performance.getEntriesByType==='function'){performance.getEntriesByType('resource').forEach(function(r){if(isM(r.name))a(r.name);});}}catch(x){}const at=['src','data-src','data-lazy-src','data-player','data-player-url','data-url','data-iframe-src'];document.querySelectorAll('iframe').forEach(function(f){at.forEach(function(k){addIfr(f.getAttribute(k)||f[k]);});});document.querySelectorAll('[data-player],[data-player-url],[data-iframe-src]').forEach(function(e){at.forEach(function(k){addIfr(e.getAttribute(k));});});function cl(l){let t='Poss\\u00edvel m\\u00eddia',c='#8b949e';try{const p=new URL(l),pn=p.pathname.toLowerCase(),ps=p.search.toLowerCase();if(pn.endsWith('.m3u8')){t='HLS';c='#388bfd';}else if(pn.endsWith('.mp4')){t='MP4';c='#2ea043';}else if(pn.endsWith('.webm')){t='WebM';c='#f0883e';}else if(pn.endsWith('.mkv')||pn.endsWith('.mpd')){t='MKV/DASH';c='#a371f7';}else if(ps.includes('.m3u8')||ps.includes('.mp4')||ps.includes('mime=video')){t='Par\\u00e2metro m\\u00eddia';c='#d29922';}}catch(x){}return{t:t,c:c};}function cd(t,c,b,u){return '<div class=\\\"c\\\"><div class=\\\"r\\\"><span style=\\\"font-size:10px;font-weight:bold;color:'+c+';background:'+c+'22;padding:1px 5px;border-radius:3px;\\\">'+t+'</span>'+b+'</div><div class=\\\"m\\\">'+u+'</div></div>';}function btn(u){return '<button class=\\\"b ns-cpy\\\" data-url=\\\"'+encodeURIComponent(u)+'\\\">Copiar</button>';}const c=document.createElement('div');c.id=I;c.className='nsm';let h='<style>.nsm{position:fixed;top:14px;left:14px;right:14px;max-width:440px;max-height:90vh;overflow-y:auto;margin:0 auto;z-index:2147483647;background:#0d1117;color:#f0f6fc;font-family:sans-serif;font-size:12px;border:1px solid #30363d;border-radius:12px;box-shadow:0 12px 36px #000;padding:14px;box-sizing:border-box;line-height:1.4}.nsm .c{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:6px 8px;display:flex;flex-direction:column;gap:4px}.nsm .b{background:#21262d;border:1px solid #30363d;color:#58a6ff;font-size:11px;padding:3px 8px;border-radius:4px;cursor:pointer}.nsm .a{background:#1f6feb;border:1px solid #388bfd;color:#fff;font-size:11px;font-weight:600;padding:3px 8px;border-radius:4px;text-decoration:none;display:inline-flex;align-items:center;white-space:nowrap}.nsm .m{font-family:monospace;font-size:10px;color:#8b949e;word-break:break-all;max-height:36px;overflow:hidden}.nsm .l{max-height:130px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-bottom:10px}.nsm .r{display:flex;align-items:center;justify-content:space-between;gap:6px}.nsm .e{background:#161b22;padding:8px 10px;border-radius:6px;border:1px solid #30363d;color:#8b949e;font-size:11px}</style><div class=\\\"r\\\" style=\\\"margin-bottom:4px;\\\"><div style=\\\"display:flex;align-items:center;gap:6px;\\\"><span style=\\\"background:#0891b2;color:#fff;font-weight:bold;font-size:11px;padding:2px 6px;border-radius:4px;\\\">NOVA</span><strong style=\\\"color:#22d3ee;font-size:13px;\\\">Detector de M\\u00eddia</strong></div><button id=\\\"ns-close\\\" style=\\\"background:transparent;border:none;color:#8b949e;font-size:18px;cursor:pointer;padding:0 4px;line-height:1;\\\">&times;</button></div><div class=\\\"r\\\" style=\\\"margin-bottom:8px;font-size:11px;color:#8b949e;\\\"><span><strong>'+u.size+'</strong> stream(s) \\u00b7 <strong>'+ifr.size+'</strong> player(s)</span></div><div class=\\\"r\\\" style=\\\"margin-top:6px;margin-bottom:4px;\\\"><strong style=\\\"font-size:11px;color:#58a6ff;\\\">\\ud83d\\udce1 URLs de Stream Direto</strong><span style=\\\"font-size:10px;color:#8b949e;\\\">'+u.size+' item(ns)</span></div><div class=\\\"l\\\" id=\\\"ns-list\\\">';if(u.size===0){h+='<div class=\\\"e\\\">\\u26a0\\ufe0f <strong>Nenhuma fonte direta exposta no momento</strong><br><span style=\\\"font-size:10px;color:#6e7681;\\\">Se o v\\u00eddeo roda dentro de um player incorporado, confira a se\\u00e7\\u00e3o abaixo.</span></div>';}else{u.forEach(function(url){const inf=cl(url);h+=cd(inf.t,inf.c,btn(url),url);});}h+='</div><div class=\\\"r\\\" style=\\\"margin-top:8px;margin-bottom:4px;\\\"><strong style=\\\"font-size:11px;color:#e3b341;\\\">\\u25b6\\ufe0f Player Incorporado Detectado</strong><span style=\\\"font-size:10px;color:#e3b341;\\\">'+ifr.size+' player(s)</span></div><div style=\\\"background:#2d2208;border:1px solid #6e4d0f;border-radius:6px;padding:4px 8px;margin-bottom:6px;font-size:10px;color:#f2cc60;line-height:1.3;\\\">\\u26a0\\ufe0f <strong>Player em iframe externo.</strong> O navegador isola o v\\u00eddeo por seguran\\u00e7a (Same-Origin). Toque em <strong>Abrir Player em Nova Aba</strong> para rodar a Sniffer diretamente nele.</div><div class=\\\"l\\\" id=\\\"ns-ifr-list\\\">';if(ifr.size===0){h+='<div class=\\\"e\\\">Nenhum player incorporado (iframe) identificado nesta p\\u00e1gina.</div>';}else{ifr.forEach(function(url){let host='player';try{host=new URL(url).hostname;}catch(x){}const ab='<div style=\\\"display:flex;gap:4px;\\\"><a class=\\\"a\\\" href=\\\"'+url+'\\\" target=\\\"_blank\\\" rel=\\\"noopener noreferrer\\\">Abrir Player em Nova Aba \\u2197</a>'+btn(url)+'</div>';h+=cd('\\u25b6\\ufe0f '+host,'#e3b341',ab,url);});}h+='</div><div style=\\\"font-size:10px;color:#8b949e;border-top:1px solid #21262d;padding-top:6px;\\\"><span style=\\\"color:#8b949e;\\\">\\ud83d\\udd12 Somente URLs HTTP/HTTPS. Sem cookies.</span></div>';c.innerHTML=h;document.body.appendChild(c);document.getElementById('ns-close').onclick=function(){c.remove();};c.querySelectorAll('.ns-cpy').forEach(function(b){b.onclick=function(){const v=decodeURIComponent(this.getAttribute('data-url'));if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(v);}else{const ta=document.createElement('textarea');ta.value=v;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}this.textContent='Copiado!';this.style.background='#238636';this.style.color='#fff';const self=this;setTimeout(function(){self.textContent='Copiar';self.style.background='#21262d';self.style.color='#58a6ff';},2000);};});})();";

export interface BookmarkletStep {
  stepNumber: number;
  title: string;
  instruction: string;
  detail: string;
}

export const BRAVE_BOOKMARKLET_STEPS: BookmarkletStep[] = [
  {
    stepNumber: 1,
    title: 'Copiar o Código do Bookmarklet',
    instruction: 'Toque no botão "Copiar Bookmarklet" abaixo para transferir o código JavaScript para sua área de transferência.',
    detail: 'O código inicia com "javascript:(function(){...})".'
  },
  {
    stepNumber: 2,
    title: 'Criar um Favorito Qualquer no Brave',
    instruction: 'No Brave para Android, abra qualquer página web, toque no menu de 3 pontos (canto inferior ou superior) e toque no ícone de Estrela para adicionar aos favoritos.',
    detail: 'Isso cria um favorito temporário que você irá editar no próximo passo.'
  },
  {
    stepNumber: 3,
    title: 'Editar o Favorito para Transformar em Bookmarklet',
    instruction: 'Abra Menu > Favoritos no Brave, localize o favorito recém-criado, toque nos 3 pontinhos ao lado dele e selecione "Editar".',
    detail: 'Altere o Nome para "NOVA Sniffer" e, no campo URL, apague todo o endereço e cole o código copiado.'
  },
  {
    stepNumber: 4,
    title: 'Executar na Página do Episódio',
    instruction: 'Abra a página do episódio no Brave e dê Play no vídeo (para iniciar o buffer). Depois, toque na barra de endereços, digite "NOVA Sniffer" e toque no favorito correspondente.',
    detail: 'O painel exibirá as URLs de stream (.m3u8/.mp4) encontradas ou players incorporados detectados (com opção de "Abrir Player em Nova Aba" para rodar a Sniffer diretamente neles).'
  }
];
