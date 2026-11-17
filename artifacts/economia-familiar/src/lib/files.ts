import type { DatosUsuario, Movimiento } from './model';
import * as XLSX from 'xlsx';

const utf8=new TextEncoder(), text=new TextDecoder();
function crc32(bytes:Uint8Array){
  let crc=-1;
  for(const b of bytes){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^-1)>>>0;
}
function u16(v:number){return [v&255,(v>>>8)&255]}
function u32(v:number){return [v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255]}
export function crearZip(files:{name:string;content:string}[]){
  const chunks:Uint8Array[]=[], central:Uint8Array[]=[];let offset=0;
  for(const file of files){
    const name=utf8.encode(file.name),body=utf8.encode(file.content),crc=crc32(body);
    const local=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(body.length),...u32(body.length),...u16(name.length),...u16(0),...name,...body]);
    chunks.push(local);
    central.push(new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(body.length),...u32(body.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...name]));
    offset+=local.length;
  }
  const csize=central.reduce((n,c)=>n+c.length,0);
  const end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(central.length),...u16(central.length),...u32(csize),...u32(offset),...u16(0)]);
  const parts=[...chunks,...central,end].map(part=>new Uint8Array(part).buffer as ArrayBuffer);
  return new Blob(parts,{type:'application/zip'});
}
export async function leerZip(file:File):Promise<Record<string,string>>{
  const bytes=new Uint8Array(await file.arrayBuffer()), view=new DataView(bytes.buffer);
  const found:Record<string,string>={};
  let end=-1;
  for(let i=Math.max(0,bytes.length-65557);i+4<=bytes.length;i++)if(view.getUint32(i,true)===0x06054b50)end=i;
  if(end<0)throw new Error('El ZIP no tiene un índice central válido.');
  const count=view.getUint16(end+10,true),centralSize=view.getUint32(end+12,true);let p=view.getUint32(end+16,true);
  if(p+centralSize>bytes.length)throw new Error('El índice del ZIP está incompleto.');
  for(let entry=0;entry<count&&p+46<=bytes.length;entry++){
    if(view.getUint32(p,true)!==0x02014b50)throw new Error('El índice del ZIP está dañado.');
    const method=view.getUint16(p+10,true),expectedCrc=view.getUint32(p+16,true),compressed=view.getUint32(p+20,true),size=view.getUint32(p+24,true),nameLen=view.getUint16(p+28,true),extra=view.getUint16(p+30,true),comment=view.getUint16(p+32,true),localOffset=view.getUint32(p+42,true);
    const name=text.decode(bytes.slice(p+46,p+46+nameLen));
    if(localOffset+30>bytes.length||view.getUint32(localOffset,true)!==0x04034b50)throw new Error('El contenido ZIP está incompleto.');
    const localName=view.getUint16(localOffset+26,true),localExtra=view.getUint16(localOffset+28,true),start=localOffset+30+localName+localExtra;
    let payload=bytes.slice(start,start+compressed);
    if(method===8){
      if(typeof DecompressionStream==='undefined')throw new Error('Este navegador no puede abrir ZIP comprimidos.');
      try { const stream=new Blob([new Uint8Array(payload).buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat)); payload=new Uint8Array(await new Response(stream).arrayBuffer()); }
      catch { throw new Error('No se pudo descomprimir este ZIP. Comprueba que el archivo sea válido.'); }
    } else if(method!==0) throw new Error('El ZIP usa un método de compresión no compatible.');
    if(payload.length!==size||crc32(payload)!==expectedCrc)throw new Error(`Falló la comprobación de integridad del archivo ${name}.`);
    if(name)found[name]=text.decode(payload);
    p+=46+nameLen+extra+comment;
  }
  if(!Object.keys(found).length)throw new Error('El archivo no contiene una copia ZIP válida.');
  return found;
}
export function descargar(blob:Blob,name:string){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);
}
const esc=(v:unknown)=>`"${String(v??'').replace(/"/g,'""')}"`;
export function filasCSV(data:DatosUsuario,movs:Movimiento[]){
  const cats=new Map(data.categorias.map(c=>[c.id,c.nombre]));
  return [['fecha','tipo','importe','moneda','categoria','nota','origen'],...movs.map(m=>[m.fecha,m.tipo,m.importe.toFixed(2),'EUR',m.categoriaId?cats.get(m.categoriaId)||'':'',m.nota||'',m.origen])].map(r=>r.map(esc).join(';')).join('\r\n');
}
 
export function crearXlsx(data:DatosUsuario,movs:Movimiento[]){
  const cats=new Map(data.categorias.map(c=>[c.id,c.nombre]));
  const rows=[['fecha','tipo','importe','moneda','categoria','nota','origen'],...movs.map(m=>[m.fecha,m.tipo,m.importe,'EUR',m.categoriaId?cats.get(m.categoriaId)||'':'',m.nota||'',m.origen])];
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),'Movimientos');
  const bytes=XLSX.write(workbook,{bookType:'xlsx',type:'array'}) as ArrayBuffer;
  return new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
