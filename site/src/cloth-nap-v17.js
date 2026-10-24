import * as THREE from 'three';
import {fiberMaterial,ribbonGeometry} from './fur-cards.js';

// Sample the real cloth surface. The child mesh inherits its rigid head/limb
// transform; it must not receive the continuous outer-fleece neck bend twice.
export function createClothNap(surface,softNeck,{count=8000,opacity=.24,lengthScale=1,width=.00030,color=0xffffff}={}){
  surface.updateWorldMatrix(true,false);
  const geometry=surface.geometry,position=geometry.attributes.position,normal=geometry.attributes.normal,index=geometry.index;
  const worldNormal=new THREE.Matrix3().getNormalMatrix(surface.matrixWorld);
  const triangles=[],cdf=[];
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  const aw=new THREE.Vector3(),bw=new THREE.Vector3(),cw=new THREE.Vector3();
  const ab=new THREE.Vector3(),ac=new THREE.Vector3(),n=new THREE.Vector3(),nw=new THREE.Vector3();
  const vertexNormal=new THREE.Vector3();
  let area=0;
  const total=index?index.count:position.count;
  for(let i=0;i+2<total;i+=3){
    const ids=index?[index.getX(i),index.getX(i+1),index.getX(i+2)]:[i,i+1,i+2];
    a.fromBufferAttribute(position,ids[0]);b.fromBufferAttribute(position,ids[1]);c.fromBufferAttribute(position,ids[2]);
    aw.copy(a).applyMatrix4(surface.matrixWorld);bw.copy(b).applyMatrix4(surface.matrixWorld);cw.copy(c).applyMatrix4(surface.matrixWorld);
    const triangleArea=ab.subVectors(bw,aw).cross(ac.subVectors(cw,aw)).length()*.5;
    if(!(triangleArea>0))continue;
    let maximumZ=-Infinity;
    if(normal){
      for(const id of ids){
        nw.fromBufferAttribute(normal,id).applyMatrix3(worldNormal).normalize();
        maximumZ=Math.max(maximumZ,nw.z);
      }
    }else{
      nw.copy(ab).normalize();maximumZ=nw.z;
    }
    if(maximumZ<=-.30)continue;
    const fallback=normal?null:new THREE.Vector3().subVectors(b,a).cross(ac.subVectors(c,a)).normalize();
    area+=triangleArea;triangles.push({ids,fallback});cdf.push(area);
  }
  if(!triangles.length)throw new Error(`Cloth nap has no visible triangles: ${surface.name}`);

  let seed=0x17c10f9d;
  for(let i=0;i<surface.name.length;i++)seed=Math.imul(seed^surface.name.charCodeAt(i),16777619)>>>0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const capacity=Math.max(0,Math.floor(Number.isFinite(count)?count:8000));
  const strand=ribbonGeometry([[[0,0,0],[.00025,0,.00085],[.00046,.00008,.00174],[.00062,.00020,.00252]]],3);
  strand.scale(lengthScale,lengthScale,lengthScale);
  const material=fiberMaterial(softNeck,{bend:false,width,fibers:1,color,opacity});
  material.name=`Jolly_Cloth_Nap_v17_${surface.name}`;
  const mesh=new THREE.InstancedMesh(strand,material,capacity);
  mesh.name=`${surface.name}_Cloth_Nap_v17`;mesh.frustumCulled=false;
  mesh.castShadow=false;mesh.receiveShadow=false;
  const matrix=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),roll=new THREE.Quaternion();
  const up=new THREE.Vector3(0,0,1),scale=new THREE.Vector3(),shade=new THREE.Color();
  let accepted=0;
  while(accepted<capacity){
    const pick=random()*area;
    let lo=0,hi=cdf.length-1;
    while(lo<hi){const mid=(lo+hi)>>1;if(cdf[mid]<pick)lo=mid+1;else hi=mid;}
    const {ids,fallback}=triangles[lo],s=Math.sqrt(random()),v=random(),weights=[1-s,s*(1-v),s*v];
    p.set(0,0,0);n.set(0,0,0);
    for(let j=0;j<3;j++){
      p.addScaledVector(a.fromBufferAttribute(position,ids[j]),weights[j]);
      if(normal)n.addScaledVector(vertexNormal.fromBufferAttribute(normal,ids[j]),weights[j]);
    }
    if(!normal)n.copy(fallback);
    n.normalize();nw.copy(n).applyMatrix3(worldNormal).normalize();
    // Reject the partly hidden region of triangles crossing the threshold.
    // Rejection preserves uniform area density over the eligible surface.
    if(nw.z<=-.30)continue;
    p.addScaledVector(n,.00009);
    q.setFromUnitVectors(up,n);roll.setFromAxisAngle(up,random()*Math.PI*2);q.multiply(roll);
    scale.setScalar(.82+random()*.33);matrix.compose(p,q,scale);mesh.setMatrixAt(accepted,matrix);
    const value=.95+random()*.05;shade.setRGB(value,value,value);mesh.setColorAt(accepted,shade);
    accepted++;
  }
  mesh.instanceMatrix.needsUpdate=true;
  if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  surface.add(mesh);
  let disposed=false;
  return {
    mesh,
    setDensity(ratio){
      const density=THREE.MathUtils.clamp(Number.isFinite(ratio)?ratio:0,0,1);
      mesh.count=Math.round(capacity*density);mesh.visible=mesh.count>0;
    },
    dispose(){
      if(disposed)return;
      disposed=true;mesh.removeFromParent();strand.dispose();material.dispose();mesh.dispose();
    },
  };
}
