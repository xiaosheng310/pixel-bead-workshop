'use strict';
const $ = id => document.getElementById(id);
const palette = ['#453934','#865244','#dd643e','#fa9656','#ffd34d','#fff0ba','#d7b789','#af8566','#355349','#54765a','#8ca46a','#c0cf87','#42687d','#82aeb0','#b48da3','#fffaf0'];
const options = {b:['画笔','✎'],e:['橡皮','◇'],g:['填充','▨'],i:['取色','⊙'],r:['同色替换','⇄']};
const key = 'pixel-studio.draft.v1';
let n = 32, title = '林间红菇', cells = Array(n*n).fill(null);
let editLink = null, drawingRef=null, beadLimit=16;
let tool = 'b', color = palette[2], stroke = null, history = [], cursor = -1;
const canvas = $('canvas');
function mushroom() {
  const sprite = [
    '........OOOOOO........','......OORRHHWWOO......','.....ORRRHHHWWRRO.....',
    '....ORRWWWHHRRRRRO....','...ORRWWWWRRRRRWWRO...','..ORRRRWWRRRRRWWWWRO..',
    '.ORRRRRRRRWWRRRWWRRRO.','ORRWWRRRRWWWWRRRRRRRRO','ORWWWWRRRRWWRRRRWWRRRO',
    'ORRWWRRRRRRRRRRWWWWRRO','OSRRRRRRRRRRRRRRWWRRSO','.OSSSRRRRRRRRRRRRSSSO.',
    '..OOOSSSSSSSSSSSSOOO..','.....OOOOOOOOOOOO.....','........OTTTTO........',
    '........OTWTTO........','........OTWTTO........','.......OTWWTTTO.......',
    '.......OTWWTTTO.......','......OTWWWWTTTO......','......OTTWWWTTTO......',
    '.......OOOOOOOO.......'];
  const colors = {O:palette[0],R:palette[2],H:palette[3],W:palette[5],S:palette[1],T:palette[6]};
  sprite.forEach((row,y)=>Array.from(row).forEach((letter,x)=>{
    if(colors[letter]) cells[(y+4)*n+x+5] = colors[letter];
  }));
  const ground = ['..g...h.............g...', '...ghgg.h........h.ghg..',
    '....GgggGGGGGGGGGgggG...', '......GGgggggggggGG.....','.........GGGGGG.........'];
  ground.forEach((row,y)=>Array.from(row).forEach((v,x)=>{
    const c = {G:palette[8],g:palette[9],h:palette[10]}[v];
    if(c) cells[(y+23)*n+x+4] = c;
  }));
}
function restore() {
  try {
    const draft = JSON.parse(localStorage.getItem(key));
    if(draft && [16,32,64,96,128].includes(draft.n) && typeof draft.title==='string' &&
       Array.isArray(draft.cells) && draft.cells.length===draft.n**2 &&
       draft.cells.every(c=>c===null || /^#[0-9a-f]{6}$/i.test(c))) {
      ({n,title,cells}=draft); editLink=draft.editLink || null; drawingRef=draft.drawingRef||null;beadLimit=validColorLimit(draft.beadLimit); return true;
    }
  } catch { /* A new canvas is usable when storage is unavailable. */ }
  mushroom(); return false;
}
function save() {
  try {localStorage.setItem(key,JSON.stringify({n,title,cells,editLink,drawingRef,beadLimit})); $('status').textContent='● 已保存到本机';}
  catch {$('status').textContent='本机存储不可用，请导出作品';}
}
function render() {
  if(canvas.width!==n || canvas.height!==n) canvas.width=canvas.height=n;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,n,n);
  cells.forEach((c,k)=>{if(c){ctx.fillStyle=c;ctx.fillRect(k%n,Math.floor(k/n),1,1);}});
  const preview=$('preview');
  preview.width=preview.height=n;
  preview.getContext('2d').drawImage(canvas,0,0);
  document.dispatchEvent(new Event('preview-rendered'));
  $('title').textContent=title; $('size').textContent=n+' × '+n+' PX';
  $('grid').style.backgroundSize=(100/n)+'% '+(100/n)+'%';
}
function showHistory() {
  document.dispatchEvent(new Event('pixels-rendered'));
  $('undo').disabled=cursor<=0; $('redo').disabled=cursor===history.length-1;
  $('history').replaceChildren(...history.slice(Math.max(0,cursor-3),cursor+1).reverse().map(step=>{
    const li=document.createElement('li');li.textContent=step.label;return li;
  }));
}
function commit(label) {
  history.splice(cursor+1);
  history.push({label,n,beadLimit,cells:cells.slice()});
  if(history.length>50) history.shift();
  cursor=history.length-1;showHistory();save();
}
function travel(delta) {
  const next=cursor+delta;
  if(stroke || next<0 || next>=history.length) return;
  const resized=n!==history[next].n;cursor=next;n=history[next].n;beadLimit=history[next].beadLimit;cells=history[next].cells.slice();render();if(resized)resetView();showHistory();save();
}
function chooseTool(id) {
  tool=id;
  for(const btn of $('tools').children){
    const on=btn.dataset.tool===id;btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',on);
  }
}
function chooseColor(value) {
  color=value.toLowerCase();$('color').value=color;$('hex').textContent=color.toUpperCase();
  for(const btn of $('swatches').children) btn.classList.toggle('chosen',btn.dataset.color===color);
}
Object.entries(options).forEach(([id,[name,icon]])=>{
  const btn=document.createElement('button');btn.dataset.tool=id;
  btn.innerHTML='<span class="toolicon" aria-hidden="true">'+icon+'</span>'+name+'<kbd>'+id.toUpperCase()+'</kbd>';
  btn.onclick=()=>chooseTool(id);$('tools').append(btn);
});
palette.forEach(c=>{
  const btn=document.createElement('button');btn.className='swatch';btn.dataset.color=c;
  btn.style.backgroundColor=c;btn.title=c;btn.setAttribute('aria-label','选择颜色 '+c);
  btn.onclick=()=>chooseColor(c);$('swatches').append(btn);
});
function point(event) {
  const r=canvas.getBoundingClientRect();
  return [Math.floor((event.clientX-r.left)*n/r.width),Math.floor((event.clientY-r.top)*n/r.height)];
}
function inside(x,y) {return x>=0 && x<n && y>=0 && y<n;}
function fill(x,y) {
  const start=y*n+x, target=cells[start];
  if(target===color) return false;
  const stack=[start];cells[start]=color;
  while(stack.length) {
    const k=stack.pop(), col=k%n, row=Math.floor(k/n);
    for(const [a,b] of [[col-1,row],[col+1,row],[col,row-1],[col,row+1]]) {
      const i=b*n+a;
      if(inside(a,b) && cells[i]===target){cells[i]=color;stack.push(i);}
    }
  }
  return true;
}
// Interpolate successive pointer positions so fast strokes remain connected.
function paintTo(x,y) {
  const [px,py]=stroke.last, steps=Math.max(1,Math.abs(x-px),Math.abs(y-py));
  for(let i=0;i<=steps;i++) {
    const a=Math.round(px+(x-px)*i/steps), b=Math.round(py+(y-py)*i/steps);
    if(inside(a,b) && cells[b*n+a]!==stroke.ink){cells[b*n+a]=stroke.ink;stroke.changed=true;}
  }
  stroke.last=[x,y];render();
}
const viewport = $('viewport');
const levels = [0.5, 1, 1.5, 2, 3, 4, 6, 8];
let zoomIndex = 1;
let cellX = 0, cellY = 0;
function markCell(x, y, follow = false) {
  cellX = Math.max(0, Math.min(n-1, x));
  cellY = Math.max(0, Math.min(n-1, y));
  const mark = $('cellCursor');
  mark.hidden = false;
  Object.assign(mark.style, {
    left: (100*cellX/n)+'%', top: (100*cellY/n)+'%',
    width: (100/n)+'%', height: (100/n)+'%'
  });
  $('position').textContent = '列 '+(cellX+1)+' · 行 '+(cellY+1);
  Object.assign($('refMark').style,{left:mark.style.left,top:mark.style.top,width:mark.style.width,height:mark.style.height});
  if (!follow) return;
  const cell = mark.getBoundingClientRect(), view = viewport.getBoundingClientRect();
  const dx = Math.min(0,cell.left-view.left) + Math.max(0,cell.right-view.left-viewport.clientWidth);
  const dy = Math.min(0,cell.top-view.top) + Math.max(0,cell.bottom-view.top-viewport.clientHeight);
  viewport.scrollBy(dx,dy);
}
function setZoom(index) {
  zoomIndex = index;
  $('surface').style.setProperty('--zoom',levels[index]);
  $('scale').textContent = levels[index]*100+'%';
  $('smaller').disabled = index===0;
  $('larger').disabled = index===levels.length-1;
  markCell(cellX,cellY,true);
}
$('larger').onclick = () => setZoom(zoomIndex+1);
$('smaller').onclick = () => setZoom(zoomIndex-1);
$('scale').onclick = () => setZoom(1);
function resetView() {
  cellX = cellY = Math.floor(n/2);
  setZoom(n>=96 ? 5 : n===64 ? 3 : 1);
}
function useTool(id,x,y) {
  if(tool==='r'){
    const old=cells[y*n+x];if(!old || old===color)return;
    cells=cells.map(c=>c===old?color:c);render();commit('同色替换');return;
  }
  if(tool==='i'){const c=cells[y*n+x]||traceColorAt(x,y);if(c){chooseColor(c);chooseTool('b');}return;}
  if(tool==='g'){if(fill(x,y)){render();commit('填充连通区域');}return;}
  stroke={id,last:[x,y],ink:tool==='e'?null:color,label:tool==='e'?'擦除像素':'画笔描绘',changed:false};
  paintTo(x,y);
}
function finishStroke() {
  if(stroke?.changed) commit(stroke.label);
  stroke=null;
}
canvas.onpointerdown=e=>{
  if(e.button!==0 || stroke) return;
  const [x,y]=point(e);if(!inside(x,y)) return;
  canvas.focus({preventScroll:true});
  markCell(x,y);
  useTool(e.pointerId,x,y);
  if(stroke) canvas.setPointerCapture(e.pointerId);
};
function trackPointer(e) {
  if(stroke && stroke.id!==e.pointerId) return;
  const view=viewport.getBoundingClientRect();
  if(e.clientX<view.left || e.clientY<view.top || e.clientX>=view.left+viewport.clientWidth || e.clientY>=view.top+viewport.clientHeight) return;
  const [x,y]=point(e);
  if(!inside(x,y)) return;
  markCell(x,y);
  if(stroke) paintTo(x,y);
}
canvas.onpointermove=trackPointer;
function endStroke(e) {
  if(stroke?.id!==e.pointerId) return;
  if(e.type==='pointerup') trackPointer(e);
  finishStroke();
}
canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=endStroke;
const directions = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
document.addEventListener('keydown',e=>{
  if($('editorPage').hidden || document.querySelector('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey || e.target.matches('input,select,textarea,[contenteditable=true]')) return;
  if(stroke && stroke.id!=='keyboard') return;
  const step=directions[e.key];
  if(step){
    e.preventDefault();
    canvas.focus({preventScroll:true});
    markCell(cellX+step[0],cellY+step[1],true);
    if(stroke) paintTo(cellX,cellY);
  } else if(e.code==='Space' && e.target===canvas){
    e.preventDefault();
    if(!e.repeat && !stroke) useTool('keyboard',cellX,cellY);
  }
});
function releaseKeyboard(){if(stroke?.id==='keyboard') finishStroke();}
window.addEventListener('keyup',e=>{if(e.code==='Space') releaseKeyboard();});
window.addEventListener('blur',releaseKeyboard);
canvas.addEventListener('blur',releaseKeyboard);
$('undo').onclick=()=>travel(-1);$('redo').onclick=()=>travel(1);
$('color').oninput=e=>chooseColor(e.target.value);
$('showgrid').onchange=e=>$('grid').hidden=!e.target.checked;
$('new').onclick=()=>{$('dialog').returnValue='';$('dialog').showModal();};
$('dimension').onchange=e=>$('dimlabel').textContent=e.target.value;
$('dialog').onclose=()=>{
  if($('dialog').returnValue!=='create') return;
  n=Number($('dimension').value);title='未命名作品';cells=Array(n*n).fill(null);
  editLink=null;drawingRef=null;beadLimit=16;document.dispatchEvent(new Event('reference-changed'));history=[];cursor=-1;render();resetView();commit('新建画布');
};
$('export').onclick=()=>{
  const out=document.createElement('canvas');out.width=out.height=n*16;
  const ctx=out.getContext('2d');ctx.imageSmoothingEnabled=false;
  ctx.drawImage(canvas,0,0,out.width,out.height);
  const link=document.createElement('a');link.download=title+'.png';link.href=out.toDataURL('image/png');link.click();
};
document.addEventListener('keydown',e=>{
  if($('editorPage').hidden || document.querySelector('dialog[open]') || e.target.matches('input,select,textarea') || stroke || e.altKey) return;
  const k=e.key.toLowerCase();
  if(e.ctrlKey || e.metaKey){if(k==='z'){e.preventDefault();travel(e.shiftKey?1:-1);}return;}
  if(Object.hasOwn(options,k)) chooseTool(k);
});
const resumed=restore();chooseTool('b');chooseColor(color);render();resetView();commit(resumed?'恢复本地草稿':'打开林间红菇');




