import * as THREE from 'three';
import {referenceFleece} from './photo-fleece.js';

function faceCloth(source,restMatrix){
  const material=source.clone(),rest=restMatrix.clone();
  material.name='Jolly_Soft_Short_Pile';material.userData.surfaceTexture=true;
  material.vertexColors=false;material.color.set(0xffffff);material.roughness=1;
  material.normalScale.multiplyScalar(.85);material.sheen=.08;material.specularIntensity=.15;material.sheenRoughness=.96;material.envMapIntensity=.22;
  material.onBeforeCompile=shader=>{
    shader.uniforms.clothRestMatrix={value:rest};
    shader.vertexShader='uniform mat4 clothRestMatrix; varying vec3 clothRest;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      clothRest=(clothRestMatrix*vec4(position,1.)).xyz;
    `);
    shader.fragmentShader='varying vec3 clothRest;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      // Subtle short nap, without the yellow, high-contrast towel grain of v1.5.
      diffuseColor.rgb=mix(vec3(.74,.57,.40),diffuseColor.rgb,.68);
      vec2 cheek=vec2((abs(clothRest.x-.009)-.214)/.077,(clothRest.y-1.520)/.068);
      float pigment=exp(-dot(cheek,cheek)*1.10);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.82,.08,.10),pigment*.72);
    `);
  };
  material.customProgramCacheKey=()=> 'jolly-soft-face-v16';
  return material;
}

export async function dressJolly(model,anisotropy=4){
  const loader=new THREE.TextureLoader();
  const [photo,wool,facePile]=await Promise.all([loader.loadAsync('./assets/jolly-reference.png'),loader.loadAsync('./assets/wool-loop-v13.png'),loader.loadAsync('./assets/face-short-pile-v15.png')]);
  for(const texture of [photo,wool,facePile]){texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=anisotropy;}
  wool.wrapS=wool.wrapT=THREE.RepeatWrapping;wool.flipY=false;
  const rotation={value:new THREE.Vector4(0,0,0,1)};
  const fleeceNames=new Set(['Fleece_Shell','Arm_L','Arm_R','Leg_L','Leg_R']);
  model.traverse(node=>{
    if(!node.isMesh)return;
    for(const map of [node.material.map,node.material.normalMap])if(map)map.anisotropy=anisotropy;
    if(fleeceNames.has(node.name)){
      node.material=referenceFleece(photo,wool,node.matrixWorld,{moving:node.name==='Fleece_Shell',rotation});
      node.material.userData.surfaceTexture=true;return;
    }
    if(node.name==='Face'){node.material=faceCloth(node.material,node.matrixWorld);node.material.map=facePile;facePile.flipY=false;return;}
    const material=node.material.clone();node.material=material;
    if(node.name.startsWith('Eye_')){material.color.set(0x20130c);material.roughness=.24;material.envMapIntensity=1.1;}
    else if(node.name==='Nose'){material.color.set(0x302015);material.roughness=.38;}
    else if(node.name.startsWith('Hand_')||node.name.startsWith('Foot_')){material.color.set(0xe2c7a5);material.roughness=1;material.normalScale?.multiplyScalar(.30);material.sheen=.25;}
    else if(material.metalness>.5){material.color.set(0xd9d4c9);material.metalness=.82;material.roughness=.32;material.envMapIntensity=1.4;}
    else if(node.name.startsWith('EarPad_')||node.name==='Headband_Inner_Padding'){material.color.set(0x62594e);material.roughness=.96;}
  });
  return {rotation,texture:wool,photo};
}





