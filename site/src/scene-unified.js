import {clamp,pointerPose} from './sequence-core.js?v=3.3.0';
import {selectWarpPose,fitCharacter} from './pose-warp-core.js?v=3.3.0';
import {paintBackdrop} from './scene-backdrop.js?v=3.3.0';
import {createPoseRenderer} from './unified-renderer.js?v=3.3.0';

// A stable body and a sharp head resolve into the same opaque scene.
// No temporal accumulation, motion-dependent quality, or late detail swap.
export async function createJolly(stage,{onProgress=()=>{},reducedMotion=false}={}){
  const response=await fetch('./assets/sequence-film/manifest.json?v=3.3.0');
  if(!response.ok)throw new Error('Jolly 的动作画面暂时无法加载。');
  const manifest=await response.json(),atlas=manifest.warpAtlas,grid=manifest.grid;
  if(!atlas)throw new Error('动作资源正在更新，请刷新页面再试一次。');
  const base=new URL('./',response.url),narrow=matchMedia('(max-width:700px)').matches;
  const constrained=navigator.deviceMemory&&navigator.deviceMemory<=4;
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');stage.append(canvas);
  const renderer=createPoseRenderer(canvas);document.body.classList.add('unified-scene');
  const state={ready:false,paused:reducedMotion,reducedMotion,yaw:0,pitch:0,targetYaw:0,targetPitch:0,pointerActive:false,quality:'auto',activeQuality:'native',frames:0,poseChanges:0};
  let width=1,height=1,dpr=1,disposed=false,dirty=true,raf=0,last=performance.now();
  let bank=null,flows=[],flowBytes=0,controller=new AbortController(),generation=0,pending=0;
  let explore=false,zoom=1,drawn=[],lastDraw=0,displayedKey='',rect={x:0,y:0,w:0,h:0};
  let costs=[],intervals=[],errors=0,metricStart=performance.now(),metricFrames=0;
  const profile=value=>value==='low'?480:value==='balanced'?600:value==='high'?720:constrained?480:narrow?600:720;
  const url=file=>{const u=new URL(file,base);u.searchParams.set('v','3.3.0');return u;};
  async function loadItems(files,size,signal,progress=false){
    const items=new Array(files.length);let next=0,done=0;
    async function worker(){
      while(next<files.length){
        const index=next++;const r=await fetch(url(files[index]),{signal});
        if(!r.ok)throw new Error(`Pose asset ${r.status}`);
        const options={premultiplyAlpha:size?'premultiply':'none',colorSpaceConversion:'none'};
        if(size){options.resizeWidth=size*atlas.columns;options.resizeHeight=Math.round(size/manifest.aspect)*atlas.rows;options.resizeQuality='high';}
        const bitmap=await createImageBitmap(await r.blob(),options);
        if(disposed||signal.aborted){bitmap.close();throw new DOMException('Canceled','AbortError');}
        items[index]=renderer.upload(bitmap,!size);
        if(progress)onProgress(`Jolly 正在走来… ${Math.round(++done/files.length*100)}%`);
      }
    }
    const results=await Promise.allSettled(Array.from({length:2},worker));
    const failure=results.find(r=>r.status==='rejected');
    if(failure||disposed||signal.aborted){items.forEach(item=>renderer.release(item));throw failure?.reason||new DOMException('Canceled','AbortError');}
    return items;
  }
  async function loadBank(size,signal,progress=false){
    const items=await loadItems(atlas.images,size,signal,progress);
    return {width:size,height:Math.round(size/manifest.aspect),items,bytes:items.reduce((n,item)=>n+item.width*item.height*4,0),close(){items.forEach(item=>renderer.release(item));}};
  }
  function layout(){
    const nav=document.querySelector('.navigation');
    const caption=document.querySelector('.caption').getBoundingClientRect();
    const status=document.querySelector('.follow-status').getBoundingClientRect();
    const mobile=width<700,top=explore?72:nav.offsetTop+nav.offsetHeight+14;
    const bottom=explore?height-(mobile?145:110):Math.min(caption.top-24,mobile&&status.height?status.top-22:height);
    rect=fitCharacter(width,top,bottom,mobile?18:Math.min(width*.18,200),atlas.modelBounds,manifest.aspect,zoom);
    renderer.setBackdrop(paintBackdrop(width,height,dpr,rect,atlas.modelBounds,explore));
  }
  function resize(){width=Math.max(1,stage.clientWidth);height=Math.max(1,stage.clientHeight);dpr=Math.min(devicePixelRatio||1,state.quality==='low'?1.5:2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);layout();dirty=true;}
  const observer=new ResizeObserver(resize);observer.observe(stage);resize();
  function draw(pose){
    const start=performance.now();renderer.draw(bank,flows,pose,rect,width,height,dpr,atlas);
    const now=performance.now();drawn=[{id:pose.id,weight:1,tier:'native',width:bank.width,height:bank.height,warp:[pose.dx,pose.dy]}];
    costs.push(now-start);if(costs.length>600)costs.shift();if(lastDraw)intervals.push(now-lastDraw);if(intervals.length>600)intervals.shift();
    state.frames++;state.poseChanges++;lastDraw=now;dirty=false;
  }
  function pointer(x,y){if(state.paused)return;const p=pointerPose(x,y,width,height,rect.y+rect.h*.33,grid);state.targetYaw=p.yaw;state.targetPitch=p.pitch;state.pointerActive=true;}
  function center(){state.targetYaw=state.targetPitch=0;state.pointerActive=false;}
  function frame(now){
    if(disposed)return;raf=requestAnimationFrame(frame);const elapsed=(now-last)/1000;last=now;if(document.hidden||!bank)return;
    const dt=clamp(elapsed,0,.05),rate=reducedMotion?18:14;
    state.yaw+=(state.targetYaw-state.yaw)*(1-Math.exp(-rate*dt));state.pitch+=(state.targetPitch-state.pitch)*(1-Math.exp(-rate*dt));
    if(Math.abs(state.yaw-state.targetYaw)<.002)state.yaw=state.targetYaw;if(Math.abs(state.pitch-state.targetPitch)<.002)state.pitch=state.targetPitch;
    const pose=selectWarpPose(atlas,state.yaw,state.pitch),signature=`${pose.id}:${pose.dx.toFixed(5)}:${pose.dy.toFixed(5)}`;
    if(dirty||signature!==displayedKey){draw(pose);displayedKey=signature;}
  }
  let pinch=0;const pointers=new Map(),span=()=>{const p=[...pointers.values()];return p.length===2?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0;};
  function down(e){if(!explore)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});pinch=span();stage.setPointerCapture(e.pointerId);}
  function move(e){if(!explore)return;if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const distance=span();if(distance&&pinch){zoom=clamp(zoom*distance/pinch,1,1.4);layout();dirty=true;}else pointer(e.clientX,e.clientY);pinch=distance;}
  function up(e){pointers.delete(e.pointerId);pinch=span();}
  function wheel(e){if(!explore)return;e.preventDefault();zoom=clamp(zoom*Math.exp(-e.deltaY*.0008),1,1.4);layout();dirty=true;}
  const listeners=[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['wheel',wheel]];
  for(const [name,fn] of listeners)stage.addEventListener(name,fn,name==='wheel'?{passive:false}:undefined);
  async function setQuality(value){
    if(!['auto','low','balanced','high'].includes(value)||disposed)return;state.quality=value;resize();
    const size=profile(value),current=++generation;controller.abort();controller=new AbortController();pending=0;
    if(bank?.width===size)return;
    pending=1;
    try{const next=await loadBank(size,controller.signal);if(disposed||current!==generation){next.close();return;}const old=bank;bank=next;old?.close();dirty=true;}
    catch(e){if(e.name!=='AbortError')errors++;}
    finally{if(current===generation)pending=0;}
  }
  function dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();controller.abort();bank?.close();flows.flat().forEach(item=>renderer.release(item));renderer.dispose();document.body.classList.remove('unified-scene');for(const [name,fn] of listeners)stage.removeEventListener(name,fn);canvas.remove();}
  onProgress('Jolly 正在走来…');
  try{
    if(renderer.warping){const items=await loadItems(atlas.flows.flat(),0,controller.signal);flows=atlas.flows.map((_,i)=>items.slice(i*2,i*2+2));flowBytes=items.reduce((n,item)=>n+item.width*item.height*4,0);}
    bank=await loadBank(profile('auto'),controller.signal,true);
  }catch(e){dispose();throw new Error('Jolly 的动作画面未加载完整，请再试一次。');}
  draw(selectWarpPose(atlas,0,0));renderer.finishReady();state.ready=true;last=performance.now();raf=requestAnimationFrame(frame);
  return {state,pointer,center,setQuality,dispose,
    setPaused(value){state.paused=!!value;if(value){state.targetYaw=state.yaw;state.targetPitch=state.pitch;state.pointerActive=false;}},
    setExplore(value){explore=!!value;zoom=1;pointers.clear();pinch=0;layout();dirty=true;stage.classList.toggle('sequence-closeup',explore);},
    nudge(x,y){if(state.paused)return;state.targetYaw=clamp(state.targetYaw+x*180/Math.PI,grid.yaw[0],grid.yaw.at(-1));state.targetPitch=clamp(state.targetPitch+y*180/Math.PI,grid.pitch[0],grid.pitch.at(-1));},
    resetMetrics(){intervals=[];costs=[];metricStart=performance.now();metricFrames=state.frames;lastDraw=0;},
    inspectMaterials:()=>({source:'Blender Cycles rendered pixels',sourceSHA256:manifest.sourceSHA256}),inspectGeometry:()=>({renderer:renderer.type,runtimeTriangles:renderer.warping?2:0}),inspectGroom:()=>({fullDensityHair:manifest.fullDensityHair,sourceSHA256:manifest.sourceSHA256}),
    diagnostics(){const sorted=[...intervals].sort((a,b)=>a-b),seconds=(performance.now()-metricStart)/1000;return {...state,renderer:renderer.type,playerVersion:'3.3.0',assetVersion:manifest.version,sourceSHA256:manifest.sourceSHA256,frameCount:95,nativeFrames:95,interpolatedFrames:0,motionReady:!!bank,motionPoseCount:95,motionWidth:bank?.width,sourceLayers:1,crossfade:false,sceneLayers:1,opaque:renderer.opaque,stableBody:true,filter:'Catmull-Rom',warping:renderer.warping,yawDegrees:state.yaw,pitchDegrees:state.pitch,drawnFrames:drawn,frameSampleCount:intervals.length,measuredFPS:seconds?(state.frames-metricFrames)/seconds:null,p95FrameMs:sorted[Math.floor(sorted.length*.95)]||null,meanDrawMs:costs.reduce((a,b)=>a+b,0)/Math.max(1,costs.length),cacheMiB:((bank?.bytes||0)+flowBytes+renderer.backdropBytes)/1048576,cacheCount:(bank?.items.length||0)+flows.flat().length,pending,failed:errors,missingFrames:0,fallbackDraws:0,drawCalls:1,triangles:renderer.warping?2:0,canvas:[canvas.width,canvas.height],pixelRatio:dpr,rect,modelBounds:atlas.modelBounds,explore,view:{zoom},lastDraw};}
  };
}
