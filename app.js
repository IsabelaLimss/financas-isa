(()=>{'use strict';
const KEY='controle-emprestimos-v2',OLD_KEY='controle-emprestimos-v1';
const $=id=>document.getElementById(id);
const clone=o=>JSON.parse(JSON.stringify(o));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const present=v=>v!==''&&v!==null&&v!==undefined;
const n=v=>present(v)&&Number.isFinite(Number(v))?Number(v):0;
const cents=v=>Math.round(n(v)*100);
const fromCents=v=>Math.round(v)/100;
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n(v));
const compact=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(n(v));
const perc=v=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(n(v))+'%';
const rateFmt=v=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n(v))+'%';
const brDate=s=>s&&/^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—';
const STATUS=['Pendente','Paga','Parcial','Antecipada','Atrasada'];
let loans=[],selected='resumo',editingId=null;
function valid(data){return Array.isArray(data)&&data.length===9&&new Set(data.map(x=>x.id)).size===9&&data.every(l=>typeof l.id==='string'&&l.id.length<90&&typeof l.name==='string'&&l.name.length<120&&Array.isArray(l.rows)&&l.rows.length>=1&&l.rows.length<=300&&l.rows.every((r,i)=>Number.isInteger(Number(r.num))&&Number(r.num)===i+1&&r.num<=300));}
function normalise(data){return data.map(l=>({...l,amount:present(l.amount)?n(l.amount):'',rate:present(l.rate)?n(l.rate):(l.id==='nubank'?0.0295:''),n:present(l.n)?Math.trunc(n(l.n)):'',monthly:present(l.monthly)?n(l.monthly):'',officialTotal:present(l.officialTotal)?n(l.officialTotal):'',waived:present(l.waived)?n(l.waived):'',iof:present(l.iof)?n(l.iof):'',cet:present(l.cet)?n(l.cet):'',startDate:l.startDate||'',notes:l.notes||'',totalNature:l.totalNature||(present(l.officialTotal)?'contratual':'calculado'),rows:l.rows.map(r=>({...r,actual:present(r.actual)?n(r.actual):'',discount:present(r.discount)?n(r.discount):'',late:present(r.late)?n(r.late):'',expected:present(r.expected)?n(r.expected):'',status:STATUS.includes(r.status)?r.status:'Pendente',observations:r.observations||'',due:r.due||'',datePaid:r.datePaid||''}))}));}
function init(){let saved=null;
  for(const key of [KEY,OLD_KEY]){try{const d=JSON.parse(localStorage.getItem(key));if(valid(d)){saved=d;break}}catch{}}
  if(!saved&&valid(window.INITIAL_LOANS))saved=window.INITIAL_LOANS;
  loans=saved?normalise(saved):[];
  const nubank=loans.find(l=>l.id==='nubank');
  if(nubank&&!present(nubank.rate))nubank.rate=0.0295;
  if(saved){try{localStorage.setItem(KEY,JSON.stringify(loans))}catch{}}
  $('save-status').textContent=loans.length?'Dados salvos neste navegador':'Aguardando importação dos dados';
}
function save(){window.dispatchEvent(new Event('finance-data-changed'));try{localStorage.setItem(KEY,JSON.stringify(loans));$('save-status').textContent='Dados salvos neste navegador';return true}catch{$('save-status').textContent='Não foi possível salvar';notice('Não foi possível salvar. Exporte um backup.');return false}}
function notice(msg){const area=$('toast-area');area.innerHTML='<div class="toast">'+esc(msg)+'</div>';clearTimeout(notice.timer);notice.timer=setTimeout(()=>area.innerHTML='',3500)}
function actualC(r){return cents(r.actual)}
function expectedC(r){return cents(r.expected)}
function discountC(r){return cents(r.discount)}
function lateC(r){return cents(r.late)}
function balanceC(r){return Math.max(0,expectedC(r)+lateC(r)-discountC(r)-actualC(r))}
function completed(r){return (r.status==='Paga'||r.status==='Antecipada')&&balanceC(r)===0&&actualC(r)>0}
function sumRows(l,fn){return l.rows.reduce((a,r)=>a+fn(r),0)}
function paidC(l){return sumRows(l,actualC)}
function remainingC(l){return sumRows(l,balanceC)}
function discountedC(l){return sumRows(l,discountC)}
function lateSumC(l){return sumRows(l,lateC)}
function completedCount(l){return l.rows.filter(completed).length}
function summaryInstallmentC(l){
 if(l.category==='Shopee'||l.id.startsWith('shopee')){
  const values=l.rows.map(expectedC).filter(v=>v>0);
  if(values.length)return Math.max(...values);
 }
 return present(l.monthly)?cents(l.monthly):null;
}
function summaryInstallment(l){
 const amount=summaryInstallmentC(l);
 return amount===null?'<span class="muted">Variável</span>':money(fromCents(amount));
}
function contractC(l){return present(l.officialTotal)?cents(l.officialTotal):sumRows(l,expectedC)}
// Projeção do próximo mês: valores previstos integrais, antes de descontos e juros de atraso.
function forecastMonth(){const d=new Date();return new Date(d.getFullYear(),d.getMonth()+1,1)}
function forecastMonthKey(){const d=forecastMonth();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function forecastMonthlyC(month=forecastMonthKey()){
 return loans.reduce((sum,l)=>{
  // Contrato quitado deixa de compor o compromisso mensal.
  if(remainingC(l)<=0)return sum;
  const rows=l.rows.filter(r=>r.due&&r.due.slice(0,7)===month&&!completed(r));
  if(rows.length)return sum+rows.reduce((a,r)=>a+expectedC(r),0);
  // Consignados sem datas diárias confirmadas continuam mensais enquanto ativos.
  if(l.category==='Consignado'){
   const pending=l.rows.find(r=>balanceC(r)>0);
   return sum+(present(l.monthly)?cents(l.monthly):(pending?expectedC(pending):0));
  }
  return sum;
 },0);
}
function totals(){let out={received:0,monthly:0,paid:0,remaining:0,discount:0,late:0,waived:0,contracted:0,cost:0,active:0,done:0,installments:0};for(const l of loans){out.received+=cents(l.amount);out.paid+=paidC(l);out.remaining+=remainingC(l);out.discount+=discountedC(l);out.late+=lateSumC(l);out.waived+=cents(l.waived);out.contracted+=contractC(l);out.active+=remainingC(l)>0?1:0;out.done+=completedCount(l);out.installments+=l.rows.length;}out.cost=out.contracted-out.received;out.monthly=loans.reduce((sum,l)=>remainingC(l)>0?sum+(summaryInstallmentC(l)??0):sum,0);return out}
const icon=(name)=>{const paths={cash:'<circle cx="12" cy="12" r="9"/><path d="M15 8.6c-.8-.7-1.8-1-3-1-1.9 0-3 .9-3 2.2 0 3.3 6 1.3 6 4.4 0 1.4-1.4 2.3-3.1 2.3-1.3 0-2.5-.3-3.4-1.1M12 5v14"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h2M12 14h2M17 14h1M7 18h2M12 18h2"/>',check:'<path d="m4 12 5 5L20 6"/>',percent:'<circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/><path d="M5 19 19 5"/>',files:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h6"/>'};return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.cash}</svg>`};
function metric(name,label,value,extra=''){return `<article class="metric ${name==='check'?'teal':''}"><div class="metric-icon">${icon(name)}</div><div class="metric-body"><div class="metric-label">${esc(label)}</div><div class="metric-value">${esc(value)}</div>${extra?`<div class="metric-extra">${esc(extra)}</div>`:''}</div></article>`}
function bankBadge(l,large=false){let id=l.id==='nubank'?'nubank':l.id==='bradesco'?'bradesco':l.id==='inter'?'inter':'shopee';const sign=({nubank:'nu',bradesco:'B',inter:'inter',shopee:'SP'})[id];return `<span aria-hidden="true" class="bank-badge ${id} ${large?'large':''}">${sign}</span>`}
function renderTabs(){let el=$('tabs');el.innerHTML=`<button class="tab ${selected==='resumo'?'active':''}" data-tab="resumo" ${selected==='resumo'?'aria-current="page"':''}>Resumo</button>`+loans.map(l=>`<button class="tab ${selected===l.id?'active':''}" data-tab="${esc(l.id)}" ${selected===l.id?'aria-current="page"':''}>${esc(l.name)}</button>`).join('');}
function empty(){return `<div class="empty-state"><div class="empty-mark">▤</div><h2>Seu painel financeiro está pronto</h2><p>Para proteger seus dados, o ZIP público não contém valores de empréstimos nem histórico de pagamentos. Importe o arquivo pessoal de dados fornecido separadamente. A partir daí, os nove contratos aparecerão e serão salvos somente neste navegador.</p><button class="btn primary" type="button" data-action="import">Importar meus nove empréstimos</button><div class="privacy-callout">Não envie o arquivo pessoal de dados ao Cloudflare Pages. O navegador salva as informações apenas neste dispositivo. Faça backup antes de limpar o navegador ou trocar de aparelho.</div></div>`}
function summary(){
 const m=totals(),den=m.paid+m.remaining,pct=den?100*m.paid/den:0,quitados=loans.length-m.active;
 const pctPaid=den?perc(pct):'0,0%',pctUnpaid=den?perc(100-pct):'0,0%';
 // Progresso por contrato: parcelas completamente quitadas / total de parcelas.
 const rows=loans.map(l=>{
   const done=completedCount(l),count=l.rows.length,progress=count?done/count*100:0;
   return `<tr><td><button type="button" class="loan-link" data-open-loan="${esc(l.id)}" aria-label="Abrir detalhes de ${esc(l.name)}"><span class="bank-cell">${bankBadge(l)}<span>${esc(l.name)}</span></span></button></td>
   <td>${money(l.amount)}</td><td>${present(l.rate)?rateFmt(l.rate*100):'<span class="unknown">A confirmar</span>'}</td>
   <td>${esc(l.n||count)}</td><td>${summaryInstallment(l)}</td>
   <td><strong>${money(fromCents(contractC(l)))}</strong>${l.totalNature==='calculado'?'<span class="muted">Previsto pelas parcelas</span>':''}</td>
   <td><strong>${money(fromCents(paidC(l)))}</strong><span class="muted">${done} ${done===1?'parcela paga':'parcelas pagas'}</span></td>
   <td><strong>${money(fromCents(remainingC(l)))}</strong></td>
   <td class="progress-col"><div class="mini-progress" role="meter" aria-label="Progresso de ${esc(l.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.toFixed(1)}"><span style="width:${Math.min(100,progress).toFixed(3)}%"></span></div><span class="progress-numbers"><strong>${Math.round(progress)}%</strong><small>${done}/${count}</small></span></td></tr>`;
 }).join('');
 const table=`<div class="scroll-table"><table class="table-overview" aria-label="Resumo dos nove empréstimos"><thead><tr><th>Empréstimo</th><th>Valor recebido</th><th>Taxa (a.m.)</th><th>Parcelas</th><th>Valor da parcela</th><th>Total final</th><th>Pago até agora</th><th>Falta pagar</th><th>Progresso</th></tr></thead><tbody>${rows}</tbody></table></div>`;
 const metrics=`<div class="metric-grid">
 ${metric('files','Empréstimos ativos',String(m.active),'Contratos em andamento')}
 ${metric('check','Empréstimos quitados',String(quitados),'Contratos finalizados')}
 ${metric('cash','Valor a devolver',money(fromCents(m.contracted)),'Total contratual previsto')}
 ${metric('cash','Valor recebido',money(fromCents(m.received)),'Soma dos nove empréstimos')}
 ${metric('calendar','Total das parcelas por mês',money(fromCents(m.monthly)),'Soma das parcelas dos contratos ativos · sem descontos')}
 ${metric('check','Total pago',money(fromCents(m.paid)),`${pctPaid} do total projetado`)}
 ${metric('percent','Quanto falta',money(fromCents(m.remaining)),`${pctUnpaid} do total projetado`)}
 ${metric('cash','Total de juros',money(fromCents(m.cost+m.late)),'Juros/encargos + multas registradas')}
 ${metric('percent','Total de descontos',money(fromCents(m.discount)),'Economia registrada')}
 ${metric('files','Parcelas pagas x/y',`${m.done} / ${m.installments}`,`${perc(m.installments?100*m.done/m.installments:0)} das parcelas`)}
 </div>`;
 const overall=`<section class="panel overall-progress"><div class="progress-labels"><span>Progresso geral dos pagamentos</span><span class="sub">${money(fromCents(m.paid))} de ${money(fromCents(den))} já pagos (${pctPaid})</span></div><div class="progress-track"><div style="width:${Math.min(100,pct)}%"></div></div><div class="progress-foot"><span>${m.done} de ${m.installments} parcelas registradas como pagas</span><span>${money(fromCents(m.remaining))} ainda em aberto</span></div></section>`;
 const chart=`<section class="panel panel-pad chart-panel"><h2 class="panel-title">Pago × Falta pagar (todos os empréstimos)</h2><div class="donut-row"><div class="donut" role="img" aria-label="${pctPaid} pago, ${pctUnpaid} a pagar" style="--paid-pct:${pct.toFixed(4)}%"><div class="donut-center"><strong>${money(fromCents(den))}</strong><small>Total projetado<br>atualizado</small></div></div><div class="legend"><div class="legend-item"><span class="legend-dot"></span><div class="legend-text"><small>Total já pago</small><strong data-test="chart-paid">${money(fromCents(m.paid))}</strong><small>${pctPaid} do total</small></div></div><div class="legend-item"><span class="legend-dot dark"></span><div class="legend-text"><small>Falta pagar</small><strong data-test="chart-remaining">${money(fromCents(m.remaining))}</strong><small>${pctUnpaid} do total</small></div></div></div></div><p class="hint"><i>ⓘ</i><span>O gráfico considera os nove contratos. O total projetado equivale aos pagamentos feitos mais o saldo atual e pode mudar após antecipações, descontos e juros extras.</span></p></section>`;
 return `${metrics}${overall}<div class="summary-layout">${chart}<section class="panel panel-pad table-panel"><h2 class="panel-title">Resumo dos empréstimos</h2>${table}</section></div>`;
}
function valueLabel(label,value,kind='',sub=''){return `<div class="detail-metric ${kind}"><label>${esc(label)}</label><strong class="${value==='A confirmar'?'unknown-value':''}">${esc(value)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</div>`}
function dateInput(r,i,field){return `<input type="date" aria-label="Parcela ${r.num}: ${field==='due'?'data de vencimento':'data efetiva do pagamento'}" data-row="${i}" data-field="${field}" value="${esc(r[field]||'')}">`}
function amountInput(r,i,field){const readonly=field==='discount'||field==='late';return `<input type="number" min="0" step="0.01" inputmode="decimal" aria-label="Parcela ${r.num}: ${field==='expected'?'valor previsto':field==='actual'?'valor pago':field==='discount'?'desconto por antecipação':'juros por atraso'}" data-row="${i}" data-field="${field}" placeholder="—" value="${present(r[field])?esc(r[field]):''}" ${readonly?'readonly class="computed-field"':''}>`}
function detail(l){let paid=paidC(l),rem=remainingC(l),d=discountedC(l),late=lateSumC(l),pct=l.rows.length?100*completedCount(l)/l.rows.length:0;
 const fields=`${valueLabel('Valor total recebido',money(l.amount))}${valueLabel('Taxa de juros (a.m.)',present(l.rate)?rateFmt(l.rate*100):'A confirmar')}${valueLabel('Quantidade de parcelas',String(l.n||l.rows.length))}${valueLabel('Valor total a pagar',money(fromCents(contractC(l))),'',l.totalNature==='calculado'?'Previsto pelas parcelas':'Valor contratual')}${valueLabel('Valor já pago',money(fromCents(paid)),'teal')}${valueLabel('Saldo restante',money(fromCents(rem)))}${valueLabel('Desconto acumulado',money(fromCents(d)),'teal')}${valueLabel('Juros total em reais',money(fromCents(contractC(l)-cents(l.amount))),'')}`;
 const rows=l.rows.map((r,i)=>{let isComplete=completed(r),balance=balanceC(r),isPartial=actualC(r)>0&&balance>0;return `<tr class="${isComplete?'paid':isPartial?'partial':''}"><td>${r.num}${isComplete?' ✓':''}</td><td>${dateInput(r,i,'due')}</td><td>${amountInput(r,i,'expected')}</td><td>${dateInput(r,i,'datePaid')}</td><td>${amountInput(r,i,'actual')}</td><td>${amountInput(r,i,'discount')}</td><td>${amountInput(r,i,'late')}</td><td><select aria-label="Parcela ${r.num}: status" data-row="${i}" data-field="status">${STATUS.map(s=>`<option value="${s}" ${s===r.status?'selected':''}>${s}</option>`).join('')}</select>${(r.status==='Paga'||r.status==='Antecipada')&&balance>0?'<span class="warn-flag">Saldo ainda não zerado</span>':''}</td><td><input class="edit-note" type="text" maxlength="240" aria-label="Parcela ${r.num}: observações" data-row="${i}" data-field="observations" placeholder="—" value="${esc(r.observations||'')}"></td></tr>`}).join('');
 return `<div class="detail-top"><div class="detail-ident">${bankBadge(l,true)}<div><h2>${esc(l.name)} <span>· Detalhamento do empréstimo</span></h2><p>${l.category==='Consignado'?'Empréstimo consignado · Desconto em folha':'Empréstimo da Shopee · Sem desconto em folha'}</p></div></div><div class="detail-actions"><span class="status-chip ${l.category==='Shopee'?'shopee':''}">${rem>0?'Em andamento':'Quitado'}</span><button type="button" class="btn outline" id="edit-contract">Editar contrato</button></div></div>
<div class="detail-metrics">${fields}</div>
<div class="progress-panel"><div class="progress-labels"><span>Progresso do pagamento</span><span class="sub">${completedCount(l)} de ${l.rows.length} parcelas pagas (${perc(pct)})</span></div><div class="progress-track"><div style="width:${Math.min(100,pct)}%"></div></div></div>
<div class="section-header"><h3 class="panel-title">Controle de parcelas</h3><button class="btn outline" id="add-row" type="button">+ Adicionar parcela</button></div>
<div class="panel scroll-table"><table class="detail-table" aria-label="Parcelas do empréstimo ${esc(l.name)}"><thead><tr><th>Nº da parcela</th><th>Data de vencimento</th><th>Valor da parcela</th><th>Data em que paguei</th><th>Quanto paguei</th><th>Desconto antecipação</th><th>Juros por atraso</th><th>Status</th><th>Observações</th></tr></thead><tbody>${rows}</tbody></table></div>
<div class="detail-meta"><span><strong>Campos editáveis:</strong> informe o valor previsto e quanto pagou. Desconto e juros são calculados automaticamente; os dados são salvos no navegador.</span><button class="btn subdued" type="button" id="back-summary">← Voltar ao resumo</button></div>
<div class="loan-extra"><span>Juros abonados na origem: <strong>${present(l.waived)?money(l.waived):'Não informado'}</strong> (não duplicar desconto)</span><span>IOF informado: <strong>${present(l.iof)?money(l.iof):'Não informado'}</strong></span>${present(l.cet)?`<span>CET anual: <strong>${compact(l.cet)}%</strong></span>`:''}${l.startDate?`<span>Início do contrato: <strong>${brDate(l.startDate)}</strong></span>`:''}</div>
${l.notes?`<div class="callout"><span class="callout-icon">ⓘ</span><span>${esc(l.notes)}</span></div>`:''}
${!present(l.rate)?'<div class="callout warn">A taxa contratual exata ainda não foi informada; não foi estimada.</div>':''}`;
}
function render(){renderTabs();$('view').innerHTML=!loans.length?empty():selected==='resumo'?summary():detail(loans.find(l=>l.id===selected)||loans[0]);}
function editDialog(l){editingId=l.id;$('dialog-title').textContent='Editar contrato — '+l.name;const spec=[['amount','Valor recebido (R$)','number'],['rate','Juros efetivos mensais (%)','number'],['n','Quantidade de parcelas','number'],['monthly','Parcela de referência (R$)','number'],['officialTotal','Total contratual / previsto (R$)','number'],['totalNature','Origem do total','select'],['startDate','Data de início','date'],['iof','IOF (R$)','number'],['waived','Juros abonados informados (R$)','number'],['cet','CET anual (%)','number'],['reference','Identificador / proposta','text'],['notes','Observações contratuais','textarea']];$('contract-fields').innerHTML=spec.map(([field,label,type])=>{let v=l[field]??'';if(field==='rate'&&present(v))v=n(v)*100;let input=type==='select'?`<select id="fld-${field}" name="${field}"><option value="contratual" ${v==='contratual'?'selected':''}>Valor informado no contrato</option><option value="calculado" ${v==='calculado'?'selected':''}>Valor previsto pelas parcelas</option></select>`:type==='textarea'?`<textarea id="fld-${field}" name="${field}">${esc(v)}</textarea>`:`<input id="fld-${field}" name="${field}" type="${type}" ${type==='number'?'step="0.01" min="0" inputmode="decimal"':''} value="${esc(v)}">`;return `<div class="contract-field ${type==='textarea'?'wide':''}"><label for="fld-${field}">${esc(label)}</label>${input}</div>`}).join('');$('contract-dialog').showModal()}
function formSubmit(e){e.preventDefault();const l=loans.find(x=>x.id===editingId);if(!l)return;const f=new FormData($('contract-form'));const qtyRaw=f.get('n'),qty=qtyRaw===''?'':Math.floor(Number(qtyRaw));if(qty!==''&&(qty<1||qty>300)){notice('Quantidade de parcelas deve ficar entre 1 e 300.');return}if(qty!==''&&qty<l.rows.length){const affected=l.rows.slice(qty);if(affected.some(r=>actualC(r)>0||discountC(r)>0||lateC(r)>0||r.due||r.datePaid||r.observations)){notice('A redução excluiria parcelas com informações. Preserve os registros.');return}}
let changed={};for(const field of ['amount','rate','n','monthly','officialTotal','totalNature','startDate','iof','waived','cet','reference','notes']){let value=f.get(field);changed[field]=['amount','monthly','officialTotal','iof','waived','cet'].includes(field)?(value===''?'':Math.max(0,Number(value))):field==='rate'?(value===''?'':Math.max(0,Number(value))/100):field==='n'?qty:value}
if(changed.n!==''){if(changed.n<l.rows.length)l.rows.length=changed.n;while(l.rows.length<changed.n){l.rows.push({num:l.rows.length+1,due:'',expected:changed.monthly===''?'':changed.monthly,datePaid:'',actual:'',discount:'',late:'',status:'Pendente',observations:''})}}
if(changed.totalNature==='calculado'&&changed.n!==''&&changed.monthly!==''){changed.officialTotal=fromCents(changed.n*cents(changed.monthly))}else if(changed.totalNature==='calculado'&&changed.n===''){changed.officialTotal=''}
Object.assign(l,changed);$('contract-dialog').close();save();render();notice('Dados contratuais atualizados')}
function updateRow(el){const l=loans.find(x=>x.id===selected);if(!l||el.dataset.row===undefined)return;const row=l.rows[Number(el.dataset.row)];if(!row)return;let field=el.dataset.field,value=el.value;
if(['expected','actual','discount','late'].includes(field)){if(value!==''&&(!Number.isFinite(Number(value))||Number(value)<0)){notice('Informe um valor válido, maior ou igual a zero.');render();return}row[field]=value===''?'':Math.round(Number(value)*100)/100}
else if(field==='status')row.status=STATUS.includes(value)?value:'Pendente';else if(['datePaid','due','observations'].includes(field))row[field]=value;
if(field==='actual'||field==='expected'){
 const expected=expectedC(row),actual=actualC(row);
 if(actual>0&&expected>0){
   if(actual<expected){row.discount=fromCents(expected-actual);row.late=''; if(row.status==='Paga')row.status='Antecipada';}
   else if(actual>expected){row.discount='';row.late=fromCents(actual-expected); if(row.status==='Antecipada')row.status='Paga';}
   else {row.discount='';row.late=''; if(row.status==='Antecipada')row.status='Paga';}
 }
 if(actual===0){row.discount='';row.late=''; if(row.status==='Paga'||row.status==='Parcial'||row.status==='Antecipada')row.status='Pendente';}
}
if(field==='actual'||field==='discount'||field==='late'||field==='expected'){
 let balance=balanceC(row);if(field==='actual'&&row.status==='Pendente'&&actualC(row)>0)row.status=balance===0?(discountC(row)>0?'Antecipada':'Paga'):'Parcial';
 if(['actual','discount','late','expected'].includes(field)&&row.status==='Parcial'&&balance===0&&actualC(row)>0)row.status='Paga';
 if(field==='actual'&&actualC(row)===0&&(row.status==='Paga'||row.status==='Parcial'||row.status==='Antecipada'))row.status='Pendente';
 if((row.status==='Paga'||row.status==='Antecipada')&&balance>0&&actualC(row)>0&&field==='actual')row.status='Parcial';
}
save();render();let inputs=[...$('view').querySelectorAll('[data-row]')];let focused=inputs.find(x=>x.dataset.row===el.dataset.row&&x.dataset.field===field);if(focused&&document.activeElement===document.body){} }
function addRow(){let l=loans.find(x=>x.id===selected);if(!l)return;if(l.rows.length>=300){notice('Limite de 300 parcelas');return}let num=l.rows.length+1;if(present(l.n)&&num>l.n&&!confirm('O contrato informa '+l.n+' parcelas. Deseja ampliar a quantidade total?'))return;l.rows.push({num,due:'',expected:l.category==='Consignado'&&present(l.monthly)?l.monthly:'',actual:'',discount:'',late:'',datePaid:'',status:'Pendente',observations:''});l.n=num;if(l.totalNature==='calculado'&&present(l.monthly))l.officialTotal=fromCents(l.n*cents(l.monthly));save();render();notice('Parcela adicionada')}
function exportData(){if(!loans.length&&!window.patrimonioAPI?.hasData()&&!window.financasAPI?.hasData()){notice('Registre ou importe dados antes de exportar.');return}const backup={format:'controle-financeiro-v10',exportedAt:new Date().toISOString(),loans,patrimonio:window.patrimonioAPI?.snapshot()??null,financas:window.financasAPI?.snapshot()??null};const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='backup-pessoal-emprestimos-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);notice('Backup exportado. Guarde o arquivo em local privado.');}
async function importData(f){if(!f)return;try{if(f.size>5_000_000)throw Error('Arquivo acima de 5 MB');const data=JSON.parse(await f.text());const arr=data?.loans??data;const hasLoans=valid(arr),hasWealth=!!data?.patrimonio,hasFinance=!!data?.financas;if(!hasLoans&&!hasWealth&&!hasFinance)throw Error('O arquivo não contém empréstimos ou patrimônio em formato compatível');if((loans.length||window.patrimonioAPI?.hasData()||window.financasAPI?.hasData())&&!confirm('Substituir os dados correspondentes pelos dados importados? Exporte um backup antes, se necessário.'))return;if(hasLoans){loans=normalise(clone(arr));selected='resumo';}if(hasWealth&&window.patrimonioAPI){window.patrimonioAPI.restore(data.patrimonio);}if(hasFinance&&window.financasAPI){window.financasAPI.restore(data.financas);}save();render();notice('Dados financeiros importados com sucesso.');}catch(e){alert('Falha na importação: '+e.message)}finally{$('upload').value=''}}
function clearData(){if(!loans.length&&!window.patrimonioAPI?.hasData()&&!window.financasAPI?.hasData())return;if(!confirm('Remover os dados deste navegador? Essa ação apaga os lançamentos locais. Exporte um backup antes.'))return;loans=[];selected='resumo';localStorage.removeItem(KEY);localStorage.removeItem(OLD_KEY);window.patrimonioAPI?.clear();window.financasAPI?.clear();$('save-status').textContent='Aguardando importação dos dados';render();notice('Dados removidos somente deste navegador')}
$('tabs').addEventListener('click',e=>{let b=e.target.closest('[data-tab]');if(!b)return;selected=b.dataset.tab;render();window.scrollTo({top:0,behavior:'instant'})});
$('view').addEventListener('click',e=>{const openBtn=e.target.closest('[data-open-loan]');if(openBtn){selected=openBtn.dataset.openLoan;render();window.scrollTo({top:0,behavior:'instant'});return}if(e.target.closest('[data-action="import"]'))$('upload').click();else if(e.target.closest('#edit-contract'))editDialog(loans.find(l=>l.id===selected));else if(e.target.closest('#add-row'))addRow();else if(e.target.closest('#back-summary')){selected='resumo';render();window.scrollTo({top:0,behavior:'instant'})}});
$('view').addEventListener('change',e=>{const el=e.target;if(el.dataset.row!==undefined)updateRow(el)});
$('contract-form').addEventListener('submit',formSubmit);$('close-dialog').onclick=()=>$('contract-dialog').close();$('cancel-dialog').onclick=()=>$('contract-dialog').close();$('export').onclick=exportData;$('import').onclick=()=>$('upload').click();$('upload').onchange=e=>importData(e.target.files?.[0]);$('reset').onclick=clearData;
window.emprestimosAPI={monthlyFor:(month)=>fromCents(forecastMonthlyC(month)),navigate:()=>{window.navegarFinanceiro?.('loans');selected='resumo';render()},snapshot:()=>clone(loans)};
$('today').textContent=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date());init();render();
})();
