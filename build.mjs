import {mkdir,writeFile,cp,readdir,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const url='https://github.com/barebucan/dataton-moje-zgrade-demo/releases/download/snapshot-20261107/moje-zgrade-runtime-20261107.tar.gz';
const response=await fetch(url);
if(!response.ok) throw Error('Snapshot download failed: '+response.status);
const data=Buffer.from(await response.arrayBuffer());
if(createHash('sha256').update(data).digest('hex')!=='c7005fe4c71ffd9df056a95eeb4bf20fcef9a2a4e651a71b8aa363e998d96b81') throw Error('Snapshot integrity check failed');
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
