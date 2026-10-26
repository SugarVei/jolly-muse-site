// Paint the setting once per layout change. The renderer composites it with
// Jolly inside its opaque canvas; there is no CSS floor or transparent cutout.
export function paintBackdrop(width,height,dpr,rect,bounds,explore=false){
  const canvas=document.createElement('canvas');canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  const ctx=canvas.getContext('2d',{alpha:false});ctx.scale(dpr,dpr);
  ctx.save();ctx.translate(width*.5,height*.82);ctx.scale(width*.72,height*.90);
  const paper=ctx.createRadialGradient(0,0,0,0,0,1);paper.addColorStop(0,'#fffaf3');paper.addColorStop(.48,'#f4eee6');paper.addColorStop(1,'#eee7de');
  ctx.fillStyle=paper;ctx.fillRect(-2,-2,4,4);ctx.restore();
  const word=document.querySelector('.backdrop-word');
  if(word){
    const style=getComputedStyle(word),box=word.getBoundingClientRect(),fontSize=parseFloat(style.fontSize),spacing=parseFloat(style.letterSpacing)||0;
    ctx.font=`${style.fontWeight} ${fontSize}px ${style.fontFamily}`;ctx.fillStyle=style.color;ctx.textBaseline='alphabetic';
    const metrics=ctx.measureText('JOLLY'),ascent=metrics.fontBoundingBoxAscent||fontSize*.9,descent=metrics.fontBoundingBoxDescent||fontSize*.25;
    const baseline=box.top+(parseFloat(style.lineHeight)-ascent-descent)/2+ascent;
    let x=box.left;for(const ch of 'JOLLY'){ctx.fillText(ch,x,baseline);x+=ctx.measureText(ch).width+spacing;}
  }
  const floor=rect.y+rect.h*bounds[3],center=rect.x+rect.w*.5;
  function shadow(x,y,rx,ry,opacity){
    ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);
    const gradient=ctx.createRadialGradient(0,0,0,0,0,1);gradient.addColorStop(0,`rgba(71,53,37,${opacity})`);gradient.addColorStop(.35,`rgba(71,53,37,${opacity*.55})`);gradient.addColorStop(1,'rgba(71,53,37,0)');
    ctx.fillStyle=gradient;ctx.fillRect(-1,-1,2,2);ctx.restore();
  }
  shadow(center,floor+rect.h*.002,rect.w*.37,Math.max(8,rect.h*.025),.17);
  shadow(center,floor,rect.w*.22,Math.max(3,rect.h*.008),.20);
  for(const x of [.36,.63])shadow(rect.x+rect.w*x,floor-rect.h*.001,rect.w*.10,Math.max(2,rect.h*.004),.30);
  return canvas;
}
