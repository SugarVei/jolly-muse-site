export const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function axisSample(values,value){
  const x=clamp(value,values[0],values.at(-1));
  let hi=values.findIndex(v=>v>=x);
  if(hi<=0)return {lo:0,hi:0,t:0};
  if(values[hi]===x)return {lo:hi,hi,t:0};
  return {lo:hi-1,hi,t:(x-values[hi-1])/(values[hi]-values[hi-1])};
}
export const poseId=(row,col)=>`p${String(row).padStart(2,'0')}_y${String(col).padStart(2,'0')}`;

export function samplePose(grid,yaw,pitch){
  const x=axisSample(grid.yaw,yaw),y=axisSample(grid.pitch,pitch),weights=new Map();
  for(const [row,wy] of [[y.lo,1-y.t],[y.hi,y.t]]){
    for(const [col,wx] of [[x.lo,1-x.t],[x.hi,x.t]]){
      const weight=wx*wy;if(weight<=1e-6)continue;
      const id=poseId(row,col),previous=weights.get(id);
      weights.set(id,{id,row,col,weight:weight+(previous?.weight||0)});
    }
  }
  return [...weights.values()];
}

export function pointerPose(x,y,width,height,eyeY,grid){
  const nx=clamp((x-width*.5)/(width*.46),-1,1);
  const ny=clamp((y-eyeY)/(height*.5),-1,1);
  return {yaw:nx*(nx<0?-grid.yaw[0]:grid.yaw.at(-1)),pitch:ny*(ny<0?-grid.pitch[0]:grid.pitch.at(-1))};
}

// Stay at the selected resolution while a new angle decodes. Thumbnails must
// never replace a sharp frame merely because their angle is a closer match.
export function nearestReadyPose(cache,tier,grid,yaw,pitch,minWidth){
  let best=null;
  for(const [key,item] of cache.items){
    if(!key.startsWith(`${tier}/`)||item.bitmap.width<minWidth)continue;
    const match=/\/p(\d+)_y(\d+)$/.exec(key);if(!match)continue;
    const row=Number(match[1]),col=Number(match[2]);
    if(grid.pitch[row]===undefined||grid.yaw[col]===undefined)continue;
    const distance=(grid.yaw[col]-yaw)**2+(grid.pitch[row]-pitch)**2;
    if(!best||distance<best.distance)best={key,id:poseId(row,col),row,col,distance};
  }
  if(!best)return null;
  return {...best,bitmap:cache.get(best.key).bitmap,weight:1,tier};
}

export class BitmapCache{
  constructor(limitBytes){this.limit=limitBytes;this.bytes=0;this.items=new Map();this.pinned=new Set();}
  get(key){const value=this.items.get(key);if(value){this.items.delete(key);this.items.set(key,value);}return value;}
  put(key,bitmap){
    const old=this.items.get(key);if(old){this.bytes-=old.bytes;old.bitmap.close?.();this.items.delete(key);}
    const value={bitmap,bytes:bitmap.width*bitmap.height*4};this.items.set(key,value);this.bytes+=value.bytes;this.trim();return value;
  }
  trim(){for(const [key,value] of this.items){if(this.bytes<=this.limit)break;if(this.pinned.has(key))continue;value.bitmap.close?.();this.bytes-=value.bytes;this.items.delete(key);}}
  clear(){for(const v of this.items.values())v.bitmap.close?.();this.items.clear();this.bytes=0;}
}
