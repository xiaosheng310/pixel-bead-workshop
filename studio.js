'use strict';
const pages={pattern:$('patternPage'),library:$('libraryPage'),editor:$('editorPage'),collection:$('collectionPage')};
let category='全部';
function button(label, action) {
  const el=document.createElement('button');
  el.type='button';el.textContent=label;el.onclick=action;
  return el;
}
function thumbnail(work) {
  const image=document.createElement('canvas');
  image.width=image.height=work.n;
  const ctx=image.getContext('2d');
  work.cells.forEach((c,k)=>{if(c){ctx.fillStyle=c;ctx.fillRect(k%work.n,Math.floor(k/work.n),1,1);}});
  image.setAttribute('aria-label',work.title);
  return image;
}
function card(work,info,actions) {
  const article=document.createElement('article'), art=document.createElement('div');
  article.className='card';art.className='card-art';art.append(thumbnail(work));
  const body=document.createElement('div'), name=document.createElement('h3'), caption=document.createElement('p');
  body.className='card-body';name.textContent=work.title;caption.textContent=info;
  const controls=document.createElement('div');controls.className='card-controls';controls.append(...actions);
  body.append(name,caption,controls);article.append(art,body);return article;
}
function openWork(work,label,link=null) {
  if(!window.confirm('打开「'+work.title+'」会替换当前工作台草稿。继续吗？')) return;
  editLink=link;drawingRef=work.drawingRef||referenceForWork(work);beadLimit=validColorLimit(work.paired?.limit);
  document.dispatchEvent(new Event('reference-changed'));location.hash='editor';showPage();
  n=work.n;cells=work.cells.slice();title=work.title;history=[];cursor=-1;
  chooseTool('b');render();resetView();commit(label);return true;
}
function populateLibrary() {
  const query=$('searchArt').value.trim().toLowerCase();
  const matches=postcards.filter(p=>(category==='全部'||p.category===category) &&
    [p.title,p.category,p.description].join(' ').toLowerCase().includes(query));
  $('libraryCards').replaceChildren(...matches.map(p=>card(p,p.category+' · '+p.numColors+' 色 · '+p.count+' 颗　'+p.description,[
    button('使用底稿',()=>openWork(p,'载入素材'))
  ])));
  if(!matches.length) $('libraryCards').textContent='没有符合条件的素材，请更换关键词或分类。';
  for(const el of $('filters').children) el.setAttribute('aria-pressed',String(el.textContent===category));
}
for(const name of ['全部',...new Set(postcards.map(p=>p.category))]){
  $('filters').append(button(name,()=>{category=name;populateLibrary();}));
}
$('searchArt').oninput=populateLibrary;
$('heroArt').append(thumbnail(postcards[0]));
$('featured').onclick=()=>openWork(postcards[0],'载入素材');
function transform(label, destination){
  const result=new Array(n*n);
  cells.forEach((color,k)=>{result[destination(k%n,Math.floor(k/n))]=color;});
  if(!result.some((c,k)=>c!==cells[k])) return;
  cells=result;render();commit(label);
}
$('rotate').onclick=()=>transform('顺时针旋转',(x,y)=>x*n+n-1-y);
$('flip').onclick=()=>transform('水平翻转',(x,y)=>y*n+n-1-x);
function updateColors(){
  const counts=new Map();
  for(const c of cells) if(c) counts.set(c,(counts.get(c)||0)+1);
  const sorted=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
  $('usedColors').replaceChildren(...sorted.map(([c,count])=>{
    const el=button('',()=>chooseColor(c));el.style.background=c;el.title=c+' · '+count+' 格';
    el.setAttribute('aria-label',el.title);return el;
  }));
  if(!sorted.length) $('usedColors').textContent='画布尚未着色';
}
document.addEventListener('pixels-rendered',updateColors);
updateColors();
let dbPromise;
function database(){
  if(!dbPromise) dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open('pixel-studio-collection',5);
    req.onupgradeneeded=event=>{
      const db=req.result;
      const works=db.objectStoreNames.contains('works')?req.transaction.objectStore('works'):db.createObjectStore('works',{keyPath:'id',autoIncrement:true});
      if(event.oldVersion<2)db.createObjectStore('originals');
      if(event.oldVersion){
        const scan=works.openCursor();
        scan.onsuccess=()=>{
          const row=scan.result;if(!row)return;
          const w=row.value;
          if(w.kind==='示例'&&retiredSamples.has(w.title)&&!w.updated&&!w.favorite&&!w.revision&&!w.paired&&!w.hasOriginal)row.delete();
          else{
            let changed=false;
            for(const key of ['preview','referencePath','referenceThumb','referenceSnapshot']){
              if(offlineImages[w[key]]){w[key]=offlineImages[w[key]];changed=true;}
            }
            if(offlineImages[w.drawingRef?.url]){w.drawingRef.url=offlineImages[w.drawingRef.url];changed=true;}
            if(changed)row.update(w);
          }
          row.continue();
        };
      }
      // Insert in reverse so the featured pattern is first under recent sorting.
      const now=Date.now();
      for(const p of [...postcards].reverse()){
        works.add({title:p.title,topic:p.category,kind:'示例',tags:[p.numColors+' 色',p.count+' 颗'],n:p.n,cells:p.cells,paired:{limit:16},created:now});
      }
    };
    req.onblocked=()=>{$('collectionStatus').textContent='图库正在升级，请关闭其他打开旧版图库的标签页。';};
    req.onsuccess=()=>{
      const db=req.result;
      db.onversionchange=()=>{db.close();dbPromise=null;};
      resolve(db);
    };
    req.onerror=()=>reject(req.error);
  }).catch(error=>{dbPromise=null;throw error;});
  return dbPromise;
}
async function records(mode,operation){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('works',mode),request=operation(tx.objectStore('works'));
    tx.oncomplete=()=>resolve(request.result);
    tx.onabort=()=>reject(tx.error || new Error('存储事务中断'));
  });
}
function downloadable(work){
  const blob=new Blob([JSON.stringify({format:'pixel-studio-1',title:work.title,n:work.n,cells:work.cells,limit:work.paired?.limit})],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=work.title+'.pixel.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function addWork(work){
  await records('readwrite',store=>store.add({title:work.title,n:work.n,cells:work.cells,drawingRef:work.drawingRef||null,paired:work.paired||null,created:Date.now()}));
}
$('collect').onclick=()=>{
  $('workName').value=title;$('saveDialog').returnValue='';$('saveDialog').showModal();$('workName').select();
};
$('saveDialog').onclose=async()=>{
  if($('saveDialog').returnValue!=='save')return;
  const name=$('workName').value.trim();
  if(!name){$('status').textContent='请输入作品名称';return;}
  try{await addWork({title:name,n,cells:cells.slice(),drawingRef,paired:{limit:beadLimit}});showCreations();location.hash='collection';}
  catch{$('status').textContent='收藏失败，请检查可用存储空间';}
};
$('importBtn').onclick=()=>$('importFile').click();
$('importFile').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  let work;
  try{
    if(file.size>300000)throw Error();
    work=JSON.parse(await file.text());
    if(work?.format!=='pixel-studio-1'||typeof work.title!=='string'||!work.title.trim()||work.title.length>50||
      ![16,32,64,96,128].includes(work.n)||!Array.isArray(work.cells)||work.cells.length!==work.n**2||
      !work.cells.every(c=>c===null || (typeof c==='string' && /^#[a-f0-9]{6}$/i.test(c))))throw Error();
  }catch{$('collectionStatus').textContent='导入失败，请选择像素工坊导出的有效工程文件。';return;}
  try{await addWork({title:work.title,n:work.n,cells:work.cells,paired:{limit:validColorLimit(work.limit)}});showCreations();await refreshCollection();}
  catch{$('collectionStatus').textContent='写入失败，请检查浏览器存储空间。';}
};
function showPage(){
  if(location.hash==='#portrait')location.replace('#editor');
  const hash=location.hash.slice(1);
  const current=Object.hasOwn(pages,hash)?hash:'collection';
  for(const [name,page] of Object.entries(pages))page.hidden=name!==current;
  for(const a of document.querySelectorAll('nav a')){
    if(a.hash==='#'+current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  }
  document.getElementById('status').hidden=current!=='editor';
  if(current==='collection')refreshCollection();
  
  if(current==='editor')markCell(cellX,cellY,true);
}
populateLibrary();window.addEventListener('hashchange',showPage);





