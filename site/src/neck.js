import * as THREE from 'three';

// A single shell bends through a band of upper-chest vertices. Every vertex
// above the band follows the same quaternion as the face and headphones.
const bendGLSL=`
uniform vec4 neckQuaternion;
uniform vec3 neckPivot;
uniform vec2 neckBand;
vec3 neckRotate(vec3 p,vec4 q){return p+2.*cross(q.xyz,cross(q.xyz,p)+q.w*p);}
vec4 neckBlend(float y){
  float w=smoothstep(neckBand.x,neckBand.y,y);
  return normalize(mix(vec4(0.,0.,0.,1.),neckQuaternion,w));
}
vec3 neckBend(vec3 p){return neckRotate(p-neckPivot,neckBlend(p.y))+neckPivot;}
`;

export function createSoftNeck(manifest){
  const quaternion={value:new THREE.Vector4(0,0,0,1)};
  const uniforms={neckQuaternion:quaternion,neckPivot:{value:new THREE.Vector3(...manifest.neckPivot)},neckBand:{value:new THREE.Vector2(...manifest.neckBlend)}};
  function bind(material,{instanced=false,cacheRootQuaternion=false}={}){
    const previous=material.onBeforeCompile;
    material.onBeforeCompile=shader=>{
      previous.call(material,shader);
      Object.assign(shader.uniforms,uniforms);
      shader.vertexShader=bendGLSL+shader.vertexShader;
      if(instanced){
        shader.vertexShader=shader.vertexShader.replace('#include <defaultnormal_vertex>',`${cacheRootQuaternion?'vec4 rootNeckQuaternion=neckBlend(instanceMatrix[3].y);':''}
          #include <defaultnormal_vertex>
          transformedNormal=normalMatrix*neckRotate(mat3(instanceMatrix)*objectNormal,${cacheRootQuaternion?'rootNeckQuaternion':'neckBlend(instanceMatrix[3].y)'});
        `);
        shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
          vec3 rest=(instanceMatrix*vec4(transformed,1.)).xyz;
          vec3 root=instanceMatrix[3].xyz;
          vec3 bent=${cacheRootQuaternion?'neckRotate(rest-neckPivot,rootNeckQuaternion)+neckPivot':'neckBend(root)+neckRotate(rest-root,neckBlend(root.y))'};
          vec4 mvPosition=modelViewMatrix*vec4(bent,1.);
          gl_Position=projectionMatrix*mvPosition;
        `);
        shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`
          vec4 worldPosition=modelMatrix*vec4(bent,1.);
        `);
      }else{
        shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
          vec3 neckTangent=normalize(cross(normal,abs(normal.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.)));
          vec3 neckBitangent=cross(normal,neckTangent);
          vec3 neckCenter=neckBend(position);
          objectNormal=normalize(cross(neckBend(position+neckTangent*.0008)-neckCenter,neckBend(position+neckBitangent*.0008)-neckCenter));
          #ifdef USE_TANGENT
            objectTangent=normalize(neckBend(position+tangent.xyz*.0008)-neckCenter);
          #endif
        `);
        shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
          transformed=neckBend(transformed);
          #include <project_vertex>
        `);
      }
    };
    material.customProgramCacheKey=()=>`continuous-neck-v3-${instanced}-${cacheRootQuaternion}`;
    material.needsUpdate=true;
  }
  return {bind,uniforms,glsl:bendGLSL,update(q){quaternion.value.set(q.x,q.y,q.z,q.w);}};
}
