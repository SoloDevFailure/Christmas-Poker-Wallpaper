import {mkdir, readFile, writeFile} from 'node:fs/promises';
const html=await readFile('dist/index.html','utf8');
await mkdir('dist/phone',{recursive:true});
await writeFile('dist/phone/index.html',html);
await writeFile('dist/404.html',html);
await writeFile('dist/.nojekyll','');
