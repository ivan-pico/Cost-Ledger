import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Route, Switch, Link, useLocation, Router as WouterRouter } from 'wouter';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BarChart3, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Download, FileArchive, FileSpreadsheet, FileText, Filter, FolderOpen, LogOut, Pencil, Plus, RotateCcw, Settings2, ShieldCheck, Trash2, Upload, Wallet, X } from 'lucide-react';
import {
  accederUsuario, borrarUsuarioActual, cargarDatos, cerrarSesion, crearUsuario, guardarDatos, sesionActual,
  copiaClara, cifrarCopia, descifrarCopia, validarDatos
} from './lib/local-data';
import { crearZip, crearXlsx, descargar, filasCSV, leerZip } from './lib/files';
import { datosVacios, formatEUR, formatoFecha, hoyISO, nuevoId, type Ambito, type Categoria, type DatosUsuario, type Movimiento, type Regla, type Tipo, type VersionLocal } from './lib/model';

type User = {id:string;alias:string};
type Notice = {text:string;kind?:'success'|'error'};
const MONTHS=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const today=new Date();
const dateKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const firstMonth=()=>dateKey(new Date(today.getFullYear(),today.getMonth(),1));
const lastMonth=()=>dateKey(new Date(today.getFullYear(),today.getMonth()+1,0));
const moneyInput=(s:string)=>Number(s.replace(',','.'));
const safeAmount=(s:string)=>/^\d+([,.]\d{1,2})?$/.test(s.trim())&&moneyInput(s)>0;
const saveBlob=(blob:Blob,name:string)=>descargar(blob,name);
const dateLong=(s:string)=>new Intl.DateTimeFormat('es-ES',{weekday:'long',day:'numeric',month:'long'}).format(new Date(`${s}T12:00:00`));

function useLocalData(user:User|null){
  const [data,setData]=useState<DatosUsuario>(datosVacios());
  const [loading,setLoading]=useState(false);
  const [saveError,setSaveError]=useState<string|null>(null);
  const [readyFor,setReadyFor]=useState<string|null>(null);
  const [loadError,setLoadError]=useState<string|null>(null),[loadAttempt,setLoadAttempt]=useState(0);
  const ref=useRef(data); ref.current=data;
  useEffect(()=>{let active=true;setSaveError(null);if(!user){setReadyFor(null);setLoadError(null);ref.current=datosVacios();setData(ref.current);setLoading(false);return;}setReadyFor(null);setLoadError(null);setLoading(true);cargarDatos(user.id,user.alias).then(d=>{if(active){ref.current=d;setData(d);setReadyFor(user.id);}}).catch(e=>{if(active)setLoadError(e instanceof Error?e.message:'No se pudieron leer tus datos cifrados.');}).finally(()=>active&&setLoading(false));return()=>{active=false;}},[user?.id,loadAttempt]);
  const update=(fn:(old:DatosUsuario)=>DatosUsuario)=>{
    const next=fn(ref.current);ref.current=next;setData(next);
    if(user) void guardarDatos(user.id,user.alias,next).then(()=>setSaveError(null)).catch(e=>setSaveError(e instanceof Error?e.message:'No se pudieron guardar los cambios.'));
  };
  const retrySave=()=>{if(user)void guardarDatos(user.id,user.alias,ref.current).then(()=>setSaveError(null)).catch(e=>setSaveError(e instanceof Error?e.message:'No se pudieron guardar los cambios.'));};
  return {data,loading,readyFor,loadError,saveError,retry:()=>setLoadAttempt(n=>n+1),retrySave,update,replace:(d:DatosUsuario)=>{ref.current=d;setData(d);if(user)void guardarDatos(user.id,user.alias,d).then(()=>setSaveError(null)).catch(e=>setSaveError(e instanceof Error?e.message:'No se pudieron guardar los cambios.'));}};
}
function generarPendientes(data:DatosUsuario):DatosUsuario{
  const out={...data,movimientos:[...data.movimientos]};const now=hoyISO();
  for(const rule of data.reglas.filter(r=>r.activa)){
    const start=new Date(`${rule.fechaInicio}T12:00:00`),end=new Date(`${rule.fechaFin||now}T12:00:00`),todayDate=new Date(`${now}T12:00:00`);
    const limit=end<todayDate?end:todayDate;if(start>limit)continue;
    let first=new Date(start);
    if(rule.frecuencia==='semanal'&&rule.diaEjecucion!==undefined){const weekDay=rule.diaEjecucion%7;first.setDate(first.getDate()+(weekDay-first.getDay()+7)%7);}
    const monthDay=rule.diaEjecucion||start.getDate();
    const yearMonth=rule.diaEjecucion?start.getMonth():start.getMonth();
    for(let count=0;count<5000;count++){
      const occurrence=new Date(first);
      if(rule.frecuencia==='diaria')occurrence.setDate(first.getDate()+count);
      if(rule.frecuencia==='semanal')occurrence.setDate(first.getDate()+count*7);
      if(rule.frecuencia==='mensual'){
        const monthIndex=start.getMonth()+count;const year=start.getFullYear()+Math.floor(monthIndex/12);const month=monthIndex%12;
        occurrence.setFullYear(year,month,Math.min(monthDay,new Date(year,month+1,0).getDate()));
      }
      if(rule.frecuencia==='anual'){
        const year=start.getFullYear()+count;occurrence.setFullYear(year,yearMonth,Math.min(monthDay,new Date(year,yearMonth+1,0).getDate()));
      }
      if(occurrence>limit)break;
      const day=dateKey(occurrence);
      if(occurrence<=limit&&occurrence>=start&&!out.movimientos.some(m=>m.reglaId===rule.id&&m.fecha===day)){
        const nowIso=new Date().toISOString();
        out.movimientos.push({id:`${rule.id}-${day}`,tipo:rule.tipo,importe:rule.importe,fecha:day,categoriaId:rule.categoriaId,nota:rule.nota,origen:'recurrente',reglaId:rule.id,createdAt:nowIso,updatedAt:nowIso});
      }
    }
  }
  return out;
}

function App(){
  const [user,setUser]=useState<User|null>(()=>sesionActual());
  const [loc,setLoc]=useLocation();
  const {data,loading,readyFor,loadError,saveError,retry,retrySave,update,replace}=useLocalData(user);
  const [notice,setNotice]=useState<Notice|null>(null);
  const [deleted,setDeleted]=useState<Movimiento|null>(null);
  const deleteTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const show=(text:string,kind:'success'|'error'='success')=>{setNotice({text,kind});window.setTimeout(()=>setNotice(null),3600);};
  useEffect(()=>{if(user&&loc==='/')setLoc('/registro');else if(!user&&loc!=='/')setLoc('/');},[user?.id,loc]);
  useEffect(()=>{if(deleted&&loc!='/dashboard'){if(deleteTimer.current)clearTimeout(deleteTimer.current);update(d=>({...d,movimientos:d.movimientos.filter(m=>m.id!==deleted.id)}));setDeleted(null);}},[loc]);
  useEffect(()=>{if(user&&readyFor===user.id){const d=generarPendientes(data);if(d.movimientos.length!==data.movimientos.length)replace(d);}},[user?.id,readyFor,data]);
  useEffect(()=>{if(!user||readyFor!==user.id)return;const timer=window.setInterval(()=>{const next=generarPendientes(data);if(next.movimientos.length!==data.movimientos.length)replace(next);},60_000);return()=>window.clearInterval(timer);},[user?.id,readyFor,data]);
  const login=async(alias:string,email:string,create:boolean)=>{
    if(!alias.trim()||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){show('Revisa el alias y escribe un correo válido.','error');return;}
    try{const u=create?await crearUsuario(alias,email):await accederUsuario(alias,email);setUser(u);setLoc('/registro');show(create?'Tu espacio local está listo.':'Bienvenida de nuevo.');}
    catch(e){show(e instanceof Error?e.message:'No se pudo abrir el espacio local.','error');}
  };
  const commitDelete=(id=deleted?.id)=>{if(!id)return;update(d=>({...d,movimientos:d.movimientos.filter(m=>m.id!==id)}));setDeleted(current=>current?.id===id?null:current);};
  const removeMovement=(m:Movimiento)=>{if(deleteTimer.current)clearTimeout(deleteTimer.current);if(deleted)commitDelete(deleted.id);setDeleted(m);update(d=>({...d,movimientos:d.movimientos.filter(x=>x.id!==m.id)}));deleteTimer.current=setTimeout(()=>commitDelete(m.id),10000);};
  const undoDelete=()=>{if(deleteTimer.current)clearTimeout(deleteTimer.current);if(deleted)update(d=>d.movimientos.some(m=>m.id===deleted.id)?d:{...d,movimientos:[deleted,...d.movimientos]});setDeleted(null);};
  const logout=()=>{if(deleted)commitDelete();cerrarSesion();setUser(null);setLoc('/');};
  const path=loc.split('?')[0];
  return <div className="app-shell">
    {user&&path!=='/'&&<Navigation path={path} alias={user.alias} logout={logout}/>}
    {user&&saveError&&<div role="alert" data-testid="status-save-error" style={{position:'sticky',top:68,zIndex:19,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'10px 16px',background:'#f7e6df',color:'#813d31',fontSize:12,borderBottom:'1px solid #e8c8bd'}}><span>No se pudieron guardar tus cambios: {saveError}</span><button className="button button-danger" onClick={retrySave} data-testid="button-retry-save" style={{minHeight:34,padding:'0 10px'}}>Reintentar guardado</button></div>}
    <main className={user?'content-wrap':'page-enter'} style={user?{maxWidth:1160,margin:'0 auto',padding:'36px 26px 50px'}:{}}>
      {loading&&user?<div className="surface" style={{padding:28,margin:'20px auto',maxWidth:600}}><div className="eyebrow">Abriendo tu espacio protegido</div><div className="bar" style={{marginTop:18}}><span style={{width:'45%',background:'hsl(var(--primary))'}}/></div></div>:loadError&&user?<div className="surface" style={{padding:27,maxWidth:590,margin:'35px auto'}}><div className="eyebrow">NO HEMOS PODIDO DESCIFRAR TUS DATOS</div><h1 className="display" style={{fontSize:30}}>Tu espacio sigue intacto.</h1><p style={{fontSize:13,lineHeight:1.6,color:'#70796f'}}>{loadError} No guardaremos cambios hasta que puedas abrir tus datos.</p><div style={{display:'flex',gap:9,flexWrap:'wrap'}}><button className="button button-primary" onClick={retry} data-testid="button-retry-load">Intentar de nuevo</button><button className="button button-quiet" onClick={logout} data-testid="button-exit-error">Salir del espacio</button></div></div>:<Switch>
        <Route path="/"><Welcome onLogin={login}/></Route>
        <Route path="/registro"><QuickEntry data={data} update={update} show={show}/></Route>
        <Route path="/dashboard"><Dashboard data={data} update={update} show={show} remove={removeMovement} deleted={deleted} undo={undoDelete}/></Route>
        <Route path="/configuracion"><Settings data={data} update={update} replace={replace} user={user} show={show} onDeleted={()=>{setUser(null);setLoc('/');}}/></Route>
        <Route><NotFound/></Route>
      </Switch>}
    </main>
    <AuthorFooter withNav={!!user&&path!=='/'}/>
    {deleted&&path==='/dashboard'&&<div className="toast" role="status" style={{position:'fixed',zIndex:30,bottom:82,left:'50%',transform:'translateX(-50%)',background:'#263f35',color:'#fff',padding:'13px 16px',borderRadius:14,display:'flex',alignItems:'center',gap:14,boxShadow:'0 10px 40px #16332935'}}><span>Movimiento eliminado</span><button className="button" style={{minHeight:36,padding:'0 12px',background:'#e9c7a9',color:'#273d34'}} onClick={undoDelete} data-testid="button-undo-delete">Deshacer</button></div>}
    {notice&&<div className="toast" role="status" data-testid="status-notice" style={{position:'fixed',zIndex:80,right:18,bottom:90,maxWidth:'calc(100vw - 36px)',background:notice.kind==='error'?'#8a3329':'#284d3e',color:'white',padding:'14px 18px',borderRadius:14,boxShadow:'0 12px 34px #18352c33'}}>{notice.text}</div>}
  </div>;
}

