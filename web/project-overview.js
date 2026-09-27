// 项目总览及显式项目创建，不生成示例交付物。
(() => {
  let projects = [];
  let selectedId = null;
  let sources = [];
  const selectedTaskSourceIds = new Set();
  let runningTask = false;
  let resultId = null;
  let highlightedDeliverableId = null;
  let highlightedRevisionId = null;
  let transitioningRevisionId = null;
  let changeRequestBusy = false;
  const revisionHistories = new Map();
  let revisionDetailBusy = false;
  const transitionFeedback = new Map();
  const statusLabels = {active:'进行中',completed:'已完成',archived:'已归档',draft:'待负责人确认',confirmed:'已确认',doing:'执行中',submitted:'已提交',accepted:'已验收'};
  const changeStatusLabels = {proposed:'待负责人决定',accepted:'已接受并形成新版本',rejected:'已拒绝'};
  const impactLabels = {scope:'范围',schedule:'期限',responsibility:'负责人',acceptance:'验收'};
  const changeFieldLabels = {title:'成果名称',scope:'交付范围',acceptance_criteria:'验收标准',owner:'执行负责人',approver:'验收负责人',due_date:'截止日期',due_date_status:'日期状态'};
  function nextStepMarkup(item, project) {
    if (item.status === 'draft') {
      const busy = item.current_revision_id === transitioningRevisionId;
      const disabled = busy || project?.status !== 'active' || !item.approver;
      const feedback = transitionFeedback.get(item.current_revision_id) || '';
      return `<div class="deliverable-next-step"><strong>待负责人确认</strong><span>由验收负责人“${escapeHtml(item.approver || '待明确')}”确认范围和验收标准；确认后作为本机交付计划保存。</span><button class="primary-button" type="button" data-confirm-draft="${item.current_revision_id}" ${disabled?'disabled':''}>${busy?'正在确认……':'确认交付计划'}</button><p role="status">${escapeHtml(feedback)}</p></div>`;
    }
    const messages = {
      confirmed:'已确认并保存在本机。Finto 当前不提供任务接收或多人协作。',
      doing:'已标记为执行中（单机记录）。Finto 当前不提供多人协作。',
      submitted:'已标记为已提交（单机记录），实际验收仍需在线下完成。',
      accepted:'已验收，本版本状态流转完成。',
    };
    return `<span class="deliverable-next-step-text">${messages[item.status] || '暂无下一步说明。'}</span>`;
  }
  function updateProjectDeliveryPath(project) {
    const selectedCount=selectedTaskSourceIds.size;
    const availableCount=sources.filter(source=>source.ai_access===1).length;
    const active=Boolean(project&&project.status==='active');
    const setStep=(id,statusId,stateName,message)=>{
      const step=document.querySelector(id),status=document.querySelector(statusId);
      step.classList.remove('complete','current','waiting','optional');
      step.classList.add(stateName);
      status.textContent=message;
    };
    setStep('#projectPathProject','#projectPathProjectStatus',active?'complete':'current',active?`已选择“${project.name}”第${project.cycle_no}周期。`:'先创建项目，或选择一个进行中的项目。');
    setStep('#projectPathAuthorization','#projectPathAuthorizationStatus',selectedCount?'complete':active?'current':'waiting',selectedCount?`已选择 ${selectedCount} 份资料；任务只会读取本次加入的资料。`:active?'请从下拉列表加入本次任务真正需要的资料。':'先选择一个进行中的项目。');
    setStep('#projectPathRun','#projectPathRunStatus',selectedCount&&active?'current':'waiting',selectedCount&&active?'可以运行；结果会先进入待审，不会直接写入交付清单。':'加入至少一份资料后才能运行。');
    document.querySelector('#taskSourceCount').textContent=`资料库 ${availableCount}`;
  }
  function renderTaskSourcePicker() {
    const available=sources.filter(source=>source.ai_access===1);
    const availableIds=new Set(available.map(source=>source.id));
    [...selectedTaskSourceIds].forEach(id=>{if(!availableIds.has(id))selectedTaskSourceIds.delete(id);});
    const picker=document.querySelector('#taskSourcePicker');
    const remaining=available.filter(source=>!selectedTaskSourceIds.has(source.id));
    picker.innerHTML=`<option value="">${available.length?'选择一份资料加入本次任务':'暂无可用资料'}</option>${remaining.map(source=>`<option value="${source.id}">#${source.id} ${escapeHtml(source.title)}</option>`).join('')}`;
    picker.value='';
    picker.disabled=runningTask||!remaining.length;
    const selected=available.filter(source=>selectedTaskSourceIds.has(source.id));
    document.querySelector('#selectedTaskSources').innerHTML=selected.length
      ?selected.map(source=>`<div class="selected-source-item"><span><strong>#${source.id} ${escapeHtml(source.title)}</strong><small>本次任务可读取</small></span><button type="button" data-remove-task-source="${source.id}" aria-label="移除 ${escapeHtml(source.title)}">移除</button></div>`).join('')
      :'<p class="form-hint">尚未加入资料。任务只读取这里明确加入的资料。</p>';
  }
  function updateExecutionModeGuide() {
    const selected=document.querySelector('#taskExecutionMode').value;
    document.querySelectorAll('[data-execution-mode-choice]').forEach(choice=>{
      const active=choice.dataset.executionModeChoice===selected;
      choice.classList.toggle('selected',active);
      choice.setAttribute('aria-pressed',String(active));
    });
  }
  function addAcceptanceItemRow(item={text:'',status:'pending',evidence:''}) {
    const row=document.createElement('div');
    row.className='acceptance-item-row';
    row.innerHTML=`<label>验收项<input data-acceptance-text required value="${escapeHtml(item.text||'')}"></label><label>状态<select data-acceptance-status><option value="pending">待验证</option><option value="satisfied">已满足</option><option value="not_applicable">不适用</option></select></label><label>依据或说明<input data-acceptance-evidence value="${escapeHtml(item.evidence||'')}"></label><button class="secondary-button" type="button" data-remove-acceptance aria-label="删除验收项">删除</button>`;
    row.querySelector('[data-acceptance-status]').value=item.status||'pending';
    document.querySelector('#changeAcceptanceItems').appendChild(row);
  }
  function changeFormFields() {
    return {
      title:document.querySelector('#changeTitle').value.trim(),
      scope:document.querySelector('#changeScope').value.trim(),
      acceptance_criteria:document.querySelector('#changeAcceptanceCriteria').value.trim(),
      owner:document.querySelector('#changeOwner').value.trim(),
      approver:document.querySelector('#changeApprover').value.trim(),
      due_date:document.querySelector('#changeDueDate').value,
      due_date_status:document.querySelector('#changeDueDateStatus').value,
    };
  }
  function renderChangeDiff(baseFields) {
    const changes=Object.entries(changeFormFields()).filter(([field,value])=>String(baseFields?.[field]||'')!==String(value||''));
    const preview=document.querySelector('#changeDiffPreview');
    preview.classList.toggle('visible',Boolean(changes.length));
    preview.innerHTML=changes.length?`<h3>准备修改 ${changes.length} 个字段</h3><ul>${changes.map(([field,value])=>`<li><strong>${escapeHtml(changeFieldLabels[field]||field)}</strong>：${escapeHtml(baseFields?.[field]||'未填写')} → ${escapeHtml(value||'未填写')}</li>`).join('')}</ul>`:'';
  }
  function fillChangeDialog(item,changeRequest=null) {
    const project=projects.find(entry=>entry.id===selectedId),dialog=document.querySelector('#changeRequestDialog');
    const deciding=Boolean(changeRequest),fields=deciding?changeRequest.proposed_fields:{title:item.title||'',scope:item.scope||'',acceptance_criteria:item.acceptance_criteria||'',owner:item.owner||'',approver:item.approver||'',due_date:item.due_date||'',due_date_status:item.due_date_status||'pending'};
    document.querySelector('#changeDeliverableId').value=String(item.id);
    document.querySelector('#changeRequestId').value=deciding?String(changeRequest.id):'';
    document.querySelector('#changeRequestTitle').textContent=deciding?'确认版本变更':'提出版本变更';
    document.querySelector('#changeRequestContext').textContent=deciding?`基于第${changeRequest.base_revision_no||'?'}版提出：${changeRequest.reason}`:`当前为第${item.revision_no}版；提交只会形成待确认变更，不会立即修改正式版本。`;
    document.querySelector('#changeReasonLabel').textContent=deciding?'决定原因':'变更原因';
    document.querySelector('#changeReason').value='';
    document.querySelector('#changeReason').placeholder=deciding?'说明为什么接受、修改后接受或拒绝':'说明为什么需要改变当前版本';
    Object.entries({changeTitle:fields.title,changeScope:fields.scope,changeAcceptanceCriteria:fields.acceptance_criteria,changeOwner:fields.owner,changeApprover:fields.approver,changeDueDate:fields.due_date}).forEach(([id,value])=>{document.querySelector(`#${id}`).value=value||'';});
    document.querySelector('#changeDueDateStatus').value=fields.due_date_status||'pending';
    const impacts=deciding?changeRequest.impact_analysis:[];
    const impactTypes=new Set(impacts.flatMap(impact=>impact.impact_types||[]));
    document.querySelectorAll('#changeImpactTypes input').forEach(input=>{input.checked=impactTypes.has(input.value);});
    document.querySelector('#changeImpactDescription').value=impacts.map(impact=>impact.description).filter(Boolean).join('；');
    const affected=new Set(deciding?impacts.map(impact=>impact.deliverable_id):[item.id]);
    document.querySelector('#changeAffectedDeliverables').innerHTML=(project?.deliverables||[]).map(deliverable=>`<label><input type="checkbox" value="${deliverable.id}" ${affected.has(deliverable.id)?'checked':''}>${escapeHtml(deliverable.title||`交付成果 ${deliverable.id}`)}</label>`).join('');
    const evidenceIds=new Set(deciding?changeRequest.evidence_source_ids:[]);
    document.querySelector('#changeEvidenceSources').innerHTML=sources.length?sources.map(source=>`<label><input type="checkbox" value="${source.id}" ${evidenceIds.has(source.id)?'checked':''}>#${source.id} ${escapeHtml(source.title)}</label>`).join(''):'<p class="form-hint">当前没有可选资料，也可以不添加依据。</p>';
    document.querySelector('#changeAcceptanceItems').innerHTML='';
    const acceptanceItems=deciding?changeRequest.acceptance_items:[{text:item.acceptance_criteria||'',status:'pending',evidence:''}];
    acceptanceItems.forEach(addAcceptanceItemRow);
    document.querySelector('#rejectChangeRequest').hidden=!deciding;
    document.querySelector('#submitChangeRequest').textContent=deciding?'接受并创建新版本':'保存待确认变更';
    document.querySelector('#changeRequestStatus').textContent='';
    dialog.dataset.baseFields=JSON.stringify(deciding?changeRequest.base_fields:fields);
    renderChangeDiff(JSON.parse(dialog.dataset.baseFields));
    dialog.showModal();
  }
  function collectChangePayload() {
    const impactTypes=[...document.querySelectorAll('#changeImpactTypes input:checked')].map(input=>input.value);
    const affectedIds=[...document.querySelectorAll('#changeAffectedDeliverables input:checked')].map(input=>Number(input.value));
    const description=document.querySelector('#changeImpactDescription').value.trim();
    return {
      fields:changeFormFields(),
      impact_analysis:affectedIds.map(deliverableId=>({deliverable_id:deliverableId,impact_types:impactTypes,description,origin:'manual'})),
      acceptance_items:[...document.querySelectorAll('.acceptance-item-row')].map(row=>({text:row.querySelector('[data-acceptance-text]').value.trim(),status:row.querySelector('[data-acceptance-status]').value,evidence:row.querySelector('[data-acceptance-evidence]').value.trim()})),
      evidence_source_ids:[...document.querySelectorAll('#changeEvidenceSources input:checked')].map(input=>Number(input.value)),
    };
  }
  async function submitChangeRequest(event) {
    event.preventDefault();
    if(changeRequestBusy)return;
    const project=projects.find(entry=>entry.id===selectedId),requestId=document.querySelector('#changeRequestId').value,deliverableId=Number(document.querySelector('#changeDeliverableId').value),reason=document.querySelector('#changeReason').value.trim(),data=collectChangePayload(),status=document.querySelector('#changeRequestStatus');
    if(!project||!reason||!data.impact_analysis.length||!data.impact_analysis[0].impact_types.length){status.textContent='请填写原因，并至少选择一个受影响成果和一种影响类型。';return;}
    changeRequestBusy=true;document.querySelector('#submitChangeRequest').disabled=true;
    try{
      if(requestId){
        await api(`/api/change-requests/${requestId}/decision`,{method:'POST',body:JSON.stringify({decision:'accepted',actor:project.owner,reason,final_fields:data.fields,impact_analysis:data.impact_analysis,acceptance_items:data.acceptance_items})});
        toast('变更已接受，新版本已创建；旧版本继续保留');
      }else{
        const item=project.deliverables.find(entry=>entry.id===deliverableId);
        await api(`/api/deliverables/${deliverableId}/change-requests`,{method:'POST',body:JSON.stringify({actor:project.owner,reason,base_revision_id:item.current_revision_id,proposed_fields:data.fields,impact_analysis:data.impact_analysis,acceptance_items:data.acceptance_items,evidence_source_ids:data.evidence_source_ids})});
        toast('变更已保存，正式版本尚未修改');
      }
      document.querySelector('#changeRequestDialog').close();
      await refreshProjects();
    }catch(error){status.textContent=error.message;}
    finally{changeRequestBusy=false;document.querySelector('#submitChangeRequest').disabled=false;}
  }
  async function rejectChangeRequest() {
    if(changeRequestBusy)return;
    const project=projects.find(entry=>entry.id===selectedId),requestId=document.querySelector('#changeRequestId').value,reason=document.querySelector('#changeReason').value.trim(),status=document.querySelector('#changeRequestStatus');
    if(!project||!requestId||!reason){status.textContent='请先填写拒绝原因。';return;}
    changeRequestBusy=true;
    try{
      await api(`/api/change-requests/${requestId}/decision`,{method:'POST',body:JSON.stringify({decision:'rejected',actor:project.owner,reason})});
      document.querySelector('#changeRequestDialog').close();
      await refreshProjects();
      toast('变更已拒绝，正式版本保持不变');
    }catch(error){status.textContent=error.message;}
    finally{changeRequestBusy=false;}
  }
  function changeRequestCards(project) {
    const requests=project?.change_requests||[];
    return requests.map(request=>{
      const item=project.deliverables.find(deliverable=>deliverable.id===request.deliverable_id),changed=request.changed_fields.map(change=>`<span>${escapeHtml(change.label)}</span>`).join(''),impacts=[...new Set(request.impact_analysis.flatMap(impact=>impact.impact_types||[]))].map(type=>impactLabels[type]||type).join('、');
      return `<article class="change-request-card ${request.status}"><header><div><h4>${escapeHtml(item?.title||'交付成果')} · ${escapeHtml(changeStatusLabels[request.status]||request.status)}</h4><p>${escapeHtml(request.reason)}</p></div><strong>#${request.id}</strong></header><div class="change-summary-list">${changed}<span>影响：${escapeHtml(impacts||'待确认')}</span><span>验收项：${request.acceptance_items.length}</span></div><div class="change-actions">${request.status==='proposed'?`<button type="button" class="primary-button" data-decide-change="${request.id}">查看并决定</button>`:''}<button type="button" class="secondary-button" data-change-report="${request.id}">${request.status==='proposed'?'查看完整变更':'查看并打印报告'}</button></div></article>`;
    }).join('');
  }
  function deliverableTable(items,project) {
    const rows=items.map(item=>{
      const dueDate=item.due_date_status==='confirmed'?item.due_date||'未填写':'日期待确认';
      return `<tr data-deliverable-id="${item.id}" class="${item.id===highlightedDeliverableId?'newly-created':''}" tabindex="-1"><td data-label="成果"><strong class="deliverable-name">${escapeHtml(item.title||'暂无当前版本')}</strong><span class="deliverable-acceptance">验收：${escapeHtml(item.acceptance_criteria||'待明确')}</span></td><td data-label="版本">${item.revision_no?`第${item.revision_no}版`:'—'}</td><td data-label="负责人"><span class="deliverable-responsibility"><strong>${escapeHtml(item.owner||'待明确')}</strong><small>验收：${escapeHtml(item.approver||'待明确')}</small></span></td><td data-label="期限">${escapeHtml(dueDate)}</td><td data-label="状态">${escapeHtml(statusLabels[item.status]||'暂无版本')}</td><td data-label="操作"><button type="button" class="deliverable-change-button" data-open-change="${item.id}" ${project.status==='active'?'':'disabled'}>提出变更</button></td></tr>`;
    }).join('');
    return `<table class="deliverable-table"><thead><tr>${['成果','版本','负责人','期限','状态','操作'].map(text=>`<th>${text}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
  }
  function revisionHistoryState(deliverableId) {
    if(!revisionHistories.has(deliverableId))revisionHistories.set(deliverableId,{items:[],total:0,hasMore:false,q:'',status:'',loaded:false,loading:false,error:'',open:false});
    return revisionHistories.get(deliverableId);
  }
  function revisionHistoryResults(item,state) {
    if(state.loading&&!state.loaded)return '<p class="revision-history-message">正在加载版本历史……</p>';
    if(state.error)return `<p class="revision-history-message error">${escapeHtml(state.error)}</p>`;
    if(!state.loaded)return '<p class="revision-history-message">展开后加载版本，不会一次读取全部历史。</p>';
    if(!state.items.length)return '<p class="revision-history-message">没有符合条件的版本。</p>';
    return `<div class="revision-history-list">${state.items.map(revision=>`<button type="button" class="revision-history-row ${revision.id===highlightedRevisionId?'newly-created-revision':''}" data-open-revision="${revision.id}"><span><strong>第${revision.revision_no}版${revision.is_current?' · 当前版本':''}</strong><small>${escapeHtml(statusLabels[revision.status]||revision.status)} · ${escapeHtml(revision.created_at||'时间未记录')}</small></span><span><small>截止日期</small><strong>${escapeHtml(revision.due_date||'待确认')}</strong></span><span class="revision-history-acceptance"><small>验收标准</small>${escapeHtml(revision.acceptance_criteria||'未记录')}</span><b aria-hidden="true">查看详情 →</b></button>`).join('')}</div>${state.hasMore?`<button type="button" class="secondary-button revision-load-more" data-load-more-revisions="${item.id}" ${state.loading?'disabled':''}>${state.loading?'正在加载……':`继续加载（已显示 ${state.items.length}/${state.total}）`}</button>`:''}`;
  }
  function deliverableHistories(items) {
    return items.map(item=>{
      const history=revisionHistoryState(item.id);
      return `<details class="deliverable-history" data-history-deliverable="${item.id}" ${history.open||item.id===highlightedDeliverableId?'open':''}><summary><span>${escapeHtml(item.title||'交付物')}的版本历史</span><small>${item.revision_count||0} 版 · 可筛选并查看详情</small></summary><div class="revision-history-body"><form class="revision-history-filters" data-revision-filter="${item.id}"><label>查找版本<input type="search" name="q" value="${escapeHtml(history.q)}" placeholder="版本号、负责人或验收标准"></label><label>状态<select name="status"><option value="">全部状态</option>${Object.entries({draft:'待负责人确认',confirmed:'已确认',doing:'执行中',submitted:'已提交',accepted:'已验收'}).map(([value,label])=>`<option value="${value}" ${history.status===value?'selected':''}>${label}</option>`).join('')}</select></label><button type="submit" class="secondary-button">筛选</button></form><div data-history-results="${item.id}">${revisionHistoryResults(item,history)}</div></div></details>`;
    }).join('');
  }
  async function loadRevisionHistory(deliverableId,{reset=false}={}) {
    const item=projects.find(project=>project.id===selectedId)?.deliverables.find(deliverable=>deliverable.id===deliverableId);
    if(!item)return;
    const history=revisionHistoryState(deliverableId);
    if(history.loading)return;
    history.loading=true;history.error='';
    renderProjects();
    try{
      const offset=reset?0:history.items.length;
      const params=new URLSearchParams({limit:'10',offset:String(offset)});
      if(history.q)params.set('q',history.q);
      if(history.status)params.set('status',history.status);
      const result=await api(`/api/deliverables/${deliverableId}/revisions?${params}`);
      history.items=reset?result.items:[...history.items,...result.items];
      history.total=result.total;history.hasMore=result.has_more;history.loaded=true;
    }catch(error){history.error=`加载失败：${error.message}`;}
    finally{history.loading=false;renderProjects();}
  }
  function revisionDetailMarkup(detail) {
    const revision=detail.revision,previous=detail.previous_revision,request=detail.change_request,review=detail.candidate_review,references=detail.acceptance_references||[];
    const fields=[['交付范围',revision.scope],['验收标准',revision.acceptance_criteria],['执行负责人',revision.owner],['验收负责人',revision.approver],['截止日期',revision.due_date||'待确认'],['日期状态',revision.due_date_status==='confirmed'?'已确认':'待确认']];
    const changes=previous?(detail.changed_fields.length?`<ul class="revision-detail-changes">${detail.changed_fields.map(change=>`<li><strong>${escapeHtml(change.label)}</strong><span>${escapeHtml(change.before||'未填写')}</span><b>→</b><span>${escapeHtml(change.after||'未填写')}</span></li>`).join('')}</ul>`:'<p>与上一版相比，业务字段没有变化。</p>'):'<p>这是首个版本，没有上一版可比较。</p>';
    const origin=request?`<p><strong>形成原因：</strong>${escapeHtml(request.decision_reason||request.reason||'未记录')}</p><p><strong>负责人：</strong>${escapeHtml(request.decided_by||request.created_by||'未记录')}</p>${request.evidence_sources?.length?`<p><strong>变更依据：</strong>${request.evidence_sources.map(source=>`#${source.id} ${escapeHtml(source.title)}`).join('、')}</p>`:''}`:review?`<p><strong>形成方式：</strong>负责人审查候选后${review.decision==='modified'?'修改采用':'采用'}</p><p><strong>审查人：</strong>${escapeHtml(review.actor||'未记录')}</p><p><strong>审查原因：</strong>${escapeHtml(review.reason||'未记录')}</p>`:'<p>该版本没有关联到候选审查或版本变更单。</p>';
    const transitions=detail.status_transitions.length?`<ol class="revision-transition-list">${detail.status_transitions.map(item=>`<li><strong>${escapeHtml(statusLabels[item.from_status]||item.from_status)} → ${escapeHtml(statusLabels[item.to_status]||item.to_status)}</strong><span>${escapeHtml(item.actor)} · ${escapeHtml(item.reason||'未填写原因')} · ${escapeHtml(item.created_at)}</span></li>`).join('')}</ol>`:'<p>尚无状态流转记录。</p>';
    return `<header class="revision-detail-heading"><div><small>${escapeHtml(revision.project_name||'项目')} · 第${revision.cycle_no||'?'}周期</small><h2>第${revision.revision_no}版 · ${escapeHtml(revision.title)}</h2></div><span>${revision.is_current?'当前版本':'历史版本'}</span></header><section><h3>完整版本内容</h3><dl class="revision-detail-fields">${fields.map(([label,value])=>`<div><dt>${label}</dt><dd>${escapeHtml(value||'未记录')}</dd></div>`).join('')}</dl></section><section><h3>验收参考</h3>${references.length?`<ul class="revision-reference-list">${references.map(reference=>`<li><strong>${escapeHtml(reference.title)}</strong><span>${escapeHtml(reference.body||'未记录内容')}</span><small>由 ${escapeHtml(reference.linked_by)} 在审查时引用</small></li>`).join('')}</ul>`:'<p>本版本没有关联验收参考。</p>'}</section><section><h3>与${previous?`第${previous.revision_no}版`:'上一版'}的差异</h3>${changes}</section><section><h3>为什么形成这一版</h3>${origin}</section><section><h3>状态流转</h3>${transitions}</section>`;
  }
  async function openRevisionDetail(revisionId) {
    if(revisionDetailBusy)return;
    const dialog=document.querySelector('#revisionDetailDialog'),content=document.querySelector('#revisionDetailContent');
    revisionDetailBusy=true;content.innerHTML='<p class="revision-history-message">正在读取完整版本记录……</p>';dialog.showModal();
    try{content.innerHTML=revisionDetailMarkup(await api(`/api/deliverable-revisions/${revisionId}`));}
    catch(error){content.innerHTML=`<p class="revision-history-message error">读取失败：${escapeHtml(error.message)}</p>`;}
    finally{revisionDetailBusy=false;}
  }
  function renderProjects() {
    const project = projects.find(item => item.id === selectedId);
    const items = project?.deliverables || [];
    document.querySelector('#taskProjectLabel').textContent=project ? `本次目标：${project.name} · 第${project.cycle_no}周期` : '请先创建或选择项目。';
    document.querySelector('#projectAgentFields').disabled=runningTask || !project || project.status!=='active';
    renderTaskSourcePicker();
    updateProjectDeliveryPath(project);
    document.querySelector('#projectContext').textContent = project ? `${project.name || '未命名项目'} · ${statusLabels[project.status]} · 当前第${project.cycle_no || '?'}周期 · 负责人：${project.owner || '待明确'}` : '尚无项目。点击上方“创建项目”，填写项目名称、负责人和本轮范围。';
    document.querySelector('#deliverableProjectTitle').textContent = project ? `${project.name || '未命名项目'} · 交付清单` : '交付清单';
    const today = dateKey(new Date());
    const horizon = dateKey(addDays(new Date(), 7));
    const pending = state.pendingAgentReviews.filter(item => item.project.id === project?.id).length;
    const pendingChanges=(project?.change_requests||[]).filter(item=>item.status==='proposed').length;
    const due = items.filter(item => item.status !== 'accepted' && item.due_date_status === 'confirmed' && item.due_date >= today && item.due_date <= horizon).length;
    const late = items.filter(item => item.status !== 'accepted' && item.due_date_status === 'confirmed' && item.due_date && item.due_date < today).length;
    const draftCount=items.filter(item=>item.status==='draft').length;
    document.querySelector('#projectMetrics').innerHTML = [[pendingChanges,'待确认变更','deliverables'],[pending,'待审建议','reviews'],[draftCount,'待确认草稿','deliverables'],[due,'未来7天截止','deliverables'],[late,'已逾期','deliverables']].map(([count,label,action])=>`<button class="stat-card stat-card-action" type="button" data-project-action="${action}" ${count?'':'disabled'}><strong>${count}</strong><span>${label}</span></button>`).join('');
    document.querySelector('#openProjectReview').disabled=!project;
    document.querySelector('#openProjectReview').textContent=pending?'查看本项目待审建议':'查看待审与历史';
    document.querySelector('#projectNextAction').textContent = !project ? '' : project.status !== 'active' ? '此项目当前不可创建正式交付内容。' : pendingChanges ? '下一步：处理待确认变更；接受后才会形成新的正式版本。' : pending ? '下一步：进入待审建议，核对对应项目的证据和负责人。' : items.some(item=>item.status==='draft') ? '下一步：进入交付清单，由验收负责人确认草稿并保存为本机交付计划。' : items.length ? '下一步：查看当前状态；要求变化时从交付成果提出版本变更。' : '暂无正式交付物。资料经授权生成候选并由负责人采用后，草稿将出现在清单中。';
    const highlightedItem=items.find(item=>item.id===highlightedDeliverableId);
    const createdNotice=highlightedItem?`<div class="created-deliverable-notice" role="status"><strong>待确认成果已创建并定位</strong><span>“${escapeHtml(highlightedItem.title||'未命名交付物')}”当前为第${highlightedItem.revision_no}版 · ${statusLabels[highlightedItem.status]||highlightedItem.status}。旧版本仍保留在下方版本历史中。</span></div>`:'';
    const draftActions=items.filter(item=>item.status==='draft').map(item=>`<section class="deliverable-next-action-card"><div><small>“${escapeHtml(item.title||'未命名交付物')}” · 第${item.revision_no}版</small>${nextStepMarkup(item,project)}</div></section>`).join('');
    document.querySelector('#projectDeliverables').innerHTML = items.length ? `${createdNotice}${draftActions}${changeRequestCards(project)}${deliverableTable(items,project)}${deliverableHistories(items)}` : '<div class="empty-next-action"><strong>当前还没有正式交付成果</strong><p>先运行整理任务并审查候选；负责人采用后，待确认成果才会出现在这里。</p><button class="primary-button" type="button" data-empty-go-project>返回项目并生成交付建议</button></div>';
  }
  async function confirmDraftRevision(item) {
    if (!item || item.status !== 'draft' || transitioningRevisionId) return;
    transitioningRevisionId=item.current_revision_id;
    transitionFeedback.delete(item.current_revision_id);
    renderProjects();
    try {
      await api(`/api/deliverable-revisions/${item.current_revision_id}/transitions`,{method:'POST',body:JSON.stringify({to_status:'confirmed',actor:item.approver,actor_role:'approver',reason:'确认交付范围和验收要求'})});
      transitioningRevisionId=null;
      await refreshProjects();
      toast('交付计划已确认并保存在本机');
    } catch (error) {
      transitionFeedback.set(item.current_revision_id,`确认失败：${error.message}`);
      transitioningRevisionId=null;
      renderProjects();
    }
  }
  async function refreshProjects() {
    const button = document.querySelector('#refreshProjects');
    button.disabled = true;
    try {
      const [rows, reviews, history, contents] = await Promise.all([api('/api/project-overview'), api('/api/agent-candidate-results/pending'),api(window.agentReviewHistoryUrl?window.agentReviewHistoryUrl():'/api/agent-candidate-results/history'),api('/api/contents')]);
      sources=contents.filter(content=>content.type!=='acceptance-reference');
      projects = rows;
      state.pendingAgentReviews = reviews;
      state.agentReviewHistory = history.items || history;
      state.agentReviewHistoryMeta = history.items ? history : {total:history.length,limit:20,offset:0,projects:[]};
      if (!projects.some(item=>item.id===selectedId)) selectedId = projects.find(item=>item.status==='active')?.id || projects[0]?.id || null;
      document.querySelector('#projectChoice').innerHTML = projects.length ? projects.map(item=>`<option value="${item.id}" ${item.id===selectedId?'selected':''}>${escapeHtml(item.name || `项目 ${item.id}`)} · ${statusLabels[item.status]}</option>`).join('') : '<option value="">尚无项目</option>';
      renderProjects();
      renderAgentReview();
    } catch (error) {
      document.querySelector('#projectContext').textContent = `加载失败：${error.message}。请点击刷新重试。`;
      document.querySelector('#projectChoice').innerHTML = '<option>加载失败</option>';
    } finally { button.disabled = false; }
  }
  function openResultReview(candidateResultId) {
    const item=state.pendingAgentReviews.find(review=>review.id===Number(candidateResultId));
    if(!item)return false;
    state.activeAgentReviewId=item.id;
    state.selectedCandidateIndexes=item.result.candidates.length===1?[0]:[];
    renderAgentReview();
    switchView('agentReview');
    return true;
  }
  async function openSelectedProjectReview() {
    const item=state.pendingAgentReviews.find(review=>review.project.id===selectedId);
    state.agentReviewProjectId=selectedId;
    state.agentReviewMode=item?'pending':'history';
    if(item){state.activeAgentReviewId=item.id;state.selectedCandidateIndexes=defaultCandidateIndexes(item);}
    switchView('agentReview');
    if(item){renderAgentReview();return}
    state.agentReviewHistoryFilters.projectId=String(selectedId);
    await window.loadAgentReviewHistory(0);
  }
  function openSelectedProjectDeliverables() {
    highlightedDeliverableId=null;
    highlightedRevisionId=null;
    switchView('deliverables');
    document.querySelector('#pageTitle').textContent='交付清单';
    refreshProjects();
  }
  async function openCreatedDeliverable(projectId,deliverableId,revisionId) {
    selectedId=Number(projectId);
    highlightedDeliverableId=Number(deliverableId);
    highlightedRevisionId=Number(revisionId);
    await refreshProjects();
    switchView('deliverables');
    document.querySelector('#pageTitle').textContent='交付清单';
    requestAnimationFrame(()=>{
      const row=document.querySelector(`[data-deliverable-id="${highlightedDeliverableId}"]`);
      row?.scrollIntoView({behavior:'smooth',block:'center'});
      row?.focus({preventScroll:true});
    });
  }
  window.openCreatedDeliverable=openCreatedDeliverable;
  document.addEventListener('DOMContentLoaded', () => {
    updateExecutionModeGuide();
    document.querySelector('#taskExecutionMode').addEventListener('change',updateExecutionModeGuide);
    document.querySelector('#executionModeGuide').addEventListener('click',event=>{
      const choice=event.target.closest('[data-execution-mode-choice]');
      if(!choice)return;
      document.querySelector('#taskExecutionMode').value=choice.dataset.executionModeChoice;
      updateExecutionModeGuide();
    });
    document.querySelector('#projectAgentForm').addEventListener('submit',async event=>{
      event.preventDefault();
      if(runningTask)return;
      const project=projects.find(item=>item.id===selectedId),instruction=document.querySelector('#taskInstruction').value.trim(),executionMode=document.querySelector('#taskExecutionMode').value;
      const ids=[...selectedTaskSourceIds];
      const status=document.querySelector('#projectAgentStatus'),open=document.querySelector('#openTaskReview');
      if(!project||project.status!=='active'||!ids.length||!instruction){status.textContent='请选择进行中的项目、至少一条可用资料，并填写指令。';return;}
      runningTask=true;resultId=null;open.hidden=true;
      document.querySelector('#projectChoice').disabled=true;
      document.querySelector('#projectAgentFields').disabled=true;
      let job=null;
      try{
        status.textContent='正在保存本次任务授权……';
        job=await api(`/api/projects/${project.id}/agent-jobs`,{method:'POST',body:JSON.stringify({action:'extract_deliverables',execution_mode:executionMode,instruction,allowed_source_ids:ids,forbidden_scope:['formal_business_writes']})});
        status.textContent=executionMode==='deterministic'?`任务 #${job.id} 已创建，正在本机按规则解析……`:`任务 #${job.id} 已创建，正在调用模型，请等待……`;
        const result=await api(`/api/agent-jobs/${job.id}/run`,{method:'POST',body:'{}'});
        if(result.agent_job?.status!=='awaiting_review'||!result.candidate_result?.id)throw new Error('任务未返回可审查候选，请检查任务结果。');
        resultId=result.candidate_result.id;
        status.textContent=`任务 #${job.id} 已完成，候选等待你的审查。正式交付物尚未写入。`;
        await refreshProjects();
        if(!openResultReview(resultId))open.hidden=false;
      }catch(error){status.textContent=`${job?`任务 #${job.id}：`:''}${error.message}\n未自动重试。如连接中断，请先刷新待审列表，确认结果后再决定是否新建任务。`;}
      finally{runningTask=false;document.querySelector('#projectChoice').disabled=false;renderProjects();}
    });
    document.querySelector('#openTaskReview').addEventListener('click',()=>{
      if(!openResultReview(resultId))document.querySelector('#projectAgentStatus').textContent='此候选已不在待审列表，请刷新查看。';
    });
    document.querySelector('#openProjectReview').addEventListener('click',openSelectedProjectReview);
    document.querySelector('#projectMetrics').addEventListener('click',event=>{
      const target=event.target.closest('[data-project-action]');
      if(!target||target.disabled)return;
      if(target.dataset.projectAction==='reviews')openSelectedProjectReview();
      else openSelectedProjectDeliverables();
    });
    document.querySelector('#projectDeliverables').addEventListener('click',event=>{
      if(event.target.closest('[data-empty-go-project]')){switchView('projects');document.querySelector('#pageTitle').textContent='项目总览';return;}
      const openChange=event.target.closest('[data-open-change]');
      if(openChange){
        const project=projects.find(item=>item.id===selectedId),item=project?.deliverables.find(deliverable=>deliverable.id===Number(openChange.dataset.openChange));
        if(item)fillChangeDialog(item);
        return;
      }
      const decideChange=event.target.closest('[data-decide-change]');
      if(decideChange){
        const project=projects.find(item=>item.id===selectedId),request=project?.change_requests.find(change=>change.id===Number(decideChange.dataset.decideChange)),item=project?.deliverables.find(deliverable=>deliverable.id===request?.deliverable_id);
        if(item&&request)fillChangeDialog(item,request);
        return;
      }
      const report=event.target.closest('[data-change-report]');
      if(report){window.open(`/change-report.html?id=${Number(report.dataset.changeReport)}`,'_blank','noopener');return;}
      const revisionButton=event.target.closest('[data-open-revision]');
      if(revisionButton){openRevisionDetail(Number(revisionButton.dataset.openRevision));return;}
      const loadMore=event.target.closest('[data-load-more-revisions]');
      if(loadMore){loadRevisionHistory(Number(loadMore.dataset.loadMoreRevisions));return;}
      const button=event.target.closest('[data-confirm-draft]');
      if(!button)return;
      const project=projects.find(item=>item.id===selectedId);
      const item=project?.deliverables.find(deliverable=>deliverable.current_revision_id===Number(button.dataset.confirmDraft));
      confirmDraftRevision(item);
    });
    document.querySelector('#projectDeliverables').addEventListener('toggle',event=>{
      const history=event.target.closest?.('[data-history-deliverable]');
      if(!history)return;
      const deliverableId=Number(history.dataset.historyDeliverable),historyState=revisionHistoryState(deliverableId);
      historyState.open=history.open;
      if(!history.open)return;
      if(!historyState.loaded&&!historyState.loading)loadRevisionHistory(deliverableId,{reset:true});
    },true);
    document.querySelector('#projectDeliverables').addEventListener('submit',event=>{
      const form=event.target.closest('[data-revision-filter]');
      if(!form)return;
      event.preventDefault();
      const deliverableId=Number(form.dataset.revisionFilter),history=revisionHistoryState(deliverableId);
      history.q=form.elements.q.value.trim();history.status=form.elements.status.value;history.items=[];history.loaded=false;
      loadRevisionHistory(deliverableId,{reset:true});
    });
    document.querySelector('#closeRevisionDetail').addEventListener('click',()=>document.querySelector('#revisionDetailDialog').close());
    const changeDialog=document.querySelector('#changeRequestDialog');
    document.querySelector('#changeRequestForm').addEventListener('submit',submitChangeRequest);
    document.querySelector('#closeChangeRequest').addEventListener('click',()=>{if(!changeRequestBusy)changeDialog.close();});
    document.querySelector('#cancelChangeRequest').addEventListener('click',()=>{if(!changeRequestBusy)changeDialog.close();});
    document.querySelector('#rejectChangeRequest').addEventListener('click',rejectChangeRequest);
    document.querySelector('#addAcceptanceItem').addEventListener('click',()=>addAcceptanceItemRow());
    document.querySelector('#changeAcceptanceItems').addEventListener('click',event=>{const remove=event.target.closest('[data-remove-acceptance]');if(remove&&document.querySelectorAll('.acceptance-item-row').length>1)remove.closest('.acceptance-item-row').remove();});
    changeDialog.addEventListener('input',()=>{try{renderChangeDiff(JSON.parse(changeDialog.dataset.baseFields||'{}'));}catch{}});
    changeDialog.addEventListener('cancel',event=>{if(changeRequestBusy)event.preventDefault();});
    const dialog=document.querySelector('#createProjectDialog'),form=document.querySelector('#createProjectForm'),submit=document.querySelector('#submitCreateProject');
    let creating=false;
    document.querySelector('#createProjectButton').addEventListener('click',()=>{form.reset();document.querySelector('#createProjectStatus').textContent='';dialog.showModal();});
    for(const id of ['closeCreateProject','cancelCreateProject']) document.querySelector('#'+id).addEventListener('click',()=>{if(!creating)dialog.close();});
    dialog.addEventListener('cancel',event=>{if(creating)event.preventDefault();});
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(creating)return;
      const name=document.querySelector('#newProjectName').value.trim(),owner=document.querySelector('#newProjectOwner').value.trim(),scope=document.querySelector('#newProjectScope').value.trim();
      const message=document.querySelector('#createProjectStatus');
      if(!name||!owner){message.textContent='请填写项目名称和项目负责人。';return;}
      creating=true;submit.disabled=true;message.textContent='正在创建项目……';
      try{
        const project=await api('/api/projects',{method:'POST',body:JSON.stringify({name,owner,scope})});
        selectedId=project.id;
        dialog.close();
        await refreshProjects();
        toast('项目与第1周期已创建');
      }catch(error){message.textContent=error.message;}
      finally{creating=false;submit.disabled=false;}
    });
    document.querySelector('#projectChoice').addEventListener('change', event => {selectedId=Number(event.target.value);highlightedDeliverableId=null;highlightedRevisionId=null;renderProjects();});
    document.querySelector('#taskSourcePicker').addEventListener('change',event=>{
      const sourceId=Number(event.target.value);
      if(sourceId)selectedTaskSourceIds.add(sourceId);
      renderTaskSourcePicker();
      updateProjectDeliveryPath(projects.find(item=>item.id===selectedId));
    });
    document.querySelector('#selectedTaskSources').addEventListener('click',event=>{
      const remove=event.target.closest('[data-remove-task-source]');
      if(!remove)return;
      selectedTaskSourceIds.delete(Number(remove.dataset.removeTaskSource));
      renderTaskSourcePicker();
      updateProjectDeliveryPath(projects.find(item=>item.id===selectedId));
    });
    document.querySelector('#refreshProjects').addEventListener('click', refreshProjects);
    document.querySelectorAll('[data-view="projects"],[data-view="deliverables"],[data-view-jump="deliverables"]').forEach(button=>button.addEventListener('click',()=>{highlightedDeliverableId=null;highlightedRevisionId=null;document.querySelector('#pageTitle').textContent = button.dataset.view === 'projects' ? '项目总览' : '交付清单';refreshProjects();}));
    refreshProjects();
  });
})();
