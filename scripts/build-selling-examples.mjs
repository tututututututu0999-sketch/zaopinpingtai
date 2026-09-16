import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {SELLING_EXAMPLES} from '../visual-rules/selling-examples.mjs';
const source=process.argv[2];if(!source)throw new Error('请提供卖点截图文件夹');
const output=new URL('../public/selling-layouts/',import.meta.url);await mkdir(output,{recursive:true});
for(const [type,time] of Object.entries(SELLING_EXAMPLES))await sharp(path.join(source,`Snipaste_2026-08-18_${time}.png`)).resize({width:720,height:360,fit:'inside',withoutEnlargement:true}).png().toFile(fileURLToPath(new URL(`${type}.png`,output)));
console.log('已从原图生成9类卖点示例；不写入项目素材库');
