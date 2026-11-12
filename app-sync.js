/* Kandy Data Collection – Supabase reliability layer */
(function () {
  'use strict';
  const isAdmin = location.pathname.toLowerCase().endsWith('admin.html');
  const isUnit = location.pathname.toLowerCase().endsWith('unit.html');
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const csvCell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  
  const downloadCSV = (rows, filename) => {
    if (!rows.length) { if (window.showToast) showToast('දත්ත නැත', false); return; }
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const generateFlattenedCSV = (dataList) => {
      const allQ = [];
      dataList.forEach(r => {
          (window.questions || []).filter(q => String(q.node_id) === String(r.node_id)).forEach(q => {
              if(!allQ.some(x => x.id === q.id)) allQ.push(q);
          });
      });
      
      const headers = ['Date', 'Main Type', 'Path', 'Sub Office', 'Division', 'Office', 'User'];
      allQ.forEach(q => headers.push(q.question_text));
      
      const rows = [headers];
      dataList.forEach(r => {
          const answers = r.answers || {};
          const row = [
              r.created_at, r.main_type, r.node_path, r.subOfficeName || r.subOfficeId, r.division, r.office, r.submittedName
          ];
          allQ.forEach(q => {
              const val = answers[q.id];
              row.push(Array.isArray(val) ? val.join(', ') : (val !== undefined && val !== null ? String(val) : ''));
          });
          rows.push(row);
      });
      return rows;
  };

  const must = (result, label) => {
    if (result && result.error) throw result.error;
    return result ? result.data : null;
  };
  const getProfile = async () => {
    const auth = await sb.auth.getUser();
    if (auth.error || !auth.data.user) throw auth.error || new Error('Login session නැත');
    const p = await sb.from('profiles').select('*').eq('id', auth.data.user.id).single();
    return {user:auth.data.user, profile:must(p,'profile')};
  };
  const mapResponse = x => ({
    id:x.id, node_id:x.node_id, main_type:x.main_type, level1:x.level1, level2:x.level2,
    level3:x.level3, node_path:x.node_path, subOfficeId:x.sub_office_id,
    subOfficeName:x.sub_office_name, division:x.division, office:x.office,
    submittedBy:x.submitted_by_email, submittedName:x.submitted_by_name,
    answers:x.answers || {}, selected_items:x.selected_items || [],
    selected_sub:x.selected_sub || null, created_at:x.created_at, updated_at:x.updated_at
  });

  if (isAdmin) {
    if (localStorage.getItem('role') === 'sub_admin') {
      document.querySelectorAll('[data-nav="builder"]').forEach(el=>el.classList.add('hidden'));
      document.querySelectorAll('button[onclick*="goNav(\'builder\')"]').forEach(el=>el.classList.add('hidden'));
      
      setTimeout(() => {
          const uFormCard = document.getElementById('userFormCard');
          if(uFormCard) uFormCard.classList.add('hidden');
          const grid = document.querySelector('#page-users > .grid');
          if(grid) grid.className = 'grid grid-cols-1 gap-5'; 
      }, 500);

      const oldGoNav = window.goNav;
      if (typeof oldGoNav === 'function') window.goNav = function(page) {
        if (page === 'builder') page = 'data';
        return oldGoNav(page);
      };
    }
    window.sbSaveNode = async function(n) {
      if (typeof sb === 'undefined' || !sb) throw new Error('Supabase client නැත');
      const payload = {id:n.id,main_type:n.main_type,level:n.level,parent_id:n.parent_id,
        title:n.title,subtitle:n.subtitle||'',is_published:!!n.is_published,sort_order:n.sort_order||0};
      const res = await sb.from('nodes').upsert(payload,{onConflict:'id'});
      must(res,'node save');
      return true;
    };

    window.saveHier = function(h) {
      localStorage.setItem(H_KEY, JSON.stringify(h));
      if (typeof sb !== 'undefined' && sb) sb.from('office_hierarchy')
        .upsert({id:'default',hierarchy:h,updated_at:new Date().toISOString()},{onConflict:'id'})
        .then(res=>{if(res.error)showToast('Office hierarchy Supabase වල Save වුනේ නැත: '+res.error.message,false);});
    };

    window.sbSync = async function() {
      const status = document.getElementById('sbStatus');
      try {
        if (typeof sb === 'undefined' || !sb) throw new Error('Supabase client නැත');
        if (status) status.textContent = 'Supabase: Loading…';
        let nr = await sb.from('nodes').select('*').order('sort_order');
        let remoteNodes = must(nr,'nodes read') || [];
        if (!remoteNodes.length && (window.role === 'main_admin' || localStorage.getItem('role') === 'main_admin')) {
          const defaults = typeof defNodes === 'function' ? defNodes() : [];
          if (defaults.length) {
            must(await sb.from('nodes').upsert(defaults.map(n=>({
              id:n.id,main_type:n.main_type,level:n.level,parent_id:n.parent_id,title:n.title,
              subtitle:n.subtitle||'',is_published:!!n.is_published,sort_order:n.sort_order||0
            })),{onConflict:'id'}),'seed nodes');
            nr = await sb.from('nodes').select('*').order('sort_order');
            remoteNodes = must(nr,'nodes reload') || [];
          }
        }
        if (remoteNodes.length) {
          nodes = remoteNodes.map(x=>({id:x.id,main_type:x.main_type,level:x.level,parent_id:x.parent_id,
            title:x.title,subtitle:x.subtitle||'',is_published:x.is_published,sort_order:x.sort_order||0}));
          saveLocal(N_KEY,nodes);
        }
        let qr = await sb.from('questions').select('*').order('order_index');
        let remoteQs = must(qr,'questions read') || [];
        if (!remoteQs.length && (window.role === 'main_admin' || localStorage.getItem('role') === 'main_admin')) {
          const defaults = typeof defQs === 'function' ? defQs() : [];
          if (defaults.length) {
            must(await sb.from('questions').upsert(defaults.map(q=>({
              id:q.id,node_id:q.node_id,question_text:q.question_text,question_type:q.question_type,
              options:q.options||[],is_required:!!q.is_required,order_index:q.order_index||0
            })),{onConflict:'id'}),'seed questions');
            qr = await sb.from('questions').select('*').order('order_index');
            remoteQs = must(qr,'questions reload') || [];
          }
        }
        if (remoteQs.length) {
          questions = remoteQs.map(x=>({id:x.id,node_id:x.node_id,question_text:x.question_text,
            question_type:x.question_type,options:x.options||[],is_required:x.is_required,order_index:x.order_index||0}));
          saveLocal(Q_KEY,questions);
        }
        const rr = await sb.from('responses').select('*').order('created_at',{ascending:false}).limit(2000);
        responses = (must(rr,'responses read')||[]).map(mapResponse);
        saveLocal(R_KEY,responses);
        const hr = await sb.from('office_hierarchy').select('hierarchy').eq('id','default').maybeSingle();
        if (hr.error) throw hr.error;
        if (hr.data && Array.isArray(hr.data.hierarchy)) {
          window.hierarchy = hr.data.hierarchy;
          localStorage.setItem(H_KEY, JSON.stringify(window.hierarchy));
          if (typeof renderHierarchy==='function') renderHierarchy();
          if (typeof fillUserSelects==='function') fillUserSelects();
          if (typeof fillDataFilters==='function') fillDataFilters();
        } else if (localStorage.getItem('role')==='main_admin') {
          const h0 = typeof loadHier==='function' ? loadHier() : [];
          const hw = await sb.from('office_hierarchy').upsert({id:'default',hierarchy:h0,updated_at:new Date().toISOString()},{onConflict:'id'});
          must(hw,'initial hierarchy save');
        }
        if (localStorage.getItem('role')==='main_admin' || localStorage.getItem('role')==='sub_admin') {
          const pr = await sb.from('profiles').select('*').order('created_at',{ascending:false});
          const ps = must(pr,'profiles read') || [];
          users = ps.map(x=>({id:x.id,name:x.name||'',username:x.username||'',password:'',
            role:x.role||'unit_user',subOfficeId:x.sub_office_id||'ALL',division:x.division||'ALL',
            office:x.office||'',officer_name:x.officer_name||'',status:x.status||'active'}));
          saveLocal(U_KEY,users);
          if (typeof renderUsers==='function') renderUsers();
        }
        if (status) status.textContent = 'Supabase: Connected ✓';
        if (typeof renderDashboard==='function') renderDashboard();
        if (typeof renderData==='function') renderData();
        if (typeof renderAllSteps==='function') renderAllSteps();
      } catch (e) {
        if (status) status.textContent = 'Supabase Error';
        if (window.showToast) showToast('Supabase දෝෂයකි: '+(e.message||e),false);
        console.error('Kandy Supabase sync:',e);
      }
    };

    // UPDATED: qForm listener with upsertNodeChain
    const qForm = document.getElementById('qForm');
    if (qForm) qForm.addEventListener('submit', async function(e) {
      e.preventDefault(); e.stopImmediatePropagation();
      const lid = typeof leafId==='function' ? leafId() : null;
      if (!lid) return showToast('මුලින්ම අංශය තෝරන්න',false);

      // 1. Upsert Parent Node Chain
      if (typeof sb !== 'undefined' && sb) {
        try {
            async function upsertNodeChain(nodeId) {
                if (!nodeId) return;
                var n = window.nodes.find(x => x.id === nodeId);
                if (!n) return;
                if (n.parent_id) {
                    await upsertNodeChain(n.parent_id);
                }
                await sb.from('nodes').upsert({
                    id: n.id, main_type: n.main_type, level: n.level, parent_id: n.parent_id,
                    title: n.title, subtitle: n.subtitle || '', is_published: n.is_published, sort_order: n.sort_order
                }, { onConflict: 'id' });
            }
            await upsertNodeChain(lid);
        } catch(err) {
            console.error("Node chain save failed:", err);
            return showToast('ප්‍රශ්නය සුරැකීමට පෙර නෝඩ් සුරැකීම අසාර්ථක විය: ' + err.message, false);
        }
      }

      // 2. Save Question
      const oldId = document.getElementById('qId').value;
      const old = (questions||[]).find(q=>q.id===oldId);
      const payload = {id:oldId||('q'+Date.now()+Math.random().toString(36).slice(2,7)),
        node_id:lid,question_text:document.getElementById('qText').value.trim(),
        question_type:document.getElementById('qType').value,options:(window.curOptions||[]).slice(),
        is_required:document.getElementById('qReq').value==='1',
        order_index:old ? old.order_index : (questions||[]).filter(q=>q.node_id===lid).length+1};
      if (!payload.question_text) return showToast('ප්‍රශ්නය ඇතුළත් කරන්න',false);
      if (['dropdown','multiple_choice','checkbox'].includes(payload.question_type) && !payload.options.length)
        return showToast('මෙම ප්‍රශ්න වර්ගයට අවම වශයෙන් එක් විකල්පයක් අවශ්‍යයි',false);
      
      try {
        must(await sb.from('questions').upsert(payload,{onConflict:'id'}),'question save');
        if (oldId) { const i=questions.findIndex(q=>q.id===oldId); if(i>=0) questions[i]=payload; }
        else questions.push(payload);
        saveLocal(Q_KEY,questions);
        if (typeof resetQ==='function') resetQ();
        if (typeof renderQuestions==='function') renderQuestions();
        showToast('ප්‍රශ්නය Supabase වල Save විය ✓',true);
      } catch(err) { showToast('ප්‍රශ්නය Save වුනේ නැත: '+err.message,false); }
    }, true);

    window.delQ = async function(id) {
      if (!(await profConfirm('මෙම ප්‍රශ්නය ඉවත් වේ.','Delete කරන්නද?'))) return;
      try {
        must(await sb.from('questions').delete().eq('id',id),'question delete');
        questions=questions.filter(q=>q.id!==id); saveLocal(Q_KEY,questions);
        renderQuestions(); showToast('ප්‍රශ්නය ඉවත් විය ✓',true);
      } catch(e) { showToast('Delete අසාර්ථකයි: '+e.message,false); }
    };
    window.saveEdit = async function() {
      const r=responses.find(x=>String(x.id)===String(editingId)); if(!r)return;
      const answers={}; document.querySelectorAll('[data-edit-qid]').forEach(el=>{answers[el.dataset.editQid]=el.value;});
      try {
        must(await sb.from('responses').update({answers,updated_at:new Date().toISOString()}).eq('id',r.id),'response update');
        r.answers=answers; r.updated_at=new Date().toISOString(); saveLocal(R_KEY,responses);
        closeEdit(); renderData(); showToast('Edit Save විය ✓',true);
      } catch(e) { showToast('Edit Save වුනේ නැත: '+e.message,false); }
    };
    window.delData = async function(id) {
      if (!(await profConfirm('මෙම පිළිතුර ඉවත් වේ.','Delete කරන්නද?'))) return;
      try {
        must(await sb.from('responses').delete().eq('id',id),'response delete');
        responses=responses.filter(x=>String(x.id)!==String(id)); saveLocal(R_KEY,responses);
        renderData(); renderDashboard(); showToast('දත්ත ඉවත් විය ✓',true);
      } catch(e) { showToast('Delete අසාර්ථකයි: '+e.message,false); }
    };
    
    // EXPORT ADMIN DATA (Excel Friendly with Filters)
    window.downloadCSV = function() {
      let list = window.currentFilteredAdminData || (window.responses || []);
      if(!list.length) { if(window.showToast) showToast('දත්ත නැත', false); return; }
      const rows = generateFlattenedCSV(list);
      downloadCSV(rows, 'kandy_all_responses.xls');
    };

    const userForm = document.getElementById('userForm');
    if (userForm) userForm.addEventListener('submit', async function(e) {
      e.preventDefault(); e.stopImmediatePropagation();
      const id=document.getElementById('uId').value;
      if (!id) return showToast('අලුත් Login User සෑදීමට Supabase Dashboard → Authentication → Add User භාවිතා කරන්න.',false);
      const payload={username:document.getElementById('uUsername').value.trim(),
        name:document.getElementById('uName').value.trim(),role:document.getElementById('uRole').value,
        sub_office_id:document.getElementById('uSub').value,division:document.getElementById('uDiv').value,
        office:document.getElementById('uOffice').value,status:document.getElementById('uStatus').value,
        officer_name:document.getElementById('uOfficer').value.trim(),
        updated_at:new Date().toISOString()};
      try {
        must(await sb.from('profiles').update(payload).eq('id',id),'profile update');
        const ix=users.findIndex(x=>String(x.id)===String(id));
        if(ix>=0) users[ix]={...users[ix],name:payload.name,username:payload.username,role:payload.role,
          subOfficeId:payload.sub_office_id,division:payload.division,office:payload.office,officer_name:payload.officer_name,status:payload.status};
        saveLocal(U_KEY,users); renderUsers(); resetUser(); showToast('User Profile Save විය ✓',true);
      } catch(err) { showToast('Profile Save වුනේ නැත: '+err.message,false); }
    }, true);

    window.sbSync();
  }

  if (isUnit) {
    window.sbLoad = async function() {
      try {
        const hr=await sb.from('office_hierarchy').select('hierarchy').eq('id','default').maybeSingle();
        if(hr.error) throw hr.error;
        if(hr.data && Array.isArray(hr.data.hierarchy)) {
          localStorage.setItem(H_KEY,JSON.stringify(hr.data.hierarchy));
          window.hierarchy=hr.data.hierarchy; 
        }
        const nr=await sb.from('nodes').select('*').order('sort_order');
        const n=must(nr,'published nodes read')||[];
        nodes=n.map(x=>({id:x.id,main_type:x.main_type,level:x.level,parent_id:x.parent_id,
          title:x.title,subtitle:x.subtitle||'',is_published:x.is_published,sort_order:x.sort_order||0}));
        const qr=await sb.from('questions').select('*').order('order_index');
        questions=(must(qr,'published questions read')||[]).map(x=>({id:x.id,node_id:x.node_id,
          question_text:x.question_text,question_type:x.question_type,options:x.options||[],
          is_required:x.is_required,order_index:x.order_index||0}));
        const rr=await sb.from('responses').select('*').order('created_at',{ascending:false}).limit(1000);
        responses=(must(rr,'own responses read')||[]).map(mapResponse);
        saveLocal(N_KEY,nodes); saveLocal(Q_KEY,questions); saveLocal(R_KEY,responses);
        
        if (typeof renderUSelects==='function') renderUSelects();
        if (typeof renderMy==='function') renderMy();
      } catch(e) {
        console.error('Unit Supabase load:',e);
        if(window.showToast) showToast('Supabase දත්ත Load වුනේ නැත: '+e.message,false);
      }
    };

    window.submitUForm = async function(e) {
      e.preventDefault();
      const f=document.getElementById('dynForm');
      if(!f || !f.checkValidity()){ if(f)f.reportValidity(); return false; }
      const ans=collectAns();
      const lids = typeof leafIds === 'function' ? leafIds() : [];
      if(!lids.length) return showToast('ප්‍රශ්න ඇති අංශය තෝරන්න',false);
      
      try {
        const ctx=await getProfile();
        
        let lidsToSave = lids.filter(lid => (window.questions||[]).some(q => String(q.node_id) === String(lid)));
        if (lidsToSave.length === 0 && window.curMain === 'development' && window.curItems && window.curItems.length > 0 && window.curL3) {
            if ((window.questions||[]).some(q => String(q.node_id) === String(window.curL3))) {
                lidsToSave = [window.curL3];
            }
        }

        for(let i=0; i<lidsToSave.length; i++) {
          let lid = lidsToSave[i];
          let lidQs = (window.questions||[]).filter(q => String(q.node_id) === String(lid)).map(q => q.id);
          let itemAns = {};
          lidQs.forEach(qid => { if(ans[qid] !== undefined) itemAns[qid] = ans[qid]; });
          
          if(Object.keys(itemAns).length === 0) continue;

          const payload={
            node_id:lid,
            main_type:window.curMain,
            level1:window.curL1?(nodes.find(x=>x.id===window.curL1)||{}).title:'',
            level2:window.curL2?(nodes.find(x=>x.id===window.curL2)||{}).title:'',
            level3:window.curL3?(nodes.find(x=>x.id===window.curL3)||{}).title:'',
            node_path:typeof nodePath === 'function' ? nodePath() : '',
            sub_office_id:ctx.profile.sub_office_id,
            sub_office_name:ctx.profile.sub_office_name,
            division:ctx.profile.division,
            office:ctx.profile.office,
            submitted_by:ctx.user.id,
            submitted_by_email:window.myUser || localStorage.getItem('user'),
            submitted_by_name:window.myName || localStorage.getItem('user_name'),
            answers:itemAns,
            selected_items:[lid],
            selected_sub:window.curSub||null
          };
          const saved=must(await sb.from('responses').insert(payload).select('*').single(),'response insert');
          responses.unshift(mapResponse(saved)); 
        }
        
        saveLocal(R_KEY,responses);
        document.getElementById('okBox').classList.remove('hidden');
        f.querySelectorAll('[data-qid]').forEach(el=>{
          if(el.type==='checkbox'||el.type==='radio')el.checked=false;else el.value='';
        });
        renderMy(); showToast('දත්ත Supabase වල Save විය ✓',true);
      } catch(err) {
        showToast('Save වුනේ නැත: '+err.message,false);
        console.error('Response insert failed:',err);
      }
      return false;
    };
    window.saveMyEdit = async function() {
      const r=responses.find(x=>String(x.id)===String(editingId)); if(!r)return;
      const answers={}; document.querySelectorAll('[data-my-qid]').forEach(el=>{answers[el.dataset.myQid]=el.value;});
      try {
        must(await sb.from('responses').update({answers,updated_at:new Date().toISOString()}).eq('id',r.id),'my response update');
        r.answers=answers; r.updated_at=new Date().toISOString(); saveLocal(R_KEY,responses);
        closeMyEdit(); renderMy(); showToast('Edit Save විය ✓',true);
      } catch(e) { showToast('Edit Save වුනේ නැත: '+e.message,false); }
    };
    window.delMy = async function(id) {
      if (!(await profConfirm('මෙම පිළිතුර ඉවත් වේ.','Delete කරන්නද?'))) return;
      try {
        must(await sb.from('responses').delete().eq('id',id),'my response delete');
        responses=responses.filter(x=>String(x.id)!==String(id)); saveLocal(R_KEY,responses);
        renderMy(); showToast('දත්ත ඉවත් විය ✓',true);
      } catch(e) { showToast('Delete අසාර්ථකයි: '+e.message,false); }
    };
    
    // EXPORT UNIT DATA (Excel Friendly with Filters)
    window.downloadMyCSV = function() {
      let list = window.currentFilteredUnitData || (responses||[]).filter(r=>r.division===myDiv && r.office===myOffice);
      if(!list.length) { if(window.showToast) showToast('දත්ත නැත', false); return; }
      const rows = generateFlattenedCSV(list);
      downloadCSV(rows, 'my_unit_data.xls');
    };
    
    window.sbLoad();
  }
})();