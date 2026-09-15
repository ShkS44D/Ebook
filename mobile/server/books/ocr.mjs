import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
// Optional OCRmyPDF installation belongs on the durable worker, not a Vercel request.
export async function recognizePdf(bytes){
  if(!process.env.BOOK_OCR_EXECUTABLE)return null;
  const directory=await mkdtemp(path.join(tmpdir(),'ibook-ocr-'));
  try{
    const input=path.join(directory,'input.pdf'),output=path.join(directory,'output.pdf');
    await writeFile(input,bytes);
    await promisify(execFile)(process.env.BOOK_OCR_EXECUTABLE,['--skip-text','--jobs','1','--output-type','pdf',input,output],{timeout:5*60*1000,maxBuffer:1024*1024,windowsHide:true});
    return await readFile(output);
  }finally{
    const resolved=path.resolve(directory),parent=path.resolve(tmpdir())+path.sep;
    if(!resolved.startsWith(parent)||!path.basename(resolved).startsWith('ibook-ocr-'))throw new Error('Refusing to remove an unexpected OCR directory.');
    await rm(resolved,{recursive:true,force:true});
  }
}
