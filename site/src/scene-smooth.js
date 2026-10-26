import {clamp,samplePose,pointerPose,poseId,BitmapCache} from './sequence-core.js?v=3.1.0';

// All gaze keyframes stay decoded. Only a settled pose needs a network refinement.
export async function createJolly(stage,{onProgress=()=>{},reducedMotion=false}={}){
  const response=await fetch('./assets/sequence-film/manifest.json?v=3.1.0');
  if(!response.ok)throw new Error('Jolly 的动作画面暂时无法加载。');
  const manifest=await response.json(),grid=manifest.grid,atlas=manifest.motionAtlas;
  if(!atlas)throw new Error('动作资源正在更新，请刷新页面再试一次。');
  const assetBase=new URL('./',response.url),constrained=matchMedia('(max-width:700px)').matches||(navigator.deviceMemory&&navigator.deviceMemory<=4);
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');stage.append(canvas);
  const ctx=canvas.getContext('2d',{alpha:true}),blend=document.createElement('canvas'),blendCtx=blend.getContext('2d',{alpha:true});
  if(!ctx||!blendCtx)throw new Error('当前浏览器无法显示 Jolly，请使用较新的浏览器。');
  const detailCache=new BitmapCache((constrained?12:24)*1024*1024);
  const state={ready:false,paused:reducedMotion,reducedMotion,yaw:0,pitch:0,targetYaw:0,targetPitch:0,pointerActive:false,quality:'auto',activeQuality:'balanced',frames:0,poseChanges:0};
  let width=1,height=1,dpr=1,disposed=false,dirty=true,raf=0,last=performance.now();
  let bank=null,bankController=null,generation=0,detailController=null,detailLoading='',failedDetail='',failedAt=0;
  let explore=false,zoom=1,drawn=[],lastDraw=0,displayedKey='',detailMix=0,detailId='';
  let rect={x:0,y:0,w:0,h:0},lastInput=performance.now(),costs=[],intervals=[],errors=0,metricStart=performance.now(),metricFrames=0;
  const stamp=`${atlas.version}-${manifest.sourceSHA256.slice(0,12)}`;
  const url=file=>{const u=new URL(file,assetBase);u.searchParams.set('v',stamp);return u;};
  const profile=value=>value==='high'?{tier:'high',width:720}:value==='low'?{tier:'balanced',width:300}:{tier:'balanced',width:value==='auto'&&constrained?360:480};
  async function loadBank(choice,signal,progress=false){
    const spec=atlas.tiers[choice.tier],h=Math.round(choice.width/manifest.aspect);let count=0;
    const loaded=await Promise.allSettled(spec.files.map(async file=>{
      const r=await fetch(url(file),{signal});if(!r.ok)throw new Error(`Motion asset ${r.status}`);
      const bitmap=await createImageBitmap(await r.blob(),{resizeWidth:choice.width*atlas.columns,resizeHeight:h*atlas.rows,resizeQuality:'high'});
      if(progress&&!disposed)onProgress(`Jolly 正在走来… ${Math.round(++count/spec.files.length*100)}%`);return bitmap;
    }));
    const failure=loaded.find(r=>r.status==='rejected');
    if(failure||disposed||signal.aborted){for(const r of loaded)if(r.status==='fulfilled')r.value.close();throw failure?.reason||new DOMException('Canceled','AbortError');}
    const bitmaps=loaded.map(r=>r.value);
    return {...choice,height:h,bitmaps,bytes:bitmaps.reduce((n,b)=>n+b.width*b.height*4,0),close(){for(const b of bitmaps)b.close();}};
  }
  function layout(){
    const narrow=width<700,baseH=Math.min(height*(narrow?.60:.70),width*(narrow?1.18:1)/.75),h=baseH*zoom,w=h*.75;
    rect={x:(width-w)/2,y:height*(narrow?.70:.79)-baseH*.94+baseH*.35-h*.35,w,h};
  }
  function resize(){width=Math.max(1,stage.clientWidth);height=Math.max(1,stage.clientHeight);dpr=Math.min(devicePixelRatio||1,state.quality==='low'?1:1.5);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);layout();dirty=true;}
  const observer=new ResizeObserver(resize);observer.observe(stage);resize();
  function motionSamples(){return samplePose(atlas.grid,state.yaw,state.pitch).map(s=>({...s,id:poseId(atlas.sourceRows[s.row],atlas.sourceCols[s.col]),bitmap:bank.bitmaps[s.row],sx:(s.col%atlas.columns)*bank.width,sy:Math.floor(s.col/atlas.columns)*bank.height,sw:bank.width,sh:bank.height,tier:'motion'}));}
  function stopDetail(){detailController?.abort();detailController=null;detailLoading='';}
  function requestDetail(id){
    if(disposed||detailCache.items.has(id)||detailLoading===id||failedDetail===id&&performance.now()-failedAt<10000)return;
    stopDetail();const controller=new AbortController();detailController=controller;detailLoading=id;
    fetch(url(`high/${id}.webp`),{signal:controller.signal})
      .then(r=>{if(!r.ok)throw new Error(`Detail ${r.status}`);return r.blob();}).then(blob=>createImageBitmap(blob))
      .then(bitmap=>{if(disposed||controller.signal.aborted){bitmap.close();return;}detailCache.put(id,bitmap);dirty=true;})
      .catch(e=>{if(e.name!=='AbortError'){failedDetail=id;failedAt=performance.now();errors++;}})
      .finally(()=>{if(detailController===controller){detailController=null;detailLoading='';}});
  }
  function draw(samples){
    const start=performance.now(),bw=Math.min(Math.max(...samples.map(s=>s.sw)),Math.ceil(rect.w*dpr)),bh=Math.round(bw/manifest.aspect);
    if(blend.width!==bw||blend.height!==bh){blend.width=bw;blend.height=bh;}
    blendCtx.clearRect(0,0,bw,bh);blendCtx.imageSmoothingEnabled=true;blendCtx.imageSmoothingQuality='high';blendCtx.globalCompositeOperation='lighter';
    for(const s of samples){blendCtx.globalAlpha=s.weight;blendCtx.drawImage(s.bitmap,s.sx,s.sy,s.sw,s.sh,0,0,bw,bh);}
    blendCtx.globalAlpha=1;blendCtx.globalCompositeOperation='source-over';
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(blend,rect.x,rect.y,rect.w,rect.h);
    const now=performance.now();drawn=samples.map(s=>({id:s.id,weight:s.weight,tier:s.tier,width:s.sw,height:s.sh}));
    costs.push(now-start);if(costs.length>600)costs.shift();if(lastDraw)intervals.push(now-lastDraw);if(intervals.length>600)intervals.shift();
    state.frames++;state.poseChanges++;lastDraw=now;dirty=false;
  }
  function pointer(x,y){if(state.paused)return;const p=pointerPose(x,y,width,height,rect.y+rect.h*.33,grid);if(p.yaw!==state.targetYaw||p.pitch!==state.targetPitch){lastInput=performance.now();stopDetail();}state.targetYaw=p.yaw;state.targetPitch=p.pitch;state.pointerActive=true;}
  function center(){state.targetYaw=state.targetPitch=0;state.pointerActive=false;lastInput=performance.now();stopDetail();if(explore){zoom=1.18;layout();dirty=true;}}
  function frame(now){
    if(disposed)return;raf=requestAnimationFrame(frame);const elapsed=(now-last)/1000;last=now;if(document.hidden||!bank)return;
    const dt=clamp(elapsed,0,.05),rate=reducedMotion?18:11;
    state.yaw+=(state.targetYaw-state.yaw)*(1-Math.exp(-rate*dt));state.pitch+=(state.targetPitch-state.pitch)*(1-Math.exp(-rate*dt));
    if(Math.abs(state.yaw-state.targetYaw)<.015)state.yaw=state.targetYaw;if(Math.abs(state.pitch-state.targetPitch)<.015)state.pitch=state.targetPitch;
    const settled=Math.abs(state.targetYaw-state.yaw)<.03&&Math.abs(state.targetPitch-state.pitch)<.03&&now-lastInput>180;
    const target=samplePose(grid,state.yaw,state.pitch).sort((a,b)=>b.weight-a.weight)[0].id;let detail=null;
    if(settled&&(state.quality==='auto'||state.quality==='high')){if(detailId!==target){detailId=target;detailMix=0;}detailCache.pinned=new Set([target]);detail=detailCache.get(target);if(!detail)requestDetail(target);}
    if(detail){detailMix+=(1-detailMix)*(1-Math.exp(-14*dt));if(detailMix>.995)detailMix=1;}else detailMix=0;
    const samples=motionSamples().map(s=>({...s,weight:s.weight*(1-detailMix)})).filter(s=>s.weight>1e-6);
    if(detail&&detailMix)samples.push({id:target,bitmap:detail.bitmap,sx:0,sy:0,sw:detail.bitmap.width,sh:detail.bitmap.height,weight:detailMix,tier:'high'});
    const signature=samples.map(s=>`${s.id}:${s.tier}:${Math.round(s.weight*1000)}`).join('|');
    if(dirty||signature!==displayedKey){draw(samples);displayedKey=signature;}
  }
  let pinch=0;const pointers=new Map(),span=()=>{const p=[...pointers.values()];return p.length===2?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0;};
  function down(e){if(!explore)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});pinch=span();stage.setPointerCapture(e.pointerId);}
  function move(e){if(!explore)return;if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const distance=span();if(distance&&pinch){zoom=clamp(zoom*distance/pinch,1,1.55);layout();dirty=true;}else pointer(e.clientX,e.clientY);pinch=distance;}
  function up(e){pointers.delete(e.pointerId);pinch=span();}
  function wheel(e){if(!explore)return;e.preventDefault();zoom=clamp(zoom*Math.exp(-e.deltaY*.0008),1,1.55);layout();dirty=true;}
  const listeners=[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['wheel',wheel]];
  for(const [name,fn] of listeners)stage.addEventListener(name,fn,name==='wheel'?{passive:false}:undefined);
  async function setQuality(value){
    if(!['auto','low','balanced','high'].includes(value)||disposed)return;state.quality=value;resize();detailMix=0;stopDetail();
    const choice=profile(value),current=++generation;bankController?.abort();bankController=new AbortController();
    if(bank?.tier===choice.tier&&bank?.width===choice.width)return;
    try{const next=await loadBank(choice,bankController.signal);if(disposed||current!==generation){next.close();return;}const old=bank;bank=next;old?.close();state.activeQuality=choice.tier;dirty=true;}
    catch(e){if(e.name!=='AbortError')errors++;}
  }
  function dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();bankController?.abort();stopDetail();bank?.close();detailCache.clear();for(const [name,fn] of listeners)stage.removeEventListener(name,fn);canvas.remove();}
  onProgress('Jolly 正在走来…');bankController=new AbortController();
  try{bank=await loadBank(profile('auto'),bankController.signal,true);}catch(e){dispose();throw new Error('Jolly 的动作画面未加载完整，请再试一次。');}
  draw(motionSamples());state.ready=true;last=performance.now();raf=requestAnimationFrame(frame);
  return {state,pointer,center,setQuality,dispose,
    setPaused(value){state.paused=!!value;if(value){state.targetYaw=state.yaw;state.targetPitch=state.pitch;state.pointerActive=false;}},
    setExplore(value){explore=!!value;zoom=explore?1.18:1;pointers.clear();pinch=0;layout();dirty=true;stage.classList.toggle('sequence-closeup',explore);},
    nudge(x,y){if(state.paused)return;state.targetYaw=clamp(state.targetYaw+x*180/Math.PI,grid.yaw[0],grid.yaw.at(-1));state.targetPitch=clamp(state.targetPitch+y*180/Math.PI,grid.pitch[0],grid.pitch.at(-1));lastInput=performance.now();stopDetail();},
    resetMetrics(){intervals=[];costs=[];metricStart=performance.now();metricFrames=state.frames;lastDraw=0;},
    inspectMaterials:()=>({source:'Blender Cycles rendered pixels',sourceSHA256:manifest.sourceSHA256}),inspectGeometry:()=>({renderer:'Canvas2D',runtimeTriangles:0}),inspectGroom:()=>({fullDensityHair:manifest.fullDensityHair,sourceSHA256:manifest.sourceSHA256}),
    diagnostics(){const sorted=[...intervals].sort((a,b)=>a-b),seconds=(performance.now()-metricStart)/1000;return {...state,renderer:'Canvas2D resident motion atlas',playerVersion:'3.1.0',assetVersion:manifest.version,sourceSHA256:manifest.sourceSHA256,frameCount:manifest.frameCount,nativeFrames:manifest.renderFrameCount,interpolatedFrames:manifest.interpolatedFrames,motionReady:!!bank,motionPoseCount:atlas.grid.yaw.length*atlas.grid.pitch.length,motionWidth:bank?.width,yawDegrees:state.yaw,pitchDegrees:state.pitch,drawnFrames:drawn,frameSampleCount:intervals.length,measuredFPS:seconds?(state.frames-metricFrames)/seconds:null,p95FrameMs:sorted[Math.floor(sorted.length*.95)]||null,meanDrawMs:costs.reduce((a,b)=>a+b,0)/Math.max(1,costs.length),cacheMiB:((bank?.bytes||0)+detailCache.bytes)/1048576,cacheCount:(bank?.bitmaps.length||0)+detailCache.items.size,pending:detailLoading?1:0,failed:errors,missingFrames:0,fallbackDraws:0,drawCalls:drawn.length+1,triangles:0,canvas:[canvas.width,canvas.height],pixelRatio:dpr,rect,explore,view:{zoom},lastDraw};}
  };
}
