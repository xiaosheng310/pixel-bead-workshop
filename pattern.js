'use strict';
const beads=[
  ['A','炭黑','#302f38'],['B','瓷白','#fff8e8'],['C','朱红','#ca5649'],['D','金黄','#edbd57'],
  ['E','草绿','#67915c'],['F','湖蓝','#528aa5'],['G','咖啡','#895e4e'],['H','浅桃','#efb598'],
  ['J','灰紫','#86758d'],['K','松绿','#355c57'],['L','沙色','#c3a788'],['M','藏蓝','#384a66'],
  ['N','薄荷','#9cc8af'],['P','橘色','#df8951'],['R','雾蓝','#a5c4cf'],['S','莓粉','#ba7486']
].map(([symbol,name,hex])=>({symbol,name,hex,rgb:[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))}));
let sourceImage=thumbnail(postcards[4]), sourceName=postcards[4].title, plan, inputVersion=0;
let guideRow=0, patternLink=null,patternReference=null;
function sampleBeads(image,side,paletteChoice){
  const sample=document.createElement('canvas');sample.width=sample.height=side;
  const ctx=sample.getContext('2d');
  const ratio=side/Math.max(image.width,image.height);
  const width=Math.max(1,Math.round(image.width*ratio)),height=Math.max(1,Math.round(image.height*ratio));
  ctx.imageSmoothingEnabled=image.tagName!=='CANVAS';
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(image,Math.floor((side-width)/2),Math.floor((side-height)/2),width,height);
  const data=ctx.getImageData(0,0,side,side).data,counts=new Map(),indices=[];
  const colors=Array.isArray(paletteChoice)?paletteChoice:paletteChoice<=16?beads.slice(0,paletteChoice):adaptiveColors(data,paletteChoice);
  const cache=new Map();
  for(let i=0;i<data.length;i+=4){
    if(data[i+3]<128){indices.push(null);continue;}
    const r=data[i],g=data[i+1],b=data[i+2],key=(r<<16)|(g<<8)|b;
    let chosen=cache.get(key);
    if(!chosen){
      let best=Infinity;
      for(const c of colors){
        const [cr,cg,cb]=c.rgb, distance=2*(r-cr)**2+4*(g-cg)**2+3*(b-cb)**2;
        if(distance<best){best=distance;chosen=c;}
      }
      cache.set(key,chosen);
    }
    indices.push(chosen);counts.set(chosen,(counts.get(chosen)||0)+1);
  }
  return {side,indices,counts};
}
function generatePattern(){
  const side=Number($('beadSize').value), colors=Number($('beadPalette').value);
  const {indices,counts}=sampleBeads(sourceImage,side,colors);
  guideRow=Math.min(guideRow,side-1);plan={side,indices,counts};drawDiagram();
  $('patternTitle').textContent=sourceName+' · '+side+' × '+side;
  $('totals').textContent=[...counts.values()].reduce((a,b)=>a+b,0)+' 颗豆 · '+counts.size+' 种颜色';
  $('beadList').replaceChildren(...[...counts].sort((a,b)=>b[1]-a[1]).map(([c,count])=>{
    const row=document.createElement('div'),chip=document.createElement('i'),name=document.createElement('span'),qty=document.createElement('b');
    chip.style.background=c.hex;chip.style.color=ink(c);chip.textContent=c.symbol;name.textContent=c.name;qty.textContent=count+' 颗';
    row.append(chip,name,qty);return row;
  }));
}
function ink(c){return (c.rgb[0]*.299+c.rgb[1]*.587+c.rgb[2]*.114)>142?'#262630':'#ffffff';}
function drawDiagram(){
  const {side,indices}=plan, size=side*16;
  const svg=['<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="拼豆坐标图" viewBox="-24 -24 '+(size+26)+' '+(size+26)+'"><rect width="'+size+'" height="'+size+'" fill="white"/>'];
  const text=(x,y,t,color,font)=>'<text x="'+x+'" y="'+y+'" fill="'+color+'" text-anchor="middle" font-family="Arial" font-size="'+font+'">'+t+'</text>';
  indices.forEach((c,i)=>{
    if(!c)return;
    const x=i%side*16,y=Math.floor(i/side)*16;
    svg.push('<rect x="'+x+'" y="'+y+'" width="16" height="16" fill="'+c.hex+'"/>');
    if($('symbols').checked)svg.push(text(x+8,y+11,c.symbol,ink(c),9));
  });
  for(let i=0;i<=side;i++){
    const t=i*16;
    svg.push('<path d="M'+t+' 0v'+size+' M0 '+t+'h'+size+'" fill="none" stroke="'+(i%8?'#777777':'#332e30')+'" stroke-width="'+(i%8?0.35:1.4)+'"/>');
    if(i<side && (i===0 || (i+1)%4===0))svg.push(text(t+8,-5,i+1,'#383431',11),text(-12,t+12,i+1,'#383431',11));
  }
  const guiding=$('rowMode').checked;
  $('rowControls').hidden=!guiding;
  if(guiding){
    const top=guideRow*16,after=top+16;
    svg.push('<g class="guide-overlay"><rect width="'+size+'" height="'+top+'" fill="white" opacity=".7"/><rect y="'+after+'" width="'+size+'" height="'+(size-after)+'" fill="white" opacity=".7"/><rect x="0" y="'+top+'" width="'+size+'" height="16" stroke="#191625" stroke-width="2" fill="none"/></g>');
    const runs=[];
    for(const bead of indices.slice(guideRow*side,(guideRow+1)*side)){
      const name=bead?bead.symbol+' '+bead.name:'留空';
      if(runs.length && runs[runs.length-1].name===name)runs[runs.length-1].count++;
      else runs.push({name,count:1});
    }
    $('rowRecipe').textContent='从左到右　'+runs.map(r=>r.name+' × '+r.count).join(' → ');
    $('rowLabel').textContent='第 '+(guideRow+1)+' / '+side+' 行';
    $('prevRow').disabled=guideRow===0;$('nextRow').disabled=guideRow===side-1;
  }
  // Markup contains only numeric coordinates and values from the fixed palette.
  $('diagram').innerHTML=svg.join('')+'</svg>';
}
function useSource(image,name,link=null,reference=null){
  patternReference=reference||{url:image.tagName==='CANVAS'?image.toDataURL():image.src};
  patternLink=link;
  guideRow=0;inputVersion++;sourceImage=image;sourceName=name;$('patternNotice').textContent='';generatePattern();
}
$('samplePattern').onclick=()=>useSource(thumbnail(postcards[4]),postcards[4].title);
$('fromEditor').onclick=()=>useSource(thumbnail({title,n,cells}),title,editLink,drawingRef);
$('toPattern').onclick=()=>{$('beadPalette').value=beadLimit;$('fromEditor').click();$('beadSize').value=n;generatePattern();location.hash='pattern';};
$('beadSize').onchange=$('beadPalette').onchange=generatePattern;
$('symbols').onchange=drawDiagram;
$('photo').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  const version=++inputVersion;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>16*1024*1024){
    $('patternNotice').textContent='请选择 16 MB 以内的 PNG、JPEG 或 WebP 图片。';return;
  }
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();img.src=url;await img.decode();
    if(version===inputVersion)useSource(img,file.name.replace(/\.[^.]+$/,'').slice(0,42)||'导入图片',null,{url:scaledReference(img)});
  }catch{if(version===inputVersion)$('patternNotice').textContent='图片读取失败，请重新选择。';}
  finally{URL.revokeObjectURL(url);}
};
$('editPattern').onclick=()=>openWork({n:plan.side,title:sourceName.slice(0,42)+' · 拼豆',drawingRef:patternReference,paired:{limit:Number($('beadPalette').value)},cells:plan.indices.map(c=>c?.hex??null)},'载入拼豆图纸',patternLink);
$('printPattern').onclick=()=>window.print();
generatePattern();

$('rowMode').onchange=drawDiagram;
$('prevRow').onclick=()=>{if(guideRow>0){guideRow--;drawDiagram();}};
$('nextRow').onclick=()=>{if(guideRow<plan.side-1){guideRow++;drawDiagram();}};