function AuthorFooter({withNav}:{withNav:boolean}){
  return <footer className={`author-footer${withNav?' author-footer-nav':''}`} data-testid="footer-author" style={{maxWidth:1160,margin:'0 auto',padding:'14px 25px 22px',display:'flex',justifyContent:'center',alignItems:'center',gap:'6px 14px',flexWrap:'wrap',fontSize:12,color:'#7e847b'}}>
    <span>Hecho por <a href="https://ivanpico.com" target="_blank" rel="me noopener" data-testid="link-author">Ivan Picó</a></span>
    <span aria-hidden="true" style={{color:'#c9c3b3'}}>·</span>
    <a href="https://www.linkedin.com/in/ivanpico" target="_blank" rel="me noopener" data-testid="link-linkedin">LinkedIn</a>
    <span aria-hidden="true" style={{color:'#c9c3b3'}}>·</span>
    <a href="https://gohan.cat/" target="_blank" rel="noopener" data-testid="link-gohan">Más proyectos en gohan.cat</a>
  </footer>;
}

function Navigation({path,alias,logout}:{path:string;alias:string;logout:()=>void}){
  const links=[{to:'/registro',label:'Anotar',icon:Plus},{to:'/dashboard',label:'Movimientos',icon:BarChart3},{to:'/configuracion',label:'Ajustes',icon:Settings2}];
  return <>
    <header style={{height:68,borderBottom:'1px solid hsl(var(--border))',background:'#f8f5ee',display:'flex',alignItems:'center',position:'sticky',top:0,zIndex:20}}>
      <div style={{width:'100%',maxWidth:1160,padding:'0 26px',margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <Link href="/registro" data-testid="link-brand" style={{display:'flex',alignItems:'center',gap:11}}>
          <span style={{width:34,height:34,borderRadius:12,background:'#285b49',color:'#f4ecda',display:'grid',placeItems:'center'}}><Wallet size={18}/></span>
          <span className="display" style={{fontWeight:800,fontSize:18}}>Casa en orden</span>
        </Link>
        <nav className="desktop-nav" aria-label="Navegación principal" style={{gap:5}}>
          {links.map(l=><Link key={l.to} href={l.to} data-testid={`nav-${l.to.slice(1)}`} className={path===l.to?'nav-active':''} style={{display:'inline-flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:12,fontSize:13,fontWeight:700,color:'#68736b'}}><l.icon size={17}/>{l.label}</Link>)}
        </nav>
        <div className="desktop-nav" style={{alignItems:'center',gap:12}}>
          <span style={{fontSize:12,color:'#68736b'}} data-testid="text-user-alias">{alias}</span>
          <button aria-label="Cerrar sesión" title="Cerrar sesión" onClick={logout} data-testid="button-logout" className="button button-quiet" style={{minHeight:38,padding:'0 10px'}}><LogOut size={16}/></button>
        </div>
      </div>
    </header>
    <nav className="mobile-nav" aria-label="Navegación principal móvil" style={{position:'fixed',zIndex:25,bottom:0,left:0,right:0,justifyContent:'space-around',padding:'9px 10px max(12px, env(safe-area-inset-bottom))',background:'#f8f5eef2',borderTop:'1px solid hsl(var(--border))',backdropFilter:'blur(14px)'}}>
      {links.map(l=><Link key={l.to} href={l.to} data-testid={`mobile-nav-${l.to.slice(1)}`} className={path===l.to?'nav-active':''} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,padding:'8px 16px',borderRadius:12,fontSize:10,fontWeight:700,color:'#69756d'}}><l.icon size={19}/>{l.label}</Link>)}
      <button onClick={logout} aria-label="Cerrar sesión" data-testid="button-logout-mobile" style={{border:0,background:'transparent',display:'flex',flexDirection:'column',alignItems:'center',gap:3,padding:'8px 14px',color:'#69756d',fontSize:10}}><LogOut size={19}/>Salir</button>
    </nav>
  </>;
}

function Welcome({onLogin}:{onLogin:(alias:string,email:string,create:boolean)=>void}){
  const [mode,setMode]=useState<'inicio'|'crear'|'acceder'>('inicio'),[alias,setAlias]=useState(''),[email,setEmail]=useState('');
  const submit=(e:FormEvent)=>{e.preventDefault();onLogin(alias,email,mode==='crear');};
  return <div style={{maxWidth:1160,margin:'0 auto',padding:'24px 25px 20px'}}>
    <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',height:60}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}><span style={{width:34,height:34,display:'grid',placeItems:'center',borderRadius:12,background:'#285b49',color:'#f4ecda'}}><Wallet size={18}/></span><span className="display" style={{fontWeight:800,fontSize:18}}>Casa en orden</span></div>
      <span className="eyebrow" style={{letterSpacing:'.11em'}}>Tu economía, en casa</span>
    </header>
    <section style={{display:'grid',gridTemplateColumns:'minmax(0,1.2fr) minmax(300px,.8fr)',gap:36,alignItems:'center',padding:'56px 0 62px'}}>
      <div className="reveal">
        <div className="eyebrow" style={{display:'flex',alignItems:'center',gap:9}}><span style={{height:1,width:27,background:'#d18863'}}/>FINANZAS COTIDIANAS, SIN COMPLICACIONES</div>
        <h1 className="display" style={{fontSize:'clamp(48px,7.3vw,88px)',lineHeight:.99,maxWidth:700,margin:'22px 0 20px',fontWeight:700}}>Cada euro,<br/><span style={{color:'#bd7456'}}>en su sitio.</span></h1>
        <p style={{fontSize:17,lineHeight:1.7,maxWidth:525,color:'#69756d',margin:'0 0 28px'}}>Anota lo de hoy en segundos. Mira con calma cómo se mueve el dinero de tu hogar. Todo se queda en este dispositivo.</p>
        {mode==='inicio'?<div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <button className="button button-primary" onClick={()=>setMode('crear')} data-testid="button-create-user">Crear mi espacio <ArrowRight size={17}/></button>
          <button className="button button-quiet" onClick={()=>setMode('acceder')} data-testid="button-access-user">Ya tengo un espacio</button>
        </div>:<form onSubmit={submit} className="surface" style={{maxWidth:460,padding:20,boxShadow:'0 18px 50px #315c4312'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}><div><div className="eyebrow">{mode==='crear'?'EMPEZAR':'VOLVER A ENTRAR'}</div><strong style={{fontSize:19}}>{mode==='crear'?'Crea tu espacio':'Accede a tus datos'}</strong></div><button type="button" aria-label="Volver" onClick={()=>setMode('inicio')} className="button button-quiet" style={{minHeight:38,padding:'0 10px'}}><X size={17}/></button></div>
          <label className="field-label" htmlFor="alias">Alias</label><input id="alias" autoComplete="nickname" className="field" value={alias} onChange={e=>setAlias(e.target.value)} placeholder="Cómo te llamamos" data-testid="input-alias"/>
          <label className="field-label" htmlFor="email" style={{marginTop:14}}>Correo electrónico</label><input id="email" type="email" autoComplete="email" className="field" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@correo.es" data-testid="input-email"/>
          <p style={{fontSize:12,lineHeight:1.5,color:'#737c73',margin:'12px 0 15px'}}>No hay contraseña. El alias ayuda a cifrar tus datos; no es un secreto ni una protección fuerte si alguien tiene acceso al dispositivo.</p>
          <button className="button button-primary" type="submit" style={{width:'100%'}} data-testid="button-submit-identity">{mode==='crear'?'Crear espacio local':'Acceder'} <ArrowRight size={16}/></button>
        </form>}
        <div style={{display:'flex',gap:22,marginTop:33,flexWrap:'wrap'}}>{[['01','Anota en un instante'],['02','Entiende tus hábitos'],['03','Guarda una copia local']].map(x=><div key={x[0]} style={{display:'flex',gap:9,alignItems:'center'}}><span className="mono" style={{fontSize:11,color:'#c17c5b'}}>{x[0]}</span><span style={{fontSize:12,color:'#5f6f65'}}>{x[1]}</span></div>)}</div>
      </div>
      <div className="reveal" style={{position:'relative',minHeight:420,display:'grid',placeItems:'center'}}>
        <div style={{position:'absolute',width:'82%',aspectRatio:'1',borderRadius:'50%',background:'#e9e5d7',right:'2%',top:'4%'}}/>
        <div style={{position:'relative',width:'min(100%,380px)',padding:24,background:'#2b5a49',color:'#f8f3e7',borderRadius:'28px',boxShadow:'0 24px 80px #244e3c32',transform:'rotate(-2deg)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span className="eyebrow" style={{color:'#c9d9cf'}}>RESUMEN DE CASA</span><span style={{width:8,height:8,borderRadius:'50%',background:'#e5ae7f'}}/></div>
          <div style={{fontSize:13,color:'#d2ddd3',marginTop:29}}>Un registro sencillo cambia la perspectiva.</div>
          <div className="display" style={{fontSize:43,marginTop:4,fontWeight:700,letterSpacing:'-.05em'}}>A tu ritmo.</div>
          <div style={{height:1,background:'#ffffff25',margin:'25px 0 19px'}}/>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#d5e1d6'}}><span>Privado en tu dispositivo</span><ShieldCheck size={17}/></div>
          <div style={{display:'flex',gap:8,marginTop:20}}>{['Anotar','Revisar','Respirar'].map((v,i)=><span key={v} style={{flex:1,textAlign:'center',padding:'10px 4px',borderRadius:11,background:i===0?'#e9c7a2':'#ffffff14',color:i===0?'#2a5042':'#f8f3e7',fontSize:11,fontWeight:700}}>{v}</span>)}</div>
        </div>
        <div style={{position:'absolute',bottom:25,left:0,background:'#fffaf0',padding:'14px 18px',border:'1px solid #ded8c8',borderRadius:17,boxShadow:'0 12px 30px #253d3117',transform:'rotate(3deg)'}}><span className="eyebrow">HOY</span><div style={{fontSize:14,fontWeight:700,marginTop:4}}>Un paso pequeño, claro.</div></div>
      </div>
    </section>
    <section style={{borderTop:'1px solid hsl(var(--border))',padding:'32px 0',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:22}}>
      {[{n:'01',t:'Apunta sin fricción',d:'Importe, categoría y fecha. Los detalles extra esperan a que los necesites.'},{n:'02',t:'Mira el panorama',d:'Ingresos, gastos y categorías en un vistazo que sí se entiende.'},{n:'03',t:'Tú conservas el control',d:'Cifrado local, copias exportables y ninguna cuenta en la nube.'}].map(item=><div key={item.n} style={{borderLeft:'2px solid #d08a69',paddingLeft:16}}><span className="mono" style={{fontSize:11,color:'#c27a59'}}>{item.n}</span><h2 className="display" style={{fontSize:20,margin:'5px 0'}}>{item.t}</h2><p style={{fontSize:13,lineHeight:1.55,color:'#737c73',margin:0}}>{item.d}</p></div>)}
    </section>
    <div style={{borderTop:'1px solid hsl(var(--border))',paddingTop:15,display:'flex',justifyContent:'space-between',gap:14,flexWrap:'wrap',fontSize:11,color:'#7e847b'}}><span>Los datos permanecen en el navegador de este dispositivo.</span><span>Sin contraseña · Sin sincronización · Sin anuncios</span></div>
    <style>{'@media(max-width:760px){section:first-of-type{grid-template-columns:1fr!important;padding-top:33px!important;gap:14px!important} section:last-of-type{grid-template-columns:1fr!important} section:first-of-type > div:last-child{min-height:300px!important}.eyebrow{font-size:10px}}'}</style>
  </div>;
}

function QuickEntry({data,update,show}:{data:DatosUsuario;update:(fn:(d:DatosUsuario)=>DatosUsuario)=>void;show:(s:string,k?:'success'|'error')=>void}){
  const [amount,setAmount]=useState(''),[category,setCategory]=useState(''),[date,setDate]=useState(hoyISO()),[note,setNote]=useState(''),[scope,setScope]=useState(''),[scopeOpen,setScopeOpen]=useState(false);
  const [calendar,setCalendar]=useState(false);
  const expenses=data.categorias.filter(c=>c.tipo!=='ingreso');
  const popular=useMemo(()=>{const counts=new Map<string,number>();data.movimientos.filter(m=>m.tipo==='gasto'&&m.categoriaId).forEach(m=>counts.set(m.categoriaId!,(counts.get(m.categoriaId!)||0)+1));return [...expenses].sort((a,b)=>(counts.get(b.id)||0)-(counts.get(a.id)||0)).slice(0,8);},[data.movimientos,data.categorias]);
  useEffect(()=>{if(!category&&expenses[0])setCategory(expenses[0].id);},[data.categorias.length]);
  const shift=(n:number)=>{const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+n);setDate(dateKey(d));};
  const submit=(e:FormEvent)=>{e.preventDefault();if(!safeAmount(amount)){show('Escribe un importe mayor que cero, con hasta dos decimales.','error');return;}if(!category){show('Elige una categoría para este gasto.','error');return;}
    const stamp=new Date().toISOString();const m:Movimiento={id:nuevoId(),tipo:'gasto',importe:moneyInput(amount),fecha:date,categoriaId:category,nota:note.trim()||undefined,origen:'manual',ambitoId:scope||undefined,createdAt:stamp,updatedAt:stamp};
    update(d=>({...d,movimientos:[m,...d.movimientos]}));setAmount('');setNote('');setDate(hoyISO());show('Gasto anotado. Ya está en tus movimientos.');
  };
  return <div className="page-enter" style={{maxWidth:850,margin:'0 auto'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:15,marginBottom:23}}>
      <div><div className="eyebrow">REGISTRO RÁPIDO · GASTO</div><h1 className="display" style={{fontSize:'clamp(30px,5vw,43px)',margin:'5px 0 0'}}>Anota lo de hoy.</h1></div>
      <Link href="/dashboard" className="button button-quiet" data-testid="link-open-dashboard"><BarChart3 size={17}/> Ver análisis</Link>
    </div>
    <form onSubmit={submit} className="surface" style={{padding:'clamp(18px,4vw,32px)',boxShadow:'0 20px 60px #314b3910'}}>
      <div className="eyebrow">¿CUÁNTO HAS GASTADO?</div>
      <div style={{display:'flex',alignItems:'center',borderBottom:'1px solid hsl(var(--border))',margin:'10px 0 20px'}}>
        <span style={{fontFamily:'var(--app-font-mono)',fontSize:35,color:'#8a968c',paddingRight:8}}>€</span>
        <input autoFocus inputMode="decimal" type="text" pattern="[0-9]*[,.]?[0-9]*" value={amount} onChange={e=>setAmount(e.target.value)} aria-label="Importe en euros" placeholder="0,00" data-testid="input-amount" style={{fontFamily:'var(--app-font-mono)',fontSize:'clamp(43px,11vw,68px)',letterSpacing:'-.06em',fontWeight:700,color:'#284f40',border:0,outline:0,background:'transparent',width:'100%',minWidth:0,padding:'0 0 8px'}}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(68px,1fr))',gap:10,maxWidth:340,marginBottom:26}}>
        {['7','8','9','4','5','6','1','2','3','⌫','0',','].map(k=><button type="button" key={k} onClick={()=>k==='⌫'?setAmount(a=>a.slice(0,-1)):k===','?setAmount(a=>a.includes(',')||a.includes('.')?a:a+','):setAmount(a=>a.length<10?a+k:a)} data-testid={`keypad-${k==='⌫'?'delete':k===','?'decimal':k}`} aria-label={k==='⌫'?'Borrar último dígito':`Añadir ${k}`} style={{height:43,border:'1px solid #e7e2d7',borderRadius:10,background:'#fcfaf5',fontFamily:'var(--app-font-mono)',fontSize:17,color:'#3d5f4f'}}>{k}</button>)}
      </div>
      <div className="eyebrow" style={{marginBottom:11}}>ELIGE UNA CATEGORÍA</div>
      <div style={{display:'flex',gap:9,flexWrap:'wrap',marginBottom:23}}>{popular.length?popular.map(c=><button type="button" className={`chip ${category===c.id?'chip-active':''}`} key={c.id} onClick={()=>setCategory(c.id)} data-testid={`category-choice-${c.id}`}><span style={{color:c.color,fontSize:17,fontWeight:700}}>{c.icono}</span>{c.nombre}</button>):<p style={{color:'#7d857c',fontSize:13}}>Añade una categoría en configuración para empezar.</p>}</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,alignItems:'start'}}>
        <div>
          <span className="field-label">Fecha</span>
          <div style={{display:'flex',alignItems:'center',gap:5}}>
            <button type="button" aria-label="Día anterior" onClick={()=>shift(-1)} data-testid="button-date-previous" className="button button-quiet" style={{minHeight:44,padding:'0 10px'}}><ChevronLeft size={18}/></button>
            <label style={{position:'relative',flex:1}}>
              <span style={{display:'flex',justifyContent:'center',alignItems:'center',gap:7,height:44,padding:'0 9px',border:'1px solid hsl(var(--border))',borderRadius:12,background:'#fffdf8',fontSize:13,fontWeight:700}}><CalendarDays size={16} color="#52735f"/>{dateLong(date)}</span>
              <input type="date" value={date} onChange={e=>setDate(e.target.value)} aria-label="Fecha del gasto" data-testid="input-date" style={{position:'absolute',inset:0,opacity:0,width:'100%',cursor:'pointer'}}/>
            </label>
            <button type="button" aria-label="Día siguiente" onClick={()=>shift(1)} data-testid="button-date-next" className="button button-quiet" style={{minHeight:44,padding:'0 10px'}}><ChevronRight size={18}/></button>
          </div>
          <button type="button" onClick={()=>setCalendar(v=>!v)} className="button" style={{minHeight:32,padding:'0 7px',fontSize:11,color:'#758178',marginTop:4}} data-testid="button-calendar-toggle">{calendar?'Ocultar calendario':'Elegir en calendario'} <ChevronDown size={14}/></button>
          {calendar&&<input type="date" className="field" value={date} onChange={e=>setDate(e.target.value)} data-testid="input-calendar-date"/>}
        </div>
        <div><label className="field-label" htmlFor="note">Nota <span style={{fontWeight:400}}>· opcional</span></label><input id="note" className="field" value={note} onChange={e=>setNote(e.target.value)} placeholder="¿En qué fue?" data-testid="input-note"/></div>
      </div>
      <div style={{marginTop:17}}>
        <button type="button" onClick={()=>setScopeOpen(v=>!v)} data-testid="button-scope-toggle" className="button button-quiet" style={{minHeight:38,padding:'0 12px',fontSize:12}}><FolderOpen size={16}/>{scope?data.ambitos.find(a=>a.id===scope)?.nombre:'Añadir ámbito'}<ChevronDown size={14} style={{transform:scopeOpen?'rotate(180deg)':'none'}}/></button>
        {scopeOpen&&<div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>{data.ambitos.filter(a=>!a.archivado).length?data.ambitos.filter(a=>!a.archivado).map(a=><button type="button" key={a.id} className={`chip ${scope===a.id?'chip-active':''}`} onClick={()=>setScope(scope===a.id?'':a.id)} data-testid={`scope-choice-${a.id}`}>{a.nombre}</button>):<span style={{fontSize:12,color:'#758178'}}>No hay ámbitos todavía. Puedes crearlos en Ajustes.</span>}</div>}
      </div>
      <button type="submit" className="button button-primary" style={{width:'100%',marginTop:24,minHeight:54,fontSize:15}} data-testid="button-save-expense"><Check size={18}/> Guardar gasto</button>
    </form>
    <p style={{textAlign:'center',fontSize:11,color:'#7a8379',marginTop:14}}>Tus datos se guardan cifrados en este dispositivo.</p>
  </div>;
}

type ModalProps={title:string;onClose:()=>void;children:ReactNode;subtitle?:string};
function Modal({title,onClose,children,subtitle}:ModalProps){
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>e.key==='Escape'&&onClose();window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[onClose]);
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div style={{display:'flex',justifyContent:'space-between',gap:15,alignItems:'flex-start',marginBottom:20}}><div><h2 className="display" style={{fontSize:26,margin:0}}>{title}</h2>{subtitle&&<p style={{fontSize:13,color:'#727c73',margin:'6px 0 0'}}>{subtitle}</p>}</div><button onClick={onClose} aria-label="Cerrar diálogo" data-testid="button-close-modal" className="button button-quiet" style={{minHeight:38,padding:'0 10px'}}><X size={17}/></button></div>{children}</section></div>;
}
type MovementFormProps={data:DatosUsuario;initial?:Movimiento;onSave:(m:Movimiento)=>void;onClose:()=>void};
function MovementForm({data,initial,onSave,onClose}:MovementFormProps){
  const [type,setType]=useState<Tipo>(initial?.tipo||'gasto'),[amount,setAmount]=useState(initial?String(initial.importe).replace('.',','):''),[date,setDate]=useState(initial?.fecha||hoyISO()),[category,setCategory]=useState(initial?.categoriaId||''),[note,setNote]=useState(initial?.nota||''),[scope,setScope]=useState(initial?.ambitoId||'');
  const cats=data.categorias.filter(c=>c.tipo==='ambos'||c.tipo===type);
  const submit=(e:FormEvent)=>{e.preventDefault();if(!safeAmount(amount)){alert('Escribe un importe mayor que cero y con hasta dos decimales.');return;}if(type==='gasto'&&!category){alert('Elige una categoría para el gasto.');return;}const stamp=new Date().toISOString();onSave({...initial,id:initial?.id||nuevoId(),tipo:type,importe:moneyInput(amount),fecha:date,categoriaId:category||undefined,nota:note.trim()||undefined,origen:initial?.origen||'manual',reglaId:initial?.reglaId,ambitoId:scope||undefined,createdAt:initial?.createdAt||stamp,updatedAt:stamp});};
  return <Modal title={initial?'Editar movimiento':'Nuevo movimiento'} onClose={onClose} subtitle="El cambio se guarda solo en este dispositivo.">
    <form onSubmit={submit}>
      <div style={{display:'flex',gap:8,marginBottom:16}}>{(['gasto','ingreso'] as Tipo[]).map(t=><button type="button" key={t} onClick={()=>setType(t)} className={`chip ${type===t?'chip-active':''}`} data-testid={`button-type-${t}`}>{t==='gasto'?<ArrowUpRight size={16}/>:<ArrowDownLeft size={16}/>} {t==='gasto'?'Gasto':'Ingreso'}</button>)}</div>
      <label className="field-label" htmlFor="modal-amount">Importe en EUR</label><input id="modal-amount" className="field" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00" data-testid="input-movement-amount"/>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:14}}><div><label className="field-label" htmlFor="modal-date">Fecha</label><input id="modal-date" className="field" type="date" value={date} onChange={e=>setDate(e.target.value)} data-testid="input-movement-date"/></div><div><label className="field-label" htmlFor="modal-cat">Categoría {type==='ingreso'?'· opcional':'· obligatoria'}</label><select id="modal-cat" className="field" value={category} onChange={e=>setCategory(e.target.value)} data-testid="select-movement-category"><option value="">Sin categoría</option>{cats.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div></div>
      <div style={{marginTop:14}}><label className="field-label" htmlFor="modal-note">Nota · opcional</label><input id="modal-note" className="field" value={note} onChange={e=>setNote(e.target.value)} placeholder="Añade un detalle" data-testid="input-movement-note"/></div>
      <div style={{marginTop:14}}><label className="field-label" htmlFor="modal-scope">Ámbito · opcional</label><select id="modal-scope" className="field" value={scope} onChange={e=>setScope(e.target.value)} data-testid="select-movement-scope"><option value="">Sin ámbito</option>{data.ambitos.filter(a=>!a.archivado).map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select></div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:9,marginTop:21}}><button type="button" className="button button-quiet" onClick={onClose} data-testid="button-cancel-movement">Cancelar</button><button type="submit" className="button button-primary" data-testid="button-save-movement">{initial?'Guardar cambios':'Añadir movimiento'}</button></div>
    </form>
  </Modal>;
}

function Dashboard({data,update,show,remove,deleted,undo}:{data:DatosUsuario;update:(fn:(d:DatosUsuario)=>DatosUsuario)=>void;show:(s:string,k?:'success'|'error')=>void;remove:(m:Movimiento)=>void;deleted:Movimiento|null;undo:()=>void}){
  const [period,setPeriod]=useState<'semana'|'mes'|'año'|'rango'>('mes');
  const [start,setStart]=useState(firstMonth()),[end,setEnd]=useState(lastMonth()),[view,setView]=useState<'gasto'|'ingreso'|'todos'>('todos');
  const [typeFilter,setTypeFilter]=useState('todos'),[categoryFilter,setCategoryFilter]=useState('todas'),[scopeFilter,setScopeFilter]=useState('todos'),[search,setSearch]=useState('');
  const [modal,setModal]=useState<Movimiento|null|false>(false),[showFilters,setShowFilters]=useState(false);
  const applyPeriod=(p:'semana'|'mes'|'año'|'rango')=>{
    setPeriod(p);const now=new Date();
    if(p==='mes'){setStart(firstMonth());setEnd(lastMonth());}
    if(p==='año'){setStart(`${now.getFullYear()}-01-01`);setEnd(`${now.getFullYear()}-12-31`);}
    if(p==='semana'){const d=new Date(now);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);setStart(dateKey(d));const last=new Date(d);last.setDate(last.getDate()+6);setEnd(dateKey(last));}
  };
  const filtered=useMemo(()=>data.movimientos.filter(m=>
    m.fecha>=start&&m.fecha<=end&&
    (typeFilter==='todos'||m.tipo===typeFilter)&&
    (categoryFilter==='todas'||m.categoriaId===categoryFilter)&&
    (scopeFilter==='todos'||(scopeFilter==='sin-ambito'?!m.ambitoId:m.ambitoId===scopeFilter))&&
    (!search||(m.nota||'').toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))) &&
    (view==='todos'||m.tipo===view)
  ).sort((a,b)=>b.fecha.localeCompare(a.fecha)||b.createdAt.localeCompare(a.createdAt)),[data.movimientos,start,end,typeFilter,categoryFilter,scopeFilter,search,view]);
  const analytics=filtered.filter(m=>m.id!==deleted?.id);
  const income=analytics.filter(m=>m.tipo==='ingreso').reduce((n,m)=>n+m.importe,0),expenses=analytics.filter(m=>m.tipo==='gasto').reduce((n,m)=>n+m.importe,0);
  const byCategory=useMemo(()=>{const sums=new Map<string,number>();analytics.filter(m=>m.tipo==='gasto').forEach(m=>sums.set(m.categoriaId||'sin-categoria',(sums.get(m.categoriaId||'sin-categoria')||0)+m.importe));return [...sums.entries()].sort((a,b)=>b[1]-a[1]);},[analytics]);
  const incomesByCategory=useMemo(()=>{const sums=new Map<string,number>();analytics.filter(m=>m.tipo==='ingreso').forEach(m=>sums.set(m.categoriaId||'sin-categoria',(sums.get(m.categoriaId||'sin-categoria')||0)+m.importe));return [...sums.entries()].sort((a,b)=>b[1]-a[1]);},[analytics]);
  const save=(m:Movimiento)=>{update(d=>({...d,movimientos:[m,...d.movimientos.filter(x=>x.id!==m.id)]}));setModal(false);show('Movimiento guardado.');};
  const total=income+expenses;
  const categories=data.categorias;
  const pendingMatches=deleted&&deleted.fecha>=start&&deleted.fecha<=end&&(typeFilter==='todos'||deleted.tipo===typeFilter)&&(categoryFilter==='todas'||deleted.categoriaId===categoryFilter)&&(scopeFilter==='todos'||(scopeFilter==='sin-ambito'?!deleted.ambitoId:deleted.ambitoId===scopeFilter))&&(!search||(deleted.nota||'').toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')))&&(view==='todos'||deleted.tipo===view);
  const list=[...filtered,...(pendingMatches&&deleted?[deleted]:[])].sort((a,b)=>b.fecha.localeCompare(a.fecha)||b.createdAt.localeCompare(a.createdAt));
  return <div className="page-enter">
    <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:14,flexWrap:'wrap',marginBottom:22}}>
      <div><div className="eyebrow">EL PANORAMA DE CASA</div><h1 className="display" style={{fontSize:'clamp(31px,5vw,42px)',margin:'4px 0 0'}}>Movimientos</h1><p style={{fontSize:13,color:'#737c73',margin:'5px 0 0',textTransform:'capitalize'}}>{MONTHS[new Date(`${start}T12:00:00`).getMonth()]} {start.slice(0,4)}{period==='rango'?` · ${formatoFecha(start)} — ${formatoFecha(end)}`:''}</p></div>
      <button className="button button-primary" onClick={()=>setModal(null)} data-testid="button-add-movement"><Plus size={17}/> Añadir movimiento</button>
    </div>
    <section className="surface" style={{padding:'clamp(16px,3vw,25px)',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
        <div className="eyebrow">ANÁLISIS DEL PERIODO</div>
        <div style={{display:'flex',gap:5,padding:4,borderRadius:13,background:'#efede5'}}>{(['semana','mes','año','rango'] as const).map(p=><button key={p} onClick={()=>applyPeriod(p)} data-testid={`period-${p}`} style={{border:0,borderRadius:10,padding:'8px 12px',background:period===p?'#fffdf8':'transparent',color:period===p?'#275b49':'#707a71',fontSize:12,fontWeight:700,boxShadow:period===p?'0 2px 6px #243c3210':'none'}}>{p==='año'?'Año':p==='rango'?'Rango':p[0].toUpperCase()+p.slice(1)}</button>)}</div>
      </div>
      {(period==='rango'||showFilters)&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:10,marginTop:15}}>
        <label><span className="field-label">Desde · inclusivo</span><input className="field" type="date" value={start} onChange={e=>{setStart(e.target.value);setPeriod('rango');}} data-testid="filter-date-start"/></label>
        <label><span className="field-label">Hasta · inclusivo</span><input className="field" type="date" value={end} onChange={e=>{setEnd(e.target.value);setPeriod('rango');}} data-testid="filter-date-end"/></label>
      </div>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:11,marginTop:19}}>
        <Summary title="Ingresos" amount={income} icon={<ArrowDownLeft size={16}/>} tone="green" testId="value-income"/>
        <Summary title="Gastos" amount={expenses} icon={<ArrowUpRight size={16}/>} tone="coral" testId="value-expenses"/>
        <Summary title="Saldo" amount={income-expenses} icon={<Wallet size={16}/>} tone="gold" testId="value-balance"/>
      </div>
      {(analytics.length>=4)&&<div style={{marginTop:22,paddingTop:17,borderTop:'1px solid #ebe7dc'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><div className="eyebrow">EVOLUCIÓN · MOVIMIENTOS EN EL PERIODO</div><span className="mono" style={{fontSize:10,color:'#778077'}}>EUR</span></div>
        <Evolution movements={analytics} start={start} end={end}/>
      </div>}
    </section>
    <div className="dashboard-grid" style={{display:'grid',gridTemplateColumns:'minmax(260px,.85fr) minmax(0,1.4fr)',gap:16,alignItems:'start'}}>
      <section className="surface" style={{padding:20}}>
        <div className="eyebrow">GASTO POR CATEGORÍA</div>
        {byCategory.length? <div style={{marginTop:16,display:'grid',gap:14}}>{byCategory.slice(0,7).map(([id,value],i)=>{const cat=categories.find(c=>c.id===id);const percent=expenses?value/expenses*100:0;return <div key={id} data-testid={`category-analysis-${id}`}><div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center',marginBottom:6}}><span style={{fontSize:12,fontWeight:700,display:'flex',gap:7,alignItems:'center'}}><span style={{color:cat?.color||'#999',fontSize:16}}>{cat?.icono||'·'}</span>{cat?.nombre||'Sin categoría'}</span><span className="mono" style={{fontSize:11}}>{formatEUR(value)}</span></div><div className="bar"><span style={{width:`${Math.max(3,percent)}%`,background:cat?.color||['#648b76','#d68d6b','#d4ad57'][i%3]}}/></div><div style={{textAlign:'right',fontSize:10,color:'#858b81',marginTop:3}}>{percent.toFixed(1)}%</div></div>})}</div>:<EmptyState title="Sin gastos en este periodo" text="Cuando registres gastos, aquí verás cómo se reparten por categoría."/>}
        <div style={{borderTop:'1px solid #ebe7dc',marginTop:18,paddingTop:16}}>
          <div className="eyebrow">INGRESOS POR CATEGORÍA</div>
          {incomesByCategory.length?<div style={{display:'grid',gap:9,marginTop:12}}>{incomesByCategory.map(([id,v])=><div key={id} style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span>{categories.find(c=>c.id===id)?.nombre||'Sin categoría'}</span><b className="mono">{formatEUR(v)}</b></div>)}</div>:<p style={{fontSize:12,color:'#81877d',margin:'10px 0 0'}}>Aún no hay ingresos categorizados.</p>}
        </div>
      </section>
      <section className="surface" style={{padding:'20px 20px 12px',minWidth:0}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
          <div><div className="eyebrow">LISTADO DETALLADO</div><h2 className="display" style={{fontSize:22,margin:'3px 0 0'}}>Tu actividad</h2></div>
          <button onClick={()=>setShowFilters(v=>!v)} className={`button ${showFilters?'button-secondary':'button-quiet'}`} style={{minHeight:38,padding:'0 11px',fontSize:12}} data-testid="button-toggle-filters"><Filter size={15}/> Filtros</button>
        </div>
        <div style={{display:'flex',gap:5,padding:4,borderRadius:13,background:'#f0eee7',marginTop:15,width:'fit-content'}}>{(['gasto','ingreso','todos'] as const).map(v=><button key={v} onClick={()=>setView(v)} data-testid={`view-${v}`} style={{border:0,borderRadius:10,padding:'8px 12px',background:view===v?'#fffdf8':'transparent',color:view===v?'#285b49':'#707a71',fontSize:12,fontWeight:700}}>{v==='gasto'?'Gastos':v==='ingreso'?'Ingresos':'Todos'}</button>)}</div>
        {(showFilters||typeFilter!=='todos'||categoryFilter!=='todas'||scopeFilter!=='todos'||search)&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:9,marginTop:12}}>
          <label><span className="field-label">Tipo</span><select className="field" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} data-testid="filter-type"><option value="todos">Todos</option><option value="gasto">Gastos</option><option value="ingreso">Ingresos</option></select></label>
          <label><span className="field-label">Categoría</span><select className="field" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} data-testid="filter-category"><option value="todas">Todas</option>{categories.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
          <label><span className="field-label">Ámbito</span><select className="field" value={scopeFilter} onChange={e=>setScopeFilter(e.target.value)} data-testid="filter-scope"><option value="todos">Todos los ámbitos</option><option value="sin-ambito">Sin ámbito</option>{data.ambitos.map(a=><option key={a.id} value={a.id}>{a.nombre}{a.archivado?' · archivado':''}</option>)}</select></label>
          <label><span className="field-label">Buscar nota</span><input className="field" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Escribe una palabra" data-testid="filter-search"/></label>
        </div>}
        <div style={{marginTop:13}}>
          {list.length?list.map(m=>{const isDeleted=m.id===deleted?.id;const cat=categories.find(c=>c.id===m.categoriaId);const scope=data.ambitos.find(a=>a.id===m.ambitoId);return <article key={m.id} data-testid={`row-movement-${m.id}`} style={{display:'flex',gap:11,alignItems:'center',padding:'13px 0',borderBottom:'1px solid #efebe2',opacity:isDeleted ? .48 : 1}}>
            <div style={{width:38,height:38,flex:'0 0 38px',borderRadius:13,display:'grid',placeItems:'center',background:m.tipo==='ingreso'?'#e4eee5':'#f5e9e0',color:m.tipo==='ingreso'?'#387058':'#ae644a'}}>{m.tipo==='ingreso'?<ArrowDownLeft size={18}/>:<ArrowUpRight size={18}/>}</div>
            <div style={{minWidth:0,flex:1}}><div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}><strong style={{fontSize:13}}>{cat?.nombre||'Sin categoría'}</strong><span style={{fontSize:10,color:m.tipo==='ingreso'?'#3d7759':'#b0644e',fontWeight:700}}>{m.tipo==='ingreso'?'INGRESO':'GASTO'}</span>{m.origen==='recurrente'&&<span style={{fontSize:9,border:'1px solid #ded9ca',padding:'2px 5px',borderRadius:8}}>RECURRENTE</span>}</div><div style={{display:'flex',gap:7,alignItems:'center',fontSize:11,color:'#81877e',marginTop:3,flexWrap:'wrap'}}><span>{formatoFecha(m.fecha)}</span>{m.nota&&<><span>·</span><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:180}}>{m.nota}</span></>}{scope&&<span style={{background:'#f0ede3',borderRadius:7,padding:'2px 6px'}}>{scope.nombre}</span>}</div></div>
            <strong className="mono" data-testid={`value-movement-${m.id}`} style={{fontSize:13,color:m.tipo==='ingreso'?'#3b7858':'#9d5844',whiteSpace:'nowrap'}}>{m.tipo==='ingreso'?'+':'−'}{formatEUR(m.importe)}</strong>
            <div style={{display:'flex',gap:3}}>{isDeleted?<button onClick={undo} className="button button-secondary" style={{minHeight:35,padding:'0 9px',fontSize:11}} data-testid={`button-undo-${m.id}`}>Deshacer</button>:<><button title="Editar movimiento" aria-label="Editar movimiento" onClick={()=>setModal(m)} className="button button-quiet" style={{minHeight:34,padding:'0 8px'}} data-testid={`button-edit-${m.id}`}><Pencil size={14}/></button><button title="Eliminar movimiento" aria-label="Eliminar movimiento" onClick={()=>remove(m)} className="button button-quiet" style={{minHeight:34,padding:'0 8px',color:'#a75549'}} data-testid={`button-delete-${m.id}`}><Trash2 size={14}/></button></>}</div>
          </article>}) : <EmptyState title="Todavía no hay movimientos" text="Prueba con otro periodo o anota tu primer ingreso o gasto." action={<button className="button button-secondary" onClick={()=>setModal(null)} data-testid="button-empty-add"><Plus size={16}/> Añadir movimiento</button>}/>}
        </div>
        <div style={{fontSize:11,color:'#848b81',padding:'11px 0'}} data-testid="text-filter-count">{list.length} {list.length===1?'movimiento':'movimientos'} · sin paginación</div>
      </section>
    </div>
    {modal!==false&&<MovementForm data={data} initial={modal||undefined} onSave={save} onClose={()=>setModal(false)}/>}
    <style>{'@media(max-width:740px){.dashboard-grid{grid-template-columns:1fr!important}.page-enter > div:first-child{align-items:flex-start!important}.page-enter .surface{border-radius:17px}}'}</style>
  </div>;
}

