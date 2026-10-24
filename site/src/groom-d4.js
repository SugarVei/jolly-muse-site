import * as THREE from 'three';

const axisConversion=new THREE.Matrix4().makeRotationX(-Math.PI/2);
const norm=v=>v.normalize();

// Native fiber envelopes retain the saved C/J/S paths and root transforms.
// LOD combines overlapping sublocks and uses actual undercoat centerlines.
function templateGeometry(spec,data,mode='balanced'){
  const pos=[],normal=[],uv=[],indices=[];
  const samples=spec.pointsPerCurve;
  const levels={high:{segments:13,sides:5,undercoat:2},balanced:{segments:9,sides:4,undercoat:1},low:{segments:5,sides:3,undercoat:0}};
  const settings=levels[mode];
  const lanes=[{core:true,segments:settings.segments,sides:settings.sides}];
  for(let i=0;i<settings.undercoat;i++)lanes.push({fiber:152+(spec.family*7+i*23)%68,segments:mode==='high'?7:mode==='low'?3:5,sides:3});
  for(const lane of lanes){
    const {segments,sides}=lane,path=[],radii=[];
    for(let j=0;j<=segments;j++){
      const t=j/segments*(samples-1),lo=Math.floor(t),hi=Math.min(samples-1,lo+1),f=t-lo;
      const points=[],center=new THREE.Vector3();
      const startFiber=lane.core?0:lane.fiber,endFiber=lane.core?104:lane.fiber+1;
      for(let fiber=startFiber;fiber<endFiber;fiber++){
        const start=spec.offset+fiber*samples*4;
        const p=new THREE.Vector3(...[0,1,2].map(k=>THREE.MathUtils.lerp(data[start+lo*4+k],data[start+hi*4+k],f)));
        points.push(p);center.add(p);
      }
      center.multiplyScalar(1/points.length);path.push(center);
      const spread=Math.sqrt(points.reduce((sum,p)=>sum+p.distanceToSquared(center),0)/points.length);
      const envelope=.25+.75*Math.pow(Math.sin(j/segments*Math.PI),.35);
      radii.push(lane.core?Math.max(.0003,spread*(mode==='low'?1.52:1.38)):.00165*envelope);
    }
    const base=pos.length/3;
    for(let j=0;j<=segments;j++){
      const tangent=norm(path[Math.min(segments,j+1)].clone().sub(path[Math.max(0,j-1)]));
      const u=norm(new THREE.Vector3().crossVectors(tangent,Math.abs(tangent.z)<.9?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0)));
      const v=new THREE.Vector3().crossVectors(tangent,u);
      for(let k=0;k<=sides;k++){
        const angle=k/sides*Math.PI*2,n=u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v,Math.sin(angle));
        pos.push(...path[j].clone().addScaledVector(n,radii[j]).toArray());normal.push(...n.toArray());uv.push(k/sides,j/segments);
        if(j<segments&&k<sides){const a=base+j*(sides+1)+k,b=a+sides+1;indices.push(a,a+1,b,b,a+1,b+1);}
      }
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);return g;
}

