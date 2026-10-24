import * as THREE from 'three';

// Short, rooted boucle yarn, with a real elliptical cross-section. The curl is
// part of the geometry, so highlights and silhouettes follow the same surface.
// Each tuft is two overlapping open curls rather than a billboard or halo.
function tuftGeometry(variant){
  const positions=[],normals=[],uvs=[],indices=[];
  const p=new THREE.Vector3(),before=new THREE.Vector3(),after=new THREE.Vector3();
  const tangent=new THREE.Vector3(),across=new THREE.Vector3(),outward=new THREE.Vector3();
  const up=new THREE.Vector3(0,0,1),normal=new THREE.Vector3();
  const specifications=[
    {segments:10,cx:-.0032,cy:.0009,rx:.0085,ry:.0073,start:-1.55+variant*.27,sweep:4.9,height:.0080},
    {segments:8,cx:.0052,cy:-.0019,rx:.0062,ry:.0053,start:.65+variant*.34,sweep:4.6,height:.0065},
  ];
  for(let strand=0;strand<specifications.length;strand++){
    const spec=specifications[strand],sides=5,base=positions.length/3;
    const sample=(s,result)=>{
      const t=spec.start+s*spec.sweep;
      const turn=variant===1?-.15:variant===2?.13:0;
      const x=spec.cx+spec.rx*Math.cos(t)*(1-.13*s),y=spec.cy+spec.ry*Math.sin(t);
      return result.set(x*Math.cos(turn)-y*Math.sin(turn),x*Math.sin(turn)+y*Math.cos(turn),.0006+spec.height*Math.pow(Math.max(0,Math.sin(Math.PI*s)),.85));
    };
    for(let i=0;i<=spec.segments;i++){
      const s=i/spec.segments;sample(s,p);sample(Math.max(0,s-.002),before);sample(Math.min(1,s+.002),after);
      tangent.subVectors(after,before).normalize();across.crossVectors(tangent,up);
      if(across.lengthSq()<.00001)across.set(1,0,0);else across.normalize();
      outward.crossVectors(across,tangent).normalize();
      const tip=.48+.52*Math.pow(Math.sin(Math.PI*s),.4);
      const width=(strand===0?.0037:.0030)*tip,depth=width*.77;
      for(let side=0;side<=sides;side++){
        const angle=side/sides*Math.PI*2,c=Math.cos(angle),n=Math.sin(angle);
        positions.push(p.x+across.x*c*width+outward.x*n*depth,p.y+across.y*c*width+outward.y*n*depth,p.z+across.z*c*width+outward.z*n*depth);
        normal.copy(across).multiplyScalar(c/width).addScaledVector(outward,n/depth).normalize();
        normals.push(normal.x,normal.y,normal.z);uvs.push(s,side/sides);
      }
    }
    for(let i=0;i<spec.segments;i++)for(let side=0;side<sides;side++){
      const a=base+i*(sides+1)+side,b=a+sides+1;
      indices.push(a,b,a+1,b,b+1,a+1);
    }
    // End caps remain inside the nap at the roots; closed geometry avoids bright
    // cut ends when a tuft is seen along its tangent.
    for(const end of [0,1]){
      const ring=base+end*spec.segments*(sides+1),center=positions.length/3;
      sample(end,p);sample(end===0?.002:.998,after);tangent.subVectors(p,after).normalize();
      positions.push(p.x,p.y,p.z);normals.push(tangent.x,tangent.y,tangent.z);uvs.push(end,.5);
      for(let side=0;side<sides;side++){
        if(end===0)indices.push(center,ring+side,ring+side+1);else indices.push(center,ring+side+1,ring+side);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeBoundingSphere();
  geometry.name=`Rooted_Boucle_Tuft_${variant}`;
  return geometry;
}

function woolMaterial(softNeck,bend,{photo,wool}={}){
  const material=new THREE.MeshPhysicalMaterial({
    name:bend?'Continuous_Boucle_Wool':'Boucle_Wool',color:0xc2a77f,
    roughness:1,metalness:0,sheen:.05,sheenColor:0xd9c2a2,sheenRoughness:1,
    specularIntensity:0,envMapIntensity:.10,emissive:0xc2a77f,emissiveIntensity:.05,
  });
  // When the underlying surface uses the supplied photograph, use the same
  // rest-space color across the raised yarn, preserving the fine reference fibers.
  // A restrained normal-light ratio adds relief without a separate stitch layer.
  const referenceMatched=!!(photo&&wool);if(referenceMatched)material.toneMapped=false;
  material.onBeforeCompile=shader=>{
    if(referenceMatched)Object.assign(shader.uniforms,{boucleReference:{value:photo},boucleWool:{value:wool}});
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      varying vec2 vYarnUV;
      ${referenceMatched?'varying vec3 vYarnRoot,vYarnRest,vYarnRootNormal,vYarnScalp;':''}
    `).replace('#include <begin_vertex>',`#include <begin_vertex>
      vYarnUV=uv;
      ${referenceMatched?`
        vYarnRoot=(modelMatrix*vec4(instanceMatrix[3].xyz,1.)).xyz; vYarnRest=(modelMatrix*instanceMatrix*vec4(position,1.)).xyz;
        vYarnRootNormal=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*vec3(0.,0.,1.));
        vYarnScalp=normalize(normalMatrix*${bend?'neckRotate(mat3(instanceMatrix)*vec3(0.,0.,1.),neckBlend(instanceMatrix[3].y))':'mat3(instanceMatrix)*vec3(0.,0.,1.)'});
      `:''}
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec2 vYarnUV;
      ${referenceMatched?'uniform sampler2D boucleReference,boucleWool; varying vec3 vYarnRoot,vYarnRest,vYarnRootNormal,vYarnScalp;':''}
    `).replace('#include <color_fragment>',`#include <color_fragment>
      // Fine spun fibers follow the yarn, with derivative filtering so the
      // microstructure becomes soft at a distance rather than shimmering.
      float yarnPhase=vYarnUV.y*8.+vYarnUV.x*2.6;
      float yarnFilter=1.-smoothstep(.28,1.,fwidth(yarnPhase));
      float yarnGrain=sin(yarnPhase*6.2831853)*yarnFilter;
      float rootShade=.88+.12*smoothstep(.02,.30,vYarnUV.x);
      diffuseColor.rgb*=rootShade*(.985+.015*yarnGrain);
    `).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor+.025*yarnGrain,.85,1.);
    `);
    if(referenceMatched)shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      vec2 boucleUV=vec2(.5+vYarnRest.x*.1715,.137+vYarnRest.y*.309+.011*smoothstep(1.1,1.5,vYarnRest.y));
      vec3 bouclePhoto=texture2D(boucleReference,boucleUV).rgb;
      vec3 boucleRootNormal=normalize(vYarnRootNormal);
      vec3 boucleWeights=pow(abs(boucleRootNormal),vec3(5.));boucleWeights/=max(dot(boucleWeights,vec3(1.)),.0001);
      vec3 boucleFallback=texture2D(boucleWool,vYarnRest.yz*.95).rgb*boucleWeights.x+texture2D(boucleWool,vYarnRest.xz*.95).rgb*boucleWeights.y+texture2D(boucleWool,vYarnRest.xy*.95).rgb*boucleWeights.z;
      float boucleBright=max(bouclePhoto.r,max(bouclePhoto.g,bouclePhoto.b)),boucleDark=min(bouclePhoto.r,min(bouclePhoto.g,bouclePhoto.b));
      bouclePhoto=mix(boucleFallback*.95,bouclePhoto,smoothstep(.09,.22,(boucleBright-boucleDark)/max(boucleBright,.001)));
      float boucleFront=smoothstep(.10,.58,boucleRootNormal.z);
      boucleFront*=smoothstep(.11,.20,vYarnRoot.y)*mix(smoothstep(.06,.12,abs(vYarnRoot.x)),1.,smoothstep(.25,.38,vYarnRoot.y));
      vec3 boucleKey=normalize(vec3(-3.,5.,4.));
      float boucleSideLight=.73+.29*max(0.,dot(boucleRootNormal,boucleKey));
      vec3 boucleBase=mix(boucleFallback*boucleSideLight,bouclePhoto,boucleFront);
      vec3 boucleViewKey=normalize(mat3(viewMatrix)*boucleKey);
      float boucleRelief=clamp((.79+.21*max(0.,dot(normal,boucleViewKey)))/(.79+.21*max(0.,dot(normalize(vYarnScalp),boucleViewKey))),.86,1.08);
      outgoingLight=boucleBase*boucleRelief*(.99+.01*yarnGrain);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey=()=>`real-boucle-v16-${bend}-${referenceMatched}`;
  if(bend)softNeck.bind(material,{instanced:true});
  return material;
}

export function createBoucleGroom(model,manifest,seeds,softNeck,reference={}){
  const geometries=[0,1,2].map(tuftGeometry);
  const material=woolMaterial(softNeck,false,reference),bentMaterial=woolMaterial(softNeck,true,reference);
  const meshes=[],matrix=new THREE.Matrix4(),position=new THREE.Vector3(),normal=new THREE.Vector3();
  const up=new THREE.Vector3(0,0,1),orientation=new THREE.Quaternion(),roll=new THREE.Quaternion(),scale=new THREE.Vector3(),color=new THREE.Color();
  model.updateMatrixWorld(true);
  const visibleByPart=manifest.parts.map(part=>{
    const rows=[];
    for(let row=0;row<part.count;row++){
      const i=(part.offset+row)*8;
      // Back-facing roots cannot be exposed within the allowed head movement.
      // Keep side roots so turns have a real, soft and continuous silhouette.
      if(seeds[i+5]<-.30)continue;
      if(part.name.startsWith('Leg_')&&(seeds[i+1]<.13||(seeds[i+1]<.31&&Math.abs(seeds[i])<.135)))continue;
      rows.push(i);
    }
    // A deterministic shuffle allows every density setting to cover the whole
    // surface, even when a new seed file has been sorted spatially.
    let rng=1979+part.offset;
    for(let i=rows.length-1;i>0;i--){rng=(Math.imul(rng,1664525)+1013904223)>>>0;const j=rng%(i+1);[rows[i],rows[j]]=[rows[j],rows[i]];}
    return {part,rows};
  });
  const totalRoots=visibleByPart.reduce((total,p)=>total+p.rows.length,0);
  // At the current .30 balanced density this is <= 2,400 tufts / 480k triangles.
  const populationRatio=Math.min(1,8000/Math.max(1,totalRoots));
  for(const {part,rows:sourceRows} of visibleByPart){
    const target=model.getObjectByName(part.name);
    if(!target?.isMesh)throw new Error(`Missing boucle surface: ${part.name}`);
    const rows=sourceRows.slice(0,Math.max(1,Math.round(sourceRows.length*populationRatio)));
    const inverse=target.matrixWorld.clone().invert(),normalToLocal=new THREE.Matrix3().setFromMatrix4(target.matrixWorld).transpose();
    for(let variant=0;variant<3;variant++){
      const count=Math.ceil((rows.length-variant)/3);if(count<=0)continue;
      const mesh=new THREE.InstancedMesh(geometries[variant],part.name===manifest.continuousShell?bentMaterial:material,count);
      mesh.name=`Boucle_${part.name}_${variant}`;mesh.userData.fullCount=count;mesh.userData.realBoucle=true;
      mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=true;
      let instance=0;
      for(let r=variant;r<rows.length;r+=3){
        const i=rows[r];position.set(seeds[i],seeds[i+1],seeds[i+2]).applyMatrix4(inverse);
        normal.set(seeds[i+3],seeds[i+4],seeds[i+5]).applyMatrix3(normalToLocal).normalize();
        position.addScaledVector(normal,-.0007);
        orientation.setFromUnitVectors(up,normal);roll.setFromAxisAngle(up,seeds[i+7]);orientation.multiply(roll);
        const seedScale=THREE.MathUtils.clamp(seeds[i+6],.65,1.32);
        const variation=.82+((i*17+variant*73)%997)/997*.30;
        scale.set(seedScale*variation,seedScale*variation,seedScale*(.9+variation*.12));
        matrix.compose(position,orientation,scale);mesh.setMatrixAt(instance,matrix);
        const shade=.94+((i*23+variant*31)%991)/991*.06;
        color.setRGB(shade,shade,shade);mesh.setColorAt(instance,color);instance++;
      }
      mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;target.add(mesh);meshes.push(mesh);
    }
  }
  return {
    meshes,materials:[material,bentMaterial],
    setDensity(ratio){for(const mesh of meshes)mesh.count=Math.max(1,Math.round(mesh.userData.fullCount*THREE.MathUtils.clamp(ratio,0,1)));},
    stats(){return {tufts:meshes.reduce((n,mesh)=>n+mesh.count,0),triangles:meshes.reduce((n,mesh)=>n+mesh.count*mesh.geometry.index.count/3,0)};},
    dispose(){for(const mesh of meshes)mesh.removeFromParent();for(const geometry of geometries)geometry.dispose();material.dispose();bentMaterial.dispose();},
  };
}


