'use strict';
const perPage=12, stages=['待制作','制作中','已完成'];
let catalog=[],shelf='全部作品',stageFilter='',pageNumber=1,loadVersion=0,paintVersion=0;
let activeWork=null,detailVersion=0,originalURL='';
const revision=w=>w.revision||0;
const linkTo=w=>({id:w.id,revision:revision(w)});
const notice=t=>{$('uploadStatus').textContent=t;};
const topicNames=['卡通角色','点心果物','花草动物','游戏道具','未分类'];
let topicFilter='';
function workTopic(w){return w.topic || ('未分类');}
for(const name of topicNames)$('metaTopic').add(new Option(name,name));
function asSummary(w){
  const {id,title,created,updated,kind,stage,tags,favorite,preview,n}=w;
  return {id,title,topic:workTopic(w),created,updated:updated||created,kind:kind||'我的创作',stage:stage||stages[0],tags:tags||[],favorite:!!favorite,preview,n};
}
async function refreshCollection(){
  const version=++loadVersion;
  try{
    const db=await database(),list=await new Promise((resolve,reject)=>{
      const tx=db.transaction('works'),req=tx.objectStore('works').openCursor(),items=[];
      req.onsuccess=()=>{const row=req.result;if(row){items.push(asSummary(row.value));row.continue();}};
      tx.oncomplete=()=>resolve(items);tx.onabort=()=>reject(tx.error);
    });
    if(version!==loadVersion)return;
    catalog=list;renderGallery();
  }catch{$('collectionStatus').textContent='图库读取失败，请检查浏览器的本地存储权限。';}
}
function matchesShelf(w,name){
  if(name==='全部作品')return true;
  if(name==='星标收藏')return w.favorite;
  return w.kind===name;
}
function filterButton(name,count,on,action){
  const b=button(name,action),number=document.createElement('span');number.textContent=count;
  b.append(number);b.setAttribute('aria-pressed',String(on));return b;
}
function renderGallery(){
  const version=++paintVersion;
  const base=catalog.filter(w=>matchesShelf(w,shelf));
  $('shelves').replaceChildren(...['全部作品','星标收藏','上传图片','我的创作','示例'].map(name=>
    filterButton(name,catalog.filter(w=>matchesShelf(w,name)).length,shelf===name,()=>{shelf=name;topicFilter='';stageFilter='';pageNumber=1;renderGallery();})));
  $('progressFilters').replaceChildren(...stages.map(name=>filterButton(name,base.filter(w=>w.stage===name).length,stageFilter===name,()=>{
    stageFilter=stageFilter===name?'':name;pageNumber=1;renderGallery();
  })));
  const search=$('gallerySearch').value.trim().toLowerCase(),sort=$('gallerySort').value;
  const filtered=base.filter(w=>(!stageFilter||w.stage===stageFilter)&&[w.title,w.topic,...w.tags].join(' ').toLowerCase().includes(search));
  $('topicFilters').replaceChildren(...['',...topicNames].map(name=>filterButton(name||'全部题材',filtered.filter(w=>!name||w.topic===name).length,topicFilter===name,()=>{
    topicFilter=name;pageNumber=1;renderGallery();
  })));
  const list=filtered.filter(w=>!topicFilter||w.topic===topicFilter);
  list.sort((a,b)=>sort==='name'?a.title.localeCompare(b.title,'zh-CN'):sort==='old'?a.created-b.created||a.id-b.id:b.updated-a.updated||b.id-a.id);
  const total=Math.max(1,Math.ceil(list.length/perPage));
  pageNumber=Math.min(pageNumber,total);
  $('albumTitle').textContent=shelf+(stageFilter?' / '+stageFilter:'');
  $('collectionStatus').textContent=list.length?'共 '+list.length+' 张 · 第 '+pageNumber+' / '+total+' 页':'当前没有匹配的图片。可上传图片，或调整筛选条件。';
  const container=$('savedCards');container.replaceChildren();
  for(const work of list.slice((pageNumber-1)*perPage,pageNumber*perPage)){
    const item=document.createElement('article'),cover=button('',()=>openDetail(work.id)),body=document.createElement('div');
    item.className='card';cover.className='tile-cover';cover.setAttribute('aria-label','打开 '+work.title);body.className='card-body';
    if(['人物摄影','动漫人物'].includes(work.topic)){
      cover.classList.add('portrait-tile');
      records('readonly',store=>store.get(work.id)).then(w=>{
        if(w&&version===paintVersion)renderPairTile(cover,w);
      }).catch(()=>{cover.textContent='打开对照预览';});
    }else if(work.preview){const img=new Image();img.src=work.preview;img.alt=work.title;cover.append(img);}
    else records('readonly',store=>store.get(work.id)).then(w=>{if(w&&version===paintVersion)cover.append(thumbnail(w));}).catch(()=>{cover.textContent='打开预览';});
    const titleButton=button(work.title,()=>openDetail(work.id)),caption=document.createElement('p'),info=document.createElement('div');
    titleButton.className='tile-name';caption.textContent=[...new Set([work.kind,work.topic,...work.tags])].join(' · ');info.className='tile-info';
    info.append(button('绘图',async()=>{try{const w=await records('readonly',s=>s.get(work.id));if(w)openWork(await detailedWork(w),'从图库打开',linkTo(w));}catch{notice('读取作品失败，请重试。');}}));
    const status=document.createElement('span');status.className='stage-pill';status.textContent=work.stage;
    const star=button(work.favorite?'★':'☆',async()=>{
      try{await mutateWork(work.id,w=>{w.favorite=!w.favorite;});await refreshCollection();}
      catch{notice('收藏状态保存失败，请重试。');}
    });star.className='star';star.setAttribute('aria-label',(work.favorite?'取消收藏 ':'收藏 ')+work.title);star.setAttribute('aria-pressed',String(work.favorite));
    info.append(status,star);body.append(titleButton,caption,info);item.append(cover,body);container.append(item);
  }
  const controls=$('pageControls');controls.replaceChildren();
  if(total>1){
    const prev=button('上一页',()=>{pageNumber--;renderGallery();}),next=button('下一页',()=>{pageNumber++;renderGallery();});
    prev.disabled=pageNumber===1;next.disabled=pageNumber===total;controls.append(prev,next);
  }
}
$('gallerySearch').oninput=$('gallerySort').onchange=()=>{pageNumber=1;renderGallery();};
for(const index of [0,1,2])$('bannerArt').append(thumbnail(postcards[index]));
// Read and change the latest record in one transaction, including its original file.
async function mutateWork(id,change,{original,remove=false}={}){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['works','originals'],'readwrite'),store=tx.objectStore('works'),raw=tx.objectStore('originals');
    let result,reason;
    const read=store.get(id);
    read.onsuccess=()=>{
      try{
        result=read.result;if(!result)throw Error('作品已删除，请另存为新作品。');
        change(result);
        if(remove){store.delete(id);raw.delete(id);}
        else{result.updated=Date.now();store.put(result);if(original)raw.put(original,id);}
      }catch(e){reason=e;tx.abort();}
    };
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(reason||tx.error);
  });
}
async function sampleFile(file){
  if(!['image/png','image/webp','image/jpeg'].includes(file.type)||file.size>16*1024*1024)throw Error('请选择 16 MB 以内的 PNG、JPEG 或 WebP');
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();image.src=url;await image.decode();
    const thumb=document.createElement('canvas'),ratio=Math.min(1,256/Math.max(image.width,image.height));
    thumb.width=Math.max(1,Math.round(image.width*ratio));thumb.height=Math.max(1,Math.round(image.height*ratio));
    thumb.getContext('2d').drawImage(image,0,0,thumb.width,thumb.height);
    const side=image.width===image.height&&[16,32,64,96,128].includes(image.width)?image.width:64;
    const pixels=document.createElement('canvas');pixels.width=pixels.height=side;
    const ctx=pixels.getContext('2d'),scale=side/Math.max(image.width,image.height);
    const w=Math.max(1,Math.round(image.width*scale)),h=Math.max(1,Math.round(image.height*scale));
    ctx.drawImage(image,Math.floor((side-w)/2),Math.floor((side-h)/2),w,h);
    const data=ctx.getImageData(0,0,side,side).data,colors=[];
    for(let i=0;i<data.length;i+=4)colors.push(data[i+3]<128?null:'#'+((data[i]<<16)|(data[i+1]<<8)|data[i+2]).toString(16).padStart(6,'0'));
    return {n:side,cells:colors,preview:thumb.toDataURL('image/webp',.88),hasOriginal:true};
  }finally{URL.revokeObjectURL(url);}
}
async function insertImage(file){
  const picture=await sampleFile(file),db=await database();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(['works','originals'],'readwrite');
    const req=tx.objectStore('works').add({...picture,title:file.name.replace(/\.[^.]+$/,'').trim().slice(0,50)||'未命名图片',kind:'上传图片',topic:demoTopics[file.name]||'未分类',created:Date.now()});
    req.onsuccess=()=>tx.objectStore('originals').put(file,req.result);
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
  });
}
$('uploadBtn').onclick=()=>$('uploadFiles').click();
$('uploadFiles').onchange=async e=>{
  const files=[...e.target.files];e.target.value='';if(!files.length)return;
  const failed=[];$('uploadBtn').disabled=true;
  try{
    for(const [i,file] of files.entries()){
      notice('正在入库 '+(i+1)+' / '+files.length+'　'+file.name);
      try{await insertImage(file);}catch(error){failed.push(file.name+'（'+(error.message||'存储失败')+'）');}
    }
    shelf='上传图片';topicFilter='';stageFilter='';pageNumber=1;$('gallerySearch').value='';$('gallerySort').value='recent';
    await refreshCollection();notice('已保存 '+(files.length-failed.length)+' 张'+(failed.length?'。未保存：'+failed.join('、'):'。'));
  }finally{$('uploadBtn').disabled=false;}
};
function displayDetail(w){
  activeWork=w;$('detailTitle').textContent=w.title;$('metaName').value=w.title;
  if(![...$('metaTopic').options].some(o=>o.value===workTopic(w)))$('metaTopic').add(new Option(workTopic(w),workTopic(w)));
  $('metaTopic').value=workTopic(w);$('metaTags').value=(w.tags||[]).join('，');$('metaStage').value=w.stage||stages[0];$('metaFav').checked=!!w.favorite;
  $('originalView').hidden=!w.hasOriginal;
  const art=$('detailArt');art.replaceChildren();
  if(w.preview){const img=new Image();img.alt=w.title;img.src=w.preview;art.append(img);}
  else art.append(thumbnail(w));
}
async function openDetail(id){
  const version=++detailVersion;
  try{
    const w=await records('readonly',store=>store.get(id));if(version!==detailVersion)return;
    if(!w)throw Error();
    displayDetail(w);$('detailNotice').textContent='';$('details').showModal();
  }catch{notice('无法打开该作品，请刷新图库。');}
}
$('closeDetails').onclick=()=>$('details').close();
$('metadata').onsubmit=async e=>{
  e.preventDefault();const name=$('metaName').value.trim();if(!name){$('detailNotice').textContent='请输入作品名称。';return;}
  const values={title:name,topic:$('metaTopic').value,tags:[...new Set($('metaTags').value.split(/[,，、]/).map(x=>x.trim()).filter(Boolean))],stage:$('metaStage').value,favorite:$('metaFav').checked};
  try{displayDetail(await mutateWork(activeWork.id,w=>Object.assign(w,values)));$('detailNotice').textContent='资料已保存';await refreshCollection();}
  catch(error){$('detailNotice').textContent=error.message;}
};
$('replaceBtn').onclick=()=>$('replaceFile').click();
$('replaceFile').onchange=async e=>{
  const file=e.target.files[0],target=activeWork;e.target.value='';if(!file || !confirm('替换此作品的图片和上传原图？名称、标签与制作进度将保留。'))return;
  try{
    const picture=await sampleFile(file);
    const w=await mutateWork(target.id,w=>{checkRevision(w,revision(target));Object.assign(w,picture);delete w.drawingRef;delete w.paired;delete w.referenceThumb;delete w.referenceSnapshot;delete w.referencePath;w.revision=revision(w)+1;},{original:file});
    if(activeWork?.id===w.id){displayDetail(w);$('detailNotice').textContent='图片已替换';}
    await refreshCollection();
  }catch(error){$('detailNotice').textContent=error.message;}
};
$('detailDelete').onclick=async()=>{
  const w=activeWork;if(!confirm('删除「'+w.title+'」及其上传原图？'))return;
  try{await mutateWork(w.id,()=>{},{remove:true});$('details').close();await refreshCollection();}
  catch(error){$('detailNotice').textContent=error.message;}
};
$('detailExport').onclick=()=>downloadable(activeWork);
$('originalView').onclick=async()=>{
  const w=activeWork;
  try{
    const db=await database(),file=await new Promise((resolve,reject)=>{
      const req=db.transaction('originals').objectStore('originals').get(w.id);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    if(!file)throw Error();
    originalURL=URL.createObjectURL(file);$('originalImg').src=originalURL;$('originalDialog').showModal();
  }catch{$('detailNotice').textContent='无法读取原图。';}
};
$('closeOriginal').onclick=()=>$('originalDialog').close();
$('originalDialog').onclose=()=>{URL.revokeObjectURL(originalURL);$('originalImg').removeAttribute('src');};
$('detailEdit').onclick=async()=>{
  const w=activeWork;
  try{if(openWork(await detailedWork(w),'从图库打开',linkTo(w)))$('details').close();}
  catch{$('detailNotice').textContent='读取原图失败，请重新选择图片。';}
};
$('detailPlan').onclick=async()=>{
  try{
    const w=await detailedWork(activeWork);
    const basis=(w.paired||revision(w))?thumbnail(w):await detailSource(w);
    $('beadPalette').value=validColorLimit(w.paired?.limit);$('beadSize').value=w.n;
    useSource(basis,w.title,linkTo(w),referenceForWork(w));
  }catch{$('detailNotice').textContent='读取原图失败，请重试。';return;}
  $('details').close();location.hash='pattern';
};
function checkRevision(w,expected){if(revision(w)!==expected)throw Error('图片已在其他操作中更新，请另存副本或重新打开。');}
function updateSaveButton(){$('updateWork').hidden=!editLink;}
document.addEventListener('pixels-rendered',updateSaveButton);
$('updateWork').onclick=async()=>{
  if(!editLink)return;
  const target={...editLink},image={n,cells:cells.slice(),drawingRef,paired:{limit:beadLimit}};$('updateWork').disabled=true;
  try{
    const w=await mutateWork(target.id,w=>{
      checkRevision(w,target.revision);Object.assign(w,image);if(w.preview?.startsWith('图库图片/'))w.referencePath=w.preview;else if(w.preview)w.referenceThumb=w.preview;delete w.preview;w.revision=revision(w)+1;
    });
    if(editLink?.id===target.id){editLink=linkTo(w);save();}
    location.hash='collection';notice('已保存「'+w.title+'」的修改。');
  }catch(error){$('status').textContent=error.message;alert(error.message);}
  finally{$('updateWork').disabled=false;}
};
updateSaveButton();showPage();

function showCreations(){
  shelf='我的创作';topicFilter='';stageFilter='';pageNumber=1;
  $('gallerySearch').value='';$('gallerySort').value='recent';notice('');
}
