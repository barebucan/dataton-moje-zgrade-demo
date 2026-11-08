import {mkdir,writeFile,cp,readdir,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const url='https://github.com/barebucan/dataton-moje-zgrade-demo/releases/download/final-v203-20261107/moje-zgrade-runtime-mz-systematic-20261107-v203.tar.gz';
const response=await fetch(url);
if(!response.ok) throw Error('Snapshot download failed: '+response.status);
const data=Buffer.from(await response.arrayBuffer());
if(createHash('sha256').update(data).digest('hex')!=='62ecc489038588993c3854fbb22fd1a5c26b171cbef72fe25b083f50e7e61a03') throw Error('Snapshot integrity check failed');
await writeFile('/tmp/mz-runtime.tar.gz',data);await mkdir('api',{recursive:true});
execFileSync('tar',['-xzf','/tmp/mz-runtime.tar.gz','-C','api']);
for(const name of await readdir('api/runtime')) {
 if(name.endsWith('.py')) {
  const path='api/runtime/'+name;
  const code=await readFile(path,'utf8');
  await writeFile(path,code.replaceAll('?mode=ro','?mode=ro&immutable=1'));
 }
}
await cp('api/runtime/web','public',{recursive:true});
console.log('Independent offline building runtime prepared.');

const reviewPath='public/review.html';
const review=await readFile(reviewPath,'utf8');
await writeFile(reviewPath,review.replace('Interni izvorni paket s manifestom read-only baza','Javni runtime s obrađenim bazama (TAR.GZ)'));

const source=await fetch('https://api.github.com/repos/barebucan/dataton-moje-zgrade-demo/tarball/96611f546579b686a4ac59abb392e35e51071f28',{headers:{'User-Agent':'DELTA-static-build'}});
if(!source.ok)throw Error('Source snapshot failed: '+source.status);
await writeFile('/tmp/mz-source.tar.gz',Buffer.from(await source.arrayBuffer()));
await mkdir('/tmp/mz-export',{recursive:true});
execFileSync('tar',['-xzf','/tmp/mz-source.tar.gz','--strip-components=1','-C','/tmp/mz-export']);
await cp('/tmp/mz-export/overrides','public',{recursive:true});

const serverPath='api/runtime/server.py';
await writeFile(serverPath,(await readFile(serverPath,'utf8')).replaceAll("['mala','srednja','velika']","['mala','srednja','velika','overview']"));
