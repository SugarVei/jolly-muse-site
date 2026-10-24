import * as THREE from 'three';

// Rest-space projection bakes the supplied photograph's front fleece detail
// onto the real shell. Side/rear regions blend into a seamless wool material.
export function referenceFleece(photo,wool,restMatrix,{face=false,moving=false,rotation}={}){
  const neutralMatrix=restMatrix.clone();
  const material=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
  material.name=face?'Reference_Short_Pile':'Reference_Projected_Fleece';
  material.userData.photoProjection=true;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{referencePlate:{value:photo},woolTex:{value:wool},woolRestMatrix:{value:neutralMatrix}});
    shader.uniforms.photoRotation=rotation;
    shader.vertexShader='uniform mat4 woolRestMatrix; uniform vec4 photoRotation; varying vec3 photoRest,photoNormal; varying float photoShade;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      photoRest=(woolRestMatrix*vec4(position,1.)).xyz;
      photoNormal=normalize(mat3(woolRestMatrix)*normal);
      photoShade=1.;
      ${moving?`
        vec4 photoQ=normalize(mix(vec4(0.,0.,0.,1.),photoRotation,${face?'1.':'smoothstep(1.02,1.35,photoRest.y)'}));
        vec3 movingNormal=photoNormal+2.*cross(photoQ.xyz,cross(photoQ.xyz,photoNormal)+photoQ.w*photoNormal);
        vec3 photoKey=normalize(vec3(-3.,5.,4.));
        photoShade=clamp((.70+.30*max(0.,dot(movingNormal,photoKey)))/(.70+.30*max(0.,dot(photoNormal,photoKey))),.80,1.15);
      `:''}
    `);
    shader.fragmentShader='uniform sampler2D referencePlate,woolTex; varying vec3 photoRest,photoNormal; varying float photoShade;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 photoUV=vec2(.5+photoRest.x*.1715,.137+photoRest.y*.309+.011*smoothstep(1.1,1.5,photoRest.y));
      vec3 photoColor=texture2D(referencePlate,photoUV).rgb;
      // Modest source-scale local contrast, without a screen-space blur pass.
      vec2 texel=1./vec2(1672.,941.);
      vec3 neighbours=(texture2D(referencePlate,photoUV+vec2(texel.x,0.)).rgb+texture2D(referencePlate,photoUV-vec2(texel.x,0.)).rgb+texture2D(referencePlate,photoUV+vec2(0.,texel.y)).rgb+texture2D(referencePlate,photoUV-vec2(0.,texel.y)).rgb)*.25;
      photoColor+=clamp(photoColor-neighbours,vec3(-.045),vec3(.045))*.45;
      vec3 weights=pow(abs(normalize(photoNormal)),vec3(5.));weights/=max(dot(weights,vec3(1.)),.0001);
      vec3 fallback=texture2D(woolTex,photoRest.yz*.95).rgb*weights.x+texture2D(woolTex,photoRest.xz*.95).rgb*weights.y+texture2D(woolTex,photoRest.xy*.95).rgb*weights.z;
      float frontal=smoothstep(.10,.58,normalize(photoNormal).z);
      ${face?'':`
        // The source photo has an ivory backdrop and metal headphones. Fill
        // those samples with wool rather than projecting them onto the shell.
        float brightest=max(photoColor.r,max(photoColor.g,photoColor.b));
        float darkest=min(photoColor.r,min(photoColor.g,photoColor.b));
        float woolChroma=(brightest-darkest)/max(brightest,.001);
        photoColor=mix(fallback*.95,photoColor,smoothstep(.09,.22,woolChroma));
        float legEdge=smoothstep(.11,.20,photoRest.y);
        float innerLeg=smoothstep(.06,.12,abs(photoRest.x));
        frontal*=legEdge*mix(innerLeg,1.,smoothstep(.25,.38,photoRest.y));
      `}
      float sideLight=.73+.29*max(0.,dot(normalize(photoNormal),normalize(vec3(-3.,5.,4.))));
      diffuseColor.rgb*=${face?'photoColor':'mix(fallback*sideLight,photoColor,frontal)'}*photoShade;
    `);
  };
  material.customProgramCacheKey=()=>`reference-fleece-v14-${face}-${moving}`;
  return material;
}
