from PIL import Image
from pathlib import Path
import json
root=Path(__file__).resolve().parents[2]
out=root/'mobile/assets/reference'
def crop(name,time,box):
 im=Image.open(root/'ui'/f'Screenshot 2026-09-09 at {time} PM.png').convert('RGB'); im.crop(box).save(out/f'{name}.jpg',quality=96)
crop('mexican','1.43.19',(530,189,812,575))
crop('murder','1.44.34',(64,184,347,570))
for name,box in [('burning',(514,287,595,400)),('immortal',(514,420,595,534)),('olive',(514,557,595,667)),('gold',(514,692,595,803)),('love',(514,825,595,910))]: crop(name,'1.45.13',box)
for name,box in [('red',(79,596,160,708)),('bestiary',(80,731,160,843))]: crop(name,'1.42.49',box)
for name,box in [('rain',(70,594,165,731)),('ready',(70,749,165,881))]:crop(name,'1.47.44',box)
for name,box in [('flies',(60,520,156,650)),('kevin',(60,675,156,807)),('carrion',(60,833,156,963))]:crop(name,'1.48.11',box)
crop('invisible','1.48.06',(66,273,160,405))
crop('profile','1.46.22',(143,234,276,368))
crop('friend','1.42.49',(56,194,158,293))
crop('author','1.42.57',(52,191,154,293))
for i,box in enumerate([(53,360,106,414),(53,452,106,505),(53,541,106,594),(53,633,106,685),(53,724,106,776)]):crop(f'avatar{i}','1.42.25',box)
crop('joshua','1.42.16',(328,124,370,167))
for theme,time,boxes in [('light','1.32.45',[(60,182,218,325),(357,182,521,325)]),('dark','1.43.35',[(104,276,325,497),(563,275,782,497)])]:
 for n,b in zip(['check','bulb'],boxes):crop(n+'-'+theme,time,b)
for theme,time,box in [('light','1.34.32',(52,175,239,329)),('dark','1.44.34',(553,267,777,488))]:crop('coffee-'+theme,time,box)
for theme,time,boxes in [('light','1.29.54',[(32,258,121,332),(148,258,236,334)]),('dark','1.42.39',[(68,418,180,524),(235,414,348,527)])]:
 for n,b in zip(['timer','trophy'],boxes):crop(n+'-'+theme,time,b)
for theme,time,box in [('light','1.36.20',(344,200,542,410)),('dark','1.46.07',(544,294,843,597))]:crop('bell-'+theme,time,box)
for theme,time,box in [('light','1.35.44',(48,192,253,410)),('dark','1.45.36',(70,301,367,620))]:crop('empty-'+theme,time,box)
for theme,time,box in [('light','1.35.51',(365,175,512,316)),('dark','1.45.44',(577,248,804,467))]:crop('trash-'+theme,time,box)
crop('target','1.34.43',(77,88,235,212));crop('failure','1.34.43',(392,88,497,212))
crop('orbit-light','1.28.02',(11,133,255,386));crop('orbit-dark','1.41.37',(14,210,398,600))
crop('onboard1','1.25.47',(325,160,589,437));crop('onboard2','1.25.57',(13,151,277,430));crop('onboard3','1.25.57',(308,154,569,430))
crop('logo','1.25.47',(124,279,201,392))
crop('dune','1.46.53',(59,91,85,135))
crop('onboard1-dark','1.40.36',(445,160,830,562))
crop('onboard2-dark','1.40.44',(13,148,398,558))
crop('onboard3-dark','1.40.44',(442,148,827,558))
crop('logo-dark','1.40.36',(155,280,265,453))
names=['Arts','Biographies','Business','Comic','Cooking','Edu','Health','History','Horror','Kid','Medical','Romance','Fantasy','Self-Help','Sport','Travel']
for i,n in enumerate(names):
 x=[64,163,263,361][i%4]; y=[257,397,536,675][i//4];crop('category-'+str(i),'1.47.53',(x,y,x+85,y+87))
assets={p.stem:f"require('../assets/reference/{p.name}')" for p in sorted(out.glob('*.jpg'))}
(root/'mobile/src/assets.ts').write_text('export const art = {\n'+''.join(f'  "{k}": {v},\n' for k,v in assets.items())+'} as const;\n')
(root/'mobile/src/reference-manifest.json').write_text(json.dumps([{'file':p.name,'size':Image.open(p).size} for p in sorted((root/'ui').glob('*.png'))],indent=2))
print('Extracted',len(assets),'artwork assets from 95 references')
