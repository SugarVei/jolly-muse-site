import * as THREE from 'three';
import {fiberMaterial,ribbonGeometry,createFaceFuzz} from './fur-cards.js';
import {curlGeometry,curlGuides} from './curl-geometry.js';

export function createFleece(model,manifest,seeds,templates,softNeck){
  // Extra follicles on the existing padded face opening soften its boundary;
  // these share the continuous shell deformation, with no separate collar mesh.
  const parts=manifest.parts.map(p=>({...p})),all=[];
  for(const part of parts){
    let rows=[];for(let k=0;k<part.count;k++)rows.push(Array.from(seeds.subarray((part.offset+k)*8,(part.offset+k+1)*8)));
    if(part.name.startsWith('Leg_'))rows=rows.filter(row=>row[1]>.13&&(row[1]>.31||Math.abs(row[0])>.135));
    if(part.name===manifest.continuousShell){
      for(let k=0;k<260;k++){
        const a=k*2.39996323,r=1.015+.055*((k*43%97)/97),x=Math.sign(Math.cos(a))*Math.pow(Math.abs(Math.cos(a)),2/2.13)*.369*r,y=Math.sign(Math.sin(a))*Math.pow(Math.abs(Math.sin(a)),2/2.13)*.304*r;
        const normal=new THREE.Vector3(x*.7,y*.6,1).normalize();
        rows.splice(Math.floor(k*rows.length/260),0,[x+.009,y+1.62,.445,...normal.toArray(),.82+(k%7)*.04,a]);
      }
    }
    part.offset=all.length/8;part.count=rows.length;for(const row of rows)all.push(...row);
  }
  seeds=new Float32Array(all);
  const material=fiberMaterial(softNeck,{width:.0012,fibers:3,color:0xe3c8a6,opacity:.28});
  const bendMaterial=fiberMaterial(softNeck,{bend:true,width:.0012,fibers:3,color:0xe3c8a6,opacity:.28});
  const geometries=templates.slice(0,4).map((strands,i)=>curlGeometry(strands,i));
  const halos=templates.slice(0,4).map(strands=>ribbonGeometry(curlGuides(strands),12));
  const coreMaterial=fiberMaterial(softNeck,{width:.0015,fibers:3,color:0xd6b995,opacity:.12});
  const coreBend=fiberMaterial(softNeck,{bend:true,width:.0015,fibers:3,color:0xd6b995,opacity:.12});
  const meshes=[];const mat=new THREE.Matrix4(),pos=new THREE.Vector3(),normal=new THREE.Vector3(),scale=new THREE.Vector3(),q=new THREE.Quaternion(),roll=new THREE.Quaternion(),up=new THREE.Vector3(0,0,1),color=new THREE.Color();
  model.updateMatrixWorld(true);
  for(const part of parts){
    const target=model.getObjectByName(part.name);if(!target)throw new Error(`Missing fleece parent: ${part.name}`);
    const inverse=target.matrixWorld.clone().invert(),nmatrix=new THREE.Matrix3().setFromMatrix4(target.matrixWorld).transpose();
    for(let v=0;v<geometries.length;v++){
      const count=Math.ceil((part.count-v)/geometries.length);if(count<=0)continue;
      const mesh=new THREE.InstancedMesh(geometries[v],part.name===manifest.continuousShell?bendMaterial:material,count);mesh.name=`Fleece_${part.name}_${v}`;mesh.userData.fullCount=count;mesh.frustumCulled=false;
      const core=new THREE.InstancedMesh(halos[v],part.name===manifest.continuousShell?coreBend:coreMaterial,count);core.name=`Fine_Flyaways_${part.name}_${v}`;core.userData.fullCount=count;core.userData.densityMultiplier=.12;core.frustumCulled=false;
      let n=0;
      for(let k=v;k<part.count;k+=geometries.length){
        const i=(part.offset+k)*8;
        pos.set(seeds[i],seeds[i+1],seeds[i+2]).applyMatrix4(inverse);
        normal.set(seeds[i+3],seeds[i+4],seeds[i+5]).applyMatrix3(nmatrix).normalize();
        pos.addScaledVector(normal,-.001);
        q.setFromUnitVectors(up,normal);roll.setFromAxisAngle(up,seeds[i+7]);q.multiply(roll);
        scale.setScalar(seeds[i+6]);mat.compose(pos,q,scale);mesh.setMatrixAt(n,mat);
        const shade=.90+.1*((k*173%997)/997);color.setRGB(shade,shade,shade);mesh.setColorAt(n,color);
        core.setMatrixAt(n,mat);core.setColorAt(n,color);n++;
      }
      mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;target.add(mesh);meshes.push(mesh);
      core.instanceMatrix.needsUpdate=true;core.instanceColor.needsUpdate=true;target.add(core);meshes.push(core);
    }
  }
  const faceFuzz=createFaceFuzz(model.getObjectByName('Face'),softNeck);
  return {meshes,setDensity(ratio){for(const mesh of meshes)mesh.count=Math.max(1,Math.round(mesh.userData.fullCount*ratio*(mesh.userData.densityMultiplier||1)));faceFuzz.setDensity(Math.min(1,.35+ratio));}};
}
