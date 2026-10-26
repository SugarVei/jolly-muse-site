import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {selectWarpPose,fitCharacter} from '../site/src/pose-warp-core.js';
const root=new URL('../site/assets/sequence-film/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8')),atlas=manifest.warpAtlas;

test('every pointer position selects one valid native pose with a bounded local warp',()=>{
  for(let yaw=-50;yaw<=50;yaw+=.23)for(let pitch=-20;pitch<=20;pitch+=.37){
    const p=selectWarpPose(atlas,yaw,pitch);
    assert.ok(p.col>=0&&p.col<19&&p.row>=0&&p.row<5);
    assert.ok(Math.abs(p.dx)<=.5&&Math.abs(p.dy)<=.5);
    assert.ok(p.id.match(/^p\d\d_y\d\d$/));
  }
  for(const pitch of atlas.grid.pitch)for(const yaw of atlas.grid.yaw){
    const p=selectWarpPose(atlas,yaw,pitch);assert.equal(p.dx,0);assert.equal(p.dy,0);
  }
});
test('native switching preserves the requested continuous angle',()=>{
  for(const yaw of [-34.001,-34,-33.999,-2.001,-2,-1.999,1.999,2,2.001,33.999,34,34.001]){
    for(const pitch of [-9.001,-9,-8.999,-3.001,-3,-2.999,2.999,3,3.001]){
      const p=selectWarpPose(atlas,yaw,pitch);
      assert.ok(Math.abs(atlas.grid.yaw[p.col]+p.dx*4-yaw)<1e-10);
      assert.ok(Math.abs(atlas.grid.pitch[p.row]+p.dy*6-pitch)<1e-10);
    }
  }
});
test('full character bounds fit between navigation and caption at portrait and landscape sizes',()=>{
  const bounds=atlas.modelBounds;
  for(const [w,top,bottom,margin] of [[1440,114,806,200],[390,88,600,18],[320,88,390,18],[844,70,305,150]]){
    const r=fitCharacter(w,top,bottom,margin,bounds,manifest.aspect);
    assert.ok(r.x+bounds[0]*r.w>=margin-1e-8);
    assert.ok(r.x+bounds[2]*r.w<=w-margin+1e-8);
    assert.ok(r.y+bounds[1]*r.h>=top-1e-8);
    assert.ok(r.y+bounds[3]*r.h<=bottom+1e-8);
  }
});
test('all color and raw displacement atlases are present',async()=>{
  assert.equal(atlas.images.length,5);assert.equal(atlas.flows.length,5);
  for(const file of [...atlas.images,...atlas.flows.flat()])assert.ok((await stat(new URL(file,root))).size>0);
});

test('continuous neck assets use lossless color and stop warping before the stationary body anchor',async()=>{
  assert.equal(atlas.colorEncoding,'lossless RGBA');
  assert.ok(atlas.warpFade[0]<atlas.warpFade[1]);
  assert.ok(atlas.warpFade[1]<=atlas.neckContinuousUntil);
  assert.ok(atlas.neckContinuousUntil<atlas.stationaryBodyStart);
  assert.ok(atlas.neckContinuousUntil>=.60);
  for(const file of atlas.images){
    const bytes=await readFile(new URL(file,root));let offset=12,lossless=false;
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
    while(offset+8<=bytes.length){
      const chunk=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4);
      assert.notEqual(chunk,'VP8 ','Lossy neck color returned');if(chunk==='VP8L')lossless=true;
      offset+=8+size+(size&1);
    }
    assert.ok(lossless);
  }
});