export function addMicroSurface(material,{fiber=false,scale=850,strength=.12}={}){
  const prev=material.onBeforeCompile;
  material.onBeforeCompile=shader=>{
    prev.call(material,shader);
    shader.vertexShader='varying vec3 microPosition; varying vec2 microUV;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nmicroPosition=position;microUV=uv;');
    shader.fragmentShader=`varying vec3 microPosition; varying vec2 microUV;
float microHash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float microNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(microHash(i),microHash(i+vec3(1,0,0)),f.x),mix(microHash(i+vec3(0,1,0)),microHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(microHash(i+vec3(0,0,1)),microHash(i+vec3(1,0,1)),f.x),mix(microHash(i+vec3(0,1,1)),microHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float grain=microNoise(microPosition*${scale.toFixed(1)});
      ${fiber?'float threads=sin(microUV.x*100.5+sin(microUV.y*38.)*1.2);grain=mix(grain,threads*.5+.5,.45);':''}
      diffuseColor.rgb*=mix(.82,1.04,grain);
      ${fiber?'diffuseColor.rgb*=.63+.37*pow(max(0.,sin(microUV.y*3.14159)),.3);':''}
    `).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      vec3 microDx=dFdx(vViewPosition),microDy=dFdy(vViewPosition);
      vec3 microRx=cross(microDy,normal),microRy=cross(normal,microDx);
      float microDet=dot(microDx,microRx);
      vec3 microGrad=sign(microDet)*(dFdx(grain)*microRx+dFdy(grain)*microRy);
      normal=normalize(abs(microDet)*normal-${(strength*.00022).toFixed(8)}*microGrad);
    `);
  };
  material.customProgramCacheKey=()=>`d4-grain-${fiber}-${scale}-${strength}`;
}

async function readFloats(url){const r=await fetch(url);if(!r.ok)throw new Error('毛发数据加载失败');return new Float32Array(await r.arrayBuffer());}

export async function createNativeGroom(model,manifest,data,neck,onProgress){
  const base=new URL('../assets/d4/',import.meta.url);
  const [curves,roots,nap]=await Promise.all([readFloats(new URL(data.curveBuffer,base)),readFloats(new URL(data.rootBuffer,base)),readFloats(new URL(data.napBuffer,base))]);
  const groups=Array.from({length:data.templates.length},()=>[]);
  let id=0;
  for(const part of data.parts){
    for(let i=0;i<part.count;i++,id++){
      const at=part.offset+i*11;
      const p=new THREE.Vector3(...roots.slice(at,at+3));
      const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...roots.slice(at+3,at+6),'ZYX'));
      const scale=new THREE.Vector3(...roots.slice(at+6,at+9));
      const matrix=new THREE.Matrix4().compose(p,rotation,scale).premultiply(axisConversion);
      groups[roots[at+9]].push({matrix,weight:roots[at+10],id,part:part.surface,rank:((Math.imul(id+1,2654435761)>>>0)%65536)/65536});
    }
  }
  const colorA=new THREE.Color().fromArray(data.woolColors[0]),colorB=new THREE.Color().fromArray(data.woolColors[1]);
  const material=new THREE.MeshLambertMaterial({color:0xffffff});
  addMicroSurface(material,{fiber:true,scale:1800,strength:.25});neck.bind(material,true);
  // One draw for all 128 native families. Vertex texture lookup changes only
  // the source prototype; each instance keeps its original root transform.
  const rows=groups.flat().sort((a,b)=>a.rank-b.rank);
  for(let k=0;k<groups.length;k++)for(const row of groups[k])row.variant=k;
  const weights=new THREE.InstancedBufferAttribute(new Float32Array(rows.map(r=>r.weight)),1);
  const variants=new THREE.InstancedBufferAttribute(new Float32Array(rows.map(r=>r.variant)),1);
  const lodCache={};
  function makeLOD(mode){
    const geometries=data.templates.map(t=>templateGeometry(t,curves,mode));
    const geometry=geometries[0],vertices=geometry.attributes.position.count;
    const atlas=new Float32Array(vertices*2*data.templates.length*4);
    for(let k=0;k<geometries.length;k++){
      const g=geometries[k];
      for(let v=0;v<vertices;v++){
        const at=(k*vertices*2+v*2)*4;
        atlas.set(g.attributes.position.array.subarray(v*3,v*3+3),at);
        atlas.set(g.attributes.normal.array.subarray(v*3,v*3+3),at+4);
      }
      if(k)g.dispose();
    }
    const texture=new THREE.DataTexture(atlas,vertices*2,data.templates.length,THREE.RGBAFormat,THREE.FloatType);
    texture.needsUpdate=true;texture.minFilter=texture.magFilter=THREE.NearestFilter;
    geometry.setAttribute('headWeight',weights);geometry.setAttribute('tuftVariant',variants);
    return {geometry,texture};
  }
  lodCache.balanced=makeLOD('balanced');
  const atlasUniform={value:lodCache.balanced.texture};
  const prior=material.onBeforeCompile;
  material.onBeforeCompile=shader=>{
    prior.call(material,shader);shader.uniforms.nativeTuftAtlas=atlasUniform;
    shader.vertexShader='uniform sampler2D nativeTuftAtlas; attribute float tuftVariant;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
      vec3 nativePosition=texelFetch(nativeTuftAtlas,ivec2(gl_VertexID*2,int(tuftVariant)),0).xyz;
      objectNormal=texelFetch(nativeTuftAtlas,ivec2(gl_VertexID*2+1,int(tuftVariant)),0).xyz;
    `).replace('#include <begin_vertex>','vec3 transformed=nativePosition;').replace('microPosition=position','microPosition=nativePosition');
  };
  const mesh=new THREE.InstancedMesh(lodCache.balanced.geometry,material,rows.length);
  mesh.name='D4_Native_Wool_128_Families';mesh.frustumCulled=false;
  const lightDir=new THREE.Vector3(-.45,.65,.62).normalize();
  for(let i=0;i<rows.length;i++){
    const row=rows[i];mesh.setMatrixAt(i,row.matrix);
    const scalpNormal=new THREE.Vector3().setFromMatrixColumn(row.matrix,2).normalize();
    const macroLight=.58+.42*Math.max(0,scalpNormal.dot(lightDir));
    mesh.setColorAt(i,colorA.clone().lerp(colorB,((row.id*17)%101)/100).multiplyScalar(macroLight));
  }
  mesh.userData.fullCount=rows.length;mesh.userData.exportedFromMaster=true;
  model.add(mesh);const meshes=[mesh];
  onProgress?.('正在梳理 Jolly 的卷绒…');await new Promise(r=>setTimeout(r,0));
  const napMeshes=[];
  for(const part of data.nap){
    const positions=[],colors=[];
    for(let i=0;i<part.count;i++){
      const at=part.offset+i*12;
      for(const index of [0,1,1,2]){
        const a=at+index*3,p=new THREE.Vector3(nap[a],nap[a+2],-nap[a+1]);
        if(part.head)p.sub(new THREE.Vector3(...manifest.neckPivot));
        positions.push(...p.toArray());colors.push(...nap.slice(at+9,at+12));
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    const lines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.09,depthWrite:false}));
    lines.name=part.name;lines.frustumCulled=false;
    (part.head?model.getObjectByName(manifest.headNode):model).add(lines);napMeshes.push(lines);
  }
  let quality='balanced';
  return {
    setQuality(mode){
      quality=mode;
      if(!lodCache[mode])lodCache[mode]=makeLOD(mode);
      mesh.geometry=lodCache[mode].geometry;atlasUniform.value=lodCache[mode].texture;
      mesh.count=mesh.userData.fullCount;
      for(const mesh of napMeshes)mesh.geometry.setDrawRange(0,Math.floor(mesh.geometry.attributes.position.count*(mode==='low'?.3:mode==='balanced'?.65:1)/4)*4);
    },
    stats(){return {source:'D4 saved Master',sourceSHA256:data.sourceSHA256,sourceRoots:data.sourceRoots,templateCount:data.templates.length,quality,visibleTufts:meshes.reduce((a,m)=>a+m.count,0),triangles:meshes.reduce((a,m)=>a+m.count*m.geometry.index.count/3,0),nativeNapStrands:data.nap.reduce((a,p)=>a+p.count,0),representation:data.webLOD};},
    inspect(){return {parts:data.parts,templates:data.templates.length,sourceSHA256:data.sourceSHA256};},
    dispose(){for(const mesh of meshes){mesh.removeFromParent();mesh.dispose();}for(const cache of Object.values(lodCache)){cache.geometry.dispose();cache.texture.dispose();}material.dispose();for(const m of napMeshes){m.removeFromParent();m.geometry.dispose();m.material.dispose();}},
  };
}
