const sequenceMode=new URLSearchParams(location.search).get('view')!=='3d';
const {createJolly}=await import(sequenceMode?'./scene-unified.js?v=3.4.0':'./scene-d4.js');
const $=id=>document.getElementById(id);
const stage=$('stage'),dialog=$('about-dialog'),ring=$('cursor-ring');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const coarse=matchMedia('(pointer: coarse)');
if(coarse.matches){$('hint').textContent='轻轻拖动，和 Jolly 打个招呼。';document.querySelector('.explore-hint').textContent='单指转动 · 双指拉近 · 轻点右上角返回';}
if(sequenceMode){
  document.body.classList.add('sequence-mode');
  $('explore').firstChild.textContent='靠近看看 ';
  $('explore').setAttribute('aria-label','靠近看看 Jolly');
  $('exit-explore').firstChild.textContent='回到全景 ';
  document.querySelector('.explore-hint').textContent=coarse.matches?'拖动目光 · 双指拉近 · 轻点右上角返回':'移动鼠标，和它对视。滚轮拉近 · Esc 返回';
}else{
  $('alternate-view').href='./';$('alternate-view').firstChild.textContent='回到轻盈互动 ';
}
const controls=[$('pause'),$('recenter'),$('quality'),$('explore')];controls.forEach(e=>e.disabled=true);
let jolly=null,immersive=false,dialogWasPaused=false;
function refreshStatus(){
  const paused=jolly?.state.paused;
  $('pause').setAttribute('aria-pressed',String(paused));$('pause').setAttribute('aria-label',paused?'继续跟随':'暂停跟随');$('pause').title=paused?'继续跟随 · 空格':'暂停跟随 · 空格';
  $('pause-icon').setAttribute('href',paused?'#i-play':'#i-pause');
  $('status-text').textContent=paused?'安静陪伴中':'跟随已开启';$('follow-status').classList.toggle('paused',paused);
}
function togglePause(){if(!jolly)return;jolly.setPaused(!jolly.state.paused);refreshStatus();}
function setImmersive(value){immersive=value;jolly?.setExplore(value);document.body.classList.toggle('immersive',value);document.querySelector('.navigation').inert=value;$('explore').setAttribute('aria-pressed',String(value));ring.classList.remove('visible');if(value)stage.focus({preventScroll:true});else $('explore').focus({preventScroll:true});}
function openAbout(){dialogWasPaused=jolly?.state.paused??false;jolly?.setPaused(true);refreshStatus();dialog.showModal();ring.classList.remove('visible');}
$('pause').addEventListener('click',togglePause);
$('recenter').addEventListener('click',()=>jolly?.center());
$('quality').addEventListener('change',e=>jolly?.setQuality(e.target.value));
$('explore').addEventListener('click',()=>setImmersive(!immersive));
$('exit-explore').addEventListener('click',()=>{setImmersive(false);$('explore').focus();});
$('space').addEventListener('click',()=>{jolly?.center();stage.focus({preventScroll:true});});
$('about').addEventListener('click',openAbout);
$('close-about').addEventListener('click',()=>dialog.close());$('return-to-jolly').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>{jolly?.setPaused(dialogWasPaused);refreshStatus();});
dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
let touchActive=false;
stage.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'){touchActive=true;stage.setPointerCapture(e.pointerId);if(!immersive)jolly?.pointer(e.clientX,e.clientY);}});
stage.addEventListener('pointermove',e=>{
  if(dialog.open||immersive||e.pointerType!=='mouse'&&!touchActive)return;
  jolly?.pointer(e.clientX,e.clientY);
  if(e.pointerType==='mouse'&&!reduced.matches){ring.style.left=e.clientX+'px';ring.style.top=e.clientY+'px';ring.classList.toggle('visible',!jolly?.state.paused);}
});
stage.addEventListener('pointerup',e=>{touchActive=false;if(e.pointerType!=='mouse'&&!immersive&&!jolly?.state.paused)jolly?.center();});
stage.addEventListener('pointercancel',()=>{touchActive=false;if(!immersive&&!jolly?.state.paused)jolly?.center();ring.classList.remove('visible');});
stage.addEventListener('pointerleave',()=>ring.classList.remove('visible'));
document.documentElement.addEventListener('mouseleave',()=>{if(!jolly?.state.paused&&!immersive)jolly?.center();ring.classList.remove('visible');});
window.addEventListener('blur',()=>{if(!jolly?.state.paused&&!immersive)jolly?.center();ring.classList.remove('visible');});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&immersive){setImmersive(false);return;}
  if(dialog.open||e.target.matches('button,a,select,input,textarea'))return;
  const keys={ArrowLeft:[-.1,0],ArrowRight:[.1,0],ArrowUp:[0,-.06],ArrowDown:[0,.06]};
  if(keys[e.key]){e.preventDefault();jolly?.nudge(...keys[e.key]);}
  if(e.code==='Space'){e.preventDefault();togglePause();}
  if(e.key==='Home'){e.preventDefault();jolly?.center();}
});
// Double-click / double-tap leaves the immersive view; Escape is also available.
stage.addEventListener('dblclick',()=>{if(immersive)setImmersive(false);});
$('retry').addEventListener('click',()=>location.reload());
stage.addEventListener('webglcontextlost',e=>{e.preventDefault();showError('图形上下文已中断，请重新加载页面。');},true);
function showError(message){$('loading').hidden=true;$('load-error').hidden=false;$('error-detail').textContent=message;controls.forEach(e=>e.disabled=true);}
try{
  if(location.protocol==='file:')throw new Error('请双击文件夹中的“启动网页.cmd”，通过本地服务打开网页。');
  jolly=await createJolly(stage,{onProgress:text=>$('loading-text').textContent=text,reducedMotion:reduced.matches});
  window.jolly={diagnostics:()=>jolly.diagnostics(),recenter:()=>jolly.center(),resetMetrics:()=>jolly.resetMetrics(),inspectMaterials:()=>jolly.inspectMaterials(),inspectGeometry:()=>jolly.inspectGeometry(),inspectGroom:()=>jolly.inspectGroom()};
  controls.forEach(e=>e.disabled=false);refreshStatus();$('loading').classList.add('done');
  setTimeout(()=>$('loading').hidden=true,reduced.matches?0:550);
}catch(error){console.error(error);showError(/[\u4e00-\u9fff]/.test(error.message||'')?error.message:'模型没有完整加载，请确认网页文件齐全，再试一次。');}
