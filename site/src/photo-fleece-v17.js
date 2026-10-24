import * as THREE from 'three';
import {referenceWoolGLSL,referenceUniforms} from './reference-wool-v17.js';

export function referenceFleece(reference,restMatrix,{moving=false,rotation}={}){
  const neutralMatrix=restMatrix.clone();
  const material=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
  material.name='Video_And_Photo_Fleece_v17';
  material.userData.photoProjection=true;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,referenceUniforms(reference),{
      woolRestMatrix:{value:neutralMatrix},photoRotation:rotation,
    });
    shader.vertexShader='uniform mat4 woolRestMatrix; uniform vec4 photoRotation; varying vec3 photoRest,photoNormal,photoRelaxed; varying float photoShade;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      photoRest=(woolRestMatrix*vec4(position,1.)).xyz;
      photoNormal=normalize(mat3(woolRestMatrix)*normal);
      photoRelaxed=photoRest; photoShade=1.;
      ${moving?`
        photoRelaxed=(woolRestMatrix*vec4(neckBend(position),1.)).xyz;
        vec4 photoQ=normalize(mix(vec4(0.,0.,0.,1.),photoRotation,smoothstep(1.02,1.35,photoRest.y)));
        vec3 movingNormal=neckRotate(photoNormal,photoQ);
        vec3 photoKey=normalize(vec3(-3.,5.,4.));
        photoShade=clamp((.78+.22*max(0.,dot(movingNormal,photoKey)))/(.78+.22*max(0.,dot(photoNormal,photoKey))),.88,1.10);
      `:''}
    `);
    shader.fragmentShader=referenceWoolGLSL+'\nvarying vec3 photoRest,photoNormal,photoRelaxed; varying float photoShade;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      diffuseColor.rgb*=jollyWoolColor(photoRest,photoNormal,photoRest,photoRelaxed)*photoShade;
    `);
  };
  material.customProgramCacheKey=()=>`reference-fleece-v17-${moving}`;
  return material;
}
