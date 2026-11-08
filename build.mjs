import {mkdir,writeFile,cp,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const url="https://github.com/barebucan/dataton-moje-zgrade-demo/releases/download/final-v214-20261108/moje-zgrade-runtime-final-v214.tar.gz";
const response=await fetch(url);if(!response.ok)throw Error('Runtime download failed: '+response.status);
const data=Buffer.from(await response.arrayBuffer());
if(createHash('sha256').update(data).digest('hex')!=="d9c9ab5711d961e00ca860cc3deb4eec30ba22fd28d1112b6f2a1533d0928a9f")throw Error('Runtime integrity check failed');
await writeFile('/tmp/mz-runtime.tar.gz',data);await mkdir('api',{recursive:true});
execFileSync('tar',['-xzf','/tmp/mz-runtime.tar.gz','-C','api']);
await cp('api/runtime/web','public',{recursive:true});
console.log('Final v214 vector buildings, reviewed renewal and flood overview prepared.');

// Public documentation stays within the standalone deployment.
for(const name of ['index.html','index.template.html','pokus/index.html']){
 const p='public/'+name;
 await writeFile(p,(await readFile(p,'utf8')).replaceAll('http://100.103.73.54:8327/pokus/povezivanje.html','/guide').replaceAll('Rezultati, pravila, kvaliteta i preuzimanje ishoda svih zapisa','Pravila povezivanja i kvaliteta podataka'));
}

const navSource=await fetch('https://api.github.com/repos/barebucan/dataton-moje-zgrade-demo/tarball/f13208a491e9a81c8a51b716cd9106ce4556b88f',{headers:{'User-Agent':'DELTA-static-build'}});
if(!navSource.ok)throw Error('Navigation source failed: '+navSource.status);
await writeFile('/tmp/mz-navigation.tar.gz',Buffer.from(await navSource.arrayBuffer()));
await mkdir('/tmp/mz-navigation',{recursive:true});
execFileSync('tar',['-xzf','/tmp/mz-navigation.tar.gz','--strip-components=1','-C','/tmp/mz-navigation']);
await cp('/tmp/mz-navigation/overrides','public',{recursive:true});
