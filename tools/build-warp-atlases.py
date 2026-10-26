"""Build sharp native poses and displacement fields; never crossfade faces."""
import argparse, json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

parser=argparse.ArgumentParser()
parser.add_argument('--renders',required=True,type=Path)
args=parser.parse_args()
cv2.setNumThreads(2)
root=Path(__file__).resolve().parents[1]/'site/assets/sequence-film'
manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
old=manifest['motionAtlas']
out=root/'warp-v32';out.mkdir(exist_ok=True)
W,H=720,960
FW,FH=180,240
COLS,ROWS=5,4
images={};grays={};bounds=[]
for row in range(5):
    for col in range(19):
        rgba=np.asarray(Image.open(args.renders/f'p{row:02d}_y{col:02d}.png').convert('RGBA')).copy()
        black=np.max(rgba[:,:,:3],axis=2)<=2
        black[:int(H*.83)]=False
        rgba[:,:,3][black]=0
        images[row,col]=rgba
        ys,xs=np.where(rgba[:,:,3]>64)
        bounds.append([int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)])
        a=rgba[:,:,3:4]/255
        rgb=(rgba[:,:,:3]*a+np.array([243,238,230])*(1-a)).astype('uint8')
        grays[row,col]=cv2.resize(cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY),(360,480),interpolation=cv2.INTER_AREA)

yy=np.linspace(0,1,FH)[:,None]
moving=np.clip((.70-yy)/.16,0,1);moving=moving*moving*(3-2*moving)
def flow(a,b):
    if a==b:return np.zeros((FH,FW,2),np.float32)
    dis=cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    dis.setFinestScale(0)
    dis.setGradientDescentIterations(32)
    f=dis.calc(grays[a],grays[b],None)
    f=cv2.resize(f,(FW,FH),interpolation=cv2.INTER_AREA)*2
    f*=moving[:,:,None]
    return np.clip(f,-63.5,63.5)

color_files=[];flow_files=[]
for row in range(5):
    sharp=Image.new('RGBA',(W*COLS,H*ROWS))
    flows=[np.full((FH*ROWS,FW*COLS,4),128,np.uint8) for _ in range(2)]
    for col in range(19):
        sharp.paste(Image.fromarray(images[row,col]),((col%COLS)*W,(col//COLS)*H))
        neighbours=[(row,max(0,col-1)),(row,min(18,col+1)),(max(0,row-1),col),(min(4,row+1),col)]
        vectors=[flow((row,col),n) for n in neighbours]
        for axis in range(2):
            packed=np.concatenate(vectors[axis*2:axis*2+2],axis=2)
            encoded=np.clip(np.round(packed*2+128),0,255).astype('uint8')
            x,y=(col%COLS)*FW,(col//COLS)*FH
            flows[axis][y:y+FH,x:x+FW]=encoded
    name=f'native-p{row:02d}.webp'
    sharp.save(out/name,'WEBP',quality=98,method=5,exact=True)
    color_files.append('warp-v32/'+name)
    pair=[]
    for axis,values in zip(['yaw','pitch'],flows):
        name=f'{axis}-p{row:02d}.png'
        Image.fromarray(values).save(out/name,optimize=True)
        pair.append('warp-v32/'+name)
    flow_files.append(pair)
    print('packed row',row,flush=True)

box=[min(b[0] for b in bounds)/W,min(b[1] for b in bounds)/H,max(b[2] for b in bounds)/W,max(b[3] for b in bounds)/H]
manifest['playerVersion']='3.3.0'
manifest['warpAtlas']={'version':1,'width':W,'height':H,'flowWidth':FW,'flowHeight':FH,'columns':COLS,'rows':ROWS,
    'flowZero':128,'flowScale':2,'grid':old['grid'],'sourceRows':old['sourceRows'],'sourceCols':old['sourceCols'],
    'images':color_files,'flows':flow_files,'modelBounds':box,'method':'single native pose, inverse displacement warp; no pose crossfade'}
(root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'bounds':box,'bytes':sum(p.stat().st_size for p in out.iterdir()),'nativePoses':95}),flush=True)