function Summary({title,amount,icon,tone,testId}:{title:string;amount:number;icon:ReactNode;tone:string;testId:string}){
  const colors=tone==='green'?['#e7f0e7','#3c7859']:tone==='coral'?['#f5e8e0','#ad6349']:['#f2edda','#9a8041'];
  return <div style={{background:colors[0],padding:'13px 14px',borderRadius:15,minWidth:0}}><div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,fontWeight:700,color:'#69766d'}}>{icon}{title}</div><div className="mono" data-testid={testId} style={{fontSize:'clamp(15px,3vw,21px)',fontWeight:700,marginTop:9,color:colors[1],whiteSpace:'nowrap'}}>{formatEUR(amount)}</div></div>;
}
function Evolution({movements,start,end}:{movements:Movimiento[];start:string;end:string}){
  const span=Math.max(1,Math.ceil((new Date(`${end}T12:00:00`).getTime()-new Date(`${start}T12:00:00`).getTime())/86400000)+1);
  const bucketCount=Math.min(8,span), buckets=Array.from({length:bucketCount},(_,i)=>{
    const midpoint=new Date(`${start}T12:00:00`);midpoint.setDate(midpoint.getDate()+Math.floor((i+.5)*span/bucketCount));
    const format=span<=10?{weekday:'short' as const}:span<=50?{day:'numeric' as const}:{month:'short' as const};
    return {label:new Intl.DateTimeFormat('es-ES',format).format(midpoint),income:0,expense:0,balance:0};
  });
  movements.forEach(m=>{const offset=Math.floor((new Date(`${m.fecha}T12:00:00`).getTime()-new Date(`${start}T12:00:00`).getTime())/86400000);const index=Math.max(0,Math.min(bucketCount-1,Math.floor(offset/span*bucketCount)));if(m.tipo==='ingreso'){buckets[index].income+=m.importe;buckets[index].balance+=m.importe;}else{buckets[index].expense+=m.importe;buckets[index].balance-=m.importe;}});
  const max=Math.max(1,...buckets.flatMap(b=>[b.income,b.expense,Math.abs(b.balance)]));
  return <div>
    <div aria-label="Leyenda de evolución" style={{display:'flex',gap:14,flexWrap:'wrap',fontSize:10,color:'#6f796f',marginBottom:7}}><span><i style={{display:'inline-block',width:8,height:8,borderRadius:3,background:'#709b7d',marginRight:5}}/>Ingresos</span><span><i style={{display:'inline-block',width:8,height:8,borderRadius:3,background:'#d68b68',marginRight:5}}/>Gastos</span><span><i style={{display:'inline-block',width:8,height:8,borderRadius:3,background:'#648eaa',marginRight:5}}/>Saldo neto</span></div>
    <div style={{height:110,display:'flex',alignItems:'end',gap:7}}>{buckets.map((b,i)=><div key={i} title={`${b.label} · ingresos ${formatEUR(b.income)} · gastos ${formatEUR(b.expense)} · saldo neto ${formatEUR(b.balance)}`} style={{height:'100%',flex:1,display:'flex',flexDirection:'column',justifyContent:'end',alignItems:'center',gap:5,borderBottom:'1px solid #e5e1d5'}}><div style={{height:'78%',display:'flex',alignItems:'end',justifyContent:'center',gap:2,width:'100%'}}><span aria-label={`Ingresos ${formatEUR(b.income)}`} style={{height:`${Math.max(2,b.income/max*100)}%`,width:'25%',maxWidth:14,borderRadius:'4px 4px 0 0',background:'#709b7d'}}/><span aria-label={`Gastos ${formatEUR(b.expense)}`} style={{height:`${Math.max(2,b.expense/max*100)}%`,width:'25%',maxWidth:14,borderRadius:'4px 4px 0 0',background:'#d68b68'}}/><span aria-label={`Saldo neto ${formatEUR(b.balance)}`} style={{height:`${Math.max(2,Math.abs(b.balance)/max*100)}%`,width:'25%',maxWidth:14,borderRadius:'4px 4px 0 0',background:b.balance>=0?'#648eaa':'#906e9c'}}/></div><span style={{fontSize:9,color:'#7f877e'}}>{b.label}</span></div>)}</div>
  </div>;
}
function EmptyState({title,text,action}:{title:string;text:string;action?:ReactNode}){
  return <div style={{padding:'25px 14px',textAlign:'center',borderRadius:16,background:'#f6f3ec',marginTop:13}}><div style={{width:38,height:38,borderRadius:13,margin:'0 auto 10px',display:'grid',placeItems:'center',background:'#e5eee7',color:'#3c7156'}}><CircleHelp size={19}/></div><strong style={{fontSize:14}}>{title}</strong><p style={{fontSize:12,lineHeight:1.5,color:'#788178',maxWidth:260,margin:'5px auto 0'}}>{text}</p>{action&&<div style={{marginTop:13}}>{action}</div>}</div>;
}

