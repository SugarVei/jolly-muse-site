import {clamp,poseId} from './sequence-core.js';

const nearest=(values,value)=>{
  let best=0;
  for(let i=1;i<values.length;i++)if(Math.abs(values[i]-value)<Math.abs(values[best]-value))best=i;
  return best;
};
export function selectWarpPose(atlas,yaw,pitch){
  yaw=clamp(yaw,atlas.grid.yaw[0],atlas.grid.yaw.at(-1));
  pitch=clamp(pitch,atlas.grid.pitch[0],atlas.grid.pitch.at(-1));
  const col=nearest(atlas.grid.yaw,yaw),row=nearest(atlas.grid.pitch,pitch);
  function offset(values,index,value){
    const d=value-values[index],other=index+(d<0?-1:1);
    return !d||other<0||other>=values.length?0:d/Math.abs(values[other]-values[index]);
  }
  return {row,col,id:poseId(atlas.sourceRows[row],atlas.sourceCols[col]),
    dx:offset(atlas.grid.yaw,col,yaw),dy:offset(atlas.grid.pitch,row,pitch)};
}

export function fitCharacter(width,top,bottom,sideMargin,bounds,aspect,scale=1){
  const spanX=bounds[2]-bounds[0],spanY=bounds[3]-bounds[1];
  const availableH=Math.max(80,bottom-top),availableW=Math.max(80,width-sideMargin*2);
  const h=Math.min(availableH/spanY,availableW/(spanX*aspect))*scale,w=h*aspect;
  return {x:width/2-(bounds[0]+bounds[2])/2*w,y:top+(availableH-spanY*h)/2-bounds[1]*h,w,h};
}
