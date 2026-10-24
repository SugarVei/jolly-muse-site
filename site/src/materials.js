import * as THREE from 'three';
import {plushMaterial} from './plush-material.js';
import {multiViewFleece} from './multi-view-fleece.js';

export async function dressJolly(model,anisotropy=4){
  const texture=model.getObjectByName('Fleece_Shell').material.map;
  const loader=new THREE.TextureLoader();
  const maps=await Promise.all(['reference-front-v15.png','reference-left-v15.png','reference-right-v15.png','face-blush-v15.png'].map(name=>loader.loadAsync('./assets/'+name)));
  for(const map of maps){map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=anisotropy;}
  model.traverse(node=>{if(node.isMesh)for(const map of [node.material.map,node.material.normalMap])if(map)map.anisotropy=anisotropy;});
  const rotation={value:new THREE.Vector4(0,0,0,1)};
  const fleeceNames=new Set(['Fleece_Shell','Arm_L','Arm_R','Leg_L','Leg_R']);
  model.traverse(node=>{
    if(!node.isMesh)return;
    if(fleeceNames.has(node.name)){
      node.material=multiViewFleece(maps,texture,node.matrixWorld,rotation);
      return;
    }
    if(node.name==='Face'){
      node.material=plushMaterial(node.material,{face:true});
      maps[3].flipY=false;maps[3].wrapS=maps[3].wrapT=THREE.RepeatWrapping;
      maps[3].repeat.x=.87;maps[3].offset.set(.065,-.07);
      node.material.map=maps[3];node.material.vertexColors=false;node.material.color.set(0xead4b7);
      return;
    }
    const m=node.material;
    if(node.name.startsWith('Eye_')){m.roughness=.22;m.envMapIntensity=1.2;m.color.set(0x23160d);}
    if(node.name==='Nose'){m.roughness=.38;m.color.set(0x382418);}
    if(node.name==='Headband_Inner_Padding'){m.color.set(0x665749);m.metalness=0;m.roughness=.9;}
    if(node.name.startsWith('Hand_')||node.name.startsWith('Foot_')){
      // Separate pad materials prevent the foot cleft shader from also being
      // installed on the hands when the source GLB shares their material.
      node.material=m.clone();const pad=node.material;
      pad.name=node.name.startsWith('Foot_')?'Suede_Foot_Pad':'Suede_Mitten';
      pad.roughness=.94;pad.color.set(0xc5a27a);
      pad.onBeforeCompile=shader=>{
        shader.vertexShader='varying vec3 suedePoint;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsuedePoint=position;');
        shader.fragmentShader='varying vec3 suedePoint;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float suedeGrain=fract(sin(dot(floor(suedePoint*380.),vec3(12.9898,78.233,31.371)))*43758.5453);
          float grainFootprint=max(length(dFdx(suedePoint*380.)),length(dFdy(suedePoint*380.)));
          diffuseColor.rgb*=1.+.09*(suedeGrain-.5)*(1.-smoothstep(.5,1.5,grainFootprint));
          ${node.name.startsWith('Foot_')?`
            float toeCleft=exp(-pow(suedePoint.x/.010,2.))*smoothstep(.070,.148,suedePoint.z)*(1.-smoothstep(.025,.065,suedePoint.y));
            diffuseColor.rgb*=1.-.08*toeCleft;
          `:`
            float mittenCleft=exp(-pow(suedePoint.x/.008,2.))*smoothstep(.043,.078,suedePoint.z)*(1.-smoothstep(-.035,.010,suedePoint.y));
            diffuseColor.rgb*=1.-.06*mittenCleft;
          `}
        `);
        shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
          // Filtered microrelief gives the pads a short textile nap.
          vec3 clothPhase=suedePoint*vec3(850.,930.,790.);
          float clothWidth=max(length(dFdx(clothPhase)),length(dFdy(clothPhase)));
          float clothHeight=.00028*sin(clothPhase.x+sin(clothPhase.z))*sin(clothPhase.y)*cos(clothPhase.z)*(1.-smoothstep(.8,2.4,clothWidth));
          vec3 clothX=dFdx(-vViewPosition),clothY=dFdy(-vViewPosition);
          vec3 clothR1=cross(clothY,normal),clothR2=cross(normal,clothX);
          float clothDet=dot(clothX,clothR1);
          vec3 clothGradient=sign(clothDet)*(dFdx(clothHeight)*clothR1+dFdy(clothHeight)*clothR2);
          normal=normalize(abs(clothDet)*normal-clothGradient+normal*1.e-12);
        `);
      };pad.customProgramCacheKey=()=>pad.name+'-v14';pad.needsUpdate=true;
      return;
    }
    if(m.metalness>.5){
      m.roughness=Math.max(.28,m.roughness*.8);m.color.set(0xd4cec0);m.metalness=.82;m.envMapIntensity=1.9;
      m.onBeforeCompile=shader=>{
        shader.vertexShader='varying vec3 brushedPoint;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nbrushedPoint=position;');
        shader.fragmentShader='varying vec3 brushedPoint;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
          float grainPhase=brushedPoint.y*1500.;
          float grainFade=1.-smoothstep(1.,3.,fwidth(grainPhase));
          roughnessFactor+=.035*sin(grainPhase)*grainFade;
        `);
      };m.needsUpdate=true;
    }
    if(node.name==='Headband'){m.color.set(0x8d7e6e);m.roughness=.36;m.envMapIntensity=1.3;}
    if(node.name==='Headband_Front_Rim'){m.color.set(0xb6aa9a);m.envMapIntensity=1.6;}
  });
  return {photo:texture,texture,rotation};
}
