import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createNativeGroom,addMicroSurface} from './groom-d4.js';
import {createNativeNeck} from './neck-d4.js';
import {pointerToPose,damp,clamp,LIMITS} from './motion.js';

const readJSON=async url=>{const r=await fetch(url);if(!r.ok)throw new Error('Jolly 的资源暂时无法加载');return r.json();};

export async function createJolly(stage,{onProgress=()=>{},reducedMotion=false}={}){
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
  renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1.05;
  renderer.domElement.setAttribute('aria-hidden','true');stage.append(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-3,3,2,-2,.01,30);
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
  const environment=pmrem.fromScene(room,.06);scene.environment=environment.texture;scene.environmentIntensity=.45;room.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xfff7ed,0xa88c71,.50));
  const key=new THREE.DirectionalLight(0xfff7ed,2.6);key.position.set(-3,5,4);scene.add(key);
  const fill=new THREE.DirectionalLight(0xf1f4ff,.65);fill.position.set(3,2,4);scene.add(fill);
  const rim=new THREE.DirectionalLight(0xffedce,.9);rim.position.set(1,4,-3);scene.add(rim);
  function shadow(w,h,x,z,opacity){
    const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{opacity:{value:opacity}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float opacity;void main(){vec2 p=(vUv-.5)*2.;float a=exp(-dot(p,p)*4.5)*smoothstep(1.,.5,length(p));gl_FragColor=vec4(.28,.20,.14,a*opacity);}'});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.002,z);scene.add(mesh);return mesh;
  }
  // A low-angle floor is visible to the slightly elevated orthographic camera.
  shadow(3.8,3.0,-.35,-.05,.32);shadow(1.5,1.2,0,0,.32);
  for(const x of [-.24,.24])shadow(.48,.4,x,.12,.38);
  onProgress('Jolly 正在走来…');
  const manifest=await readJSON('./assets/model-manifest.json');
  const [gltf,groomData]=await Promise.all([new GLTFLoader().loadAsync('./assets/'+manifest.model),readJSON('./assets/'+manifest.groom)]);
  const model=gltf.scene;
  const master=model.getObjectByName('Jolly_D4_Master');
  if(!master||manifest.geometryRevision!=='d4'||master.userData.sourceSHA256!==manifest.sourceSHA256||groomData.sourceSHA256!==manifest.sourceSHA256)throw new Error('模型和毛发版本不一致，请重新导出完整模型');
  scene.add(model);model.updateMatrixWorld(true);
  const head=model.getObjectByName(manifest.headNode),shell=model.getObjectByName(manifest.continuousShell);
  if(!head||!shell)throw new Error('模型头部控制或连续外壳缺失');
  const neck=createNativeNeck(manifest);
  model.traverse(node=>{
    if(!node.isMesh)return;
    const material=node.material;
    if(/Face|Hand_|Foot_/.test(node.name))addMicroSurface(material,{scale:1400,strength:.20});
    if(/Fleece_Shell|Arm_|Leg_/.test(node.name))addMicroSurface(material,{scale:500,strength:.85});
    if(/Ear|Headband|Connector/.test(node.name)){
      material.envMapIntensity=.8;
      if(material.metalness>.5)material.roughness=Math.max(.32,material.roughness);
    }
    node.frustumCulled=false;
  });
  neck.bind(shell.material);
  const groom=await createNativeGroom(model,manifest,groomData,neck,onProgress);
  const state={ready:false,paused:reducedMotion,reducedMotion,yaw:0,pitch:0,targetYaw:0,targetPitch:0,pointerActive:false,quality:'auto',activeQuality:'balanced',frames:0};
  const fixed=manifest.stationaryNodes.map(n=>model.getObjectByName(n));
  const rigid=[];head.traverse(n=>{if(n.isMesh)rigid.push(n);});
  model.updateMatrixWorld(true);
  const fixedRest=fixed.map(n=>n.matrixWorld.toArray());
  const rigidRest=rigid.map(n=>n.matrixWorld.clone().premultiply(head.matrixWorld.clone().invert()).toArray());
  const metrics=[];let width=1,height=1,eyeScreen={x:0,y:0},dirty=true,raf=0,last=performance.now(),previousDraw=false,disposed=false,qualityWindow=[],explore=false;
  const view={yaw:0,pitch:0,zoom:1};let lastDraw=0;
  const initialBounds=new THREE.Box3().setFromObject(model);
  function applyQuality(mode){
    state.activeQuality=mode;groom.setQuality(mode);
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,{high:1.8,balanced:1.35,low:1}[mode]));renderer.setSize(width,height,false);dirty=true;
  }
  function positionCamera(){
    const mobile=width<700;
    const visible=(mobile?4.9:4.15)/view.zoom,aimY=mobile?1.08:1.16;
    camera.left=-visible*width/height/2;camera.right=-camera.left;camera.top=visible/2;camera.bottom=-camera.top;
    const target=new THREE.Vector3(0,aimY,0),elevation=.06+view.pitch,dist=8;
    camera.position.set(dist*Math.sin(view.yaw)*Math.cos(elevation),aimY+dist*Math.sin(elevation),dist*Math.cos(view.yaw)*Math.cos(elevation));camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const p=new THREE.Vector3(.01,1.8,.56).project(camera);eyeScreen={x:(p.x+1)*width/2,y:(1-p.y)*height/2};dirty=true;
  }
  function resize(){width=Math.max(1,stage.clientWidth);height=Math.max(1,stage.clientHeight);positionCamera();applyQuality(state.activeQuality);}
  const observer=new ResizeObserver(resize);observer.observe(stage);resize();
  function center(){state.targetYaw=state.targetPitch=0;state.pointerActive=false;if(explore){view.yaw=view.pitch=0;view.zoom=1;positionCamera();}}
  function pointer(x,y){if(state.paused||explore)return;const pose=pointerToPose(x,y,width,height,eyeScreen.x,eyeScreen.y);state.targetYaw=pose.yaw;state.targetPitch=pose.pitch;state.pointerActive=true;}
  function updatePose(){head.rotation.set(state.pitch,state.yaw,0,'YXZ');neck.update(state.yaw,state.pitch);model.updateMatrixWorld(true);}
  let drag=null,pinchDistance=0;const pointers=new Map();
  const span=()=>{const points=[...pointers.values()];return points.length===2?Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y):0;};
  function down(e){if(explore){pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});drag={x:e.clientX,y:e.clientY};pinchDistance=span();stage.setPointerCapture(e.pointerId);}}
  function move(e){if(explore&&drag){
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const distance=span();
    if(distance&&pinchDistance){view.zoom=clamp(view.zoom*distance/pinchDistance,.8,1.85);pinchDistance=distance;}
    else{view.yaw-=(e.clientX-drag.x)*.007;view.pitch=clamp(view.pitch+(e.clientY-drag.y)*.005,-.30,1.0);}
    drag={x:e.clientX,y:e.clientY};positionCamera();
  }}
  function up(e){pointers.delete(e.pointerId);pinchDistance=span();drag=pointers.size?[...pointers.values()][0]:null;}
  function wheel(e){if(!explore)return;e.preventDefault();view.zoom=clamp(view.zoom*Math.exp(-e.deltaY*.001),.8,1.85);positionCamera();}
  stage.addEventListener('pointerdown',down);stage.addEventListener('pointermove',move);stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',up);stage.addEventListener('wheel',wheel,{passive:false});
  function frame(now){
    if(disposed)return;raf=requestAnimationFrame(frame);const elapsed=(now-last)/1000;last=now;
    if(document.hidden){previousDraw=false;return;}
    const oldYaw=state.yaw,oldPitch=state.pitch;
    const dt=Math.min(.05,Math.max(0,elapsed));
    state.yaw=damp(state.yaw,state.targetYaw,dt,reducedMotion?18:11);state.pitch=damp(state.pitch,state.targetPitch,dt,reducedMotion?18:11);
    if(Math.abs(state.yaw-state.targetYaw)<.00005)state.yaw=state.targetYaw;
    if(Math.abs(state.pitch-state.targetPitch)<.00005)state.pitch=state.targetPitch;
    if(!dirty&&state.yaw===oldYaw&&state.pitch===oldPitch){previousDraw=false;return;}
    updatePose();renderer.render(scene,camera);dirty=false;state.frames++;lastDraw=now;
    if(previousDraw&&elapsed>0){metrics.push(elapsed*1000);if(metrics.length>360)metrics.shift();qualityWindow.push(elapsed);}
    previousDraw=true;
    if(state.quality==='auto'&&qualityWindow.length>=35){
      const fps=qualityWindow.length/qualityWindow.reduce((a,b)=>a+b,0);
      if(fps<44&&state.activeQuality==='balanced')applyQuality('low');qualityWindow=[];
    }
  }
  onProgress('马上就好…');await renderer.compileAsync(scene,camera);updatePose();renderer.render(scene,camera);state.ready=true;last=performance.now();raf=requestAnimationFrame(frame);
  return {
    state,pointer,center,
    setPaused(paused){state.paused=!!paused;if(paused){state.targetYaw=state.yaw;state.targetPitch=state.pitch;state.pointerActive=false;}},
    setQuality(mode){if(!['auto','high','balanced','low'].includes(mode))return;state.quality=mode;qualityWindow=[];applyQuality(mode==='auto'?'balanced':mode);},
    setExplore(value){explore=!!value;pointers.clear();drag=null;pinchDistance=0;center();if(!explore){view.yaw=view.pitch=0;view.zoom=1;positionCamera();}stage.classList.toggle('orbit-mode',explore);},
    nudge(x,y){if(state.paused)return;state.targetYaw=clamp(state.targetYaw+x,-LIMITS.yaw,LIMITS.yaw);state.targetPitch=clamp(state.targetPitch+y,-LIMITS.pitchUp,LIMITS.pitchDown);},
    resetMetrics(){metrics.length=0;qualityWindow=[];previousDraw=false;},
    inspectGroom:()=>groom.inspect(),
    inspectMaterials:()=>{const rows=[];model.traverse(n=>{if(n.isMesh&&!n.isInstancedMesh)rows.push({name:n.name,material:n.material.name,parent:n.parent.name,vertexColors:n.material.vertexColors});});return rows;},
    inspectGeometry:()=>{const rows=[];model.traverse(n=>{if(n.isMesh)rows.push({name:n.name,vertices:n.geometry.attributes.position.count,instances:n.count||1});});return rows;},
    diagnostics(){
      model.updateMatrixWorld(true);const inverse=head.matrixWorld.clone().invert();
      const drift=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
      const sorted=[...metrics].sort((a,b)=>a-b),mean=metrics.reduce((a,b)=>a+b,0)/Math.max(1,metrics.length);
      const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
      return {...state,assetVersion:manifest.assetVersion,geometryRevision:manifest.geometryRevision,sourceSHA256:manifest.sourceSHA256,
        modelAsset:manifest.model,groomSource:groom.stats(),headNode:head.name,
        bodyDrift:Object.fromEntries(fixed.map((n,i)=>[n.name,drift(n.matrixWorld.toArray(),fixedRest[i])])),
        headphonesLocalDrift:Math.max(...rigid.map((n,i)=>drift(n.matrixWorld.clone().premultiply(inverse).toArray(),rigidRest[i]))),
        yawDegrees:THREE.MathUtils.radToDeg(state.yaw),pitchDegrees:THREE.MathUtils.radToDeg(state.pitch),eyeScreen,
        frameSampleCount:metrics.length,measuredFPS:mean?1000/mean:null,p95FrameMs:sorted[Math.floor(sorted.length*.95)]||null,
        drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,pixelRatio:renderer.getPixelRatio(),canvas:[renderer.domElement.width,renderer.domElement.height],
        modelBounds:initialBounds.getSize(new THREE.Vector3()).toArray(),explore,view:{...view},lastDraw,
        renderer:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)};
    },
    dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();groom.dispose();model.traverse(n=>{if(n.isMesh){n.geometry.dispose();n.material.dispose();}});renderer.dispose();environment.dispose();},
  };
}
