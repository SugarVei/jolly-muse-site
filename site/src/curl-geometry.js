import * as THREE from 'three';
import {ribbonGeometry} from './fur-cards.js';

export function curlGuides(guides){
  return guides.slice(0,3).map(points=>{
    let smooth=points.map(p=>new THREE.Vector3(p[0]*.65,p[1]*.65,p[2]*.55));
    for(let pass=0;pass<2;pass++)smooth=smooth.map((p,i)=>i===0||i===smooth.length-1?p:p.clone().multiplyScalar(.5).addScaledVector(smooth[i-1],.25).addScaledVector(smooth[i+1],.25));
    return smooth.map(p=>p.toArray());
  });
}

export function curlGeometry(guides){return ribbonGeometry(curlGuides(guides),16);}

// Round cross-section lighting follows the real 3D curl paths. Centerline
// depth keeps early depth rejection available for curls hidden by the body.
export function curlMaterial(softNeck,{bend=false,referencePlate}={}){
  return new THREE.ShaderMaterial({
    name:'Volumetric_Wool_Locks',side:THREE.DoubleSide,toneMapped:false,
    uniforms:{...softNeck.uniforms,woolTint:{value:new THREE.Color(0xe9caa2)},referencePlate:{value:referencePlate}},
    vertexShader:`${softNeck.glsl}
      attribute vec3 pathTangent;
      varying vec3 lockCenter,lockSide,lockFront,lockTangent,lockScalp,lockColor;
      varying vec2 lockUV;
      varying vec2 photoUV;
      varying float lockRadius,lockFacing;
      void main(){
        vec3 p=(instanceMatrix*vec4(position,1.)).xyz;
        vec3 rest=(modelMatrix*vec4(p,1.)).xyz;
        vec3 photoRest=rest;
        if(rest.y<.35){photoRest.x=sign(rest.x)*max(abs(rest.x),.19);photoRest.y=max(rest.y,.16);}
        photoUV=vec2(.5+photoRest.x*.1715,.137+photoRest.y*.309+.011*smoothstep(1.1,1.5,photoRest.y));
        vec3 tangent=normalize(mat3(instanceMatrix)*pathTangent);
        vec3 scalp=normalize(mat3(instanceMatrix)*vec3(0.,0.,1.));
        ${bend?'vec3 root=instanceMatrix[3].xyz;vec4 q=neckBlend(root.y);p=neckBend(root)+neckRotate(p-root,q);tangent=neckRotate(tangent,q);scalp=neckRotate(scalp,q);':''}
        lockCenter=(modelMatrix*vec4(p,1.)).xyz;
        lockTangent=normalize(mat3(modelMatrix)*tangent);
        vec3 view=normalize(cameraPosition-lockCenter);
        lockSide=normalize(cross(lockTangent,view)+vec3(.00001,0.,0.));
        lockFront=normalize(cross(lockSide,lockTangent));
        lockScalp=normalize(mat3(modelMatrix)*scalp);
        lockRadius=.0013*length(instanceMatrix[0].xyz)*(.77+.23*sin(3.14159265*uv.x))*(1.-.72*smoothstep(.68,1.,uv.x));
        vec3 rootWorld=(modelMatrix*vec4(${bend?'neckBend(instanceMatrix[3].xyz)':'instanceMatrix[3].xyz'},1.)).xyz;
        lockFacing=dot(lockScalp,normalize(cameraPosition-rootWorld));
        float density=.12+.65*(1.-smoothstep(.10,.70,lockFacing));
        float sampleKey=fract(sin(dot(instanceMatrix[3].xyz,vec3(12.9898,78.233,39.425)))*43758.5453);
        lockRadius*=step(sampleKey,density);
        lockColor=instanceColor;lockUV=uv;
        gl_Position=projectionMatrix*viewMatrix*vec4(lockCenter+lockSide*(uv.y*2.-1.)*lockRadius,1.);
      }`,
    fragmentShader:`
      uniform vec3 woolTint;
      uniform sampler2D referencePlate;
      varying vec3 lockCenter,lockSide,lockFront,lockTangent,lockScalp,lockColor;
      varying vec2 lockUV;
      varying vec2 photoUV;
      varying float lockRadius,lockFacing;
      void main(){
        if(lockRadius<.00005)discard;
        float side=lockUV.y*2.-1.;
        float roundness=sqrt(max(0.,1.-side*side));
        vec3 n=normalize(lockSide*side+lockFront*roundness);
        float fiberPhase=side*10.+lockUV.x*17.;
        float grainFade=1.-smoothstep(.4,1.8,fwidth(fiberPhase));
        float grain=sin(fiberPhase*6.2831853)*grainFade;
        vec3 key=normalize(vec3(-3.,5.,4.));
        float diffuse=max(0.,dot(n,key));
        float rootShade=.80+.20*smoothstep(0.,.35,lockUV.x);
        float fuzz=.12*pow(1.-abs(dot(n,normalize(lockFront))),2.);
        vec3 referenceColor=mix(texture2D(referencePlate,photoUV).rgb,woolTint,.80);
        vec3 color=referenceColor*lockColor*(.82+.18*diffuse)*rootShade*(.96+.04*grain)+referenceColor*fuzz*.15;
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
