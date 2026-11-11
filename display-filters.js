/* Kandy Data Collection – readable response cards + hierarchy-aware filters */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const uniq=a=>[...new Set(a.filter(v=>v!=null&&String(v).trim()!==''))].sort((a,b)=>String(a).localeCompare(String(b)));
 const qmap=nodeId=>(window.questions||[]).filter(q=>String(q.node_id)===String(nodeId)).sort((a,b)=>(a.order_index||0)-(b.order_index||0));
 const answerText=v=>Array.isArray(v)?v.join(', '):(v&&typeof v==='object'?JSON.stringify(v):String(v==null?'':v));
 
 const answerHtml=r=>{
   const qs=qmap(r.node_id),a=r.answers||{};
   let pairs=qs.filter(q=>a[q.id]!==undefined&&a[q.id]!==null&&answerText(a[q.id])!=='').map(q=>[q.question_text,answerText(a[q.id])]);
   if(!pairs.length) pairs=Object.entries(a).map(([k,v])=>[k,answerText(v)]);
   if(!pairs.length)return '<span class="text-slate-400">பதில்கள் இல்லை</span>';
   return '<div class="flex flex-col gap-1">'+pairs.map(([k,v])=>'<div class="text-[12px] text-slate-700"><span class="font-semibold text-slate-800">'+esc(k)+':</span> '+esc(v)+'</div>').join('')+'</div>';
 };

 const options=(el,values,placeholder,keep=true)=>{if(!el)return;const old=keep?el.value:'';el.innerHTML='<option value="">'+esc(placeholder)+'</option>'+values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');if(values.includes(old))el.value=old;};

 if(location.pathname.toLowerCase().endsWith('admin.html') || location.pathname.toLowerCase().endsWith('subadmin.html')){
   const filterRow=$('filterContainer') || $('fSearch')?.parentElement;
   if(filterRow){
       filterRow.className = 'grid grid-cols-1 md:grid-cols-4 gap-3 mt-4';
       
       filterRow.innerHTML = `
         <div><label class="text-xs font-semibold text-slate-600 mb-1 block">Main Type</label><select id="fMain" onchange="renderData()"><option value="">All</option><option value="extension">Extension</option><option value="development">Development</option></select></div>
         <div><label class="text-xs font-semibold text-slate-600 mb-1 block">AD Office</label><select id="fSub" onchange="renderData()"><option value="">All AD Offices</option></select></div>
         <div><label class="text-xs font-semibold text-slate-600 mb-1 block">AI Office</label><select id="fDiv" onchange="renderData()"><option value="">All AI Offices</option></select></div>
         <div><label class="text-xs font-semibold text-slate-600 mb-1 block">Season / Year</label><select id="fL1"><option value="">All</option></select></div>
         <div><label class="text-xs font-semibold text-slate-600 mb-1 block">Program / Crop</label><select id="fL2"><option value="">All</option></select></div>
         <div><label class="text-xs font-semibold text-slate-600 mb-1 block">Sub Program</label><select id="fL3"><option value="">All</option></select></div>
         <div><label class="text-xs font-semibold text-slate-600 mb-1 block">Project / Item</label><select id="fL4"><option value="">All</option></select></div>
         <div><label class="text-xs font-semibold text-slate-600 mb-1 block">Search</label><input id="fSearch" placeholder="Search..." /></div>
         <div class="hidden"><select id="fOffice"></select></div>
       `;
   }
   
   const fMainEl = $('fMain');
   const fSubEl = $('fSub');
   const fDivEl = $('fDiv');

   function updateDivAndOfficeOptions() {
       const subId = fSubEl?.value || '';
       const hh = window.hierarchy || [];
       let divs = [];
       if (subId) {
           const sub = hh.find(h => String(h.id) === String(subId));
           if (sub) sub.divisions.forEach(d => divs.push(d.name));
       } else {
           hh.forEach(h => h.divisions.forEach(d => divs.push(d.name)));
       }
       options(fDivEl, uniq(divs), 'All AI Offices');
   }

   if(fMainEl) fMainEl.addEventListener('change', () => { window.renderData(); });
   if(fSubEl) fSubEl.addEventListener('change', () => { updateDivAndOfficeOptions(); window.renderData(); });

   const baseFill=window.fillDataFilters;
   window.fillDataFilters=function(){
     if(baseFill)baseFill();
     updateDivAndOfficeOptions();
   };

   window.renderData=function(){
     const val=id=>$(id)?.value||'';
     let list=(window.responses||[]).slice();
     const role=localStorage.getItem('role'),mySub=localStorage.getItem('user_subOfficeId');
     
     // Scope restriction for Sub Admin
     if(role==='sub_admin') list=list.filter(r=>String(r.subOfficeId)===String(mySub));
     
     const fMain = val('fMain');
     if(fMain) list=list.filter(r=>String(r.main_type)===fMain);

     // Cascading filters based on Main Type
     const filteredByMain = list.filter(r => !fMain || r.main_type === fMain);
     
     options($('fL1'),uniq(filteredByMain.map(r=>r.level1)),'All');
     options($('fL2'),uniq(filteredByMain.map(r=>r.level2)),'All');
     options($('fL3'),uniq(filteredByMain.map(r=>r.level3)),'All');
     options($('fL4'),uniq(filteredByMain.map(r=>(r.node_path||'').split(' > ').slice(-1)[0])),'All');
     
     if(role === 'main_admin'){
        const fSub = val('fSub');
        if(fSub) list=list.filter(r=>String(r.subOfficeId)===fSub);
     } else {
         // If sub_admin, ensure AD Office filter is populated but disabled/hidden
         const fSubEl = $('fSub');
         if(fSubEl) {
             if(fSubEl.options.length <= 1) {
                 fSubEl.innerHTML = `<option value="${mySub}">${localStorage.getItem('user_subOfficeName')||mySub}</option>`;
             }
             fSubEl.disabled = true;
         }
     }
     
     [['fDiv','division'],['fL1','level1'],['fL2','level2'],['fL3','level3']].forEach(([id,k])=>{if(val(id))list=list.filter(r=>String(r[k]||'')===val(id));});
     if(val('fL4'))list=list.filter(r=>(r.node_path||'').split(' > ').slice(-1)[0]===val('fL4'));
     
     const search=val('fSearch').toLowerCase();if(search)list=list.filter(r=>(JSON.stringify(r.answers||'')+' '+r.node_path+' '+r.division+' '+r.office+' '+r.subOfficeName).toLowerCase().includes(search));
     
     window.currentFilteredAdminData = list;
     
     if($('dataScopeNote'))$('dataScopeNote').textContent=(role==='main_admin'?'Main Admin':'Sub Admin')+' • මුළු '+ (list.length||0) +' • Filter කළ ප්‍රමාණය '+list.length;
     const body=$('dataTbody');if(!body)return;
     body.innerHTML=list.slice(0,300).map(r=>'<tr><td class="text-xs"><b>'+esc(r.node_path||'')+'</b><br><span class="text-slate-400">'+esc(r.main_type||'')+'</span></td><td class="text-xs">'+esc(r.subOfficeName||r.subOfficeId||'')+'<br><b>'+esc(r.division||'')+'</b><br>'+esc(r.office||'')+'</td><td>'+answerHtml(r)+'</td><td class="text-xs">'+esc(r.submittedName||r.submittedBy||'')+'<br>'+esc(r.created_at?new Date(r.created_at).toLocaleString():'')+'</td><td><button onclick="editData(\''+esc(r.id)+'\')" class="btn btn-ghost px-2 py-1 text-xs">Edit</button> <button onclick="delData(\''+esc(r.id)+'\')" class="text-red-500 text-xs px-2 font-semibold">Delete</button></td></tr>').join('')||'<tr><td colspan="5" class="text-center py-6 text-slate-400">தரவு இல்லை</td></tr>';
   };
   
   setTimeout(()=>{window.fillDataFilters();window.renderData();},0);
 }
})();