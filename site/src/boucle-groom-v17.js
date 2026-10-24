import * as THREE from 'three';
import {referenceWoolGLSL,referenceUniforms} from './reference-wool-v17.js';

// Short, rooted boucle yarn, with a real elliptical cross-section. The curl is
// part of the geometry, so highlights and silhouettes follow the same surface.
// Each tuft is two overlapping open curls rather than a billboard or halo.
function tuftGeometry(variant){
  const positions=[],normals=[],uvs=[],indices=[];
  const p=new THREE.Vector3(),before=new THREE.Vector3(),after=new THREE.Vector3();
  const tangent=new THREE.Vector3(),across=new THREE.Vector3(),outward=new THREE.Vector3();
  const up=new THREE.Vector3(0,0,1),normal=new THREE.Vector3();
  const specifications=[
    {segments:9,cx:-.0029,cy:.0008,rx:.0077,ry:.0066,start:-1.55+variant*.27,sweep:4.9,height:.0088},
    {segments:7,cx:.0047,cy:-.0017,rx:.0056,ry:.0048,start:.65+variant*.34,sweep:4.6,height:.0074},
    {segments:6,cx:-.0008,cy:.0022,rx:.0042,ry:.0035,start:1.2+variant*.71,sweep:3.5,height:.0108},
  ];
  for(let strand=0;strand<specifications.length;strand++){
    const spec=specifications[strand],sides=strand===2?3:4,base=positions.length/3;
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
      const width=(strand===0?.0021:strand===1?.0017:.00052)*tip,depth=width*.82;
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

function woolMaterial(softNeck,bend,reference){
  const material=new THREE.MeshPhysicalMaterial({
    name:bend?'Continuous_Fine_Boucle_v17':'Fine_Boucle_v17',
    color:0xe1ccb0,roughness:1,metalness:0,sheen:.12,
    sheenColor:0xf1dfc5,sheenRoughness:1,specularIntensity:0,envMapIntensity:.1,
  });
  material.toneMapped=false;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,referenceUniforms(reference));
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      varying vec2 vYarnUV;
      varying vec3 vYarnRoot,vYarnRest,vYarnRootNormal,vYarnScalp,vYarnRelaxed;
    `).replace('#include <begin_vertex>',`#include <begin_vertex>
      vYarnUV=uv;
      vYarnRoot=(modelMatrix*vec4(instanceMatrix[3].xyz,1.)).xyz;
      vec3 yarnLocal=(instanceMatrix*vec4(position,1.)).xyz;
      vYarnRest=(modelMatrix*vec4(yarnLocal,1.)).xyz;
      vYarnRelaxed=(modelMatrix*vec4(${bend?'neckBend(yarnLocal)':'yarnLocal'},1.)).xyz;
      vYarnRootNormal=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*vec3(0.,0.,1.));
      vYarnScalp=normalize(normalMatrix*${bend?'neckRotate(mat3(instanceMatrix)*vec3(0.,0.,1.),neckBlend(instanceMatrix[3].y))':'mat3(instanceMatrix)*vec3(0.,0.,1.)'});
    `);
    shader.fragmentShader=referenceWoolGLSL+'\nvarying vec2 vYarnUV; varying vec3 vYarnRoot,vYarnRest,vYarnRootNormal,vYarnScalp,vYarnRelaxed;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float phase=vYarnUV.y*9.+vYarnUV.x*3.1;
      float grain=sin(phase*6.2831853)*(1.-smoothstep(.30,1.,fwidth(phase)));
      vec3 yarnBase=jollyWoolColor(vYarnRest,vYarnRootNormal,vYarnRoot,vYarnRelaxed);
      vec3 yarnKey=normalize(mat3(viewMatrix)*normalize(vec3(-3.,5.,4.)));
      float relief=clamp((.84+.16*max(0.,dot(normal,yarnKey)))/(.84+.16*max(0.,dot(normalize(vYarnScalp),yarnKey))),.92,1.06);
      outgoingLight=yarnBase*relief*(.995+.005*grain);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey=()=>`fine-boucle-v17-${bend}`;
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
      if(part.name.startsWith('Leg_')&&(seeds[i+1]<.105||(seeds[i+1]<.25&&Math.abs(seeds[i])<.115)))continue;
      rows.push(i);
    }
    // A deterministic shuffle allows every density setting to cover the whole
    // surface, even when a new seed file has been sorted spatially.
    let rng=1979+part.offset;
    for(let i=rows.length-1;i>0;i--){rng=(Math.imul(rng,1664525)+1013904223)>>>0;const j=rng%(i+1);[rows[i],rows[j]]=[rows[j],rows[i]];}
    if(part.name===manifest.continuousShell){
      const fringe=[],other=[];
      for(const i of rows){
        const q=Math.pow(Math.pow(Math.abs((seeds[i]-.009)/.405),2.15)+Math.pow(Math.abs((seeds[i+1]-1.62)/.310),2.15),1/2.15);
        (seeds[i+2]>.32&&q>.94&&q<1.13?fringe:other).push(i);
      }
      rows.length=0;
      // One third of the early population covers the facial lip at every
      // quality, with the remaining samples spread across the whole shell.
      let a=0,b=0;
      while(a<fringe.length||b<other.length){
        if(a<fringe.length)rows.push(fringe[a++]);
        for(let j=0;j<2&&b<other.length;j++)rows.push(other[b++]);
      }
    }
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
        const wx=seeds[i],wy=seeds[i+1],wz=seeds[i+2];
        const q=Math.pow(Math.pow(Math.abs((wx-.009)/.405),2.15)+Math.pow(Math.abs((wy-1.62)/.310),2.15),1/2.15);
        const fringe=part.name===manifest.continuousShell&&wz>.32&&q>.94&&q<1.13;
        const cuff=part.name.startsWith('Arm_')&&wy<.68||part.name.startsWith('Leg_')&&wy<.23;
        const regional=fringe?1.13:cuff?1.06:wy>1.02&&wy<1.35?.83:.94;
        if(fringe){
          position.x+=(.009-wx)*.009;
          position.y+=(1.62-wy)*.009;
          position.addScaledVector(normal,.0010);
        }
        scale.set(seedScale*variation*regional,seedScale*variation*regional,seedScale*(.94+variation*.12)*(fringe?1.28:1.));

        matrix.compose(position,orientation,scale);mesh.setMatrixAt(instance,matrix);
        const shade=.94+((i*23+variant*31)%991)/991*.06;
        color.setRGB(shade,shade,shade);mesh.setColorAt(instance,color);instance++;
      }
      mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;target.add(mesh);meshes.push(mesh);
    }
  }
  return {
    meshes,materials:[material,bentMaterial],
    sourceData(){
      model.updateMatrixWorld(true);
      return {
        revision:'v17',density:meshes.reduce((n,m)=>n+m.count,0),
        templates:geometries.map(g=>({position:Array.from(g.attributes.position.array),normal:Array.from(g.attributes.normal.array),uv:Array.from(g.attributes.uv.array),index:Array.from(g.index.array)})),
        parts:meshes.map(m=>({name:m.name,part:m.parent.name,variant:Number(m.name.at(-1)),count:m.count,worldMatrix:m.matrixWorld.toArray(),matrices:Array.from(m.instanceMatrix.array.slice(0,m.count*16))})),
      };
    },
    setDensity(ratio){for(const mesh of meshes)mesh.count=Math.max(1,Math.round(mesh.userData.fullCount*THREE.MathUtils.clamp(ratio,0,1)));},
    stats(){return {tufts:meshes.reduce((n,mesh)=>n+mesh.count,0),triangles:meshes.reduce((n,mesh)=>n+mesh.count*mesh.geometry.index.count/3,0)};},
    dispose(){for(const mesh of meshes)mesh.removeFromParent();for(const geometry of geometries)geometry.dispose();material.dispose();bentMaterial.dispose();},
  };
}
