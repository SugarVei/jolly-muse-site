import * as THREE from 'three';
import {referenceFleece} from './photo-fleece-v17.js';

function faceCloth(source,restMatrix){
  const material=source.clone(),rest=restMatrix.clone();
  material.name='Jolly_Fine_Face_Velour_v17';material.userData.surfaceTexture=true;
  material.vertexColors=false;material.color.set(0xffffff);material.roughness=1;
  material.normalScale.setScalar(.27);material.sheen=.16;material.specularIntensity=.12;
  material.sheenRoughness=1;material.envMapIntensity=.20;
  material.onBeforeCompile=shader=>{
    shader.uniforms.clothRestMatrix={value:rest};
    shader.vertexShader='uniform mat4 clothRestMatrix; varying vec3 clothRest;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      clothRest=(clothRestMatrix*vec4(position,1.)).xyz;
    `);
    shader.fragmentShader='varying vec3 clothRest;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      diffuseColor.rgb=mix(vec3(.77,.63,.47),diffuseColor.rgb,.72);
      vec2 cheek=vec2((abs(clothRest.x-.009)-.214)/.077,(clothRest.y-1.520)/.068);
      float pigment=exp(-dot(cheek,cheek)*1.12);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.82,.10,.13),pigment*.61);
    `);
  };
  material.customProgramCacheKey=()=> 'jolly-fine-face-v17';
  return material;
}

function padCloth(source,restMatrix,pile){
  const rest=restMatrix.clone();
  const material=new THREE.MeshPhysicalMaterial({
    name:'Jolly_Hand_And_Toe_Velour_v17',color:0xfbf4e9,map:pile,
    normalMap:source.normalMap,normalScale:new THREE.Vector2(.22,.22),
    roughness:1,metalness:0,sheen:.27,sheenColor:0xf5e5cc,
    sheenRoughness:1,specularIntensity:.12,envMapIntensity:.18,
  });
  material.userData.surfaceTexture=true;
  material.onBeforeCompile=shader=>{
    shader.uniforms.padRestMatrix={value:rest};
    shader.vertexShader='uniform mat4 padRestMatrix; varying vec3 padRest;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      padRest=(padRestMatrix*vec4(position,1.)).xyz;
    `);
    shader.fragmentShader='varying vec3 padRest;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 nap=padRest.xy*vec2(3200.,3000.);
      float napFilter=1.-smoothstep(.7,2.5,max(fwidth(nap.x),fwidth(nap.y)));
      float grain=sin(nap.x+.3*sin(nap.y*.61))*sin(nap.y);
      diffuseColor.rgb*=1.+grain*napFilter*.018;
    `);
  };
  material.customProgramCacheKey=()=> 'jolly-pad-velour-v17';
  return material;
}

export async function dressJolly(model,anisotropy=4){
  const loader=new THREE.TextureLoader();
  const [photo,video,wool,facePile]=await Promise.all([
    loader.loadAsync('./assets/jolly-reference.png'),
    loader.loadAsync('./assets/jolly-video-reference-v17.png'),
    loader.loadAsync('./assets/wool-loop-v13.png'),
    loader.loadAsync('./assets/face-short-pile-v15.png'),
  ]);
  for(const texture of [photo,video,wool,facePile]){
    texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=anisotropy;
  }
  wool.wrapS=wool.wrapT=THREE.RepeatWrapping;wool.flipY=false;facePile.flipY=false;
  const rotation={value:new THREE.Vector4(0,0,0,1)};
  const reference={photo,video,wool};
  const fleeceNames=new Set(['Fleece_Shell','Arm_L','Arm_R','Leg_L','Leg_R']);
  model.traverse(node=>{
    if(!node.isMesh)return;
    for(const map of [node.material.map,node.material.normalMap])if(map)map.anisotropy=anisotropy;
    if(fleeceNames.has(node.name)){
      node.material=referenceFleece(reference,node.matrixWorld,{moving:node.name==='Fleece_Shell',rotation});
      node.material.userData.surfaceTexture=true;return;
    }
    if(node.name==='Face'){
      node.material=faceCloth(node.material,node.matrixWorld);node.material.map=facePile;return;
    }
    if(node.name.startsWith('Hand_')||node.name.startsWith('Foot_')){
      node.material=padCloth(node.material,node.matrixWorld,facePile);return;
    }
    const material=node.material.clone();node.material=material;
    if(node.name.startsWith('Eye_')){
      material.color.set(0x20130c);material.roughness=.24;material.envMapIntensity=1.1;
    }else if(node.name==='Nose'){
      material.color.set(0x302015);material.roughness=.38;
    }else if(material.metalness>.5){
      material.color.set(0xd9d4c9);material.metalness=.82;material.roughness=.32;material.envMapIntensity=1.4;
    }else if(node.name.startsWith('EarPad_')||node.name==='Headband_Inner_Padding'){
      material.color.set(0x62594e);material.roughness=.96;
    }
  });
  return {rotation,texture:wool,photo,video};
}
