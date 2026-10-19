/**
 * Código e instruções do Bookmarklet "NOVA Sniffer" para navegadores móveis (Brave / Chrome / Kiwi / Firefox no Android).
 *
 * Princípios de Segurança e Conformidade:
 * 1. Opera exclusivamente em memória na página aberta pelo usuário.
 * 2. Inspeciona apenas tags <video>, <source> e entradas de rede HTTP(S) no window.performance.
 * 3. Valida rigorosamente apenas protocolos 'http:' e 'https:'.
 * 4. Não lê nem armazena cookies (document.cookie), senhas, tokens de autorização ou dados de sessão.
 * 5. Não contorna DRM, CAPTCHAs nem firewalls anti-bot.
 * 6. Não faz requisições automáticas a servidores de terceiros.
 */

export const BOOKMARKLET_MINIFIED_CODE =
  "javascript:(function(){const I='nova-storage-sniffer-modal';const e=document.getElementById(I);if(e){e.remove();return;}const u=new Map();function a(l,ini){if(!l||typeof l!=='string')return;const t=l.trim();if(!t.startsWith('http://')&&!t.startsWith('https://'))return;try{const p=new URL(t,window.location.href);if(p.protocol==='http:'||p.protocol==='https:'){if(!u.has(p.href)){u.set(p.href,{url:p.href,ini:ini||''});}}}catch(x){}}document.querySelectorAll('video').forEach(v=>{if(v.src)a(v.src,'video');if(v.currentSrc)a(v.currentSrc,'video');});document.querySelectorAll('video source,source').forEach(s=>{if(s.src)a(s.src,'source');});try{if(window.performance&&typeof performance.getEntriesByType==='function'){performance.getEntriesByType('resource').forEach(r=>{const n=(r.name||'').toLowerCase();if(n.includes('.m3u8')||n.includes('.mp4')||n.includes('.webm')||n.includes('.mpd')||n.includes('mime=video')||n.includes('format=hls')){a(r.name,r.initiatorType||'rede');}});}}catch(x){}let ifrCount=0;try{ifrCount=document.querySelectorAll('iframe').length;}catch(x){}const list=Array.from(u.values());const hasSubdoc=list.some(i=>i.ini==='subdocument');const c=document.createElement('div');c.id=I;c.style.cssText='position:fixed;top:14px;left:14px;right:14px;max-width:440px;margin:0 auto;z-index:2147483647;background:#0d1117;color:#f0f6fc;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:12px;border:1px solid #30363d;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,0.85);padding:14px;box-sizing:border-box;line-height:1.4;';let h='<div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;\"><div style=\"display:flex;align-items:center;gap:6px;\"><span style=\"background:#0891b2;color:#fff;font-weight:bold;font-size:11px;padding:2px 6px;border-radius:4px;\">NOVA</span><strong style=\"color:#22d3ee;font-size:13px;\">Detector de M\u00eddia</strong></div><button id=\"ns-close\" style=\"background:transparent;border:none;color:#8b949e;font-size:18px;cursor:pointer;padding:0 4px;line-height:1;\">&times;</button></div>';h+='<div style=\"display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px;font-size:11px;color:#8b949e;\"><span><strong>'+list.length+'</strong> URL(s) \u00fanica(s) \u00b7 Captura pontual</span><span>'+(ifrCount>0?ifrCount+' iframe(s) na p\u00e1gina':'Sem iframes')+'</span></div>';if(hasSubdoc){h+='<div style=\"font-size:10px;color:#d29922;background:#2d2208;border:1px solid #6e4d0f;border-radius:6px;padding:4px 8px;margin-bottom:8px;\">\u2139\ufe0f A p\u00e1gina possui recursos associados a documentos incorporados (subdocument).</div>';}if(list.length===0){h+='<div style=\"background:#161b22;padding:10px;border-radius:8px;border:1px solid #30363d;color:#c9d1d9;margin-bottom:10px;\">\u26a0\ufe0f <strong>Nenhuma fonte direta exposta no momento</strong><br><span style=\"font-size:11px;color:#8b949e;\">Captura pontual realizada. Toque no Play do v\u00eddeo no site, aguarde alguns segundos de buffer e acione o favorito novamente.'+(ifrCount>0?' ('+ifrCount+' iframe(s) detectado(s) no DOM)':'')+'</span></div>';}else{h+='<div style=\"max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-bottom:10px;\">';list.forEach(item=>{const nl=item.url.toLowerCase();let tag='M\u00eddia';let col='#22d3ee';if(nl.includes('.m3u8')||nl.includes('format=hls')){tag='HLS (.m3u8)';col='#388bfd';}else if(nl.includes('.mpd')){tag='DASH (.mpd)';col='#a371f7';}else if(nl.includes('.webm')){tag='WebM';col='#f0883e';}else if(nl.includes('.mp4')||nl.includes('mime=video')){tag='MP4';col='#2ea043';}h+='<div style=\"background:#161b22;border:1px solid #30363d;border-radius:6px;padding:6px 8px;display:flex;flex-direction:column;gap:4px;\"><div style=\"display:flex;align-items:center;justify-content:space-between;gap:4px;\"><div style=\"display:flex;align-items:center;gap:4px;flex-wrap:wrap;\"><span style=\"font-size:10px;font-weight:bold;color:'+col+';background:'+col+'22;padding:1px 5px;border-radius:3px;\">'+tag+'</span>'+(item.ini?'<span style=\"font-size:9px;color:#8b949e;background:#21262d;padding:1px 4px;border-radius:3px;\">iniciador: '+item.ini+'</span>':'')+'</div><button class=\"ns-cpy\" data-url=\"'+encodeURIComponent(item.url)+'\" style=\"background:#21262d;border:1px solid #30363d;color:#58a6ff;font-size:11px;padding:3px 8px;border-radius:4px;cursor:pointer;\">Copiar</button></div><div style=\"font-family:monospace;font-size:10px;color:#8b949e;word-break:break-all;max-height:36px;overflow:hidden;\">'+item.url+'</div></div>';});h+='</div>';}h+='<div style=\"font-size:10px;color:#8b949e;border-top:1px solid #21262d;padding-top:6px;\">\ud83d\udd12 Somente URLs HTTP/HTTPS. Sem coleta de cookies ou senhas.</div>';c.innerHTML=h;document.body.appendChild(c);document.getElementById('ns-close').onclick=()=>c.remove();c.querySelectorAll('.ns-cpy').forEach(b=>{b.onclick=function(){const val=decodeURIComponent(this.getAttribute('data-url'));if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(val);}else{const t=document.createElement('textarea');t.value=val;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();}this.textContent='Copiado!';this.style.background='#238636';this.style.color='#fff';setTimeout(()=>{this.textContent='Copiar';this.style.background='#21262d';this.style.color='#58a6ff';},2000);};});})();";

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
    detail: 'Um painel abrirá na tela exibindo as URLs de stream (.m3u8/.mp4) encontradas. Toque em "Copiar" e cole no testador acima!'
  }
];
