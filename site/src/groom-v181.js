import * as THREE from 'three';

// Upload the current Blender curves and roots without rebuilding their shape.
function curveGeometry(template,index){
  for(const key of ['position','normal','uv','index']){
    if(!Array.isArray(template[key])||!template[key].every(Number.isFinite))throw new Error('主文件毛束模板无效: '+key);
  }
  const vertices=template.position.length/3;
  if(!Number.isInteger(vertices)||template.normal.length!==vertices*3||template.uv.length!==vertices*2||
      !template.index.every(i=>Number.isInteger(i)&&i>=0&&i<vertices))throw new Error('主文件毛束拓扑无效');
  const geometry=new THREE.BufferGeometry();geometry.name=template.name||'Master_Fiber_Template_'+index;
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(template.position,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(template.normal,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(template.uv,2));
  geometry.setIndex(template.index);geometry.computeBoundingSphere();return geometry;
}

function linearColor(value,fallback){
  if(Array.isArray(value))return new THREE.Color().fromArray(value);
  return new THREE.Color(value??fallback);
}

async function fiberTexture(filename,{color=false,repeat=[1,1],flipY=true,anisotropy=4}={}){
  if(!filename)return null;
  const texture=await new THREE.TextureLoader().loadAsync(new URL('../assets/'+filename,import.meta.url).href);
  texture.name=filename;texture.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(...repeat);
  // The curve UVs are exported directly from Blender, rather than flipped by glTF.
  texture.flipY=flipY;texture.anisotropy=anisotropy;texture.needsUpdate=true;return texture;
}

export async function createExportedFiberGroom(model,manifest,data,softNeck){
  if(!Array.isArray(data.templates)||!Array.isArray(data.parts)||!data.yarnMaterial)throw new Error('缺少主文件细纤维材质或毛根数据');
  const spec=data.yarnMaterial,look=data.look||{},geometries=data.templates.map(curveGeometry);
  const repeat=spec.uvScale||[1,1];
  if(repeat.length!==2||!repeat.every(n=>Number.isFinite(n)&&n>0))throw new Error('毛束纹理比例无效');
  const flipY=spec.uvOrigin!=='glTF';
  const [map,normalMap]=await Promise.all([
    fiberTexture(spec.albedoTexture,{color:true,repeat,flipY}),
    fiberTexture(spec.normalTexture,{repeat,flipY}),
  ]);
  const parameters={
    color:linearColor(spec.baseColor,look.groomColor||'#e8d0aa'),
    metalness:0,roughness:spec.roughness??look.groomRoughness??1,
    sheen:spec.sheen??look.groomSheen??.18,
    sheenColor:linearColor(spec.sheenColor,look.groomColor||'#e8d0aa'),
    sheenRoughness:spec.sheenRoughness??1,
    specularIntensity:spec.specularIntensity??.15,
    envMapIntensity:spec.envMapIntensity??.28,
    map,normalMap,normalScale:new THREE.Vector2(spec.normalStrength??.3,spec.normalStrength??.3),
  };
  const flat=new THREE.MeshPhysicalMaterial({...parameters,name:'Master_Fiber_PBR_v181'});
  const bent=new THREE.MeshPhysicalMaterial({...parameters,name:'Master_Continuous_Fiber_PBR_v181'});
  for(const material of [flat,bent])material.userData={masterMaterial:true,source:'Blender_Master_Curve',yarnMaterial:spec};
  softNeck.bind(bent,{instanced:true,cacheRootQuaternion:true});
  const meshes=[];let sourceRoots=0;
  for(const part of data.parts){
    const count=part.count,target=model.getObjectByName(part.part),geometry=geometries[part.variant];
    if(!target?.isMesh||!geometry||!Number.isInteger(count)||count<0||part.matrices.length!==count*16||
        !part.matrices.every(Number.isFinite)||part.rootIds?.length!==count)throw new Error('主文件毛根实例无效: '+part.part);
    if(count===0)continue;
    const mesh=new THREE.InstancedMesh(geometry,part.part===manifest.continuousShell?bent:flat,count);
    mesh.name=part.name||`Boucle_${part.part}_${part.variant}`;
    Object.assign(mesh.userData,{realBoucle:true,exportedFromMaster:true,fullCount:count,sourceRootIds:[...part.rootIds],neckWeights:part.neckWeights||[]});
    mesh.instanceMatrix.array.set(part.matrices);mesh.instanceMatrix.needsUpdate=true;
    if(part.rootTint){
      if(part.rootTint.length!==count*3||!part.rootTint.every(Number.isFinite))throw new Error('主文件毛根颜色无效');
      mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(part.rootTint),3);
    }
    mesh.castShadow=false;mesh.receiveShadow=true;mesh.frustumCulled=false;target.add(mesh);meshes.push(mesh);sourceRoots+=count;
  }
  return {
    meshes,materials:[flat,bent],
    setDensity(ratio){const d=THREE.MathUtils.clamp(ratio,0,1);for(const mesh of meshes)mesh.count=Math.max(1,Math.round(mesh.userData.fullCount*d));},
    stats(){return {source:'Blender_Master',sourceRoots,templates:geometries.length,tufts:meshes.reduce((n,m)=>n+m.count,0),triangles:meshes.reduce((n,m)=>n+m.count*m.geometry.index.count/3,0),material:'standard-fiber-pbr'};},
    inspect(){return {source:'Blender_Master',sourceRoots,templateCount:geometries.length,yarnMaterial:spec,parts:meshes.map(m=>({name:m.name,part:m.parent.name,count:m.count,fullCount:m.userData.fullCount,rootIds:m.userData.sourceRootIds}))};},
    dispose(){for(const mesh of meshes){mesh.removeFromParent();mesh.dispose();}for(const geometry of geometries)geometry.dispose();flat.dispose();bent.dispose();map?.dispose();normalMap?.dispose();},
  };
}
