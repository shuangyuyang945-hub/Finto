const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const statusLabels={proposed:'待负责人决定',accepted:'已接受',rejected:'已拒绝'};
const acceptanceLabels={pending:'待验证',satisfied:'已满足',not_applicable:'不适用'};
const impactLabels={scope:'范围',schedule:'期限',responsibility:'负责人',acceptance:'验收'};
async function loadReport(){
  const id=Number(new URLSearchParams(location.search).get('id')),status=document.querySelector('#reportStatus'),content=document.querySelector('#reportContent');
  if(!Number.isInteger(id)||id<1){status.textContent='报告编号无效。';return;}
  try{
    const response=await fetch(`/api/change-requests/${id}/report`),payload=await response.json();
    if(!response.ok)throw new Error(payload.error||'报告读取失败');
    document.title=`${payload.project_name||'项目'} · 变更报告 #${payload.id}`;
    document.querySelector('#reportMeta').textContent=`${payload.project_name||`项目 ${payload.project_id}`} · 第${payload.cycle_no||'?'}周期 · 变更单 #${payload.id}`;
    const sources=payload.evidence_sources.length?payload.evidence_sources.map(source=>`#${source.id} ${escapeHtml(source.title)}`).join('、'):'未添加资料依据';
    const changedRows=payload.changed_fields.map(change=>`<tr><th>${escapeHtml(change.label)}</th><td>${escapeHtml(change.before||'未填写')}</td><td>${escapeHtml(change.after||'未填写')}</td></tr>`).join('');
    const impacts=payload.impact_analysis.map(impact=>`<li><strong>${escapeHtml(impact.deliverable_title)}</strong><span>${(impact.impact_types||[]).map(type=>impactLabels[type]||type).join('、')||'待确认'}</span><p>${escapeHtml(impact.description||'未填写影响说明')}</p></li>`).join('');
    const checks=payload.acceptance_items.map(item=>`<tr><td>${escapeHtml(item.text)}</td><td>${escapeHtml(acceptanceLabels[item.status]||item.status)}</td><td>${escapeHtml(item.evidence||'未填写')}</td></tr>`).join('');
    const events=payload.events.map(event=>`<li><strong>${escapeHtml(event.event_type==='proposed'?'提出变更':event.event_type==='accepted'?'接受变更':'拒绝变更')}</strong><span>${escapeHtml(event.actor)} · ${escapeHtml(event.created_at)}</span><p>${escapeHtml(event.reason||'未填写')}</p></li>`).join('');
    content.innerHTML=`<section class="summary-grid"><div><span>状态</span><strong>${escapeHtml(statusLabels[payload.status]||payload.status)}</strong></div><div><span>基础版本</span><strong>第${payload.base_revision?.revision_no||'?'}版</strong></div><div><span>形成版本</span><strong>${payload.created_revision?`第${payload.created_revision.revision_no}版`:'未创建'}</strong></div><div><span>变更提出人</span><strong>${escapeHtml(payload.created_by)}</strong></div></section><section><h2>一、变更原因与决定</h2><p><strong>变更原因：</strong>${escapeHtml(payload.reason)}</p><p><strong>决定结果：</strong>${escapeHtml(statusLabels[payload.status]||payload.status)}</p><p><strong>决定原因：</strong>${escapeHtml(payload.decision_reason||'尚未决定')}</p></section><section><h2>二、修改前后</h2><table><thead><tr><th>字段</th><th>修改前</th><th>修改后</th></tr></thead><tbody>${changedRows}</tbody></table></section><section><h2>三、影响范围</h2><ul class="record-list">${impacts}</ul></section><section><h2>四、新版本验收清单</h2><table><thead><tr><th>验收项</th><th>状态</th><th>依据或说明</th></tr></thead><tbody>${checks}</tbody></table></section><section><h2>五、资料依据</h2><p>${sources}</p></section><section><h2>六、决定记录</h2><ul class="record-list">${events}</ul></section><footer>本报告由 Finto 根据变更单、版本记录和审计事件生成。</footer>`;
    status.textContent='';content.hidden=false;
  }catch(error){status.textContent=error.message;}
}
document.querySelector('#printReport').addEventListener('click',()=>window.print());
loadReport();
