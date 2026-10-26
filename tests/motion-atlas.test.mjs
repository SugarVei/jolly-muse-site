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
test('both quality banks are complete; existing full-resolution detail frames remain available',async()=>{
  for(const spec of Object.values(atlas.tiers)){
    assert.equal(spec.files.length,atlas.grid.pitch.length);
    for(const name of spec.files)assert.ok((await stat(new URL(name,root))).size>0);
  }
  for(const row of atlas.sourceRows)for(const col of atlas.sourceCols){
    const id=`p${String(row).padStart(2,'0')}_y${String(col).padStart(2,'0')}`;
    assert.ok((await stat(new URL(`high/${id}.webp`,root))).size>0);
  }
});
test('automatic resident bitmap memory stays bounded on phones and desktops',()=>{
  const bytes=w=>atlas.grid.pitch.length*atlas.columns*atlas.rows*w*Math.round(w/manifest.aspect)*4;
  assert.ok(bytes(360)<70*1024*1024);
  assert.ok(bytes(480)<120*1024*1024);
});
