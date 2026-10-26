/* ISIS Ojos - armado de las planillas en PDF.
   Dos formatos:
     'cuadrantes' -> los cuatro locales en una sola A4 horizontal, en cuatro cuadrantes.
     'porLocal'   -> una hoja entera por local (una o las cuatro, en un mismo PDF).
   En los dos casos: lunes a sabado, manana y tarde, hasta cuatro personas por turno.
   Nunca se niega a armar la hoja. Si algo no entra en la celda, primero achica la
   letra, despues usa el nombre de pila con la referencia completa al pie, y recien
   al final manda los horarios propios y las pausas a un ANEXO aparte, que se baja
   por separado. No se pierde informacion. */
(function(root){'use strict';

const DAYS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const SHIFTS={morning:'Mañana',afternoon:'Tarde'};
const PURPLE=[75,49,85];
const LOGO='data:image/jpeg;base64,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';
const MODES=[{id:'inline',bonus:4},{id:'stacked',bonus:3},{id:'horas',bonus:1.5},{id:'marker',bonus:0}];
const LEVELS=[0,1,2,3];
const GEO={
 cuadrantes:{margin:8,gapX:5,gapY:3,top:23,cols:2,rows:2,shiftWidth:13,padTexto:2.5,bottomLimit:204,
  headH:9.2,dayH:6.5,tituloFs:10.5,diaFs:6.6,pieFs:6.2,horaFs:6,fonts:[8,7.5,7,6.5,6,5.5,5,4.5]},
 porLocal:{margin:10,gapX:0,gapY:0,top:27,cols:1,rows:1,shiftWidth:23,padTexto:4,bottomLimit:198,
  headH:13,dayH:9,tituloFs:15,diaFs:9,pieFs:8,horaFs:8,fonts:[12,11,10,9,8,7.5,7,6.5,6,5.5]}
};

const hm=s=>String(s||'').replace(/^0(\d)/,'$1');
/* Mismo calculo que OJOS_HORARIOS.turnoDe: el horario del turno ese dia. */
function turnoDe(branch,shift,day){
 const base=(branch&&branch[shift])||{};
 const propio=branch&&branch.dias&&branch.dias[day]&&branch.dias[day][shift];
 if(!propio)return {start:base.start,end:base.end,slots:base.slots,propio:false};
 return {start:propio.start||base.start,end:propio.end||base.end,
  slots:Number.isInteger(propio.slots)?propio.slots:base.slots,propio:true};
}
const esc=s=>String(s==null?'':s);

function labelsFor(employees,level){
 const map={};
 employees.forEach((e,i)=>{
  const parts=esc(e.name||'Empleada').trim().split(/\s+/).filter(Boolean);
  const first=parts[0]||'Empleada',last=parts.length>1?parts[parts.length-1]:'';
  map[e.id]=level===0?esc(e.name||first)
   :level===1?first
   :level===2?(first+(last?' '+last[0].toUpperCase()+'.':''))
   :String(i+1);
 });
 return map;
}
function unique(map){const v=Object.values(map);return new Set(v.map(x=>x.toLowerCase())).size===v.length;}

function cellTexts(mode,label,hours,pause){
 if(!hours&&!pause)return [label];
 if(mode==='inline')return [label+(hours?' '+hours:'')+(pause?' (pausa '+pause+')':'')];
 if(mode==='stacked'){const out=[label];if(hours)out.push(hours);if(pause)out.push('p '+pause);return out;}
 if(mode==='horas'){const out=[label+(pause?' *':'')];if(hours)out.push(hours);return out;}
 return [label+' *'];
}
const movesDetail=(mode,hours,pause)=>mode==='marker'?!!(hours||pause):mode==='horas'?!!pause:false;

function build(input){
 const jsPDF=input.jsPDF||(root.jspdf&&root.jspdf.jsPDF);
 if(!jsPDF)throw Error('No se pudo cargar la herramienta de PDF. Volvé a abrir la página.');
 const todos=input.branches||[],employees=input.employees||[],assignments=input.assignments||[];
 const layout=input.layout==='porLocal'?'porLocal':'cuadrantes';
 const elegidos=Array.isArray(input.branchIds)&&input.branchIds.length
  ?todos.filter(b=>input.branchIds.indexOf(b.id)>=0):todos;
 const branches=layout==='cuadrantes'?todos:elegidos;
 const periodLabel=esc(input.periodLabel),mode=esc(input.mode||'BORRADOR'),dayNumbers=input.dayNumbers||[];
 const byId={};employees.forEach(e=>{byId[e.id]=e;});
 const g=Object.assign({},GEO[layout]);
 const hayDiasPropios=branches.some(b=>b&&b.dias&&Object.keys(b.dias).length);
 if(hayDiasPropios)g.dayH+=3.4;
 const d=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});

 const qw=(297-g.margin*2-g.gapX*(g.cols-1))/g.cols;
 const cw=(qw-g.shiftWidth)/6,tw=cw-g.padTexto;
 const legendWidth=297-g.margin*2;

 const wrap=(t,f)=>{d.setFont('helvetica','normal');d.setFontSize(f);return d.splitTextToSize(String(t),tw);};
 const widest=(ls,f)=>{d.setFont('helvetica','normal');d.setFontSize(f);return ls.reduce((n,l)=>Math.max(n,d.getTextWidth(l)),0);};

 function cellsOf(branch,shift){
  return DAYS.map((_,day)=>assignments
   .filter(a=>a.branchId===branch.id&&a.day===day&&a.shift===shift)
   .sort((a,b)=>String(a.start).localeCompare(String(b.start)))
   .map(a=>{
    const emp=byId[a.employeeId],std=turnoDe(branch,shift,day);
    const custom=a.start!==std.start||a.end!==std.end;
    return {a,emp,hours:custom?hm(a.start)+'-'+hm(a.end):'',pause:a.pauseStart?hm(a.pauseStart)+'-'+hm(a.pauseEnd):''};
   }));
 }
 const grid=branches.map(b=>({b,shifts:Object.keys(SHIFTS).map(s=>({s,cells:cellsOf(b,s)}))}));

 /* Solo entran en la referencia las personas que aparecen en estas hojas. */
 const enHoja=new Set();
 grid.forEach(q=>q.shifts.forEach(sh=>sh.cells.forEach(p=>p.forEach(x=>enHoja.add(x.a.employeeId)))));
 const equipo=employees.filter(e=>enHoja.has(e.id));

 function legendTextFor(labels,level){
  if(!level||!equipo.length)return '';
  return (level===3?'Referencia del equipo: ':'Nombres completos: ')+
   equipo.map(e=>labels[e.id]+' = '+esc(e.name)).join('  ·  ');
 }
 function legendHeight(text,font){
  if(!text)return 0;
  d.setFont('helvetica','normal');d.setFontSize(font);
  return d.splitTextToSize(text,legendWidth).length*font*0.3528*1.15+1.5;
 }

 const candidates=[];
 for(const m of MODES)for(const level of LEVELS)for(const font of g.fonts)
  candidates.push({mode:m.id,level,font,bonus:m.bonus,score:font*10+m.bonus-[0,0.6,1.2,6][level],
   /* por local: nombre completo primero; despues, dejar todo dentro de la celda
      mientras la letra siga siendo legible (8 pt o mas); recien ahi, el anexo. */
   orden:[level,font>=8?0:1,-m.bonus,-font]});
 /* En la hoja por local hay lugar de sobra: primero el nombre completo, aunque
    haya que achicar la letra. En los cuatro cuadrantes la columna es angosta,
    asi que ahi manda que se lea, con la referencia de nombres al pie. */
 candidates.sort(layout==='porLocal'
  ?(a,b)=>{for(let i=0;i<4;i++)if(a.orden[i]!==b.orden[i])return a.orden[i]-b.orden[i];return 0;}
  :(a,b)=>b.score-a.score);

 function evaluate(c){
  const labels=labelsFor(employees,c.level);
  if(c.level&&!unique(labels))return null;
  const legend=legendTextFor(labels,c.level),legendFont=Math.max(5.5,Math.min(g.pieFs+0.3,c.font));
  const legendH=legendHeight(legend,legendFont);
  const qh=(g.bottomLimit-(legendH?legendH+2:0)-g.top-g.gapY*(g.rows-1))/g.rows;
  const budget=qh-(g.headH+g.dayH+6);
  if(budget<10)return null;
  const line=c.font*0.3528*1.1,pad=Math.max(0.8,c.font*0.12),blockPad=g.headH*0.35;
  const plan=[];
  for(const q of grid){
   const blocks=[];
   for(const sh of q.shifts){
    const cells=sh.cells.map(people=>people.map(p=>{
     const texts=cellTexts(c.mode,labels[p.a.employeeId]||'Empleada',p.hours,p.pause);
     const lines=[].concat(...texts.map(t=>wrap(t,c.font)));
     if(widest(lines,c.font)>tw+0.35)return null;
     return {p,lines};
    }));
    if(cells.some(people=>people.some(x=>!x)))return null;
    const height=Math.max(g.dayH*2,...cells.map(people=>people.reduce((n,x)=>n+x.lines.length*line+pad,0)+blockPad));
    blocks.push({s:sh.s,cells,height});
   }
   const usado=blocks.reduce((n,r)=>n+r.height,0);
   if(usado>budget)return null;
   const sobra=(budget-usado)/blocks.length;blocks.forEach(r=>{r.height+=sobra;});
   plan.push({b:q.b,blocks});
  }
  return {...c,labels,legend,legendFont,legendH,qh,line,pad,plan};
 }

 let chosen=null;
 for(const c of candidates){const r=evaluate(c);if(r){chosen=r;break;}}
 if(!chosen){
  const labels=labelsFor(employees,3),font=g.fonts[g.fonts.length-1];
  chosen={mode:'marker',level:3,font,labels,legend:legendTextFor(labels,3),legendFont:5.5,legendH:0,
   qh:(g.bottomLimit-g.top)/g.rows,line:font*0.3528*1.1,pad:0.8,plan:null,clip:true};
 }

 /* Lo que salio de las celdas va al ANEXO, que se baja por separado. */
 const groups=[];let details=0;
 branches.forEach(b=>Object.keys(SHIFTS).forEach(s=>{
  const rows=[];
  cellsOf(b,s).forEach((people,day)=>people.forEach(p=>{
   if(!movesDetail(chosen.mode,p.hours,p.pause))return;
   rows.push(DAYS[day].slice(0,3)+' '+(dayNumbers[day]||'')+'  '+esc(p.emp&&p.emp.name||'Empleada')+
    (p.hours?'  '+p.hours:'  horario del turno')+(p.pause?'  ·  pausa '+p.pause:''));
  }));
  if(rows.length){groups.push({title:esc(b.name)+' · '+SHIFTS[s],rows});details+=rows.length;}
 }));

 const qh=chosen.qh;
 function encabezado(sub){
  d.setFillColor.apply(d,PURPLE);d.rect(0,0,297,2.5,'F');
  var anchoLogo=0;
  try{d.addImage(LOGO,'JPEG',9,6,24,7.8);anchoLogo=27;}catch(e){anchoLogo=0;}
  d.setTextColor.apply(d,PURPLE);d.setFont('helvetica','bold');d.setFontSize(15);
  d.text('Ojos',9+anchoLogo,12.3);
  d.setFontSize(9.5);d.text(sub,9+anchoLogo+16,12.3);
  d.setFont('helvetica','normal');d.setFontSize(8.5);d.setTextColor.apply(d,PURPLE);d.text(periodLabel,9,19.5);
  d.setFontSize(8);d.text(mode,288,11,{align:'right'});
  d.setFontSize(6.8);d.setTextColor(110);d.text('Lunes a sábado · Mañana y tarde',288,19.5,{align:'right'});
 }
 function cuadrante(q,x,y){
  d.setDrawColor(219,211,222);d.setFillColor(255);d.roundedRect(x,y,qw,qh,2,2,'FD');
  d.setFillColor(244,237,245);d.rect(x+.3,y+.3,qw-.6,g.headH,'F');
  d.setFont('helvetica','bold');d.setFontSize(g.tituloFs);d.setTextColor.apply(d,PURPLE);
  d.text(esc(q.b.name),x+3,y+g.headH*0.72);
  let ty=y+g.headH;
  d.setFontSize(g.diaFs);d.setFont('helvetica','bold');d.setTextColor(85);
  d.text('Turno',x+2,ty+g.dayH*0.68);
  DAYS.forEach((name,i)=>{
   const cx=x+g.shiftWidth+cw*i+cw/2;
   d.setFont('helvetica','bold');d.setFontSize(g.diaFs);d.setTextColor(85);
   d.text(name.slice(0,3)+' '+(dayNumbers[i]||''),cx,ty+(hayDiasPropios?g.dayH*0.44:g.dayH*0.68),{align:'center'});
   if(hayDiasPropios){
    const m=turnoDe(q.b,'morning',i),t=turnoDe(q.b,'afternoon',i);
    d.setFont('helvetica','normal');d.setFontSize(Math.max(5,g.diaFs-1.2));
    d.setTextColor(m.propio||t.propio?150:170);
    d.text(hm(m.start)+'–'+hm(t.end),cx,ty+g.dayH*0.86,{align:'center'});
   }
  });
  d.setFont('helvetica','bold');d.setFontSize(g.diaFs);d.setTextColor(85);
  ty+=g.dayH;
  for(const row of q.blocks){
   d.setDrawColor(229,224,231);d.line(x,ty,x+qw,ty);
   d.setFillColor(250,247,250);d.rect(x+.3,ty,g.shiftWidth-.3,row.height,'F');
   d.setFont('helvetica','bold');d.setTextColor.apply(d,PURPLE);d.setFontSize(g.diaFs);
   d.text(SHIFTS[row.s],x+1.8,ty+g.dayH*0.7);
   d.setFont('helvetica','normal');d.setFontSize(g.horaFs);
   const std=q.b[row.s]||{};
   d.text(hm(std.start)||'',x+1.8,ty+g.dayH*0.7+g.horaFs*0.62);
   d.text(hm(std.end)||'',x+1.8,ty+g.dayH*0.7+g.horaFs*1.18);
   row.cells.forEach((people,i)=>{
    const xx=x+g.shiftWidth+cw*i;d.line(xx,ty,xx,ty+row.height);
    let yy=ty+chosen.line*1.1;d.setTextColor(48,43,54);d.setFont('helvetica','normal');d.setFontSize(chosen.font);
    if(!people.length){d.setTextColor(145);d.text('Sin asignar',xx+1.4,yy);}
    for(const item of people){d.text(item.lines,xx+1.4,yy,{lineHeightFactor:1.1});yy+=item.lines.length*chosen.line+chosen.pad;}
   });
   ty+=row.height;
  }
  d.setDrawColor(229,224,231);d.line(x,ty,x+qw,ty);
  d.setFontSize(g.pieFs);d.setTextColor(120);
  d.text('Mañana: '+((q.b.morning||{}).slots||0)+' personas · Tarde: '+((q.b.afternoon||{}).slots||0)+' personas',x+2,y+qh-2.4);
 }
 function pie(){
  let footY=g.top+qh*g.rows+g.gapY*(g.rows-1)+4;
  if(chosen.legend){
   d.setFont('helvetica','normal');d.setFontSize(chosen.legendFont);d.setTextColor(95);
   const lines=d.splitTextToSize(chosen.legend,legendWidth);
   d.text(lines,g.margin,footY,{lineHeightFactor:1.15});
   footY+=lines.length*chosen.legendFont*0.3528*1.15+1.5;
  }
  const hayPausa=assignments.some(a=>a.pauseStart);
  d.setFontSize(6.6);d.setTextColor(120);
  d.text(mode+'. Las horas que aparecen junto al nombre son distintas al turno'+
   (hayPausa&&chosen.mode!=='inline'?'; "p" es la pausa.':'.')+
   (details?' Los horarios propios y las pausas están en el anexo, que se baja aparte.':'')+
   (chosen.mode==='marker'||chosen.mode==='horas'?' El asterisco (*) marca a quien tiene detalle.':''),
   g.margin,Math.min(footY,207));
  return Math.min(footY,207);
 }

 const dibujo=chosen.plan||branches.map(b=>({b,blocks:[]}));
 if(layout==='cuadrantes'){
  encabezado('Planilla de horarios');
  dibujo.forEach((q,i)=>cuadrante(q,g.margin+(i%2)*(qw+g.gapX),g.top+Math.floor(i/2)*(qh+g.gapY)));
  const fy=pie();
  d.setFontSize(6.6);d.setTextColor(120);d.text('1 / 1',289,fy,{align:'right'});
 }else{
  dibujo.forEach((q,i)=>{
   if(i)d.addPage('a4','landscape');
   encabezado('Planilla de '+esc(q.b.name));
   cuadrante(q,g.margin,g.top);
   const fy=pie();
   d.setFontSize(6.6);d.setTextColor(120);d.text((i+1)+' / '+dibujo.length,289,fy,{align:'right'});
  });
 }
 d.setPage(1);
 return {doc:d,groups,plan:{layout,mode:chosen.mode,level:chosen.level,font:chosen.font,
  legend:!!chosen.legend,details,pages:d.getNumberOfPages(),locales:branches.length,
  clip:!!chosen.clip,cellWidth:+tw.toFixed(2)}};
}

