from pathlib import Path
import json
from PIL import Image
import numpy as np

base = Path('.agents/outputs/Scan_2026-09-08-3_1788875051688-analysis')
files = [base/'embedded-xref-23.jpeg', base/'embedded-xref-24.jpeg', base/'embedded-xref-25.jpeg']
out = base/'comparison'
out.mkdir(exist_ok=True)
common_size = (1511, 1053)

def metrics(gray):
    a=np.asarray(gray,dtype=np.float32)
    c=a[1:-1,1:-1]
    lap=4*c-a[1:-1,:-2]-a[1:-1,2:]-a[:-2,1:-1]-a[2:,1:-1]
    gx=a[1:-1,2:]-a[1:-1,:-2]
    gy=a[2:,1:-1]-a[:-2,1:-1]
    return {'laplacian_variance':round(float(lap.var()),2),'gradient_energy':round(float(np.mean(gx*gx+gy*gy)),2),'mean':round(float(a.mean()),2),'stddev':round(float(a.std()),2)}

results=[]
for i,path in enumerate(files,1):
    image=Image.open(path).convert('RGB')
    rot=image.transpose(Image.Transpose.ROTATE_90)
    rot.save(out/f'page-{i}-upright.jpg',quality=98)
    normalized=rot.resize(common_size,Image.Resampling.LANCZOS)
    w,h=normalized.size
    roi=normalized.crop((int(w*.07),int(h*.08),int(w*.94),int(h*.93)))
    rw,rh=roi.size
    thirds=[]; contact=[]
    for j,name in enumerate(['left','center','right']):
        x0=round(rw*j/3); x1=round(rw*(j+1)/3)
        region=roi.crop((x0,0,x1,rh)).convert('L')
        thirds.append({'region':name,**metrics(region)})
        crop=roi.crop((x0,int(rh*.25),x1,int(rh*.72)))
        contact.append(crop.resize((round(crop.width*1.65),round(crop.height*1.65)),Image.Resampling.LANCZOS))
    strip=Image.new('RGB',(sum(x.width for x in contact),max(x.height for x in contact)),'white')
    ox=0
    for x in contact: strip.paste(x,(ox,0)); ox+=x.width
    strip.save(out/f'page-{i}-thirds-zoom.jpg',quality=98)
    results.append({'page':i,'native_width':image.width,'native_height':image.height,'native_pixels':image.width*image.height,'normalized_overall':metrics(roi.convert('L')),'regions':thirds})
(out/'metrics.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
