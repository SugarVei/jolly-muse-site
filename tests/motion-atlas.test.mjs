import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {samplePose} from '../site/src/sequence-core.js';
const root=new URL('../site/assets/sequence-film/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
const atlas=manifest.motionAtlas;

test('resident poses cover the entire pointer range without sampling blank atlas cells',()=>{
  for(const axis of ['yaw','pitch']){
    assert.equal(atlas.grid[axis][0],manifest.grid[axis][0]);
    assert.equal(atlas.grid[axis].at(-1),manifest.grid[axis].at(-1));
  }
  for(let yaw=-45;yaw<=45;yaw+=.7)for(let pitch=-18;pitch<=18;pitch+=.9){
    const samples=samplePose(atlas.grid,yaw,pitch);
    assert.ok(Math.abs(samples.reduce((n,s)=>n+s.weight,0)-1)<1e-10);
    for(const s of samples){
      assert.ok(s.col<atlas.sourceCols.length&&s.row<atlas.sourceRows.length);
      assert.equal(atlas.grid.yaw[s.col],manifest.grid.yaw[atlas.sourceCols[s.col]]);
      assert.equal(atlas.grid.pitch[s.row],manifest.grid.pitch[atlas.sourceRows[s.row]]);
      assert.ok(Math.floor(s.col/atlas.columns)<atlas.rows);
    }
  }
});
test('all HD quality banks cover every native pose with locally available assets',async()=>{
  const current=manifest.warpAtlas;
  assert.deepEqual(manifest.renderResolution,[1440,1920]);
  assert.equal(manifest.renderSamples,96);
  assert.equal(manifest.renderFrameCount,95);
  assert.deepEqual(Object.keys(current.colorTiers).map(Number),[480,720,1080,1440]);
  for(const spec of Object.values(current.colorTiers)){
    assert.equal(spec.images.length,current.grid.pitch.length);
    assert.equal(spec.width/spec.height,manifest.aspect);
    for(const name of spec.images)assert.ok((await stat(new URL(name,root))).size>0);
  }
});
test('resident bitmap budgets remain bounded across all HD quality tiers',()=>{
  const bytes=w=>atlas.grid.pitch.length*atlas.columns*atlas.rows*w*Math.round(w/manifest.aspect)*4;
  assert.ok(bytes(720)<270*1024*1024);
  assert.ok(bytes(1080)<600*1024*1024);
  assert.ok(bytes(1440)<1060*1024*1024);
});
