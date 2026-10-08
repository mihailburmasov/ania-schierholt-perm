// Сопоставляет фото по сходству: для каждого файла из папки A ищет самый похожий в папке B.
// node tools/imagebank/match.mjs <A> <B> <map.json>; печатает расстояние до лучшего и второго кандидата.
import sharp from 'sharp';
import fs from 'fs';
const [A,B]=process.argv.slice(2);
const vec=async f=>new Float32Array(await sharp(f).resize(32,45,{fit:'fill'}).grayscale().raw().toBuffer());
const la=fs.readdirSync(A).filter(f=>/\.jpe?g$/i.test(f)), lb=fs.readdirSync(B).filter(f=>/\.jpe?g$/i.test(f));
const va={},vb={}; for(const f of la) va[f]=await vec(A+'/'+f); for(const f of lb) vb[f]=await vec(B+'/'+f);
const res={};
for(const a of la){ const d=lb.map(b=>{let s=0;for(let i=0;i<va[a].length;i++){const x=va[a][i]-vb[b][i];s+=x*x;}return [b,s/va[a].length];}).sort((x,y)=>x[1]-y[1]);
 res[a]=d[0][0]; console.log(a.padEnd(22), d[0][0].padEnd(34), d[0][1].toFixed(0).padStart(6), '| 2nd', d[1][1].toFixed(0).padStart(6)); }
fs.writeFileSync(process.argv[4],JSON.stringify(res,null,1));
