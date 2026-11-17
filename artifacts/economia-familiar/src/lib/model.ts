export type Tipo = 'ingreso' | 'gasto';
export type CategoriaTipo = 'gasto' | 'ingreso' | 'ambos';
export interface Movimiento {
  id: string; tipo: Tipo; importe: number; fecha: string; categoriaId?: string; nota?: string;
  origen: 'manual' | 'recurrente'; reglaId?: string; ambitoId?: string; createdAt: string; updatedAt: string;
}
export interface Categoria { id: string; nombre: string; icono: string; color: string; tipo: CategoriaTipo }
export interface Ambito { id: string; nombre: string; archivado: boolean }
export interface Regla {
  id: string; tipo: Tipo; importe: number; categoriaId?: string;
  frecuencia: 'diaria' | 'semanal' | 'mensual' | 'anual'; fechaInicio: string; fechaFin?: string;
  diaEjecucion?: number; nota?: string; activa: boolean;
}
export interface VersionLocal { id: string; fecha: string; size: number; payload: string }
export interface DatosUsuario { movimientos: Movimiento[]; categorias: Categoria[]; ambitos: Ambito[]; reglas: Regla[]; versiones: VersionLocal[] }
export const CATEGORIAS_INICIALES: Categoria[] = [
  {id:'cat-alimentacion',nombre:'Alimentación',icono:'◉',color:'#d59168',tipo:'gasto'},
  {id:'cat-hogar',nombre:'Hogar',icono:'⌂',color:'#76917c',tipo:'gasto'},
  {id:'cat-suministros',nombre:'Suministros',icono:'ϟ',color:'#d6a94a',tipo:'gasto'},
  {id:'cat-transporte',nombre:'Transporte',icono:'↗',color:'#6791a0',tipo:'gasto'},
  {id:'cat-vehiculo',nombre:'Vehículo',icono:'○',color:'#879386',tipo:'gasto'},
  {id:'cat-salud',nombre:'Salud',icono:'+',color:'#c77c77',tipo:'gasto'},
  {id:'cat-ocio',nombre:'Ocio',icono:'✳',color:'#a483a0',tipo:'gasto'},
  {id:'cat-educacion',nombre:'Educación',icono:'⌑',color:'#7e8eac',tipo:'gasto'},
  {id:'cat-seguros',nombre:'Seguros',icono:'◇',color:'#b2935a',tipo:'gasto'},
  {id:'cat-salario',nombre:'Salario',icono:'＋',color:'#50846d',tipo:'ingreso'},
  {id:'cat-intereses',nombre:'Intereses o depósitos',icono:'↗',color:'#689987',tipo:'ingreso'},
  {id:'cat-inversiones',nombre:'Inversiones',icono:'⌁',color:'#7e9b86',tipo:'ingreso'},
  {id:'cat-reembolsos',nombre:'Reembolsos',icono:'↩',color:'#b38d62',tipo:'ingreso'},
  {id:'cat-otros-ingreso',nombre:'Otros',icono:'＋',color:'#82958a',tipo:'ingreso'},
];
export const datosVacios = (): DatosUsuario => ({ movimientos:[], categorias:CATEGORIAS_INICIALES.map(c=>({...c})), ambitos:[], reglas:[], versiones:[] });
export const nuevoId = () => crypto.randomUUID();
export const hoyISO = () => {
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
export const formatEUR = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(n);
export const formatoFecha = (s: string) => new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${s}T12:00:00`));
