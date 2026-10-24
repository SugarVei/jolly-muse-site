export const LIMITS={yaw:40*Math.PI/180,pitchUp:19*Math.PI/180,pitchDown:16*Math.PI/180};
export const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
export function pointerToPose(x,y,width,height,eyeX=width*.5,eyeY=height*.35){
  const dx=clamp((x-eyeX)/(width*.46),-1,1);
  const dy=clamp((y-eyeY)/(height*.53),-1,1);
  return {yaw:dx*LIMITS.yaw,pitch:dy*(dy<0?LIMITS.pitchUp:LIMITS.pitchDown)};
}
export function damp(current,target,dt,rate=11){return current+(target-current)*(1-Math.exp(-rate*Math.max(0,dt)));}
