import {clamp,samplePose,pointerPose,poseId,BitmapCache,nearestReadyPose} from './sequence-core.js';

export async function createJolly(stage,{onProgress=()=>{},reducedMotion=false}={}){
  const response=await fetch('./assets/sequence-film/manifest.json');
  if(!response.ok)throw new Error('Jolly 的动作画面暂时无法加载。');
  const manifest=await response.json(),grid=manifest.grid;
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');stage.append(canvas);
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)throw new Error('当前浏览器无法显示 Jolly，请使用较新的浏览器。');
  const blend=document.createElement('canvas'),blendCtx=blend.getContext('2d',{alpha:true});
  const mobile=matchMedia('(max-width:700px)').matches;
  const cache=new BitmapCache((mobile?48:112)*1024*1024);
  const pending=new Map(),queue=new Map(),failures=new Map();
  const state={ready:false,paused:reducedMotion,reducedMotion,yaw:0,pitch:0,targetYaw:0,targetPitch:0,pointerActive:false,quality:'auto',activeQuality:'high',frames:0,poseChanges:0};
  let width=1,height=1,dpr=1,disposed=false,dirty=true,raf=0,last=performance.now(),previousDraw=false;
  let concurrent=0,explore=false,zoom=1,drawn=[],lastDraw=0,drawCost=0,missingFrames=0,fallbackDraws=0,lowResolutionDraws=0;
  let metrics=[],drawCosts=[],rect={x:0,y:0,w:0,h:0},displayedKey='',displayedPose='';
  const neutral=samplePose(grid,0,0)[0].id;
  const stride=manifest.nativeStride||1;
  function anchors(){
    const columns=width<700?3:7,rows=[0,Math.floor((grid.pitch.length-1)/2),grid.pitch.length-1];
    return rows.flatMap(row=>Array.from({length:columns},(_,i)=>{
      const col=Math.round(i*(grid.yaw.length-1)/(columns-1)/stride)*stride;
      return poseId(row,Math.min(col,grid.yaw.length-1));
    }));
  }
  const assetBase=new URL('./',response.url);
  const key=(tier,id)=>`${tier}/${id}`;
  const url=(tier,id)=>{const value=new URL(`${tier}/${id}.webp`,assetBase);value.searchParams.set('v',`${manifest.version}-${manifest.sourceSHA256.slice(0,12)}`);return value;};
  function pump(){
    if(disposed)return;
    while(concurrent<4&&queue.size){
      const tasks=[...queue.values()].sort((a,b)=>b.priority-a.priority);
      const task=tasks[0];queue.delete(task.key);
      if(cache.items.has(task.key)){pending.delete(task.key);task.resolve(cache.get(task.key));continue;}
      concurrent++;
      fetch(url(task.tier,task.id)).then(r=>{if(!r.ok)throw new Error(`Frame ${r.status}`);return r.blob();})
        .then(blob=>createImageBitmap(blob)).then(bitmap=>{
          if(disposed){bitmap.close();task.resolve(null);return;}
          const item=cache.put(task.key,bitmap);
          failures.delete(task.key);
          if(wanted().some(s=>s.id===task.id))dirty=true;
          task.resolve(item);
        }).catch(()=>{failures.set(task.key,performance.now());task.resolve(null);})
        .finally(()=>{pending.delete(task.key);concurrent--;pump();});
    }
  }
  function request(tier,id,priority=0){
    const k=key(tier,id),ready=cache.get(k);if(ready)return Promise.resolve(ready);
    if(pending.has(k)){const q=queue.get(k);if(q)q.priority=Math.max(q.priority,priority);return pending.get(k);}
    if(failures.has(k)&&performance.now()-failures.get(k)<10000)return Promise.resolve(null);
    let resolve;const promise=new Promise(r=>resolve=r);
    pending.set(k,promise);queue.set(k,{key:k,tier,id,priority,resolve});pump();return promise;
  }
  function desiredTier(){return state.activeQuality==='high'?'high':state.activeQuality==='low'?'low':'balanced';}
  function layout(){
    const narrow=width<700;
    const baseH=Math.min(height*(narrow?.60:.70),width*(narrow?1.18:1.0)/.75);
    const h=baseH*zoom;
    const w=h*.75;
    const bottom=height*(narrow?.70:.79),baseY=bottom-baseH*.94;
    // Zoom around the face so the headphones stay in view.
    rect={x:(width-w)/2,y:baseY+baseH*.35-h*.35,w,h};
  }
  function resize(){
    width=Math.max(1,stage.clientWidth);height=Math.max(1,stage.clientHeight);
    if(state.quality==='auto')state.activeQuality='high';
    cache.limit=(width<700?48:112)*1024*1024;cache.trim();
    dpr=Math.min(devicePixelRatio||1,state.activeQuality==='low'?1:1.5);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    layout();dirty=true;
  }
  const observer=new ResizeObserver(resize);observer.observe(stage);resize();
  function wanted(){
    const samples=samplePose(grid,state.yaw,state.pitch);
    return manifest.nativeStride?[{...samples.sort((a,b)=>b.weight-a.weight)[0],weight:1}]:samples;
  }
  function prefetch(samples){
    const tier=desiredTier();
    // A rapid direction change must not wait behind old high-priority poses.
    for(const task of queue.values())task.priority=Math.min(task.priority,20);
    const anchorIds=anchors();
    cache.pinned=new Set([...anchorIds.map(id=>key(tier,id)),...drawn.map(s=>key(s.tier,s.id)),...samples.map(s=>key(tier,s.id))]);
    for(const s of samples)request(tier,s.id,200);
    // Predict the damped gaze, giving decoding a head start instead of replacing
    // the character with a tiny preview whenever the pointer moves quickly.
    for(const [seconds,priority] of [[.035,160],[.07,140],[.12,120]]){
      const mix=1-Math.exp(-11*seconds);
      const predicted=samplePose(grid,state.yaw+(state.targetYaw-state.yaw)*mix,state.pitch+(state.targetPitch-state.pitch)*mix).sort((a,b)=>b.weight-a.weight)[0];
      request(tier,predicted.id,priority);
    }
    const target=samplePose(grid,state.targetYaw,state.targetPitch).sort((a,b)=>b.weight-a.weight)[0];
    request(tier,target.id,80);
    // Nearby poses, not the entire decoded sequence, live in the memory cache.
    const dominant=[...samples].sort((a,b)=>b.weight-a.weight)[0];
    if(dominant){
      for(let dx=-2;dx<=2;dx++)for(let dy=-1;dy<=1;dy++){
        const col=dominant.col+dx,row=dominant.row+dy;
        if(col>=0&&row>=0&&col<grid.yaw.length&&row<grid.pitch.length)request(tier,poseId(row,col),30-Math.abs(dx)-Math.abs(dy));
      }
    }
    // Drop stale queued prefetches after rapid pointer changes.
    if(queue.size>64){
      const keep=new Set([...queue.values()].sort((a,b)=>b.priority-a.priority).slice(0,45).map(t=>t.key));
      for(const k of cache.pinned)keep.add(k);
      for(const [k,task] of queue)if(!keep.has(k)){queue.delete(k);pending.delete(k);task.resolve(null);}
    }
    for(const id of anchorIds)request(tier,id,-20);
    cache.trim();
  }
  function choose(samples){
    const tier=desiredTier();let result=[];
    for(const s of samples){
      const item=cache.get(key(tier,s.id));
      if(!item){
        if(!manifest.nativeStride)return null;
        const fallback=nearestReadyPose(cache,tier,grid,state.yaw,state.pitch,manifest.tiers[tier].width);
        if(!fallback)return null;
        fallbackDraws++;return [fallback];
      }
      result.push({...s,bitmap:item.bitmap,tier});
    }
    return result;
  }
  function draw(samples){
    const t=performance.now();
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    if(samples.length===1&&samples[0].weight===1){
      ctx.drawImage(samples[0].bitmap,rect.x,rect.y,rect.w,rect.h);
    }else{
      const targetWidth=Math.min(manifest.tiers[desiredTier()].width,Math.ceil(rect.w*dpr));
      const targetHeight=Math.round(targetWidth/manifest.aspect);
      if(blend.width!==targetWidth||blend.height!==targetHeight){blend.width=targetWidth;blend.height=targetHeight;}
      blendCtx.clearRect(0,0,blend.width,blend.height);
      // Weighted premultiplied-alpha sum: ordinary source-over creates pale seams.
      blendCtx.globalCompositeOperation='lighter';
      for(const sample of samples){blendCtx.globalAlpha=sample.weight;blendCtx.drawImage(sample.bitmap,0,0,blend.width,blend.height);}
      blendCtx.globalAlpha=1;blendCtx.globalCompositeOperation='source-over';
      ctx.drawImage(blend,rect.x,rect.y,rect.w,rect.h);
    }
    drawCost=performance.now()-t;drawCosts.push(drawCost);if(drawCosts.length>360)drawCosts.shift();
    drawn=samples.map(({id,weight,bitmap,tier})=>({id,weight,tier,width:bitmap.width,height:bitmap.height}));
    if(samples.some(s=>s.bitmap.width<manifest.tiers[desiredTier()].width))lowResolutionDraws++;
    const poseKey=drawn.map(s=>`${s.id}:${Math.round(s.weight*200)}`).join('|');
    if(poseKey!==displayedPose){state.poseChanges++;displayedPose=poseKey;}
    state.frames++;lastDraw=performance.now();dirty=false;
  }
  function pointer(x,y){
    if(state.paused)return;
    const p=pointerPose(x,y,width,height,rect.y+rect.h*.33,grid);
    state.targetYaw=p.yaw;state.targetPitch=p.pitch;state.pointerActive=true;
  }
  function center(){state.targetYaw=state.targetPitch=0;state.pointerActive=false;if(explore){zoom=1.18;layout();dirty=true;}}
  function frame(now){
    if(disposed)return;raf=requestAnimationFrame(frame);
    const elapsed=(now-last)/1000;last=now;
    if(document.hidden){previousDraw=false;return;}
    const dt=clamp(elapsed,0,.05),rate=reducedMotion?18:11;
    const oldYaw=state.yaw,oldPitch=state.pitch;
    state.yaw+=(state.targetYaw-state.yaw)*(1-Math.exp(-rate*dt));
    state.pitch+=(state.targetPitch-state.pitch)*(1-Math.exp(-rate*dt));
    if(Math.abs(state.yaw-state.targetYaw)<.015)state.yaw=state.targetYaw;
    if(Math.abs(state.pitch-state.targetPitch)<.015)state.pitch=state.targetPitch;
    if(!dirty&&oldYaw===state.yaw&&oldPitch===state.pitch){previousDraw=false;return;}
    const samples=wanted();
    prefetch(samples);
    const available=choose(samples);
    if(!available){missingFrames++;previousDraw=false;return;}
    const signature=available.map(s=>`${s.id}:${s.bitmap.width}:${Math.round(s.weight*200)}`).join('|');
    if(signature!==displayedKey||dirty){
      draw(available);displayedKey=signature;
      if(previousDraw&&elapsed>0){metrics.push(elapsed*1000);if(metrics.length>360)metrics.shift();}
      previousDraw=true;
    }else previousDraw=false;
  }
  let pinch=0;const pointers=new Map();
  const span=()=>{const p=[...pointers.values()];return p.length===2?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0;};
  function down(e){if(!explore)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});pinch=span();stage.setPointerCapture(e.pointerId);}
  function move(e){if(!explore)return;
    if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const distance=span();if(distance&&pinch){zoom=clamp(zoom*distance/pinch,1,1.55);layout();dirty=true;}else pointer(e.clientX,e.clientY);
    pinch=distance;
  }
  function up(e){pointers.delete(e.pointerId);pinch=span();}
  function wheel(e){if(!explore)return;e.preventDefault();zoom=clamp(zoom*Math.exp(-e.deltaY*.0008),1,1.55);layout();dirty=true;}
  stage.addEventListener('pointerdown',down);stage.addEventListener('pointermove',move);stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',up);stage.addEventListener('wheel',wheel,{passive:false});
  onProgress('Jolly 正在走来…');const firstTier=desiredTier();cache.pinned.add(key(firstTier,neutral));
  const first=await request(firstTier,neutral,200);
  if(!first)throw new Error('Jolly 的首张画面未加载成功，请再试一次。');
  draw([{id:neutral,weight:1,bitmap:first.bitmap,tier:firstTier}]);state.ready=true;
  prefetch(wanted());raf=requestAnimationFrame(frame);
  return {
    state,pointer,center,
    setPaused(value){state.paused=!!value;if(value){state.targetYaw=state.yaw;state.targetPitch=state.pitch;state.pointerActive=false;}},
    setQuality(value){if(!['auto','low','balanced','high'].includes(value))return;state.quality=value;state.activeQuality=value==='auto'?'high':value;resize();prefetch(wanted());},
    setExplore(value){explore=!!value;zoom=explore?1.18:1;pointers.clear();pinch=0;layout();dirty=true;stage.classList.toggle('sequence-closeup',explore);},
    nudge(x,y){if(state.paused)return;state.targetYaw=clamp(state.targetYaw+x*180/Math.PI,grid.yaw[0],grid.yaw.at(-1));state.targetPitch=clamp(state.targetPitch+y*180/Math.PI,grid.pitch[0],grid.pitch.at(-1));},
    resetMetrics(){metrics=[];drawCosts=[];missingFrames=0;fallbackDraws=0;lowResolutionDraws=0;previousDraw=false;},
    inspectMaterials:()=>({source:'Blender Cycles rendered pixels',sourceSHA256:manifest.sourceSHA256}),
    inspectGeometry:()=>({renderer:'Canvas2D',runtimeTriangles:0}),
    inspectGroom:()=>({fullDensityHair:manifest.fullDensityHair,sourceSHA256:manifest.sourceSHA256}),
    diagnostics(){const sorted=[...metrics].sort((a,b)=>a-b),mean=metrics.reduce((a,b)=>a+b,0)/Math.max(1,metrics.length);return {...state,renderer:'Canvas2D frame sequence',playerVersion:'3.0.1',assetVersion:manifest.version,sourceSHA256:manifest.sourceSHA256,frameCount:manifest.frameCount,nativeFrames:manifest.renderFrameCount,interpolatedFrames:manifest.interpolatedFrames,yawDegrees:state.yaw,pitchDegrees:state.pitch,drawnFrames:drawn,frameSampleCount:metrics.length,measuredFPS:mean?1000/mean:null,p95FrameMs:sorted[Math.floor(sorted.length*.95)]||null,meanDrawMs:drawCosts.reduce((a,b)=>a+b,0)/Math.max(1,drawCosts.length),cacheMiB:cache.bytes/1048576,cacheCount:cache.items.size,pending:pending.size,failed:failures.size,missingFrames,fallbackDraws,lowResolutionDraws,drawCalls:drawn.length+1,triangles:0,canvas:[canvas.width,canvas.height],pixelRatio:dpr,rect,explore,view:{zoom},lastDraw};},
    dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();for(const task of queue.values())task.resolve(null);queue.clear();cache.clear();for(const [name,fn] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['wheel',wheel]])stage.removeEventListener(name,fn);canvas.remove();},
  };
}
