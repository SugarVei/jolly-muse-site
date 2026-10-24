import * as THREE from 'three';

// The master Blender file owns templates, root order and instance transforms.
// This reader uploads the exported arrays; it does not resample or regroom.
function readGeometry(template,index){
  for(const key of ['position','normal','uv','index']){
    if(!Array.isArray(template[key])||!template[key].every(Number.isFinite))throw new Error('卷毛模板数据无效: '+key);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.name=template.name||'Master_Groom_Template_'+index;
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(template.position,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(template.normal,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(template.uv,2));
  geometry.setIndex(template.index);
  geometry.computeBoundingSphere();
  return geometry;
}

function yarnMaterial(source,softNeck,bend,look){
  const material=new THREE.MeshPhysicalMaterial({
    name:bend?'Master_Continuous_Boucle_v18':'Master_Boucle_v18',
    color:source.color.clone(),roughness:look.groomRoughness??source.roughness??1,metalness:0,
    sheen:look.groomSheen??source.sheen??.14,
    sheenColor:look.groomColor?new THREE.Color(look.groomColor):source.sheenColor?.clone()||source.color.clone(),
    sheenRoughness:source.sheenRoughness??1,
    normalMap:source.normalMap||null,
    normalScale:source.normalScale?.clone()||new THREE.Vector2(1,1),
    specularIntensity:source.specularIntensity??.15,
    envMapIntensity:look.envMapIntensity??.28,
  });
  const albedo=source.map;
  material.onBeforeCompile=shader=>{
    shader.uniforms.masterYarnAlbedo={value:albedo};
    shader.uniforms.masterYarnFrequency={value:look.textureFrequency??1.3};
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      varying vec3 masterYarnRest,masterYarnRootNormal;
      varying vec2 masterYarnUV;
    `).replace('#include <begin_vertex>',`#include <begin_vertex>
      masterYarnRest=(modelMatrix*instanceMatrix*vec4(position,1.)).xyz;
      masterYarnRootNormal=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*vec3(0.,0.,1.));
      masterYarnUV=uv;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      uniform sampler2D masterYarnAlbedo;
      uniform float masterYarnFrequency;
      varying vec3 masterYarnRest,masterYarnRootNormal;
      varying vec2 masterYarnUV;
    `).replace('#include <color_fragment>',`#include <color_fragment>
      ${albedo?`
        vec3 weights=pow(abs(normalize(masterYarnRootNormal)),vec3(4.));
        weights/=max(dot(weights,vec3(1.)),.0001);
        vec3 p=masterYarnRest*masterYarnFrequency;
        vec3 pile=texture2D(masterYarnAlbedo,p.yz).rgb*weights.x+
                  texture2D(masterYarnAlbedo,p.xz).rgb*weights.y+
                  texture2D(masterYarnAlbedo,p.xy).rgb*weights.z;
        diffuseColor.rgb*=pile;
      `:''}
      float phase=masterYarnUV.y*11.+masterYarnUV.x*4.1;
      float grain=sin(phase*6.2831853)*(1.-smoothstep(.3,1.,fwidth(phase)));
      diffuseColor.rgb*=1.+grain*.012;
    `);
  };
  material.customProgramCacheKey=()=>`master-yarn-v18-${bend}-${!!albedo}`;
  if(bend)softNeck.bind(material,{instanced:true});
  return material;
}

export function createExportedGroom(model,manifest,data,softNeck){
  if(!data||!Array.isArray(data.templates)||!Array.isArray(data.parts))throw new Error('Blender 卷毛导出文件不完整');
  const look=data.look||{};
  const geometries=data.templates.map(readGeometry);
  const shell=model.getObjectByName(manifest.continuousShell);
  const flat=yarnMaterial(shell.material,softNeck,false,look);
  const bent=yarnMaterial(shell.material,softNeck,true,look);
  const meshes=[];
  let sourceRoots=0;
  for(const part of data.parts){
    const target=model.getObjectByName(part.part),geometry=geometries[part.variant];
    if(!target?.isMesh||!geometry)throw new Error('毛根绑定对象或模板不存在: '+part.part);
    const count=part.count;
    if(!Number.isInteger(count)||count<1||part.matrices.length!==count*16||!part.matrices.every(Number.isFinite))throw new Error('卷毛实例矩阵无效');
    if(!Array.isArray(part.rootIds)||part.rootIds.length!==count)throw new Error('卷毛缺少稳定毛根标识');
    const mesh=new THREE.InstancedMesh(geometry,part.part===manifest.continuousShell?bent:flat,count);
    mesh.name=part.name||`Boucle_${part.part}_${part.variant}`;
    mesh.userData.realBoucle=true;mesh.userData.exportedFromMaster=true;
    mesh.userData.fullCount=count;mesh.userData.sourceRootIds=[...part.rootIds];
    mesh.userData.neckWeights=part.neckWeights||[];
    mesh.instanceMatrix.array.set(part.matrices);
    mesh.instanceMatrix.needsUpdate=true;
    mesh.castShadow=false;mesh.receiveShadow=true;mesh.frustumCulled=false;
    target.add(mesh);meshes.push(mesh);sourceRoots+=count;
  }
  return {
    meshes,materials:[flat,bent],
    setDensity(ratio){
      const d=THREE.MathUtils.clamp(ratio,0,1);
      for(const mesh of meshes)mesh.count=Math.max(1,Math.round(mesh.userData.fullCount*d));
    },
    stats(){
      return {source:'Blender_Master',sourceRoots,templates:geometries.length,
        tufts:meshes.reduce((n,m)=>n+m.count,0),
        triangles:meshes.reduce((n,m)=>n+m.count*m.geometry.index.count/3,0)};
    },
    inspect(){
      return {source:'Blender_Master',sourceRoots,templateCount:geometries.length,
        parts:meshes.map(m=>({name:m.name,part:m.parent.name,count:m.count,fullCount:m.userData.fullCount,rootIds:m.userData.sourceRootIds}))};
    },
    dispose(){for(const mesh of meshes)mesh.removeFromParent();for(const geometry of geometries)geometry.dispose();flat.dispose();bent.dispose();},
  };
}