/* El anexo es un PDF aparte: solo los horarios propios y las pausas. */
function annex(input,groups){
 if(!groups||!groups.length)return null;
 const jsPDF=input.jsPDF||(root.jspdf&&root.jspdf.jsPDF);
 if(!jsPDF)throw Error('No se pudo cargar la herramienta de PDF. Volvé a abrir la página.');
 const d=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
 const margin=10,cols=2,colW=(297-margin*2-8)/cols,fs=7.4,lh=fs*0.3528*1.3;
 let col=0,yy=0,primera=true;
 function hoja(){
  if(!primera)d.addPage('a4','landscape');primera=false;
  d.setFillColor.apply(d,PURPLE);d.rect(0,0,297,2.5,'F');
  d.setTextColor.apply(d,PURPLE);d.setFont('helvetica','bold');d.setFontSize(12.5);
  d.text('Anexo · horarios propios y pausas',9,11.5);
  d.setFont('helvetica','normal');d.setFontSize(8);d.setTextColor(110);
  d.text(esc(input.periodLabel)+' · '+esc(input.mode||''),9,17.5);
  col=0;yy=24;
 }
 hoja();
 const hueco=alto=>{if(yy+alto<=200)return;col++;yy=24;if(col>=cols)hoja();};
 for(const grupo of groups){
  hueco(lh*2.5);
  d.setFont('helvetica','bold');d.setFontSize(fs+0.6);d.setTextColor.apply(d,PURPLE);
  d.text(grupo.title,margin+col*(colW+8),yy);yy+=lh*1.3;
  d.setFont('helvetica','normal');d.setFontSize(fs);d.setTextColor(48,43,54);
  for(const text of grupo.rows){
   const lines=d.splitTextToSize(text,colW);
   hueco(lines.length*lh);
   if(yy===24){d.setFont('helvetica','bold');d.setFontSize(fs+0.6);d.setTextColor.apply(d,PURPLE);
    d.text(grupo.title+' (sigue)',margin+col*(colW+8),yy);yy+=lh*1.3;
    d.setFont('helvetica','normal');d.setFontSize(fs);d.setTextColor(48,43,54);}
   d.text(lines,margin+col*(colW+8),yy,{lineHeightFactor:1.3});yy+=lines.length*lh+0.3;
  }
  yy+=lh*0.6;
 }
 const total=d.getNumberOfPages();
 for(let p=1;p<=total;p++){d.setPage(p);d.setFontSize(6.6);d.setTextColor(120);d.text(p+' / '+total,289,206,{align:'right'});}
 d.setPage(1);
 return {doc:d,pages:total,count:groups.reduce((n,g)=>n+g.rows.length,0)};
}

root.ISIS_PDF={build,annex,turnoDe,DAYS,SHIFTS};
if(typeof module!=='undefined'&&module.exports)module.exports=root.ISIS_PDF;
})(typeof globalThis!=='undefined'?globalThis:this);
