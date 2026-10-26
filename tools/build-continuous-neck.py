"""Keep the moving head and neck intact; stabilize only the stationary torso.

Raw-frame comparison places the moving neckline above pixel 560. The anchor
starts at 576 and finishes at 600, where the native torso geometry is already
aligned (95th-percentile RGB differences about one level out of 255).
No images are crossfaded at runtime. Lossless output preserves the shared body
exactly across atlas cells and avoids angle-dependent WebP chroma artifacts.
"""
import argparse, json
from pathlib import Path
import numpy as np
from PIL import Image

parser=argparse.ArgumentParser()
parser.add_argument('--renders',required=True,type=Path)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]/'site/assets/sequence-film'
manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
out=root/'neck-v34';out.mkdir(exist_ok=True)
W,H,COLS,ROWS=720,960,5,4
START,END=576,600

def read(row,col):
    rgba=np.array(Image.open(args.renders/f'p{row:02d}_y{col:02d}.png').convert('RGBA'))
    black=np.max(rgba[:,:,:3],axis=2)<=2;black[:int(H*.83)]=False
    rgba[:,:,3][black]=0
    return rgba

rest=read(2,9)
t=np.clip((np.arange(H)-START)/(END-START),0,1)
weight=(t*t*(3-2*t))[:,None,None]
files=[];max_roundtrip=0;max_neck_change=0;max_body_change=0
for row in range(5):
    sheet=Image.new('RGBA',(W*COLS,H*ROWS));expected=[]
    for col in range(19):
        source=read(row,col)
        stable=np.round(source.astype(np.float32)*(1-weight)+rest*weight).astype(np.uint8)
        max_neck_change=max(max_neck_change,int(np.abs(stable[:START].astype(int)-source[:START]).max()))
        max_body_change=max(max_body_change,int(np.abs(stable[END:].astype(int)-rest[END:]).max()))
        sheet.paste(Image.fromarray(stable),((col%COLS)*W,(col//COLS)*H));expected.append(stable)
    name=f'native-p{row:02d}.webp'
    sheet.save(out/name,'WEBP',lossless=True,quality=100,method=4,exact=True)
    decoded=Image.open(out/name).convert('RGBA')
    for col,source in enumerate(expected):
        x,y=col%COLS*W,col//COLS*H
        actual=np.asarray(decoded.crop((x,y,x+W,y+H)))
        max_roundtrip=max(max_roundtrip,int(np.abs(actual.astype(int)-source.astype(int)).max()))
    files.append('neck-v34/'+name)
    print(json.dumps({'row':row,'bytes':(out/name).stat().st_size}),flush=True)

assert max_neck_change==max_body_change==max_roundtrip==0
atlas=manifest['warpAtlas'];atlas['version']=2;atlas['images']=files
atlas['neckContinuousUntil']=START/H;atlas['stationaryBodyStart']=END/H
atlas['warpFade']=[.55,.60];atlas['colorEncoding']='lossless RGBA'
atlas['method']='one full-pose texture; native neck retained; stationary torso anchored below the neck'
manifest['playerVersion']='3.4.0'
(root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'poses':95,'bytes':sum((out/f'native-p{r:02d}.webp').stat().st_size for r in range(5)),
    'maxNeckSourceDifference':max_neck_change,'maxBodyDifference':max_body_change,'maxLosslessRoundTripDifference':max_roundtrip}),flush=True)
