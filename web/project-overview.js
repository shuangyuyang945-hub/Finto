// 项目总览及显式项目创建，不生成示例交付物。
(() => {
  let projects = [];
  let selectedId = null;
  let sources = [];
  let runningTask = false;
  let resultId = null;
  let highlightedDeliverableId = null;
  let highlightedRevisionId = null;
  let transitioningRevisionId = null;
  const transitionFeedback = new Map();
  const statusLabels = {active:'进行中',completed:'已完成',archived:'已归档',draft:'待负责人确认',confirmed:'已确认',doing:'执行中',submitted:'已提交',accepted:'已验收'};
  function nextStepMarkup(item, project) {
    if (item.status === 'draft') {
      const busy = item.current_revision_id === transitioningRevisionId;
      const disabled = busy || project?.status !== 'active' || !item.approver;
      const feedback = transitionFeedback.get(item.current_revision_id) || '';
      return `<div class="deliverable-next-step"><strong>待负责人确认</strong><span>由验收负责人“${escapeHtml(item.approver || '待明确')}”确认范围和验收标准；确认后才交给执行负责人“${escapeHtml(item.owner || '待明确')}”。</span><button class="primary-button" type="button" data-confirm-draft="${item.current_revision_id}" ${disabled?'disabled':''}>${busy?'正在确认……':'确认草稿并交给执行负责人'}</button><p role="status">${escapeHtml(feedback)}</p></div>`;
    }
    const messages = {
      confirmed:`已确认，下一步由执行负责人“${escapeHtml(item.owner || '待明确')}”开始执行。`,
      doing:`正在执行，由执行负责人“${escapeHtml(item.owner || '待明确')}”完成后提交验收。`,
      submitted:`已提交，等待验收负责人“${escapeHtml(item.approver || '待明确')}”验收。`,
      accepted:'已验收，本版本状态流转完成。',
    };
    return `<span class="deliverable-next-step-text">${messages[item.status] || '暂无下一步说明。'}</span>`;
  }
  function updateProjectDeliveryPath(project) {
    const selectedCount=document.querySelectorAll('[data-task-source]:checked:not(:disabled)').length;
    const availableCount=sources.filter(source=>source.ai_access===1).length;
    const active=Boolean(project&&project.status==='active');
    const setStep=(id,statusId,stateName,message)=>{
      const step=document.querySelector(id),status=document.querySelector(statusId);
      step.classList.remove('complete','current','waiting','optional');
      step.classList.add(stateName);
      status.textContent=message;
    };
    setStep('#projectPathProject','#projectPathProjectStatus',active?'complete':'current',active?`已选择“${project.name}”第${project.cycle_no}周期。`:'先创建项目，或选择一个进行中的项目。');
    const sourceMessage=!active
      ? '先选择一个进行中的项目。'
      : availableCount
        ? `资料库有 ${availableCount} 份可用资料；已有合适资料可直接跳到第3步。`
        : '资料库暂无可用资料；需要依据时可在这里添加，也可以暂不添加。';
    setStep('#projectPathSource','#projectPathSourceStatus',active?'optional':'waiting',sourceMessage);
    setStep('#projectPathAuthorization','#projectPathAuthorizationStatus',selectedCount?'complete':active?'current':'waiting',selectedCount?`已选择 ${selectedCount} 份资料；任务只会读取本次勾选的资料。`:active?'请在下方勾选本次任务真正需要的资料。':'先选择一个进行中的项目。');
    setStep('#projectPathRun','#projectPathRunStatus',selectedCount&&active?'current':'waiting',selectedCount&&active?'可以运行；结果会先进入待审，不会直接写入交付清单。':'勾选至少一份资料后才能运行。');
  }
  function updateExecutionModeGuide() {
    const selected=document.querySelector('#taskExecutionMode').value;
    document.querySelectorAll('[data-execution-mode-choice]').forEach(choice=>{
      const active=choice.dataset.executionModeChoice===selected;
      choice.classList.toggle('selected',active);
      choice.setAttribute('aria-pressed',String(active));
    });
  }
  function renderProjects() {
    const project = projects.find(item => item.id === selectedId);
    const items = project?.deliverables || [];
    document.querySelector('#taskProjectLabel').textContent=project ? `本次目标：${project.name} · 第${project.cycle_no}周期` : '请先创建或选择项目。';
    document.querySelector('#projectAgentFields').disabled=runningTask || !project || project.status!=='active';
    const checked=new Set([...document.querySelectorAll('[data-task-source]:checked')].map(el=>Number(el.value)));
    document.querySelector('#taskSourceChoices').innerHTML=sources.length?sources.map(source=>`<label style="display:flex;align-items:center;gap:10px;margin:10px 0"><input style="width:auto" type="checkbox" data-task-source value="${source.id}" ${source.ai_access===1?'':'disabled'} ${checked.has(source.id)?'checked':''}>#${source.id} ${escapeHtml(source.title)} · ${source.ai_access===1?'可授权':'禁止AI使用'}</label>`).join(''):'<p>暂无资料，请先使用“添加资料”，保存后点击项目刷新。</p>';
    updateProjectDeliveryPath(project);
    document.querySelector('#projectContext').textContent = project ? `${project.name || '未命名项目'} · ${statusLabels[project.status]} · 当前第${project.cycle_no || '?'}周期 · 负责人：${project.owner || '待明确'}` : '尚无项目。点击上方“创建项目”，填写项目名称、负责人和本轮范围。';
    document.querySelector('#deliverableProjectTitle').textContent = project ? `${project.name || '未命名项目'} · 交付清单` : '交付清单';
    const today = dateKey(new Date());
    const horizon = dateKey(addDays(new Date(), 7));
    const pending = state.pendingAgentReviews.filter(item => item.project.id === project?.id).length;
    const due = items.filter(item => item.status !== 'accepted' && item.due_date_status === 'confirmed' && item.due_date >= today && item.due_date <= horizon).length;
    const late = items.filter(item => item.status !== 'accepted' && item.due_date_status === 'confirmed' && item.due_date && item.due_date < today).length;
    const draftCount=items.filter(item=>item.status==='draft').length;
    document.querySelector('#projectMetrics').innerHTML = [[pending,'待审建议','reviews'],[draftCount,'待确认草稿','deliverables'],[due,'未来7天截止','deliverables'],[late,'已逾期','deliverables']].map(([count,label,action])=>`<button class="stat-card stat-card-action" type="button" data-project-action="${action}" ${count?'':'disabled'}><strong>${count}</strong><span>${label}</span></button>`).join('');
    document.querySelector('#openProjectReview').disabled=!project;
    document.querySelector('#openProjectReview').textContent=pending?'查看本项目待审建议':'查看待审与历史';
    document.querySelector('#projectNextAction').textContent = !project ? '' : project.status !== 'active' ? '此项目当前不可创建正式交付内容。' : pending ? '下一步：进入待审建议，核对对应项目的证据和负责人。' : items.some(item=>item.status==='draft') ? '下一步：进入交付清单，由验收负责人确认草稿；确认后才交给执行负责人。' : items.length ? '下一步：查看当前状态、责任人和临近截止事项。' : '暂无正式交付物。资料经授权生成候选并由负责人采用后，草稿将出现在清单中。';
    const highlightedItem=items.find(item=>item.id===highlightedDeliverableId);
    const createdNotice=highlightedItem?`<div class="created-deliverable-notice" role="status"><strong>待确认成果已创建并定位</strong><span>“${escapeHtml(highlightedItem.title||'未命名交付物')}”当前为第${highlightedItem.revision_no}版 · ${statusLabels[highlightedItem.status]||highlightedItem.status}。旧版本仍保留在下方版本历史中。</span></div>`:'';
    const draftActions=items.filter(item=>item.status==='draft').map(item=>`<section class="deliverable-next-action-card"><div><small>“${escapeHtml(item.title||'未命名交付物')}” · 第${item.revision_no}版</small>${nextStepMarkup(item,project)}</div></section>`).join('');
    document.querySelector('#projectDeliverables').innerHTML = items.length ? `${createdNotice}${draftActions}<table class="deliverable-table"><thead><tr>${['成果','版本','验收标准','执行负责人','验收负责人','期限','状态'].map(text=>`<th>${text}</th>`).join('')}</tr></thead><tbody>${items.map(item=>`<tr data-deliverable-id="${item.id}" class="${item.id===highlightedDeliverableId?'newly-created':''}" tabindex="-1">${[item.title || '暂无当前版本',item.revision_no ? `第${item.revision_no}版` : '—',item.acceptance_criteria || '待明确',item.owner || '待明确',item.approver || '待明确',item.due_date_status === 'confirmed' ? item.due_date || '未填写' : '日期待确认',statusLabels[item.status] || '暂无版本'].map(value=>`<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>${items.map(item=>`<details class="deliverable-history" ${item.id===highlightedDeliverableId?'open':''}><summary>${escapeHtml(item.title||'交付物')}的版本历史（${item.revisions?.length||0}版）</summary><div>${(item.revisions||[]).map(revision=>`<p class="${revision.id===highlightedRevisionId?'newly-created-revision':''}"><strong>第${revision.revision_no}版 · ${statusLabels[revision.status]||revision.status}</strong><br>期限：${escapeHtml(revision.due_date||'待确认')}<br>验收标准：${escapeHtml(revision.acceptance_criteria||'未记录')}</p>`).join('')}</div></details>`).join('')}` : '<div class="empty-next-action"><strong>当前还没有正式交付成果</strong><p>先运行整理任务并审查候选；负责人采用后，待确认成果才会出现在这里。</p><button class="primary-button" type="button" data-empty-go-project>返回项目并生成交付建议</button></div>';
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
      toast('草稿已确认，下一步由执行负责人开始执行');
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
      const [rows, reviews, history, contents] = await Promise.all([api('/api/project-overview'), api('/api/agent-candidate-results/pending'),api('/api/agent-candidate-results/history'),api('/api/contents')]);
      sources=contents;
      projects = rows;
      state.pendingAgentReviews = reviews;
      state.agentReviewHistory = history;
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
  function openSelectedProjectReview() {
    const item=state.pendingAgentReviews.find(review=>review.project.id===selectedId);
    const history=state.agentReviewHistory.find(review=>review.project.id===selectedId);
    state.agentReviewProjectId=selectedId;
    state.agentReviewMode=item?'pending':history?'history':'pending';
    if(item){state.activeAgentReviewId=item.id;state.selectedCandidateIndexes=defaultCandidateIndexes(item);}
    if(history)state.activeAgentReviewHistoryId=history.review.id;
    renderAgentReview();
    switchView('agentReview');
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
      const ids=[...document.querySelectorAll('[data-task-source]:checked:not(:disabled)')].map(el=>Number(el.value));
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
      const button=event.target.closest('[data-confirm-draft]');
      if(!button)return;
      const project=projects.find(item=>item.id===selectedId);
      const item=project?.deliverables.find(deliverable=>deliverable.current_revision_id===Number(button.dataset.confirmDraft));
      confirmDraftRevision(item);
    });
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
    document.querySelector('#taskSourceChoices').addEventListener('change',event=>{if(event.target.matches('[data-task-source]'))updateProjectDeliveryPath(projects.find(item=>item.id===selectedId));});
    document.querySelector('#refreshProjects').addEventListener('click', refreshProjects);
    document.querySelectorAll('[data-view="projects"],[data-view="deliverables"],[data-view-jump="deliverables"]').forEach(button=>button.addEventListener('click',()=>{highlightedDeliverableId=null;highlightedRevisionId=null;document.querySelector('#pageTitle').textContent = button.dataset.view === 'projects' ? '项目总览' : '交付清单';refreshProjects();}));
    refreshProjects();
  });
})();
