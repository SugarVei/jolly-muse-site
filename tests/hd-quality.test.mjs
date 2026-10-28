import test from 'node:test';
import assert from 'node:assert/strict';
import {qualityWidth} from '../site/src/quality-profile.js';
test('HD source selection respects device memory, display pixels and GPU limits',()=>{
  assert.equal(qualityWidth('auto',{width:1920}),1440);
  assert.equal(qualityWidth('auto',{width:1440}),1080);
  assert.equal(qualityWidth('auto',{width:1440,pixelRatio:2}),1440);
  assert.equal(qualityWidth('auto',{width:390,pixelRatio:3,memory:4}),720);
  assert.equal(qualityWidth('auto',{width:1920,memory:4}),720);
  assert.equal(qualityWidth('high',{width:1920,maxTextureSize:4096}),720);
  assert.equal(qualityWidth('high',{width:1920,maxTextureSize:8192}),1440);
  assert.equal(qualityWidth('low',{width:1920}),480);
  assert.equal(qualityWidth('balanced',{width:1920}),1080);
});
