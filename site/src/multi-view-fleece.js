import * as THREE from 'three';

// Three separately generated reference views supply high-frequency fiber detail.
// Blending is tied to neutral surface normals, never a frame/image switch.
export function multiViewFleece(plates,wool,restMatrix,rotation){
  const rest=restMatrix.clone(),material=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
  material.name='Multiview_Fine_Fleece';material.userData.surfaceTexture=true;material.userData.referenceViews=3;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{frontPlate:{value:plates[0]},leftPlate:{value:plates[1]},rightPlate:{value:plates[2]},woolPlate:{value:wool},fleeceRest:{value:rest},fleeceRotation:rotation});
    shader.vertexShader='uniform mat4 fleeceRest; uniform vec4 fleeceRotation; varying vec3 fleecePoint,fleeceNormal; varying float fleeceShade;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      fleecePoint=(fleeceRest*vec4(position,1.)).xyz;
      fleeceNormal=normalize(mat3(fleeceRest)*normal);
      vec4 fleeceQ=normalize(mix(vec4(0.,0.,0.,1.),fleeceRotation,smoothstep(1.02,1.35,fleecePoint.y)));
      vec3 turnedNormal=fleeceNormal+2.*cross(fleeceQ.xyz,cross(fleeceQ.xyz,fleeceNormal)+fleeceQ.w*fleeceNormal);
      vec3 keyDirection=normalize(vec3(-3.,5.,4.));
      fleeceShade=clamp((.78+.22*max(0.,dot(turnedNormal,keyDirection)))/(.78+.22*max(0.,dot(fleeceNormal,keyDirection))),.85,1.12);
    `);
    shader.fragmentShader=`uniform sampler2D frontPlate,leftPlate,rightPlate,woolPlate;
      varying vec3 fleecePoint,fleeceNormal;varying float fleeceShade;
      vec3 suitableFleece(vec3 sampleColor,vec3 fallback){
        float hi=max(sampleColor.r,max(sampleColor.g,sampleColor.b)),lo=min(sampleColor.r,min(sampleColor.g,sampleColor.b));
        return mix(fallback,sampleColor,smoothstep(.10,.24,(hi-lo)/max(hi,.001)));
      }
    `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 p=fleecePoint,n=normalize(fleeceNormal);
      float v=.103+p.y*.355+.029*smoothstep(1.1,1.5,p.y);
      vec2 frontUV=vec2(.5+p.x*.40,v);
      vec2 leftUV=vec2(.525+.385*(p.x*.707107-p.z*.707107),v);
      vec2 rightUV=vec2(.475+.385*(p.x*.707107+p.z*.707107),v);
      vec3 tri=pow(abs(n),vec3(4.));tri/=max(dot(tri,vec3(1.)),.001);
      vec3 fallback=texture2D(woolPlate,p.yz/0.7).rgb*tri.x+texture2D(woolPlate,p.xz/0.7).rgb*tri.y+texture2D(woolPlate,p.xy/0.7).rgb*tri.z;
      fallback*=.78+.20*max(0.,dot(n,normalize(vec3(-3.,5.,4.))));
      vec3 weights=pow(max(vec3(n.z,dot(n,vec3(.707107,0.,.707107)),dot(n,vec3(-.707107,0.,.707107))),vec3(0.)),vec3(10.));
      float total=dot(weights,vec3(1.));weights/=max(total,.001);
      vec3 projected=suitableFleece(texture2D(frontPlate,frontUV).rgb,fallback)*weights.x+suitableFleece(texture2D(leftPlate,leftUV).rgb,fallback)*weights.y+suitableFleece(texture2D(rightPlate,rightUV).rgb,fallback)*weights.z;
      // Lower torso/limbs stay in the frontal pose; use their frontal plate
      // instead of importing another view's underarm/leg occlusion shadows.
      projected=mix(suitableFleece(texture2D(frontPlate,frontUV).rgb,fallback),projected,smoothstep(1.22,1.42,p.y));
      float coverage=smoothstep(.005,.12,total)*smoothstep(.10,.19,p.y);
      diffuseColor.rgb*=mix(fallback,projected,coverage)*fleeceShade;
    `);
  };
  material.customProgramCacheKey=()=> 'multiview-fleece-v15';
  return material;
}
