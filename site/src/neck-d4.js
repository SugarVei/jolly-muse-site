import * as THREE from 'three';

// Blender's weighted Euler field: Rz(yaw*w) Rx(pitch*w), converted to Y-up.
export function createNativeNeck(manifest){
  const uniforms={nativePose:{value:new THREE.Vector2()},nativePivot:{value:new THREE.Vector3(...manifest.neckPivot)},nativeBand:{value:new THREE.Vector2(...manifest.neckBlend)}};
  const glsl=`
uniform vec2 nativePose; uniform vec3 nativePivot; uniform vec2 nativeBand;
vec3 nativeRotate(vec3 p,float w){
  vec2 a=nativePose*w;float cx=cos(a.y),sx=sin(a.y),cy=cos(a.x),sy=sin(a.x);
  p=vec3(p.x,cx*p.y-sx*p.z,sx*p.y+cx*p.z);
  return vec3(cy*p.x+sy*p.z,p.y,-sy*p.x+cy*p.z);
}
float nativeWeight(float y){return smoothstep(nativeBand.x,nativeBand.y,y);}
vec3 nativeBend(vec3 p){return nativeRotate(p-nativePivot,nativeWeight(p.y))+nativePivot;}
`;
  function bind(material,instanced=false){
    const previous=material.onBeforeCompile;
    material.onBeforeCompile=shader=>{
      previous.call(material,shader);Object.assign(shader.uniforms,uniforms);
      shader.vertexShader=glsl+(instanced?'attribute float headWeight;\n':'')+shader.vertexShader;
      if(instanced){
        shader.vertexShader=shader.vertexShader.replace('#include <defaultnormal_vertex>',`
          #include <defaultnormal_vertex>
          vec3 scaledNormal=objectNormal/vec3(dot(instanceMatrix[0].xyz,instanceMatrix[0].xyz),dot(instanceMatrix[1].xyz,instanceMatrix[1].xyz),dot(instanceMatrix[2].xyz,instanceMatrix[2].xyz));
          transformedNormal=normalMatrix*nativeRotate(mat3(instanceMatrix)*scaledNormal,headWeight);
        `).replace('#include <project_vertex>',`
          vec3 nativeRest=(instanceMatrix*vec4(transformed,1.)).xyz;
          vec3 nativeBent=nativeRotate(nativeRest-nativePivot,headWeight)+nativePivot;
          vec4 mvPosition=modelViewMatrix*vec4(nativeBent,1.);gl_Position=projectionMatrix*mvPosition;
        `).replace('#include <worldpos_vertex>','vec4 worldPosition=modelMatrix*vec4(nativeBent,1.);');
      }else{
        shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`
          #include <beginnormal_vertex>
          vec3 nt=normalize(cross(normal,abs(normal.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.)));
          vec3 nb=cross(normal,nt);vec3 nc=nativeBend(position);
          objectNormal=normalize(cross(nativeBend(position+nt*.0008)-nc,nativeBend(position+nb*.0008)-nc));
        `).replace('#include <project_vertex>','transformed=nativeBend(transformed);\n#include <project_vertex>');
      }
    };
    const previousKey=material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey=()=>`native-d4-${instanced}-${previousKey()}`;
    material.needsUpdate=true;
  }
  return {bind,update(yaw,pitch){uniforms.nativePose.value.set(yaw,pitch);},uniforms};
}