type SettingsTab='categorias'|'ambitos'|'recurrentes'|'copias'|'exportar'|'historial'|'peligro';
function Settings({data,update,replace,user,show,onDeleted}:{data:DatosUsuario;update:(fn:(d:DatosUsuario)=>DatosUsuario)=>void;replace:(d:DatosUsuario)=>void;user:User|null;show:(s:string,k?:'success'|'error')=>void;onDeleted:()=>void}){
  const [tab,setTab]=useState<SettingsTab>('categorias');
  const [categoryEdit,setCategoryEdit]=useState<Categoria|null|false>(false);
  const [categoryDelete,setCategoryDelete]=useState<Categoria|null>(null);
  const [reassign,setReassign]=useState('');
  const [scopeEdit,setScopeEdit]=useState<Ambito|null|false>(false);
  const [ruleEdit,setRuleEdit]=useState<Regla|null|false>(false);
  const [backupEncrypted,setBackupEncrypted]=useState(true);
  const [importFile,setImportFile]=useState<File|null>(null),[importMode,setImportMode]=useState<'replace'|'add'>('replace'),[importAlias,setImportAlias]=useState(''),[importEncrypted,setImportEncrypted]=useState(true);
  const [importBusy,setImportBusy]=useState(false);
  const [exportFormat,setExportFormat]=useState<'csv'|'xlsx'>('csv'),[exportAll,setExportAll]=useState(true),[exportStart,setExportStart]=useState(firstMonth()),[exportEnd,setExportEnd]=useState(lastMonth());
  const [exportState,setExportState]=useState<{status:string;percent:number;size?:number}|null>(null);
  const [dangerOpen,setDangerOpen]=useState(false),[confirmText,setConfirmText]=useState(''),[checked,setChecked]=useState(false);
  const [returnToDanger,setReturnToDanger]=useState(false);
  const [restoreVersion,setRestoreVersion]=useState<VersionLocal|null>(null);
  const exportSelection=data.movimientos.filter(m=>exportAll||(m.fecha>=exportStart&&m.fecha<=exportEnd));
  const categoryTabs: {id:SettingsTab;name:string;icon:ReactNode}[]=[
    {id:'categorias',name:'Categorías',icon:<Wallet size={16}/>},{id:'ambitos',name:'Ámbitos',icon:<FolderOpen size={16}/>},
    {id:'recurrentes',name:'Reglas',icon:<RotateCcw size={16}/>},{id:'copias',name:'Copia local',icon:<FileArchive size={16}/>},
    {id:'exportar',name:'Exportar',icon:<Download size={16}/>},{id:'historial',name:'Historial',icon:<RotateCcw size={16}/>},
    {id:'peligro',name:'Zona de peligro',icon:<Trash2 size={16}/>}
  ];
  const saveCategory=(cat:Categoria)=>{update(d=>({...d,categorias:cat.id?d.categorias.some(c=>c.id===cat.id)?d.categorias.map(c=>c.id===cat.id?cat:c):[...d.categorias,cat]:[...d.categorias,cat]}));setCategoryEdit(false);show('Categoría guardada.');};
  const removeCategory=()=>{
    if(!categoryDelete)return;
    const used=data.movimientos.some(m=>m.categoriaId===categoryDelete.id)||data.reglas.some(r=>r.categoriaId===categoryDelete.id);
    if(used&&!reassign)return;
    update(d=>({...d,categorias:d.categorias.filter(c=>c.id!==categoryDelete.id),movimientos:d.movimientos.map(m=>m.categoriaId===categoryDelete.id?{...m,categoriaId:reassign||undefined,updatedAt:new Date().toISOString()}:m),reglas:d.reglas.map(r=>r.categoriaId===categoryDelete.id?{...r,categoriaId:reassign||undefined}:r)}));
    setCategoryDelete(null);setReassign('');show(used?'Categoría eliminada y referencias reasignadas.':'Categoría eliminada.');
  };
  const addScope=(scope:Ambito)=>{update(d=>({...d,ambitos:scope.id&&d.ambitos.some(a=>a.id===scope.id)?d.ambitos.map(a=>a.id===scope.id?scope:a):[...d.ambitos,scope]}));setScopeEdit(false);show('Ámbito guardado.');};
  const deleteScope=(scope:Ambito)=>{if(!confirm(`Eliminar el ámbito «${scope.nombre}»? Sus movimientos se conservarán sin ámbito.`))return;update(d=>({...d,ambitos:d.ambitos.filter(a=>a.id!==scope.id),movimientos:d.movimientos.map(m=>m.ambitoId===scope.id?{...m,ambitoId:undefined}:m)}));show('Ámbito eliminado; los movimientos se conservan.');};
  const saveRule=(rule:Regla)=>{update(d=>({...d,reglas:rule.id&&d.reglas.some(r=>r.id===rule.id)?d.reglas.map(r=>r.id===rule.id?rule:r):[...d.reglas,rule]}));setRuleEdit(false);show('Regla guardada. Se generarán sus ejecuciones vencidas.');};
  const makeSnapshot=(d:DatosUsuario)=>{
    const snap={...d,versiones:[]};const payload=JSON.stringify(snap);const version:VersionLocal={id:nuevoId().slice(0,8).toUpperCase(),fecha:new Date().toISOString(),size:new Blob([payload]).size,payload};
    return {...d,versiones:[version,...d.versiones]};
  };
  const createBackup=async()=>{
    try{const copy=backupEncrypted?await cifrarCopia(data,user?.alias||''):copiaClara(data);const blob=crearZip([{name:'economia-familiar.json',content:JSON.stringify(copy)}]);saveBlob(blob,`casa-en-orden-copia-${hoyISO()}.zip`);show(`Copia descargada · ${(blob.size/1024).toFixed(1)} KB.`);if(returnToDanger){setReturnToDanger(false);setTab('peligro');setDangerOpen(true);}}
    catch(e){show(e instanceof Error?e.message:'No se pudo crear la copia.','error');}
  };
  const createSnapshot=()=>{const next=makeSnapshot(data);update(()=>next);show('Versión local guardada.');};
  const restore=(v:VersionLocal)=>{
    try{const parsed=JSON.parse(v.payload) as DatosUsuario;validarDatos(parsed);const next={...parsed,versiones:[{...makeSnapshot(data).versiones[0]},...data.versiones.filter(x=>x.id!==v.id)]};replace(next);setRestoreVersion(null);show('Versión restaurada. Guardamos una copia del estado anterior.');}
    catch{show('No se pudo restaurar esta versión: sus datos no son válidos.','error');}
  };
  const downloadSnapshot=(v:VersionLocal)=>{const blob=crearZip([{name:'economia-familiar.json',content:JSON.stringify(copiaClara(JSON.parse(v.payload) as DatosUsuario))}]);saveBlob(blob,`copia-local-${v.id}.zip`);show(`Versión descargada · ${(blob.size/1024).toFixed(1)} KB.`);};
  const importBackup=async()=>{
    if(!importFile){show('Selecciona un archivo ZIP primero.','error');return;}
    setImportBusy(true);
    try{
      const archive=await leerZip(importFile);const file=Object.entries(archive).find(([name])=>name.endsWith('.json'));
      if(!file)throw new Error('No encontramos el archivo de datos dentro del ZIP.');
      const raw=JSON.parse(file[1]) as {encrypted?:unknown};
      if(typeof raw?.encrypted!=='boolean')throw new Error('El archivo no indica si la copia está cifrada.');
      if(raw.encrypted!==importEncrypted)throw new Error('El tipo de cifrado seleccionado no coincide con el archivo.');
      if(importEncrypted&&!importAlias.trim())throw new Error('Escribe el alias usado para cifrar esta copia.');
      const incoming=await descifrarCopia(raw,importEncrypted?importAlias.trim():'');
      let next:DatosUsuario;
      if(importMode==='replace')next={...incoming,versiones:[makeSnapshot(data).versiones[0],...data.versiones]};
      else{
        const cats=[...data.categorias],catIds=new Map<string,string>();
        incoming.categorias.forEach(c=>{
          const sameId=cats.find(x=>x.id===c.id);
          const equivalent=cats.find(x=>x.nombre===c.nombre&&x.tipo===c.tipo);
          const target=sameId?(sameId.nombre===c.nombre&&sameId.tipo===c.tipo?sameId.id:nuevoId()):equivalent?.id||c.id;
          catIds.set(c.id,target);if(!cats.some(x=>x.id===target))cats.push({...c,id:target});
        });
        const scopes=[...data.ambitos],scopeIds=new Map<string,string>();
        incoming.ambitos.forEach(a=>{const same=scopes.find(x=>x.id===a.id);const target=same?(same.nombre===a.nombre?same.id:nuevoId()):a.id;scopeIds.set(a.id,target);if(!scopes.some(x=>x.id===target))scopes.push({...a,id:target});});
        const rules=[...data.reglas],ruleIds=new Map<string,string>();
        incoming.reglas.forEach(r=>{const target=rules.some(x=>x.id===r.id)?nuevoId():r.id;ruleIds.set(r.id,target);rules.push({...r,id:target,categoriaId:r.categoriaId?catIds.get(r.categoriaId):undefined});});
        const existingIds=new Set(data.movimientos.map(m=>m.id));
        const movs=incoming.movimientos.map(m=>{const id=existingIds.has(m.id)?nuevoId():m.id;existingIds.add(id);return {...m,id,categoriaId:m.categoriaId?catIds.get(m.categoriaId):undefined,ambitoId:m.ambitoId?scopeIds.get(m.ambitoId):undefined,reglaId:m.reglaId?ruleIds.get(m.reglaId)||m.reglaId:undefined};});
        next={...data,categorias:cats,ambitos:scopes,movimientos:[...movs,...data.movimientos],reglas:rules};
      }
      validarDatos(next);replace(next);setImportFile(null);show(importMode==='replace'?'Datos importados. La versión anterior quedó guardada.':'Datos agregados a tu espacio.');
    }catch(e){show(e instanceof Error?e.message:'No se pudo importar la copia. Tus datos siguen intactos.','error');}
    finally{setImportBusy(false);}
  };
  const exportMovements=async()=>{
    if(!exportAll&&exportStart>exportEnd){show('La fecha inicial no puede ser posterior a la final.','error');return;}
    const movements=exportSelection;
    const estimated=Math.ceil(JSON.stringify(movements).length*.8);
    setExportState({status:'No cierres esta ventana hasta que finalice la exportación',percent:20,size:estimated});
    await new Promise(resolve=>setTimeout(resolve,30));
    try{
      const blob=exportFormat==='csv'?new Blob(['\ufeff',filasCSV(data,movements)],{type:'text/csv;charset=utf-8'}):crearXlsx(data,movements);
      setExportState({status:`Archivo listo · ${(blob.size/1024).toFixed(1)} KB exactos.`,percent:100,size:blob.size});
      saveBlob(blob,`movimientos-${exportAll?'completos':`${exportStart}-${exportEnd}`}.${exportFormat}`);
    }catch(e){setExportState({status:e instanceof Error?e.message:'Error recuperable al generar el archivo.',percent:0});}
  };
  const deleteAll=async()=>{
    if(confirmText!=='ELIMINAR MIS DATOS'||!checked||!user)return;
    try{await borrarUsuarioActual(user.id);onDeleted();}
    catch{show('No se pudieron eliminar los datos.','error');}
  };
  const renderTab=()=>{
    if(tab==='categorias')return <section className="surface" style={{padding:22}}>
      <PanelHeading eyebrow="PERSONALIZA TU LISTA" title="Categorías" subtitle="Separa tus gastos e ingresos de la forma que te resulte natural." action={<button className="button button-primary" onClick={()=>setCategoryEdit(null)} data-testid="button-add-category"><Plus size={16}/> Crear categoría</button>}/>
      {(['gasto','ingreso'] as const).map(type=><div key={type} style={{marginTop:22}}><div className="eyebrow">{type==='gasto'?'GASTOS':'INGRESOS'}</div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:9,marginTop:10}}>{data.categorias.filter(c=>c.tipo===type||c.tipo==='ambos').map(c=><div key={c.id} data-testid={`category-row-${c.id}`} style={{display:'flex',alignItems:'center',gap:10,border:'1px solid #e8e3d9',borderRadius:14,padding:'10px 11px',background:'#fffdf8'}}><span style={{fontSize:19,color:c.color,width:27,textAlign:'center'}}>{c.icono}</span><span style={{fontSize:13,fontWeight:700,flex:1}}>{c.nombre}</span><button className="button button-quiet" onClick={()=>setCategoryEdit(c)} aria-label={`Editar ${c.nombre}`} data-testid={`button-edit-category-${c.id}`} style={{minHeight:34,padding:'0 8px'}}><Pencil size={14}/></button><button className="button button-quiet" onClick={()=>{setCategoryDelete(c);setReassign('');}} aria-label={`Eliminar ${c.nombre}`} data-testid={`button-delete-category-${c.id}`} style={{minHeight:34,padding:'0 8px',color:'#a75549'}}><Trash2 size={14}/></button></div>)}</div></div>)}
    </section>;
    if(tab==='ambitos')return <section className="surface" style={{padding:22}}>
      <PanelHeading eyebrow="ACTIVIDADES Y OBJETIVOS" title="Ámbitos" subtitle="Agrupa un viaje, una reforma o una actividad sin cambiar tus categorías." action={<button className="button button-primary" onClick={()=>setScopeEdit(null)} data-testid="button-add-scope"><Plus size={16}/> Crear ámbito</button>}/>
      {!data.ambitos.length?<EmptyState title="Todavía no hay ámbitos" text="Un ámbito te ayuda a mirar por separado los gastos de una actividad concreta."/>:<div style={{display:'grid',gap:9,marginTop:19}}>{data.ambitos.map(a=><div key={a.id} data-testid={`scope-row-${a.id}`} style={{display:'flex',alignItems:'center',gap:10,padding:14,border:'1px solid #e8e3d9',borderRadius:14,background:'#fffdf8'}}><FolderOpen size={18} color="#678472"/><div style={{flex:1}}><strong style={{fontSize:14}}>{a.nombre}</strong><div style={{fontSize:11,color:'#7d857c',marginTop:3}}>{data.movimientos.filter(m=>m.ambitoId===a.id).length} movimientos · {a.archivado?'Archivado':'Activo'}</div></div><button className="button button-quiet" onClick={()=>update(d=>({...d,ambitos:d.ambitos.map(x=>x.id===a.id?{...x,archivado:!x.archivado}:x)}))} data-testid={`button-archive-scope-${a.id}`} style={{minHeight:36,padding:'0 10px',fontSize:11}}>{a.archivado?'Reactivar':'Archivar'}</button><button className="button button-quiet" aria-label="Editar ámbito" onClick={()=>setScopeEdit(a)} data-testid={`button-edit-scope-${a.id}`} style={{minHeight:36,padding:'0 8px'}}><Pencil size={14}/></button><button className="button button-quiet" aria-label="Eliminar ámbito" onClick={()=>deleteScope(a)} data-testid={`button-delete-scope-${a.id}`} style={{minHeight:36,padding:'0 8px',color:'#a75549'}}><Trash2 size={14}/></button></div>)}</div>}
    </section>;
    if(tab==='recurrentes')return <section className="surface" style={{padding:22}}>
      <PanelHeading eyebrow="AUTOMATIZA LO REPETIDO" title="Reglas recurrentes" subtitle="Al abrir tu espacio, se generan una sola vez las ejecuciones vencidas." action={<button className="button button-primary" onClick={()=>setRuleEdit(null)} data-testid="button-add-rule"><Plus size={16}/> Nueva regla</button>}/>
      {!data.reglas.length?<EmptyState title="Sin reglas por ahora" text="Añade un pago o ingreso periódico y se anotará cuando corresponda."/>:<div style={{display:'grid',gap:10,marginTop:18}}>{data.reglas.map(r=>{const c=data.categorias.find(x=>x.id===r.categoriaId);return <div key={r.id} data-testid={`rule-row-${r.id}`} style={{padding:15,border:'1px solid #e8e3d9',borderRadius:15,background:'#fffdf8',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}><div style={{width:39,height:39,borderRadius:13,display:'grid',placeItems:'center',background:r.tipo==='ingreso'?'#e4eee5':'#f5e9e0',color:r.tipo==='ingreso'?'#387058':'#ae644a'}}>{r.tipo==='ingreso'?<ArrowDownLeft size={18}/>:<ArrowUpRight size={18}/>}</div><div style={{flex:1,minWidth:160}}><strong>{c?.nombre||(r.tipo==='ingreso'?'Ingreso':'Gasto')} · {formatEUR(r.importe)}</strong><div style={{fontSize:11,color:'#778078',marginTop:4}}>{r.frecuencia} desde {formatoFecha(r.fechaInicio)}{r.fechaFin?` · hasta ${formatoFecha(r.fechaFin)}`:''}</div></div><span style={{fontSize:10,fontWeight:700,color:r.activa?'#3d7659':'#87877b',background:r.activa?'#e8f0e8':'#efede7',padding:'6px 8px',borderRadius:8}}>{r.activa?'ACTIVA':'PAUSADA'}</span><button className="button button-quiet" onClick={()=>update(d=>({...d,reglas:d.reglas.map(x=>x.id===r.id?{...x,activa:!x.activa}:x)}))} data-testid={`button-toggle-rule-${r.id}`} style={{minHeight:36,padding:'0 9px',fontSize:11}}>{r.activa?'Pausar':'Activar'}</button><button className="button button-quiet" onClick={()=>setRuleEdit(r)} data-testid={`button-edit-rule-${r.id}`} style={{minHeight:36,padding:'0 8px'}}><Pencil size={14}/></button><button className="button button-quiet" onClick={()=>{if(confirm('¿Eliminar esta regla? Los movimientos ya generados se conservarán.'))update(d=>({...d,reglas:d.reglas.filter(x=>x.id!==r.id)}));}} data-testid={`button-delete-rule-${r.id}`} style={{minHeight:36,padding:'0 8px',color:'#a75549'}}><Trash2 size={14}/></button></div>})}</div>}
      <div style={{fontSize:12,color:'#727b72',marginTop:17,padding:13,borderRadius:12,background:'#f5f2ea'}}>Editar o eliminar una regla no altera movimientos que ya se hayan generado.</div>
    </section>;
    if(tab==='copias')return <section className="surface" style={{padding:22}}>
      <PanelHeading eyebrow="COPIAS QUE TE ACOMPAÑAN" title="Copia local" subtitle="Exporta o recupera todos tus movimientos, categorías, ámbitos y reglas."/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(270px,1fr))',gap:14,marginTop:18}}>
        <div style={{padding:18,borderRadius:17,background:'#f6f3eb',border:'1px solid #e7e1d5'}}><div style={{display:'flex',gap:10,alignItems:'center'}}><FileArchive size={19} color="#46725b"/><strong>Crear copia ZIP</strong></div><p style={{fontSize:12,lineHeight:1.55,color:'#747c73'}}>Incluye datos y configuración. Puedes protegerla con cifrado o guardarla en claro.</p><div style={{display:'flex',gap:7,flexWrap:'wrap'}}><button className={`chip ${backupEncrypted?'chip-active':''}`} onClick={()=>setBackupEncrypted(true)} data-testid="button-backup-encrypted">Cifrada</button><button className={`chip ${!backupEncrypted?'chip-active':''}`} onClick={()=>setBackupEncrypted(false)} data-testid="button-backup-plain">Sin cifrar</button></div>{backupEncrypted&&<p style={{fontSize:11,color:'#66756a',lineHeight:1.5,margin:'11px 0'}}>El cifrado usa tu alias como material de clave. Necesitarás ese mismo alias para restaurar. Un alias no es secreto.</p>}<button className="button button-primary" style={{width:'100%',marginTop:12}} onClick={createBackup} data-testid="button-download-backup"><Download size={16}/> Descargar ZIP</button><div style={{fontSize:10,color:'#81877e',marginTop:7}}>Tamaño estimado: {(new Blob([JSON.stringify(data)]).size/1024).toFixed(1)} KB más estructura ZIP.</div></div>
        <div style={{padding:18,borderRadius:17,background:'#f6f3eb',border:'1px solid #e7e1d5'}}>
          <div style={{display:'flex',gap:10,alignItems:'center'}}><Upload size={19} color="#46725b"/><strong>Importar una copia</strong></div>
          <p style={{fontSize:12,lineHeight:1.55,color:'#747c73'}}>La copia se valida antes de aplicar cambios. Si falla, tus datos actuales no se modifican.</p>
          <label className="field-label" htmlFor="backup-file">Archivo ZIP</label><input className="field" id="backup-file" type="file" accept=".zip,application/zip" onChange={e=>setImportFile(e.target.files?.[0]||null)} data-testid="input-backup-file"/>
          <label className="field-label" style={{marginTop:11}} htmlFor="backup-encrypted">Tipo de copia</label>
          <select className="field" id="backup-encrypted" value={importEncrypted?'encrypted':'plain'} onChange={e=>setImportEncrypted(e.target.value==='encrypted')} data-testid="select-backup-encryption"><option value="encrypted">Cifrada</option><option value="plain">Sin cifrar</option></select>
          <label className="field-label" style={{marginTop:11}} htmlFor="backup-mode">Al importar</label><select className="field" id="backup-mode" value={importMode} onChange={e=>setImportMode(e.target.value as 'replace'|'add')} data-testid="select-import-mode"><option value="replace">Sustituir datos actuales</option><option value="add">Agregar a los datos actuales</option></select>
          {importEncrypted&&<><label className="field-label" style={{marginTop:11}} htmlFor="backup-alias">Alias usado para cifrar la copia</label><input className="field" id="backup-alias" required value={importAlias} onChange={e=>setImportAlias(e.target.value)} placeholder="Alias de la copia" data-testid="input-import-alias"/></>}
          <button className="button button-primary" disabled={!importFile||importBusy} style={{width:'100%',marginTop:13,opacity:(!importFile||importBusy)? .55:1}} onClick={importBackup} data-testid="button-import-backup">{importBusy?'Validando…':'Validar e importar'}</button>
        </div>
      </div>
      <div style={{display:'flex',gap:9,alignItems:'flex-start',padding:13,borderRadius:12,background:'#f2eadf',marginTop:14,color:'#6a6153'}}><ShieldCheck size={17} style={{flex:'0 0 auto'}}/><p style={{fontSize:11,lineHeight:1.55,margin:0}}>Tus archivos no se suben a ningún servidor. Las copias sin cifrar contienen información financiera legible: guárdalas con cuidado.</p></div>
    </section>;
    if(tab==='exportar')return <section className="surface" style={{padding:22}}>
      <PanelHeading eyebrow="TUS DATOS, EN TU FORMATO" title="Exportar movimientos" subtitle="Descarga un CSV separado o un libro Excel XLSX real."/>
      <div style={{maxWidth:590,marginTop:19}}>
        <div className="eyebrow">FORMATO</div><div style={{display:'flex',gap:9,marginTop:9}}><button onClick={()=>setExportFormat('csv')} className={`chip ${exportFormat==='csv'?'chip-active':''}`} data-testid="button-export-csv"><FileText size={16}/> CSV</button><button onClick={()=>setExportFormat('xlsx')} className={`chip ${exportFormat==='xlsx'?'chip-active':''}`} data-testid="button-export-xlsx"><FileSpreadsheet size={16}/> Excel · XLSX</button></div>
        <div className="eyebrow" style={{marginTop:21}}>QUÉ INCLUIR</div><div style={{display:'flex',gap:9,marginTop:9}}><button onClick={()=>setExportAll(true)} className={`chip ${exportAll?'chip-active':''}`} data-testid="button-export-all">Todos los movimientos</button><button onClick={()=>setExportAll(false)} className={`chip ${!exportAll?'chip-active':''}`} data-testid="button-export-range">Rango inclusivo</button></div>
        {!exportAll&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:13}}><label><span className="field-label">Desde · incluido</span><input className="field" type="date" value={exportStart} onChange={e=>setExportStart(e.target.value)} data-testid="input-export-start"/></label><label><span className="field-label">Hasta · incluido</span><input className="field" type="date" value={exportEnd} onChange={e=>setExportEnd(e.target.value)} data-testid="input-export-end"/></label></div>}
        <div style={{padding:14,background:'#f5f2ea',borderRadius:13,marginTop:15,fontSize:12,color:'#6f796f'}}>Formato final: <b>{exportFormat.toUpperCase()}</b> · {exportSelection.length} filas · tamaño aproximado {Math.max(1,Math.ceil(new Blob([JSON.stringify(exportSelection)]).size/1024))} KB{exportFormat==='xlsx'?' en libro de Excel':''}.</div>
        {exportState&&<div role="status" data-testid="status-export" style={{marginTop:13,padding:14,border:'1px solid #e5e0d4',borderRadius:13}}><div style={{display:'flex',justifyContent:'space-between',gap:10,fontSize:12}}><strong>{exportState.status}</strong><span className="mono">{exportState.percent}%</span></div><div className="bar" style={{marginTop:10}}><span style={{width:`${exportState.percent}%`,background:'#528369',transition:'width .3s ease'}}/></div>{exportState.size!==undefined&&<div style={{fontSize:11,color:'#737c73',marginTop:6}}>Tamaño {exportState.percent===100?'exacto':'estimado'}: {(exportState.size/1024).toFixed(1)} KB</div>}</div>}
        <button className="button button-primary" onClick={exportMovements} style={{marginTop:15,width:'100%'}} data-testid="button-export-movements"><Download size={16}/> Preparar descarga</button>
        <p style={{fontSize:11,color:'#7a8278',lineHeight:1.5}}>Se incluirán fecha, tipo, importe, moneda EUR, categoría, nota y origen. No cierres esta ventana hasta que finalice la exportación.</p>
      </div>
    </section>;
    if(tab==='historial')return <section className="surface" style={{padding:22}}>
      <PanelHeading eyebrow="PUNTOS DE RESTAURACIÓN LOCALES" title="Historial de copias" subtitle="Cada versión conserva movimientos, categorías, ámbitos y reglas." action={<button className="button button-primary" onClick={createSnapshot} data-testid="button-create-snapshot"><Plus size={16}/> Guardar versión</button>}/>
      {!data.versiones.length?<EmptyState title="Aún no hay versiones guardadas" text="Crea una versión antes de hacer cambios importantes. Se conserva solo en este dispositivo."/>:<div style={{display:'grid',gap:10,marginTop:18}}>{data.versiones.map(v=><div key={v.id} data-testid={`snapshot-row-${v.id}`} style={{display:'flex',alignItems:'center',gap:13,padding:14,border:'1px solid #e8e3d9',borderRadius:14,background:'#fffdf8',flexWrap:'wrap'}}><div style={{width:39,height:39,borderRadius:13,display:'grid',placeItems:'center',background:'#e8eee7',color:'#477357'}}><FileArchive size={17}/></div><div style={{flex:1,minWidth:150}}><strong style={{fontSize:13}}>{new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v.fecha))}</strong><div className="mono" style={{fontSize:10,color:'#81877e',marginTop:4}}>ID {v.id} · {(v.size/1024).toFixed(1)} KB</div></div><button className="button button-quiet" onClick={()=>downloadSnapshot(v)} data-testid={`button-download-snapshot-${v.id}`} style={{minHeight:37,padding:'0 10px',fontSize:11}}><Download size={14}/> Descargar</button><button className="button button-quiet" onClick={()=>setRestoreVersion(v)} data-testid={`button-restore-snapshot-${v.id}`} style={{minHeight:37,padding:'0 10px',fontSize:11}}><RotateCcw size={14}/> Restaurar</button></div>)}</div>}
    </section>;
    return <section className="surface" style={{padding:22,borderColor:'#e6c4b9'}}>
      <PanelHeading eyebrow="UNA DECISIÓN IRREVERSIBLE" title="Zona de peligro" subtitle="Elimina únicamente el espacio local de este usuario."/>
      <div style={{marginTop:18,padding:18,borderRadius:16,background:'#f8ebe6',border:'1px solid #e9d3ca'}}><div style={{display:'flex',alignItems:'center',gap:9,color:'#9b4438'}}><Trash2 size={18}/><strong>Eliminar todos mis datos</strong></div><p style={{fontSize:13,lineHeight:1.6,color:'#765f58'}}>Se borrarán de este dispositivo tus movimientos, categorías, ámbitos, reglas y versiones. No afecta a otros usuarios. La acción no se puede deshacer.</p><button className="button button-danger" onClick={()=>{setDangerOpen(true);setConfirmText('');setChecked(false);}} data-testid="button-open-danger">Revisar y continuar</button></div>
      {dangerOpen&&<Modal title="Eliminar mi espacio local" subtitle="Esta acción es permanente y no se puede deshacer." onClose={()=>setDangerOpen(false)}>
        <div style={{padding:14,borderRadius:13,background:'#f7e9e3',fontSize:12,lineHeight:1.55,color:'#7d463b'}}>Antes de continuar, puedes descargar una copia ZIP desde la pestaña «Copia local». La eliminación solo afecta a <b>{user?.alias}</b>.</div>
        <button className="button button-secondary" style={{width:'100%',marginTop:12}} onClick={()=>{setReturnToDanger(true);setDangerOpen(false);setTab('copias');}} data-testid="button-danger-export"><Download size={15}/> Exportar copia y volver aquí</button>
        <label className="field-label" htmlFor="danger-confirm" style={{marginTop:17}}>Escribe exactamente ELIMINAR MIS DATOS</label><input id="danger-confirm" className="field" value={confirmText} onChange={e=>setConfirmText(e.target.value)} data-testid="input-danger-confirm"/>
        <label style={{display:'flex',gap:9,alignItems:'center',fontSize:12,marginTop:13}}><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} data-testid="checkbox-danger-confirm"/> Entiendo que mis datos se borrarán permanentemente.</label>
        <button className="button button-danger" disabled={confirmText!=='ELIMINAR MIS DATOS'||!checked} style={{width:'100%',marginTop:16,opacity:confirmText==='ELIMINAR MIS DATOS'&&checked?1:.45}} onClick={deleteAll} data-testid="button-confirm-delete-all"><Trash2 size={16}/> Borrar definitivamente mi espacio</button>
      </Modal>}
    </section>;
  };
  return <div className="page-enter">
    <div style={{marginBottom:19}}><div className="eyebrow">TU ESPACIO LOCAL</div><h1 className="display" style={{fontSize:'clamp(31px,5vw,42px)',margin:'4px 0'}}>Configuración</h1><p style={{margin:'5px 0 0',fontSize:13,color:'#737c73'}}>Todo se guarda cifrado y separado en este dispositivo.</p><div role="note" data-testid="text-local-encryption-limitation" style={{marginTop:12,padding:'11px 13px',borderRadius:12,background:'#efe9db',fontSize:11,lineHeight:1.55,color:'#667267'}}>Usamos tu alias para derivar la clave de cifrado. Un alias no es una contraseña ni un secreto: no brinda protección fuerte frente a alguien que conozca el alias y tenga acceso a este dispositivo o a una copia.</div></div>
    <div style={{display:'grid',gridTemplateColumns:'190px minmax(0,1fr)',gap:16,alignItems:'start'}}>
      <nav aria-label="Secciones de configuración" style={{display:'grid',gap:4,position:'sticky',top:84}}>{categoryTabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} data-testid={`settings-tab-${t.id}`} className={tab===t.id?'nav-active':''} style={{display:'flex',alignItems:'center',gap:9,textAlign:'left',border:0,borderRadius:12,padding:'11px 12px',background:tab===t.id?'#e5eee8':'transparent',color:t.id==='peligro'?'#a95348':'#66736a',fontSize:12,fontWeight:700}}>{t.icon}{t.name}</button>)}</nav>
      <div style={{minWidth:0}}>{renderTab()}</div>
    </div>
    {categoryEdit!==false&&<CategoryEditor category={categoryEdit||undefined} onClose={()=>setCategoryEdit(false)} onSave={saveCategory}/>}
      {categoryDelete&&<Modal title={`Eliminar «${categoryDelete.nombre}»`} onClose={()=>setCategoryDelete(null)} subtitle="Antes de eliminar, decide qué hacer con los datos asociados.">
      {(data.movimientos.some(m=>m.categoriaId===categoryDelete.id)||data.reglas.some(r=>r.categoriaId===categoryDelete.id))?<><p style={{fontSize:13,color:'#6e796f'}}>Hay {data.movimientos.filter(m=>m.categoriaId===categoryDelete.id).length} movimientos y {data.reglas.filter(r=>r.categoriaId===categoryDelete.id).length} reglas recurrentes asociadas. Elige otra categoría antes de confirmar.</p><label className="field-label" htmlFor="reassign-category">Reasignar movimientos y reglas a</label><select className="field" id="reassign-category" value={reassign} onChange={e=>setReassign(e.target.value)} data-testid="select-reassign-category"><option value="">Elige una categoría</option>{data.categorias.filter(c=>c.id!==categoryDelete.id&&(c.tipo==='ambos'||c.tipo===categoryDelete.tipo)).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></>:<p style={{fontSize:13,color:'#6e796f'}}>Esta categoría no tiene movimientos ni reglas asociados.</p>}
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:19}}><button className="button button-quiet" onClick={()=>setCategoryDelete(null)} data-testid="button-cancel-category-delete">Cancelar</button><button className="button button-danger" onClick={removeCategory} disabled={(data.movimientos.some(m=>m.categoriaId===categoryDelete.id)||data.reglas.some(r=>r.categoriaId===categoryDelete.id))&&!reassign} data-testid="button-confirm-category-delete">Eliminar categoría</button></div>
    </Modal>}
    {scopeEdit!==false&&<ScopeEditor scope={scopeEdit||undefined} onClose={()=>setScopeEdit(false)} onSave={addScope}/>}
    {ruleEdit!==false&&<RuleEditor rule={ruleEdit||undefined} categories={data.categorias} onClose={()=>setRuleEdit(false)} onSave={saveRule}/>}
    {restoreVersion&&<Modal title="Restaurar esta versión" subtitle="El estado actual se guardará antes de sustituirse." onClose={()=>setRestoreVersion(null)}><div style={{padding:14,borderRadius:13,background:'#f4f1e9',fontSize:12,lineHeight:1.55}}>Se restaurará la versión <b>{restoreVersion.id}</b> del {new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short'}).format(new Date(restoreVersion.fecha))}. Crearemos automáticamente una versión con tu estado actual para que puedas volver atrás.</div><div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:18}}><button className="button button-quiet" onClick={()=>setRestoreVersion(null)} data-testid="button-cancel-restore">Cancelar</button><button className="button button-primary" onClick={()=>restore(restoreVersion)} data-testid="button-confirm-restore">Sí, restaurar versión</button></div></Modal>}
    <style>{'@media(max-width:740px){.page-enter > div:nth-of-type(2){grid-template-columns:1fr!important}.page-enter nav[aria-label="Secciones de configuración"]{display:flex!important;overflow:auto;position:static!important;padding-bottom:4px}.page-enter nav[aria-label="Secciones de configuración"] button{flex:0 0 auto}.page-enter .surface{padding:17px!important}}'}</style>
  </div>;
}

function PanelHeading({eyebrow,title,subtitle,action}:{eyebrow:string;title:string;subtitle:string;action?:ReactNode}){
  return <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:14,flexWrap:'wrap'}}><div><div className="eyebrow">{eyebrow}</div><h2 className="display" style={{fontSize:27,margin:'4px 0'}}>{title}</h2><p style={{fontSize:12,lineHeight:1.5,color:'#737c73',margin:0,maxWidth:500}}>{subtitle}</p></div>{action}</div>;
}
function CategoryEditor({category,onClose,onSave}:{category?:Categoria;onClose:()=>void;onSave:(c:Categoria)=>void}){
  const [name,setName]=useState(category?.nombre||''),[icon,setIcon]=useState(category?.icono||'◉'),[color,setColor]=useState(category?.color||'#d59168'),[type,setType]=useState<Categoria['tipo']>(category?.tipo||'gasto');
  const submit=(e:FormEvent)=>{e.preventDefault();if(!name.trim())return;onSave({id:category?.id||nuevoId(),nombre:name.trim(),icono:icon.trim()||'•',color,tipo:type});};
  return <Modal title={category?'Editar categoría':'Crear categoría'} onClose={onClose}><form onSubmit={submit}><label className="field-label" htmlFor="category-name">Nombre</label><input id="category-name" className="field" value={name} onChange={e=>setName(e.target.value)} required data-testid="input-category-name"/><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:13}}><div><label className="field-label" htmlFor="category-icon">Símbolo</label><input id="category-icon" className="field" value={icon} onChange={e=>setIcon(e.target.value)} maxLength={3} data-testid="input-category-icon"/></div><div><label className="field-label" htmlFor="category-color">Color</label><input id="category-color" className="field" type="color" value={color} onChange={e=>setColor(e.target.value)} data-testid="input-category-color"/></div></div><label className="field-label" style={{marginTop:13}} htmlFor="category-type">Tipo</label><select id="category-type" className="field" value={type} onChange={e=>setType(e.target.value as Categoria['tipo'])} data-testid="select-category-type"><option value="gasto">Gasto</option><option value="ingreso">Ingreso</option><option value="ambos">Ambos</option></select><div style={{display:'flex',justifyContent:'flex-end',gap:9,marginTop:20}}><button type="button" className="button button-quiet" onClick={onClose} data-testid="button-cancel-category">Cancelar</button><button type="submit" className="button button-primary" data-testid="button-save-category">Guardar categoría</button></div></form></Modal>;
}
function ScopeEditor({scope,onClose,onSave}:{scope?:Ambito;onClose:()=>void;onSave:(a:Ambito)=>void}){
  const [name,setName]=useState(scope?.nombre||'');
  return <Modal title={scope?'Renombrar ámbito':'Crear ámbito'} onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(name.trim())onSave({id:scope?.id||nuevoId(),nombre:name.trim(),archivado:scope?.archivado||false});}}><label className="field-label" htmlFor="scope-name">Nombre del ámbito</label><input id="scope-name" className="field" autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Por ejemplo, Viaje de verano" required data-testid="input-scope-name"/><div style={{display:'flex',justifyContent:'flex-end',gap:9,marginTop:19}}><button type="button" className="button button-quiet" onClick={onClose} data-testid="button-cancel-scope">Cancelar</button><button className="button button-primary" type="submit" data-testid="button-save-scope">Guardar</button></div></form></Modal>;
}
function RuleEditor({rule,categories,onClose,onSave}:{rule?:Regla;categories:Categoria[];onClose:()=>void;onSave:(r:Regla)=>void}){
  const [type,setType]=useState<Tipo>(rule?.tipo||'gasto'),[amount,setAmount]=useState(rule?String(rule.importe).replace('.',','):''),[category,setCategory]=useState(rule?.categoriaId||''),[frequency,setFrequency]=useState<Regla['frecuencia']>(rule?.frecuencia||'mensual'),[start,setStart]=useState(rule?.fechaInicio||hoyISO()),[end,setEnd]=useState(rule?.fechaFin||''),[day,setDay]=useState(String(rule?.diaEjecucion??(rule?.frecuencia==='semanal'?(new Date().getDay()+6)%7+1:new Date().getDate()))),[note,setNote]=useState(rule?.nota||''),[active,setActive]=useState(rule?.activa??true);
  const submit=(e:FormEvent)=>{e.preventDefault();if(!safeAmount(amount)){alert('El importe debe ser mayor que cero y tener hasta dos decimales.');return;}if(type==='gasto'&&!category){alert('Un gasto recurrente necesita categoría.');return;}if(end&&end<start){alert('La fecha final no puede ser anterior a la inicial.');return;}onSave({id:rule?.id||nuevoId(),tipo:type,importe:moneyInput(amount),categoriaId:category||undefined,frecuencia:frequency,fechaInicio:start,fechaFin:end||undefined,diaEjecucion:Number(day),nota:note.trim()||undefined,activa:active});};
  return <Modal title={rule?'Editar regla':'Nueva regla recurrente'} subtitle="Los movimientos ya generados no cambiarán." onClose={onClose}><form onSubmit={submit}><div style={{display:'flex',gap:8,marginBottom:14}}>{(['gasto','ingreso'] as Tipo[]).map(t=><button type="button" key={t} className={`chip ${type===t?'chip-active':''}`} onClick={()=>setType(t)} data-testid={`rule-type-${t}`}>{t==='gasto'?'Gasto':'Ingreso'}</button>)}</div><label className="field-label" htmlFor="rule-amount">Importe en EUR</label><input id="rule-amount" className="field" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00" data-testid="input-rule-amount"/><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:11,marginTop:12}}><label><span className="field-label">Frecuencia</span><select className="field" value={frequency} onChange={e=>{const value=e.target.value as Regla['frecuencia'];setFrequency(value);if(value==='semanal')setDay(String((new Date().getDay()+6)%7+1));}} data-testid="select-rule-frequency"><option value="diaria">Diaria</option><option value="semanal">Semanal</option><option value="mensual">Mensual</option><option value="anual">Anual</option></select></label><label><span className="field-label">Día de ejecución {frequency==='semanal'?'· lunes 1 — domingo 7':''}</span><input className="field" type="number" min="1" max={frequency==='semanal'?7:31} value={day} onChange={e=>setDay(e.target.value)} data-testid="input-rule-day"/></label></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:11,marginTop:12}}><label><span className="field-label">Fecha inicial</span><input className="field" type="date" value={start} onChange={e=>setStart(e.target.value)} data-testid="input-rule-start"/></label><label><span className="field-label">Fecha final · opcional</span><input className="field" type="date" value={end} onChange={e=>setEnd(e.target.value)} data-testid="input-rule-end"/></label></div><label className="field-label" style={{marginTop:12}} htmlFor="rule-category">Categoría {type==='gasto'?'· obligatoria':'· opcional'}</label><select id="rule-category" className="field" value={category} onChange={e=>setCategory(e.target.value)} data-testid="select-rule-category"><option value="">Sin categoría</option>{categories.filter(c=>c.tipo==='ambos'||c.tipo===type).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select><label className="field-label" htmlFor="rule-note" style={{marginTop:12}}>Nota opcional</label><input id="rule-note" className="field" value={note} onChange={e=>setNote(e.target.value)} data-testid="input-rule-note"/><label style={{display:'flex',alignItems:'center',gap:9,fontSize:12,marginTop:12}}><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)} data-testid="checkbox-rule-active"/> Regla activa</label><div style={{display:'flex',justifyContent:'flex-end',gap:9,marginTop:18}}><button type="button" className="button button-quiet" onClick={onClose} data-testid="button-cancel-rule">Cancelar</button><button type="submit" className="button button-primary" data-testid="button-save-rule">Guardar regla</button></div></form></Modal>;
}
function NotFound(){return <div className="surface" style={{maxWidth:560,margin:'10vh auto',padding:30,textAlign:'center'}}><div className="eyebrow">PÁGINA NO ENCONTRADA</div><h1 className="display">No encontramos ese lugar.</h1><Link href="/" className="button button-primary" data-testid="link-home">Volver al inicio</Link></div>;}

function Root(){
  return <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><App/></WouterRouter>;
}
export default Root;
