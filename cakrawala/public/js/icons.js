// Local SVG icon set: no font, CDN, image generator, or network dependency.
(()=>{
const paths={
 '↗':'M7 17 17 7M7 7h10v10','↘':'M7 7 17 17M7 17h10V7','↓':'M12 4v16M6 14l6 6 6-6','↻':'M20 7v5h-5M20 12a8 8 0 1 1-2.5-6',
 '◫':'M3 4h18v16H3zM9 4v16M9 10h12','▦':'M3 4h18v16H3zM3 10h18M9 4v16M15 4v16','▤':'M4 3h16v18H4zM8 8h8M8 12h8M8 16h5',
 '⌁':'M3 17 8 11 12 14 17 6 21 9','≎':'M4 5h16M7 12h13M4 19h16M8 3v4M16 10v4M10 17v4','▱':'M4 7h16v13H4zM8 7V4h8v3M4 12h16',
 '▥':'M4 3h16v18H4zM8 7h8M8 11h3M8 15h8','⌘':'M8 8h8v8H8zM8 8V5a2 2 0 1 0-2 2h2M16 8h3a2 2 0 1 0-2-2v2M16 16v3a2 2 0 1 0 2-2h-2M8 16H5a2 2 0 1 0 2 2v-2',
 '✧':'m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3z','✦':'m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3z','⤴':'M4 18 12 10h7M15 6l4 4-4 4M4 21h16','ƒ':'M16 4h-3l-3 16H7M6 10h11','⛓':'m9 15 6-6M8 11l-2 2a4 4 0 0 0 5 5l2-2M16 13l2-2a4 4 0 0 0-5-5l-2 2','⤢':'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5','☆':'m12 3 2.8 5.7L21 9.6l-4.5 4.3 1 6.1-5.5-2.9L6.5 20l1-6.1L3 9.6l6.2-.9z','★':'m12 3 2.8 5.7L21 9.6l-4.5 4.3 1 6.1-5.5-2.9L6.5 20l1-6.1L3 9.6l6.2-.9z','＋':'M12 4v16M4 12h16'};
const regex=/[↗↘↓↻◫▦▤⌁≎▱▥⌘✧⤴ƒ⛓⤢☆★＋✦]/u;
function decorate(root){if(root.nodeType===3){if(root.parentElement?.closest('script,style,textarea,input,select,code,pre,.cu-icon')||!regex.test(root.textContent))return;const frag=document.createDocumentFragment();for(const piece of root.textContent.split(/([↗↘↓↻◫▦▤⌁≎▱▥⌘✧⤴ƒ⛓⤢☆★＋✦])/u)){if(paths[piece]){const span=document.createElement('span');span.className='cu-icon';span.setAttribute('aria-hidden','true');span.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="'+(piece==='★'?'currentColor':'none')+'" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="'+paths[piece]+'"/></svg>';frag.append(span);}else frag.append(document.createTextNode(piece));}root.replaceWith(frag);}else if(root.nodeType===1&&!root.matches('script,style,textarea,input,select,svg,.cu-icon')){for(const child of [...root.childNodes])decorate(child);}}
document.addEventListener('DOMContentLoaded',()=>{decorate(document.body);new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.isConnected)decorate(node);}).observe(document.body,{childList:true,subtree:true});});
})();
