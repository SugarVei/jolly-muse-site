// Select a complete source bank before enabling interaction. Never change
// resolution merely because the character starts or stops turning.
export function qualityWidth(value,{width=1440,pixelRatio=1,memory=8,maxTextureSize=16384}={}){
  const requested=value==='low'?480:value==='balanced'?1080:value==='high'?1440:
    memory<=4||width<700?720:pixelRatio>=1.5||width>=1600?1440:1080;
  // Five columns and four rows of 3:4 portrait frames must fit one texture.
  const limit=Math.min(maxTextureSize/5,maxTextureSize*3/16);
  return [480,720,1080,1440].filter(w=>w<=requested&&w<=limit).at(-1)||480;
}
