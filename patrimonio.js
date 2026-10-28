/* Patrimônio e dívidas — separado dos contratos de empréstimos (baseline preservada). */
(() => {
  'use strict';
  const KEY = 'controle-financeiro-patrimonio-v1';
  const $ = id => document.getElementById(id);
  const fmt = v => Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const amt = v => v === '' || v === undefined || v === null ? 0 : Number(v) || 0;
  const cen = v => Math.round(amt(v)*100);
  const moneyC = c => fmt(c/100);
  const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const blank = () => ({fgts:'',pension:[],reserves:[],debts:{pai:{amount:'',payments:[]},asefaz:{amount:'',payments:[]},ipog:{amount:'',payments:[]},imp:{amount:'',payments:[]}}});
  const debtNames = {pai:'PAI',asefaz:'ASEFAZ',ipog:'IPOG',imp:'IMP'};
  const logos = {asefaz:'assets/assefaz.png',ipog:'assets/ipog.png',imp:'assets/imp.png'};
  const isFinitePositive = v => (v===''||v===null||v===undefined) ? '' : Number.isFinite(Number(v))&&Number(v)>=0?Math.round(Number(v)*100)/100:'';
  const cleanDate = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d??''))?String(d):'';
  const cleanMonth = d => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(d??''))?String(d):'';
  function normalise(raw){
    const a=blank();if(!raw||typeof raw!=='object')return a;
    a.fgts=isFinitePositive(raw.fgts);
    a.pension=Array.isArray(raw.pension)?raw.pension.slice(0,300).map(r=>({month:cleanMonth(r.month),date:cleanDate(r.date),amount:isFinitePositive(r.amount)})):[];
    a.reserves=Array.isArray(raw.reserves)?raw.reserves.slice(0,150).map(r=>({bank:String(r.bank??'').slice(0,80),type:String(r.type??'').slice(0,120),amount:isFinitePositive(r.amount)})):[];
    for(const id of Object.keys(debtNames)){
      const d=raw.debts?.[id]||{};
      a.debts[id]={amount:isFinitePositive(d.amount),payments:Array.isArray(d.payments)?d.payments.slice(0,300).map(r=>({date:cleanDate(r.date),amount:isFinitePositive(r.amount)})):[]};
    }
    return a;
  }
  let state=blank();
  try{const saved=localStorage.getItem(KEY);if(saved)state=normalise(JSON.parse(saved));}catch{}
  let activeDialog='';
  const totalPension=()=>state.pension.reduce((s,r)=>s+cen(r.amount),0);
  const totalReserves=()=>state.reserves.reduce((s,r)=>s+cen(r.amount),0);
  const totalWealth=()=>cen(state.fgts)+totalPension()+totalReserves();
  const debtBalance=id=>Math.max(0,cen(state.debts[id].amount)-state.debts[id].payments.reduce((s,p)=>s+cen(p.amount),0));
  const totalDebt=()=>Object.keys(debtNames).reduce((s,id)=>s+debtBalance(id),0);
  const show=v=>v===''?'Não informado':fmt(v);
  const moneyInput=(val,attr,lab)=>`<input type="number" min="0" step="0.01" inputmode="decimal" ${attr} aria-label="${esc(lab)}" value="${val===''?'':esc(val)}" placeholder="0,00">`;
  const makeLogo=id=>logos[id]?`<img class="original-logo logo-${id}" src="${logos[id]}" alt="Logotipo ${esc(debtNames[id])}">`:'';
  function tile(label,value,cls,action,sub,logo=''){
    return `<button type="button" class="asset-card ${cls}" data-wealth-open="${action}" aria-label="Abrir ${esc(label)}"><div class="asset-content">${logo}<div class="asset-text"><span class="asset-label">${esc(label)}</span><strong class="asset-value">${esc(value)}</strong><span class="asset-sub">${esc(sub)}</span></div></div><span class="asset-arrow" aria-hidden="true">›</span></button>`;
  }
  const totalCard=(label,val,cls,sub)=>`<div class="asset-card ${cls} noninteractive"><span class="asset-label">${esc(label)}</span><strong class="asset-value">${esc(val)}</strong><span class="asset-sub">${esc(sub)}</span></div>`;
  function render(){
    const hasFgts=state.fgts!=='';
    const hasPension=state.pension.length>0;
    const hasReserves=state.reserves.length>0;
    $('wealth-view').innerHTML=`<section class="wealth-section"><div class="wealth-title"><div><h2>Receitas e patrimônio</h2><p>Acompanhe o que você já construiu.</p></div></div><div class="wealth-assets">
      ${tile('FGTS',hasFgts?fmt(state.fgts):'—','color-fgts','fgts','Saldo atual')}
      ${tile('Previdência privada',hasPension?moneyC(totalPension()):'—','color-pension','pension','Total acumulado')}
      ${tile('Reservas',hasReserves?moneyC(totalReserves()):'R$ 0,00','color-reserves','reserves','Saldo atual')}
      ${totalCard('Total das receitas',moneyC(totalWealth()),'color-total','Total acumulado')}
    </div></section>
    <section class="wealth-section"><div class="wealth-title"><div><h2>Dívidas fixas</h2><p>Saldos que ainda faltam pagar a cada credor.</p></div></div><div class="debt-assets">
      ${Object.keys(debtNames).map(id=>tile(debtNames[id],state.debts[id].amount===''?'—':moneyC(debtBalance(id)),'color-debt','debt-'+id,'Saldo devedor',makeLogo(id))).join('')}
      ${totalCard('Total das dívidas fixas',moneyC(totalDebt()),'color-debt-total','Saldo devedor total')}
    </div></section>
    <p class="wealth-privacy">Clique nos cards para consultar e atualizar os valores. Os dados são salvos apenas neste navegador; utilize Exportar backup para preservá-los.</p>`;
  }
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{alert('Não foi possível salvar os dados neste navegador. Faça um backup.');}render();}
  const popupHeader=(title,sub,value)=>`<div class="wealth-modal-head"><div><h2 id="wealth-dialog-title">${esc(title)}</h2><small>${esc(sub)}</small><strong>${esc(value)}</strong></div><button type="button" class="wealth-close" data-wealth-close aria-label="Fechar janela">×</button></div>`;
  const footer=(label,value,cls)=>`<div class="wealth-total ${cls}"><strong>${esc(label)}</strong><strong>${esc(value)}</strong></div>`;
  function modalMarkup(kind){
    if(kind==='fgts')return `${popupHeader('FGTS','Saldo atual',show(state.fgts))}<div class="wealth-form-single"><label for="fgts-saldo">Saldo atual do FGTS (R$)</label>${moneyInput(state.fgts,'id="fgts-saldo" data-wealth-field="fgts"','Saldo do FGTS')}<small>Atualize o valor conforme o extrato do FGTS.</small></div>`;
    if(kind==='pension'){
      const rows=state.pension.map((r,i)=>`<tr><td><input type="month" data-wealth-kind="pension" data-i="${i}" data-field="month" aria-label="Mês da parcela ${i+1}" value="${esc(r.month)}"></td><td><input type="date" data-wealth-kind="pension" data-i="${i}" data-field="date" aria-label="Data de depósito da parcela ${i+1}" value="${esc(r.date)}"></td><td>${moneyInput(r.amount,`data-wealth-kind="pension" data-i="${i}" data-field="amount"`,'Valor depositado '+(i+1))}</td><td><button type="button" data-remove-kind="pension" data-remove-i="${i}" class="remove-item" aria-label="Excluir parcela ${i+1}">×</button></td></tr>`).join('');
      return `${popupHeader('Previdência privada','Total acumulado',moneyC(totalPension()))}<div class="wealth-table-scroll"><table class="wealth-table"><thead><tr><th>Parcela (mês)</th><th>Data do depósito</th><th>Valor depositado</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="4">Nenhum depósito registrado.</td></tr>'}</tbody></table></div><button class="wealth-add" type="button" data-add-kind="pension">+ Adicionar depósito</button>${footer('Total acumulado',moneyC(totalPension()),'total-pension')}<p class="wealth-notice">Os dias dos depósitos anteriores não foram informados; preencha apenas quando souber.</p>`;
    }
    if(kind==='reserves'){
      const rows=state.reserves.map((r,i)=>`<tr><td><input type="text" maxlength="80" data-wealth-kind="reserves" data-i="${i}" data-field="bank" aria-label="Banco ${i+1}" value="${esc(r.bank)}" placeholder="Banco"></td><td><input type="text" maxlength="120" data-wealth-kind="reserves" data-i="${i}" data-field="type" aria-label="Tipo de reserva ${i+1}" value="${esc(r.type)}" placeholder="Tipo de reserva"></td><td>${moneyInput(r.amount,`data-wealth-kind="reserves" data-i="${i}" data-field="amount"`,'Valor da reserva '+(i+1))}</td><td><button type="button" data-remove-kind="reserves" data-remove-i="${i}" class="remove-item" aria-label="Excluir reserva ${i+1}">×</button></td></tr>`).join('');
      return `${popupHeader('Reservas','Saldo atual',moneyC(totalReserves()))}<div class="wealth-table-scroll"><table class="wealth-table"><thead><tr><th>Banco</th><th>Tipo de reserva</th><th>Valor</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="4">Você ainda não cadastrou reservas.</td></tr>'}</tbody></table></div><button class="wealth-add" type="button" data-add-kind="reserves">+ Adicionar banco ou reserva</button>${footer('Total das reservas',moneyC(totalReserves()),'total-reserves')}`;
    }
    if(kind.startsWith('debt-')){
      const id=kind.slice(5),d=state.debts[id],paid=d.payments.reduce((s,r)=>s+cen(r.amount),0);
      const rows=d.payments.map((r,i)=>`<tr><td><input type="date" data-debt="${id}" data-i="${i}" data-field="date" aria-label="Data do pagamento ${i+1}" value="${esc(r.date)}"></td><td>${moneyInput(r.amount,`data-debt="${id}" data-i="${i}" data-field="amount"`,'Pagamento '+(i+1))}</td><td><button type="button" data-remove-debt="${id}" data-remove-i="${i}" class="remove-item" aria-label="Excluir pagamento ${i+1}">×</button></td></tr>`).join('');
      return `${popupHeader('Dívida — '+debtNames[id],'Saldo que falta pagar',moneyC(debtBalance(id)))}<div class="wealth-form-single"><label for="debt-balance">Saldo informado antes dos novos pagamentos (R$)</label>${moneyInput(d.amount,`id="debt-balance" data-debt-base="${id}"`,'Saldo da dívida '+debtNames[id])}</div><h3 class="wealth-modal-subtitle">Pagamentos registrados</h3><div class="wealth-table-scroll"><table class="wealth-table"><thead><tr><th>Data</th><th>Valor pago</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="3">Nenhum pagamento adicional registrado.</td></tr>'}</tbody></table></div><button class="wealth-add" type="button" data-add-debt="${id}">+ Registrar pagamento</button>${footer('Saldo devedor atualizado',moneyC(debtBalance(id)),'total-debt')}<p class="wealth-notice">O valor informado é o saldo devedor atual de referência. Novos pagamentos registrados serão abatidos desse saldo.</p>`;
    }
    return '';
  }
  function refreshDialog(){if(!activeDialog)return;$('wealth-dialog-content').innerHTML=modalMarkup(activeDialog);}
  function openDialog(kind){activeDialog=kind;refreshDialog();$('wealth-dialog').showModal();}
  function closeDialog(){activeDialog='';$('wealth-dialog').close();}
  function onChange(e){
    const t=e.target;if(!t.matches('input'))return;
    const moneyField=t.type==='number';const nv=moneyField?isFinitePositive(t.value):t.value;
    if(moneyField&&nv===''&&t.value!==''){alert('Informe um valor válido maior ou igual a zero.');refreshDialog();return;}
    if(t.dataset.wealthField==='fgts')state.fgts=nv;
    else if(t.dataset.wealthKind==='pension'||t.dataset.wealthKind==='reserves'){
      const r=state[t.dataset.wealthKind]?.[Number(t.dataset.i)];if(!r)return;
      r[t.dataset.field]=t.dataset.field==='month'?cleanMonth(t.value):t.dataset.field==='date'?cleanDate(t.value):nv;
    }else if(t.dataset.debtBase){state.debts[t.dataset.debtBase].amount=nv;}
    else if(t.dataset.debt){const r=state.debts[t.dataset.debt]?.payments[Number(t.dataset.i)];if(!r)return;r[t.dataset.field]=t.dataset.field==='date'?cleanDate(t.value):nv;}
    else return;
    save();refreshDialog();
  }
  function handleClick(e){
    const open=e.target.closest('[data-wealth-open]');if(open){openDialog(open.dataset.wealthOpen);return;}
    if(e.target.closest('[data-wealth-close]')){closeDialog();return;}
    const add=e.target.closest('[data-add-kind]');if(add){if(add.dataset.addKind==='pension')state.pension.push({month:'',date:'',amount:''});if(add.dataset.addKind==='reserves')state.reserves.push({bank:'',type:'',amount:''});save();refreshDialog();return;}
    const remove=e.target.closest('[data-remove-kind]');if(remove){state[remove.dataset.removeKind].splice(Number(remove.dataset.removeI),1);save();refreshDialog();return;}
    const addDebt=e.target.closest('[data-add-debt]');if(addDebt){state.debts[addDebt.dataset.addDebt].payments.push({date:'',amount:''});save();refreshDialog();return;}
    const rmDebt=e.target.closest('[data-remove-debt]');if(rmDebt){state.debts[rmDebt.dataset.removeDebt].payments.splice(Number(rmDebt.dataset.removeI),1);save();refreshDialog();return;}
  }
  $('wealth-view').addEventListener('click',handleClick);
  $('wealth-dialog').addEventListener('click',handleClick);
  $('wealth-dialog').addEventListener('change',onChange);
  $('wealth-dialog').addEventListener('close',()=>{activeDialog='';});
  const switchTo=which=>{
    const names=['loans','wealth','credit','expenses'];
    if(!names.includes(which))return;
    const views={loans:'view',wealth:'wealth-view',credit:'credit-view',expenses:'expenses-view'};
    const buttons={loans:'switch-loans',wealth:'switch-wealth',credit:'switch-credit',expenses:'switch-expenses'};
    names.forEach(k=>{$(views[k]).hidden=(which!==k);$(buttons[k]).classList.toggle('active',which===k);$(buttons[k]).toggleAttribute('aria-current',which===k);});
    $('tabs').hidden=which!=='loans';
    if(which==='wealth')render();
    if(which==='credit'||which==='expenses')window.financasAPI?.render(which);
  };
  window.navegarFinanceiro=switchTo;
  $('switch-loans').addEventListener('click',()=>switchTo('loans'));
  $('switch-wealth').addEventListener('click',()=>switchTo('wealth'));
  $('switch-credit').addEventListener('click',()=>switchTo('credit'));
  $('switch-expenses').addEventListener('click',()=>switchTo('expenses'));
  window.patrimonioAPI={hasData:()=>state.fgts!==''||state.pension.length>0||state.reserves.length>0||Object.values(state.debts).some(d=>d.amount!==''||d.payments.length>0),snapshot:()=>JSON.parse(JSON.stringify(state)),restore:data=>{state=normalise(data);save();refreshDialog();},clear:()=>{state=blank();try{localStorage.removeItem(KEY)}catch{}render();},show:()=>switchTo('wealth')};
  render();
})();
