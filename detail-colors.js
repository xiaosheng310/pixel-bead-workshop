'use strict';
function validColorLimit(value){return [8,16,32,64].includes(value)?value:16;}
// Median-cut boxes are split along the channel with greatest weighted variance.
function adaptiveColors(data,limit){
  const histogram=new Map();
  for(let i=0;i<data.length;i+=4){
    if(data[i+3]<128)continue;
    const key=(data[i]<<16)|(data[i+1]<<8)|data[i+2];
    let point=histogram.get(key);
    if(!point){point={rgb:[data[i],data[i+1],data[i+2]],weight:0};histogram.set(key,point);}
    point.weight++;
  }
  function box(points){
    const mean=[0,0,0],variance=[0,0,0];let weight=0;
    for(const p of points){weight+=p.weight;for(let k=0;k<3;k++)mean[k]+=p.rgb[k]*p.weight;}
    for(let k=0;k<3;k++)mean[k]/=weight;
    for(const p of points)for(let k=0;k<3;k++)variance[k]+=p.weight*(p.rgb[k]-mean[k])**2;
    const scores=variance.map((v,k)=>v*[2,4,3][k]),score=Math.max(...scores);
    return {points,weight,mean,score,axis:scores.indexOf(score)};
  }
  if(!histogram.size)return [];
  const boxes=[box([...histogram.values()])];
  while(boxes.length<limit){
    let index=-1,best=0;
    boxes.forEach((b,i)=>{if(b.points.length>1&&b.score>best){index=i;best=b.score;}});
    if(index<0)break;
    const b=boxes[index],points=b.points.sort((a,c)=>a.rgb[b.axis]-c.rgb[b.axis]);
    let cut=1,weight=points[0].weight;
    while(cut<points.length-1&&weight<b.weight/2)weight+=points[cut++].weight;
    boxes.splice(index,1,box(points.slice(0,cut)),box(points.slice(cut)));
  }
  return boxes.map((b,i)=>{
    const rgb=b.mean.map(Math.round),hex='#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
    return {rgb,hex,name:hex.toUpperCase(),symbol:String(i+1).padStart(2,'0')};
  });
}
async function decodeDetailImage(url){const img=new Image();img.src=url;await img.decode();return img;}
const initialDetails=new Map();
function isPhotoDraft(w){return !w.paired&&!revision(w)&&['人物摄影','动漫人物'].includes(workTopic(w));}
async function detailSource(w){
  const ref=referenceForWork(w);
  if(ref.originalId){
    const db=await database();
    const file=await new Promise((resolve,reject)=>{
      const req=db.transaction('originals').objectStore('originals').get(ref.originalId);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    if(file){const url=URL.createObjectURL(file);try{return await decodeDetailImage(url);}finally{URL.revokeObjectURL(url);}}
  }
  return decodeDetailImage((location.protocol==='file:'&&offlineImages[ref.url])||ref.url);
}
async function detailedWork(w){
  if(!isPhotoDraft(w))return w;
  const key=w.id+'-'+revision(w);
  if(!initialDetails.has(key)){
    const result=detailSource(w).then(img=>{
      const sampled=sampleBeads(img,128,64);
      return {cells:sampled.indices.map(c=>c?.hex??null),aspect:img.width/img.height};
    }).catch(error=>{initialDetails.delete(key);throw error;});
    if(initialDetails.size>=24)initialDetails.delete(initialDetails.keys().next().value);
    initialDetails.set(key,result);
  }
  const detail=await initialDetails.get(key);
  return {...w,n:128,cells:detail.cells,aspect:detail.aspect,paired:{limit:64},drawingRef:referenceForWork(w)};
}
