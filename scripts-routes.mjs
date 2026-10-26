import {readFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
const languages=JSON.parse(readFileSync('src/languages.json','utf8'));
for(const language of languages){const target=join('dist',language.path);mkdirSync(target,{recursive:true});copyFileSync('dist/index.html',join(target,'index.html'));}
