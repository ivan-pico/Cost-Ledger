import { datosVacios, type DatosUsuario } from './model';

type UsuarioIndexado = { id: string; hash: string; salt: string; iv: string; contenido: string };
const KEY_INDEX = 'economia-familiar:index:v1';
const KEY_SESSION = 'economia-familiar:sesion:v1';
const enc = new TextEncoder();
const dec = new TextDecoder();
const toB64 = (v: Uint8Array) => {
  let binary='';
  for(let i=0;i<v.length;i+=0x8000)binary+=String.fromCharCode(...v.subarray(i,i+0x8000));
  return btoa(binary);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), c=>c.charCodeAt(0));
const digest = async (v: string) => toB64(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(v))));
const saveQueues=new Map<string,Promise<void>>();

async function derive(alias: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw',enc.encode(alias.normalize('NFKC').trim().toLocaleLowerCase('es')), 'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt:new Uint8Array(salt).buffer as ArrayBuffer,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function cipher(text: string, alias: string, salt?: Uint8Array) {
  const s = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(alias,s);
  const payload = await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(text));
  return {salt:toB64(s),iv:toB64(iv),contenido:toB64(new Uint8Array(payload))};
}
async function decipher(user: UsuarioIndexado, alias: string) {
  const key = await derive(alias,fromB64(user.salt));
  const bytes = await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(user.iv)},key,fromB64(user.contenido));
  return JSON.parse(dec.decode(bytes)) as DatosUsuario;
}
function index(): UsuarioIndexado[] {
  try { return JSON.parse(localStorage.getItem(KEY_INDEX) || '[]'); } catch { return []; }
}
function persist(users: UsuarioIndexado[]) { localStorage.setItem(KEY_INDEX,JSON.stringify(users)); }
export async function identidadHash(alias: string, correo: string) {
  return digest(`${alias.normalize('NFKC').trim().toLocaleLowerCase('es')}|${correo.trim().toLocaleLowerCase('es')}`);
}
export async function existeUsuario(alias: string, correo: string) {
  const h=await identidadHash(alias,correo); return index().some(u=>u.hash===h);
}
export async function crearUsuario(alias: string, correo: string) {
  const hash=await identidadHash(alias,correo);
  const users=index();
  if(users.some(u=>u.hash===hash)) throw new Error('Ya existe una cuenta con ese alias y correo.');
  const id=crypto.randomUUID();
  const crypt=await cipher(JSON.stringify(datosVacios()),alias);
  users.push({id,hash,...crypt}); persist(users);
  sessionStorage.setItem(KEY_SESSION,JSON.stringify({id,alias}));
  return {id,alias};
}
export async function accederUsuario(alias: string, correo: string) {
  const h=await identidadHash(alias,correo);
  const user=index().find(u=>u.hash===h);
  if(!user) throw new Error('No encontramos esa combinación. Puedes crear un usuario nuevo.');
  await decipher(user,alias);
  sessionStorage.setItem(KEY_SESSION,JSON.stringify({id:user.id,alias}));
  return {id:user.id,alias};
}
export function sesionActual(): {id:string;alias:string}|null {
  try { return JSON.parse(sessionStorage.getItem(KEY_SESSION)||'null'); } catch { return null; }
}
export function cerrarSesion() { sessionStorage.removeItem(KEY_SESSION); }
export async function cargarDatos(id: string, alias: string): Promise<DatosUsuario> {
  const user=index().find(u=>u.id===id);
  if(!user) throw new Error('No se encontró el espacio local de este usuario.');
  return {...datosVacios(),...await decipher(user,alias)};
}
export async function guardarDatos(id: string, alias: string, data: DatosUsuario) {
  const previous=saveQueues.get(id)||Promise.resolve();
  const current=previous.catch(()=>{}).then(async()=>{
    const users=index(), i=users.findIndex(u=>u.id===id);
    if(i<0) throw new Error('No se encontró el espacio local de este usuario.');
    const crypt=await cipher(JSON.stringify(data),alias,fromB64(users[i].salt));
    users[i]={...users[i],...crypt}; persist(users);
  });
  saveQueues.set(id,current);
  try{await current;}finally{if(saveQueues.get(id)===current)saveQueues.delete(id);}
}
export async function borrarUsuarioActual(id:string) {
  persist(index().filter(u=>u.id!==id)); cerrarSesion();
}
export async function cifrarCopia(data: DatosUsuario, alias: string) {
  const crypt=await cipher(JSON.stringify(data),alias);
  return {format:'economia-familiar',version:1,encrypted:true,...crypt};
}
export async function descifrarCopia(raw: unknown, alias: string): Promise<DatosUsuario> {
  const v=raw as {format?:string; version?:number; encrypted?:boolean; salt?:string; iv?:string; contenido?:string; data?:DatosUsuario};
  if(v?.format!=='economia-familiar'||v.version!==1) throw new Error('El archivo no es una copia compatible.');
  let result: unknown;
  if(v.encrypted) {
    if(!v.salt||!v.iv||!v.contenido) throw new Error('La copia cifrada está incompleta.');
    const user:UsuarioIndexado={id:'backup',hash:'',salt:v.salt,iv:v.iv,contenido:v.contenido};
    try{result=await decipher(user,alias);}catch{throw new Error('No se pudo descifrar la copia. Revisa el alias y la integridad del archivo.');}
  } else result=v.data;
  validarDatos(result);
  return result as DatosUsuario;
}
export function copiaClara(data: DatosUsuario) { return {format:'economia-familiar',version:1,encrypted:false,data}; }
export function validarDatos(x: unknown): asserts x is DatosUsuario {
  if(!x||typeof x!=='object') throw new Error('La copia no contiene datos válidos.');
  const d=x as DatosUsuario;
  if(!Array.isArray(d.movimientos)||!Array.isArray(d.categorias)||!Array.isArray(d.ambitos)||!Array.isArray(d.reglas)||!Array.isArray(d.versiones)) throw new Error('La estructura de la copia está incompleta.');
  const validDate=(date:unknown)=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(new Date(`${date}T12:00:00`).getTime())&&new Date(`${date}T12:00:00`).toISOString().slice(0,10)===date;
  const unique=(items:{id:string}[])=>new Set(items.map(item=>item?.id)).size===items.length;
  if(!unique(d.categorias)||!unique(d.ambitos)||!unique(d.movimientos)||!unique(d.reglas)||!unique(d.versiones))throw new Error('La copia contiene identificadores duplicados.');
  const categories=new Set(d.categorias.map(c=>c?.id)),scopes=new Set(d.ambitos.map(a=>a?.id));
  if(d.categorias.some(c=>!c||typeof c.id!=='string'||!c.id||typeof c.nombre!=='string'||!c.nombre.trim()||!['gasto','ingreso','ambos'].includes(c.tipo)||typeof c.icono!=='string'||typeof c.color!=='string')) throw new Error('Hay categorías inválidas en la copia.');
  if(d.ambitos.some(a=>!a||typeof a.id!=='string'||!a.id||typeof a.nombre!=='string'||!a.nombre.trim()||typeof a.archivado!=='boolean')) throw new Error('Hay ámbitos inválidos en la copia.');
  if(d.movimientos.some(m=>!m||typeof m.id!=='string'||!m.id||!['ingreso','gasto'].includes(m.tipo)||!Number.isFinite(m.importe)||m.importe<=0||Math.abs(m.importe*100-Math.round(m.importe*100))>1e-8||!validDate(m.fecha)||!['manual','recurrente'].includes(m.origen)||(m.tipo==='gasto'&&!m.categoriaId)||Boolean(m.categoriaId&&!categories.has(m.categoriaId))||Boolean(m.ambitoId&&!scopes.has(m.ambitoId)))) throw new Error('Hay movimientos inválidos en la copia.');
  if(d.reglas.some(r=>!r||typeof r.id!=='string'||!r.id||!['ingreso','gasto'].includes(r.tipo)||!Number.isFinite(r.importe)||r.importe<=0||Math.abs(r.importe*100-Math.round(r.importe*100))>1e-8||!['diaria','semanal','mensual','anual'].includes(r.frecuencia)||!validDate(r.fechaInicio)||(r.fechaFin&&!validDate(r.fechaFin))||(r.fechaFin&&r.fechaFin<r.fechaInicio)||(r.tipo==='gasto'&&!r.categoriaId)||Boolean(r.categoriaId&&!categories.has(r.categoriaId))||typeof r.activa!=='boolean'||(r.diaEjecucion!==undefined&&(!Number.isInteger(r.diaEjecucion)||r.diaEjecucion<0||r.diaEjecucion>31)))) throw new Error('Hay reglas recurrentes inválidas en la copia.');
  if(d.versiones.some(v=>!v||typeof v.id!=='string'||!v.id||!validDate(String(v.fecha).slice(0,10))||typeof v.payload!=='string'||!Number.isFinite(v.size))) throw new Error('Hay versiones locales inválidas en la copia.');
}
