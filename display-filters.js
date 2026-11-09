/* Kandy Data Collection – readable response cards + hierarchy-aware filters */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const uniq=a=>[...new Set(a.filter(v=>v!=null&&String(v).trim()!==''))].sort((a,b)=>String(a).localeCompare(String(b)));
 const qmap=nodeId=>(window.questions||[]).filter(q=>String(q.node_id)===String(nodeId)).sort((a,b)=>(a.order_index||0)-(b.order_index||0));
 const answerText=v=>Array.isArray(v)?v.join(', '):(v&&typeof v==='object'?JSON.stringify(v):String(v==null?'':v));
 const answerHtml=r=>{const qs=qmap(r.node_id),a=r.answers||{};let pairs=qs.filter(q=>a[q.id]!==undefined&&a[q.id]!==null&&answerText(a[q.id])!=='').map(q=>[q.question_text,answerText(a[q.id])]);
   if(!pairs.length) pairs=Object.entries(a).map(([k,v])=>[k,answerText(v)]);
   if(!pairs.length)return '<span class="text-slate-400">පිළිතුරු නැත</span>';
   return '<div class="answer-grid">'+pairs.map(([k,v])=>'<div class="answer-item"><div class="answer-label">'+esc(k)+'</div><div class="answer-value">'+esc(v)+'</div></div>').join('')+'</div>';
 };
 const options=(el,values,placeholder,keep=true)=>{if(!el)return;const old=keep?el.value:'';el.innerHTML='<option value="">'+esc(placeholder)+'</option>'+values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');if(values.includes(old))el.value=old;};
 const addFilter=(parent,id,label)=>{if($(id))return $(id);const wrap=document.createElement('label');wrap.className='text-xs font-semibold text-slate-600';wrap.innerHTML=esc(label)+'<select id="'+id+'" class="mt-1"><option value="">සියල්ල</option></select>';parent.appendChild(wrap);return $(id);};
 const style=document.createElement('style');style.textContent='.answer-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:7px;min-width:220px}.answer-item{background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:8px}.answer-label{font-size:10px;color:#64748b;font-weight:700;margin-bottom:3px}.answer-value{font-size:12px;color:#0f172a;white-space:pre-wrap;overflow-wrap:anywhere}.filter-extra{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:10px}.filter-extra select{width:100%;border:1px solid #cbd5e1;border-radius:9px;padding:9px;background:white}.data-card{border:1px solid #e2e8f0;border-radius:12px;padding:11px;margin:8px 0;background:white}.data-card-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-weight:700}.data-meta{font-size:11px;color:#64748b;margin:5px 0 9px}.answer-grid{max-width:100%}@media(max-width:640px){.answer-grid{grid-template-columns:1fr 1fr}.answer-value{font-size:11px}}';document.head.appendChild(style);

 if(location.pathname.toLowerCase().endsWith('admin.html')){
   const filterRow=$('fSearch')?.parentElement;
   if(filterRow){filterRow.classList.add('filter-extra');addFilter(filterRow,'fOffice','කාර්යාලය');addFilter(filterRow,'fL1','වාරය / වර්ෂය');addFilter(filterRow,'fL2','බෝගය / වැඩසටහන');addFilter(filterRow,'fL3','උප වැඩසටහන');addFilter(filterRow,'fL4','අයිතමය');}
   
   const fSubEl = $('fSub');
   const fDivEl = $('fDiv');
   const fOfficeEl = $('fOffice');

   function updateDivAndOfficeOptions() {
       const subId = fSubEl?.value || '';
       const hh = window.hierarchy || [];
       let divs = [];
       let offices = [];

       if (subId) {
           const sub = hh.find(h => String(h.id) === String(subId));
           if (sub) {
               sub.divisions.forEach(d => {
                   divs.push(d.name);
                   offices.push(...d.offices);
               });
           }
       } else {
           hh.forEach(h => h.divisions.forEach(d => {
               divs.push(d.name);
               offices.push(...d.offices);
           }));
       }
       options(fDivEl, uniq(divs), 'සියලුම අංශ');
       updateOfficeOptions();
   }

   function updateOfficeOptions() {
       const divName = fDivEl?.value || '';
       const hh = window.hierarchy || [];
       let offices = [];
       if (divName) {
           hh.forEach(h => {
               const d = h.divisions.find(x => x.name === divName);
               if (d) offices.push(...d.offices);
           });
       } else {
           const subId = fSubEl?.value || '';
           if (subId) {
               const sub = hh.find(h => String(h.id) === String(subId));
               if (sub) sub.divisions.forEach(d => offices.push(...d.offices));
           } else {
               hh.forEach(h => h.divisions.forEach(d => offices.push(...d.offices)));
           }
       }
       options(fOfficeEl, uniq(offices), 'සියලුම කාර්යාල');
   }

   if(fSubEl) fSubEl.addEventListener('change', () => { updateDivAndOfficeOptions(); window.renderData(); });
   if(fDivEl) fDivEl.addEventListener('change', () => { updateOfficeOptions(); window.renderData(); });

   const baseFill=window.fillDataFilters;
   window.fillDataFilters=function(){
     if(baseFill)baseFill();
     const rs=window.responses||[];
     options($('fL1'),uniq(rs.map(r=>r.level1)),'සියලුම වාර / වර්ෂ');
     options($('fL2'),uniq(rs.map(r=>r.level2)),'සියලුම බෝග / වැඩසටහන්');
     options($('fL3'),uniq(rs.map(r=>r.level3)),'සියලුම උප වැඩසටහන්');
     options($('fL4'),uniq(rs.map(r=>(r.node_path||'').split(' / ').slice(-1)[0])),'සියලුම අයිතම');
     updateDivAndOfficeOptions();
   };
   window.renderData=function(){
     const val=id=>$(id)?.value||'';
     let list=(window.responses||[]).slice();
     const role=localStorage.getItem('role'),mySub=localStorage.getItem('user_subOfficeId');
     if(role==='sub_admin')list=list.filter(r=>String(r.subOfficeId)===String(mySub));
     
     const fSub = val('fSub');
     if(fSub) list=list.filter(r=>String(r.subOfficeId)===fSub);
     
     [['fMain','main_type'],['fDiv','division'],['fOffice','office'],['fL1','level1'],['fL2','level2'],['fL3','level3']].forEach(([id,k])=>{if(val(id))list=list.filter(r=>String(r[k]||'')===val(id));});
     if(val('fL4'))list=list.filter(r=>(r.node_path||'').split(' / ').slice(-1)[0]===val('fL4'));
     const search=val('fSearch').toLowerCase();if(search)list=list.filter(r=>(JSON.stringify(r.answers||'')+' '+r.node_path+' '+r.division+' '+r.office+' '+r.subOfficeName).toLowerCase().includes(search));
     if($('dataScopeNote'))$('dataScopeNote').textContent=(role==='main_admin'?'Main Admin':'Sub Admin')+' • මුළු '+ (window.responses||[]).length+' • Filter කළ ප්‍රමාණය '+list.length;
     const body=$('dataTbody');if(!body)return;
     body.innerHTML=list.slice(0,300).map(r=>'<tr><td class="text-xs"><b>'+esc(r.node_path||'')+'</b><br><span class="text-slate-400">'+esc(r.main_type||'')+'</span></td><td class="text-xs">'+esc(r.subOfficeName||r.subOfficeId||'')+'<br><b>'+esc(r.division||'')+'</b><br>'+esc(r.office||'')+'</td><td>'+answerHtml(r)+'</td><td class="text-xs">'+esc(r.submittedName||r.submittedBy||'')+'<br>'+esc(r.created_at?new Date(r.created_at).toLocaleString():'')+'</td><td><button onclick="editData(\''+esc(r.id)+'\')" class="btn btn-ghost px-2 py-1 text-xs">Edit</button> <button onclick="delData(\''+esc(r.id)+'\')" class="text-red-500 text-xs px-2 font-semibold">Delete</button></td></tr>').join('')||'<tr><td colspan="5" class="text-center py-6 text-slate-400">දත්ත නැත</td></tr>';
   };
   window.downloadCSV=function(){const list=(window.responses||[]);if(!list.length)return window.showToast('දත්ත නැත',false);const headers=['Date','Main Type','Path','Sub Office','Division','Office','User'];const allQ=[];list.forEach(r=>qmap(r.node_id).forEach(q=>{if(!allQ.some(x=>x.id===q.id))allQ.push(q)}));allQ.forEach(q=>headers.push(q.question_text));const rows=[headers];list.forEach(r=>rows.push([r.created_at,r.main_type,r.node_path,r.subOfficeName||r.subOfficeId,r.division,r.office,r.submittedName,...allQ.map(q=>answerText((r.answers||{})[q.id]))]));const csv='\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='kandy_responses_readable.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
   document.addEventListener('change',e=>{if(/^f(Main|Sub|Div|Office|L[1-4])$/.test(e.target.id))window.renderData();});
   setTimeout(()=>{window.fillDataFilters();window.renderData();},0);
 }
 if(location.pathname.toLowerCase().endsWith('unit.html')){
   const row=$('mySearch')?.parentElement;if(row){row.classList.add('filter-extra');addFilter(row,'myFilterL2','බෝගය / වැඩසටහන');addFilter(row,'myFilterL3','උප වැඩසටහන');addFilter(row,'myFilterItem','අයිතමය');}
   window.renderMy=function(){const v=id=>$(id)?.value||'';let mine=(window.responses||[]).filter(r=>r.division===window.myDiv&&r.office===window.myOffice);if(v('myFilterMain'))mine=mine.filter(r=>r.main_type===v('myFilterMain'));if(v('myFilterL1'))mine=mine.filter(r=>r.level1===v('myFilterL1'));if(v('myFilterL2'))mine=mine.filter(r=>r.level2===v('myFilterL2'));if(v('myFilterL3'))mine=mine.filter(r=>r.level3===v('myFilterL3'));if(v('myFilterItem'))mine=mine.filter(r=>(r.node_path||'').split(' / ').slice(-1)[0]===v('myFilterItem'));const s=v('mySearch').toLowerCase();if(s)mine=mine.filter(r=>(JSON.stringify(r.answers||'')+' '+r.node_path).toLowerCase().includes(s));
     const all=(window.responses||[]).filter(r=>r.division===window.myDiv&&r.office===window.myOffice);options($('myFilterL1'),uniq(all.map(r=>r.level1)),'සියලුම වාර / වර්ෂ');options($('myFilterL2'),uniq(all.map(r=>r.level2)),'සියලුම බෝග / වැඩසටහන්');options($('myFilterL3'),uniq(all.map(r=>r.level3)),'සියලුම උප වැඩසටහන්');options($('myFilterItem'),uniq(all.map(r=>(r.node_path||'').split(' / ').slice(-1)[0])),'සියලුම අයිතම');
     const tb=$('myTbody');if(!tb)return;tb.innerHTML=mine.slice(0,300).map(r=>'<tr><td class="text-xs"><b>'+esc(r.node_path||'')+'</b><br><span class="text-slate-500">'+esc(r.main_type||'')+'</span></td><td>'+answerHtml(r)+'</td><td class="text-xs">'+esc(r.created_at?new Date(r.created_at).toLocaleString():'')+'</td><td><button onclick="editMy(\''+esc(r.id)+'\')" class="btn btn-ghost px-2 py-1 text-xs">Edit</button> <button onclick="delMy(\''+esc(r.id)+'\')" class="text-red-500 text-xs">Delete</button></td></tr>').join('')||'<tr><td colspan="4" class="text-center py-6 text-slate-400">දත්ත නැත</td></tr>';
   };
   document.addEventListener('change',e=>{if(/^myFilter/.test(e.target.id))window.renderMy();});setTimeout(()=>window.renderMy(),0);
 }
})();