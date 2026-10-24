import * as THREE from 'three';

// Curved ribbons contain filtered fine strands instead of solid tubes.
export function fiberMaterial(softNeck,{bend=false,width=.0065,fibers=7,color=0xefd1a8,opacity=1}={}){
  return new THREE.ShaderMaterial({
    name:'Soft_Fiber_Bundles',side:THREE.DoubleSide,transparent:true,depthWrite:false,forceSinglePass:true,premultipliedAlpha:true,
    uniforms:{...softNeck.uniforms,cardWidth:{value:width},fiberCount:{value:fibers},fiberOpacity:{value:opacity},woolTint:{value:new THREE.Color(color)}},
    vertexShader:`${softNeck.glsl}
      attribute vec3 pathTangent;
      uniform float cardWidth;
      uniform vec3 woolTint;
      varying vec2 fiberUV;
      varying vec3 fiberLight;
      varying float fiberSeed;
      void main(){
        vec3 p=(instanceMatrix*vec4(position,1.)).xyz;
        vec3 tangent=normalize(mat3(instanceMatrix)*pathTangent);
        vec3 surfaceNormal=normalize(mat3(instanceMatrix)*vec3(0.,0.,1.));
        ${bend?'vec3 root=instanceMatrix[3].xyz;vec4 q=neckBlend(root.y);p=neckBend(root)+neckRotate(p-root,q);tangent=neckRotate(tangent,q);surfaceNormal=neckRotate(surfaceNormal,q);':''}
        vec3 wp=(modelMatrix*vec4(p,1.)).xyz;
        tangent=normalize(mat3(modelMatrix)*tangent);
        surfaceNormal=normalize(mat3(modelMatrix)*surfaceNormal);
        vec3 view=normalize(cameraPosition-wp);
        vec3 side=normalize(cross(tangent,view)+vec3(.00001,0.,0.));
        float taper=(.32+.68*pow(max(0.,sin(3.14159265*uv.x)),.35));
        float scale=length(instanceMatrix[0].xyz);
        wp+=side*(uv.y*2.-1.)*cardWidth*taper*scale;
        vec3 lightDir=normalize(vec3(-3.,5.,4.));
        float diffuse=sqrt(max(.0,1.-pow(dot(tangent,lightDir),2.)));
        float surface=max(0.,dot(surfaceNormal,lightDir));
        float scatter=pow(1.-abs(dot(surfaceNormal,view)),3.);
        vec3 light=vec3(.29)+vec3(.42,.39,.34)*diffuse+vec3(.43,.40,.35)*surface+vec3(.12,.10,.07)*scatter;
        float rootShade=.74+.26*smoothstep(0.,.3,uv.x);
        fiberLight=woolTint*instanceColor*light*rootShade;
        fiberSeed=fract(dot(instanceMatrix[3].xyz,vec3(12.9898,78.233,39.425)))*6.2831853;
        fiberUV=uv;
        gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);
      }`,
    fragmentShader:`
      uniform float fiberCount;
      uniform float fiberOpacity;
      varying vec2 fiberUV;
      varying vec3 fiberLight;
      varying float fiberSeed;
      void main(){
        float flow=fiberUV.y*fiberCount+.16*sin(fiberUV.x*23.+fiberSeed)+.06*sin(fiberUV.x*59.+fiberSeed*3.);
        float phase=fract(flow);
        float line=abs(phase-.5);
        float footprint=max(fwidth(flow),.0001);
        float strand=1.-smoothstep(.31-footprint*.5,.31+footprint*.5,line);
        strand=mix(strand,.62,smoothstep(.35,1.1,footprint));
        float edge=smoothstep(0.,.14,fiberUV.y)*(1.-smoothstep(.86,1.,fiberUV.y));
        float tip=1.-smoothstep(.78,1.,fiberUV.x);
        float coverage=strand*edge*tip*fiberOpacity;
        if(coverage<.025)discard;
        float radial=sqrt(max(0.,1.-pow(fiberUV.y*2.-1.,2.)));
        float glint=(.62+.38*radial)*(.94+.06*cos(phase*6.2831853));
        gl_FragColor=vec4(fiberLight*glint,coverage);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <premultiplied_alpha_fragment>
      }`,
  });
}

export function ribbonGeometry(strands,segments=11){
  const positions=[],tangents=[],uvs=[],indices=[];
  for(const points of strands){
    const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    const offset=positions.length/3;
    for(let i=0;i<=segments;i++){
      const t=i/segments,p=path.getPointAt(t),tangent=path.getTangentAt(t);
      for(let side=0;side<2;side++){positions.push(p.x,p.y,p.z);tangents.push(tangent.x,tangent.y,tangent.z);uvs.push(t,side);}
      if(i<segments){const a=offset+i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('pathTangent',new THREE.Float32BufferAttribute(tangents,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
  return geometry;
}

export function createFaceFuzz(face,softNeck,{opacity=.22,lengthScale=1}={}){
  const geometry=face.geometry,position=geometry.attributes.position,normal=geometry.attributes.normal,index=geometry.index;
  const triangles=[],cdf=[];
  let area=0;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3();
  for(let i=0;i<index.count;i+=3){
    const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
    a.fromBufferAttribute(position,ids[0]);b.fromBufferAttribute(position,ids[1]);c.fromBufferAttribute(position,ids[2]);
    const front=(normal.getZ(ids[0])+normal.getZ(ids[1])+normal.getZ(ids[2]))/3;
    if(front<.04)continue;
    area+=ab.subVectors(b,a).cross(ac.subVectors(c,a)).length()*.5;
    triangles.push(ids);cdf.push(area);
  }
  let seed=8917;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const count=9500;
  const strand=ribbonGeometry([[[0,0,0],[.0007,0,.0018],[.0013,.0003,.0038],[.0016,.0008,.0044]]],3);
  strand.scale(lengthScale,lengthScale,lengthScale);
  const material=fiberMaterial(softNeck,{width:.00065,fibers:1,color:0xf2d9b9,opacity});
  const mesh=new THREE.InstancedMesh(strand,material,count);mesh.name='Face_Short_Pile';mesh.frustumCulled=false;
  const mat=new THREE.Matrix4(),p=new THREE.Vector3(),n=new THREE.Vector3(),q=new THREE.Quaternion(),roll=new THREE.Quaternion(),up=new THREE.Vector3(0,0,1),scale=new THREE.Vector3(),shade=new THREE.Color();
  for(let i=0;i<count;i++){
    const pick=random()*area;let lo=0,hi=cdf.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(cdf[mid]<pick)lo=mid+1;else hi=mid;}
    const ids=triangles[lo],s=Math.sqrt(random()),v=random(),weights=[1-s,s*(1-v),s*v];p.set(0,0,0);n.set(0,0,0);
    for(let j=0;j<3;j++){p.addScaledVector(a.fromBufferAttribute(position,ids[j]),weights[j]);n.addScaledVector(a.fromBufferAttribute(normal,ids[j]),weights[j]);}
    n.normalize();p.addScaledVector(n,.00035);q.setFromUnitVectors(up,n);roll.setFromAxisAngle(up,random()*Math.PI*2);q.multiply(roll);scale.setScalar(.65+random()*.65);mat.compose(p,q,scale);mesh.setMatrixAt(i,mat);
    const value=.90+.1*random();shade.setRGB(value,value,value);mesh.setColorAt(i,shade);
  }
  mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;face.add(mesh);
  return {mesh,setDensity(ratio){mesh.count=Math.round(count*ratio);}};
}

