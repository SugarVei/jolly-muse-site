import * as THREE from 'three';

// A single closed surface keeps the small toe cleft continuous with the pad.
// The upper half sinks into the fleece cuff instead of leaving floating balls.
function paddedPaw(foot,inward=1){
  const g=new THREE.SphereGeometry(1,48,32),p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const sx=p.getX(i),sy=p.getY(i),sz=p.getZ(i);
    let x=sx*(foot ? .103 : .073),y=sy*(foot ? .075 : .090)+(foot ? .031 : .011),z=sz*(foot ? .137 : .086)+(foot ? .035 : .012);
    const front=THREE.MathUtils.smoothstep(sz,-.3,.45);
    const lower=1-THREE.MathUtils.smoothstep(sy,-.8,.05);
    const cleft=Math.exp(-((x/(foot ? .016 : .012))**2))*front*lower;
    if(foot){z-=.020*cleft;y+=.018*cleft;}
    else{
      y+=.015*cleft;z-=.008*cleft;
      x+=inward*.018*Math.exp(-((sy/.4)**2))*THREE.MathUtils.smoothstep(sx*inward,.1,.85);
    }
    p.setXYZ(i,x,y,z);
  }
  g.computeVertexNormals();g.computeBoundingSphere();return g;
}

// Refine the supplied mesh in local coordinates; its validated rig is retained.
export function refineModel(model){
  const face=model.getObjectByName('Face');
  const p=face.geometry.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),u=Math.abs(x/.3843),v=Math.abs(y/.3137);
    const oldRadius=Math.pow(u**2.5+v**2.5,1/2.5),newRadius=Math.pow(u**2.13+v**2.13,1/2.13);
    const scale=newRadius>.0001?oldRadius/newRadius:1;
    p.setXY(i,x*scale,y*scale);
  }
  p.needsUpdate=true;face.geometry.computeVertexNormals();face.geometry.computeBoundingSphere();
  for(const [name,x,y] of [['Eye_L',-.19706,1.6139],['Eye_R',.20402,1.6156]]){
    const eye=model.getObjectByName(name);eye.scale.x*=1.16;eye.scale.y*=1.04;
    eye.position.x=x;eye.position.y=y-1.68;
  }
  const nose=model.getObjectByName('Nose');nose.scale.x*=1.25;nose.scale.y*=1.4;
  for(const side of ['L','R']){
    const foot=model.getObjectByName('Foot_'+side);
    foot.geometry.dispose();foot.geometry=paddedPaw(true);
    const hand=model.getObjectByName('Hand_'+side);
    hand.geometry.dispose();hand.geometry=paddedPaw(false,side==='L'?1:-1);
    for(const [prefix,scale] of [['EarCup_',[.048,.205,.148]],['EarCup_Outer_Plate_',[.012,.184,.126]],['EarPad_',[.035,.202,.14]]]){
      const node=model.getObjectByName(prefix+side);
      const g=new THREE.SphereGeometry(1,48,32);g.scale(...scale);
      node.geometry.dispose();node.geometry=g;
    }
  }
  function bandShape(rx,ry,thickness,depth,z){
    const shape=new THREE.Shape();
    shape.absellipse(0,1.826,rx,ry,0,Math.PI,false);
    shape.absellipse(0,1.826,rx-thickness,ry-thickness,Math.PI,0,true);shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth,steps:1,curveSegments:128,bevelEnabled:true,bevelSegments:3,bevelSize:.002,bevelThickness:.002});
    g.translate(0,0,z);return g;
  }
  for(const [name,g] of [
    ['Headband',bandShape(.596,.445,.029,.106,-.065)],
    ['Headband_Inner_Padding',bandShape(.576,.425,.014,.085,-.055)],
    ['Headband_Front_Rim',bandShape(.597,.446,.003,.003,.047)],
  ]){const node=model.getObjectByName(name);node.geometry.dispose();node.geometry=g;}
}
