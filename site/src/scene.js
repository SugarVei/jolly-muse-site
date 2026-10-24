import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createExportedGroom} from './groom-v18.js';
import {createExportedFiberGroom} from './groom-v181.js';
import {createClothNap} from './cloth-nap-v18.js';
import {prepareExportedMaterials} from './materials-v18.js';
import {createSoftNeck} from './neck.js';
import {pointerToPose,damp,clamp} from './motion.js';

export async function createJolly(stage,{onProgress=()=>{},reducedMotion=false}={}){
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
  renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.75;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.domElement.setAttribute('aria-hidden','true');stage.append(renderer.domElement);
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(29,1,.1,40);
  const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();
  const environment=pmrem.fromScene(room,.05);scene.environment=environment.texture;scene.environmentIntensity=.35;room.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xfff5e6,0x8f7456,.65));
  const key=new THREE.DirectionalLight(0xfff3df,2.0);key.position.set(-3,5,4);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-2.4;key.shadow.camera.right=2.4;key.shadow.camera.top=3.3;key.shadow.camera.bottom=-1;key.shadow.camera.near=.1;key.shadow.camera.far=12;key.shadow.normalBias=.018;key.shadow.bias=-.00015;key.shadow.radius=3;key.target.position.set(0,1,0);scene.add(key,key.target);
  const fill=new THREE.DirectionalLight(0xf5f6ff,.4);fill.position.set(3,2,4);scene.add(fill);
  const rim=new THREE.DirectionalLight(0xffe8c7,1.0);rim.position.set(0,3,-2);scene.add(rim);
  const shadowMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uOpacity:{value:.27}},vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv; uniform float uOpacity; void main(){vec2 p=(vUv-.5)*2.;float a=exp(-dot(p,p)*3.8)*smoothstep(1.,.55,length(p));gl_FragColor=vec4(.30,.23,.17,a*uOpacity);}' });
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(3.4,2.1),shadowMaterial);floor.rotation.x=-Math.PI/2;floor.position.set(-.14,.018,.05);scene.add(floor);
  const contact=new THREE.Mesh(new THREE.PlaneGeometry(1.35,.72),shadowMaterial.clone());contact.material.uniforms.uOpacity.value=.22;contact.rotation.x=-Math.PI/2;contact.position.set(0,.02,0);scene.add(contact);
  for(const x of [-.239,.239]){
    const footContact=new THREE.Mesh(new THREE.PlaneGeometry(.38,.32),shadowMaterial.clone());
    footContact.material.uniforms.uOpacity.value=.40;footContact.rotation.x=-Math.PI/2;footContact.position.set(x,.021,.13);scene.add(footContact);
  }

  onProgress('正在整理柔软的卷毛…');
  const manifest=await fetch('./assets/model-manifest.json').then(checkJSON);
  if(manifest.geometryBaked!==true||!manifest.groom)throw new Error('当前模型没有 Blender 主文件导出标记');
  const [gltf,groomData]=await Promise.all([
    new GLTFLoader().loadAsync('./assets/'+manifest.model),
    fetch('./assets/'+manifest.groom).then(checkJSON),
  ]);
  if(groomData.revision!==manifest.geometryRevision||groomData.geometryBaked!==true||
      !manifest.sourceSHA256||groomData.sourceSHA256!==manifest.sourceSHA256){
    throw new Error('模型与卷毛数据来自不同的 Blender 主文件导出，请重新完整导出');
  }
  const model=gltf.scene;model.name='Jolly';scene.add(model);
  const master=model.getObjectByName('Plush_Character_Master');
  const geometryRevision=master?.userData.geometryRevision;
  if(geometryRevision!==manifest.geometryRevision||master?.userData.geometryBaked!==true||
      master?.userData.sourceSHA256!==manifest.sourceSHA256)throw new Error('模型版本与 Blender 导出清单不一致');
  model.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
  model.updateMatrixWorld(true);
  prepareExportedMaterials(model,{anisotropy:Math.min(16,renderer.capabilities.getMaxAnisotropy()),look:groomData.look});
  const neck=model.getObjectByName('Jolly_Neck');const head=model.getObjectByName('Head');const body=model.getObjectByName('Body');const phones=model.getObjectByName('Headphones_Controller');
  if(!neck||!head||!body||!phones)throw new Error('模型缺少独立头部控制结构');
  const softNeck=createSoftNeck(manifest);
  const shell=model.getObjectByName(manifest.continuousShell);
  if(!shell?.isMesh)throw new Error('模型缺少连续毛绒外壳');
  softNeck.bind(shell.material);shell.frustumCulled=false;
  shell.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});softNeck.bind(shell.customDepthMaterial);
  const boucle=await (groomData.yarnMaterial?createExportedFiberGroom:createExportedGroom)(model,manifest,groomData,softNeck);
  const napEntries=Object.entries(groomData.clothNap||{});
  if(napEntries.length!==5)throw new Error('主文件短绒配置不完整');
  const naps=napEntries.map(([name,config])=>({name,...createClothNap(model.getObjectByName(name),softNeck,{...config,guide:groomData.clothNapGuide})}));
  const fleece={...boucle,setDensity(r){
    boucle.setDensity(r);
    for(const nap of naps)nap.setDensity(Math.min(1,(nap.name==='Face'?.3:.45)+r));
  }};
  const state={ready:true,paused:reducedMotion,reducedMotion,yaw:0,pitch:0,targetYaw:0,targetPitch:0,pointerActive:false,quality:'auto',activeQuality:'balanced',frames:0};
  let width=1,height=1,last=performance.now(),raf=0,disposed=false,rendered=false,dirty=true,autoElapsed=0,autoFrames=0,qualityCooldown=0,frameTimes=[],eyeScreen={x:0,y:0};
  const eye=model.getObjectByName('Nose');const neutralNeck=neck.quaternion.clone();const targetQ=new THREE.Quaternion();const euler=new THREE.Euler(0,0,0,'YXZ');
  const stationary=manifest.stationaryNodes.map(name=>model.getObjectByName(name)).filter(Boolean);
  const initialMatrices=Object.fromEntries(stationary.map(n=>[n.name,n.matrixWorld.toArray()]));
  const phoneLocal=phones.matrix.clone().toArray();
  const bodyBounds=new THREE.Box3().setFromObject(model);
  const materialTextures=new Set();
  model.traverse(node=>{
    if(!node.isMesh)return;
    for(const material of Array.isArray(node.material)?node.material:[node.material]){
      for(const value of Object.values(material||{}))if(value?.isTexture)materialTextures.add(value);
    }
  });

  function applyQuality(mode){
    const settings={high:{dpr:2,shadow:2048},balanced:{dpr:1.5,shadow:1024},low:{dpr:1,shadow:512}}[mode];
    settings.density=groomData.groomDensities[mode];
    if(!Number.isFinite(settings.density))throw new Error('主文件缺少画质密度配置');
    state.activeQuality=mode;
    if(manifest.assetVersion==='1.8.1'){
      const anisotropy=Math.min({high:8,balanced:4,low:2}[mode],renderer.capabilities.getMaxAnisotropy());
      for(const texture of materialTextures)if(texture.anisotropy!==anisotropy){texture.anisotropy=anisotropy;texture.needsUpdate=true;}
    }
    dirty=true;
    key.castShadow=mode==='high';
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,settings.dpr));
    renderer.setSize(width,height,false);fleece.setDensity(settings.density);
    if(key.shadow.mapSize.x!==settings.shadow){key.shadow.mapSize.setScalar(settings.shadow);key.shadow.map?.dispose();key.shadow.map=null;}
  }
  function resize(){
    width=stage.clientWidth;height=stage.clientHeight;camera.aspect=width/height;
    const mobile=width<700;
    const visibleHeight=mobile?4.55:3.95;
    const distance=Math.max(visibleHeight/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))),1.95/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));
    const aimY=mobile?.88:1.095;
    camera.position.set(0,aimY,distance);camera.lookAt(0,aimY,0);camera.updateProjectionMatrix();
    applyQuality(state.activeQuality);
    const old=neck.quaternion.clone();neck.quaternion.copy(neutralNeck);model.updateMatrixWorld(true);
    const p=eye.getWorldPosition(new THREE.Vector3()).project(camera);eyeScreen={x:(p.x+1)*width/2,y:(1-p.y)*height/2};neck.quaternion.copy(old);
  }
  const observer=new ResizeObserver(resize);observer.observe(stage);resize();
  function pointer(x,y){if(state.paused)return;const pose=pointerToPose(x,y,width,height,eyeScreen.x,eyeScreen.y);state.targetYaw=pose.yaw;state.targetPitch=pose.pitch;state.pointerActive=true;}
  function center(){state.targetYaw=0;state.targetPitch=0;state.pointerActive=false;}
  function setPaused(value){state.paused=Boolean(value);if(value)state.pointerActive=false;}
  function setQuality(value){state.quality=value;autoElapsed=0;autoFrames=0;qualityCooldown=performance.now()+5000;applyQuality(value==='auto'?'balanced':value);}
  function frame(now){
    if(disposed)return;
    raf=requestAnimationFrame(frame);
    const actualDt=(now-last)/1000;const dt=Math.min(.05,Math.max(0,actualDt));last=now;
    if(document.hidden)return;
    // Pausing freezes the current pose; explicit recenter is still available.
    const oldYaw=state.yaw,oldPitch=state.pitch;
    state.yaw=damp(state.yaw,state.targetYaw,dt,reducedMotion?18:11);
    state.pitch=damp(state.pitch,state.targetPitch,dt,reducedMotion?18:11);
    if(Math.abs(state.yaw-state.targetYaw)<.00001)state.yaw=state.targetYaw;
    if(Math.abs(state.pitch-state.targetPitch)<.00001)state.pitch=state.targetPitch;
    if(!dirty&&state.yaw===oldYaw&&state.pitch===oldPitch)return;
    dirty=false;
    euler.set(state.pitch,state.yaw,0);targetQ.setFromEuler(euler);neck.quaternion.copy(neutralNeck).multiply(targetQ);
    softNeck.update(targetQ);
    renderer.render(scene,camera);state.frames++;
    if(rendered&&actualDt>0){frameTimes.push(actualDt*1000);if(frameTimes.length>180)frameTimes.shift();}
    rendered=true;
    if(state.quality==='auto'&&now>qualityCooldown){
      autoElapsed+=actualDt;autoFrames++;
      if(autoElapsed>4){
        const fps=autoFrames/autoElapsed;
        if(fps<48&&state.activeQuality!=='low'){applyQuality('low');qualityCooldown=now+15000;}
        autoElapsed=0;autoFrames=0;
      }
    }
  }
  document.addEventListener('visibilitychange',()=>{last=performance.now();});
  raf=requestAnimationFrame(frame);
  return {
    state,pointer,center,setQuality,
    inspectGroom(){return boucle.inspect();},
    resetMetrics(){frameTimes=[];last=performance.now();},
    inspectMaterials(){const rows=[];model.traverse(n=>{if(n.isMesh&&!n.isInstancedMesh)rows.push({name:n.name,parent:n.parent?.name,material:n.material?.name,map:!!n.material?.map,normalMap:!!n.material?.normalMap,surfaceTexture:!!n.material?.userData.surfaceTexture,referenceViews:n.material?.userData.referenceViews||0,vertexColors:!!n.material?.vertexColors,referenceProjection:!!n.material?.userData.photoProjection});});return rows;},
    inspectGeometry(){const rows=[];model.traverse(n=>{if(!n.isMesh)return;const attributes=n.geometry.attributes;rows.push({name:n.name,parent:n.parent?.name,instances:n.isInstancedMesh?n.count:1,vertices:attributes.position.count,finite:Object.values(attributes).every(a=>Array.from(a.array).every(Number.isFinite))});});return rows;},
    setPaused(value){if(value){state.targetYaw=state.yaw;state.targetPitch=state.pitch;}setPaused(value);},
    nudge(x,y){if(state.paused)return;state.targetYaw=clamp(state.targetYaw+x,-.698,.698);state.targetPitch=clamp(state.targetPitch+y,-.332,.279);},
    diagnostics(){
      model.updateMatrixWorld(true);
      const drift=Object.fromEntries(stationary.map(n=>[n.name,Math.max(...n.matrixWorld.toArray().map((x,i)=>Math.abs(x-initialMatrices[n.name][i])))]));
      const sorted=[...frameTimes].sort((a,b)=>a-b);const mean=frameTimes.reduce((a,b)=>a+b,0)/Math.max(1,frameTimes.length);
      const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
      return {...state,assetVersion:manifest.assetVersion||'1.8.0',geometryRevision,geometryBaked:manifest.geometryBaked,modelAsset:manifest.model,groomAsset:manifest.groom,groomSource:boucle.stats(),headNode:neck.name,headParent:head.parent.name,headphoneParent:phones.parent.name,bodyDrift:drift,headphonesLocalDrift:Math.max(...phones.matrix.toArray().map((x,i)=>Math.abs(x-phoneLocal[i]))),yawDegrees:THREE.MathUtils.radToDeg(state.yaw),pitchDegrees:THREE.MathUtils.radToDeg(state.pitch),eyeScreen,frameSampleCount:frameTimes.length,measuredFPS:mean?1000/mean:0,p95FrameMs:sorted[Math.floor(sorted.length*.95)]||0,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,pixelRatio:renderer.getPixelRatio(),canvas:[renderer.domElement.width,renderer.domElement.height],modelBounds:bodyBounds.getSize(new THREE.Vector3()).toArray(),renderer:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)};
    },
    dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();renderer.dispose();environment.dispose();},
  };
}
async function checkJSON(response){if(!response.ok)throw new Error('资源加载失败');return response.json();}





