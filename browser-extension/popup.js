const $=selector=>document.querySelector(selector);
let activeTab;

function collectPage(){
  const selected=window.getSelection()?.toString().trim()||"";
  const description=document.querySelector('meta[name="description"]')?.content||document.querySelector('meta[property="og:description"]')?.content||"";
  const main=document.querySelector("article, main")||document.body;
  return {title:document.title,url:location.href,selection:selected,description,page_text:(main?.innerText||"").trim().slice(0,20000)};
}

async function initialize(){
  [activeTab]=await chrome.tabs.query({active:true,currentWindow:true});
  $("#title").value=activeTab?.title||"";
  const host=new URL(activeTab.url).hostname;
  $("#sourceKind").value=/(youtube\.com|youtu\.be|bilibili\.com)$/i.test(host)?"视频":"网页";
  try{
    const [result]=await chrome.scripting.executeScript({target:{tabId:activeTab.id},func:collectPage});
    if(result?.result?.selection)$("#selection").value=result.result.selection;
  }catch{}
}

$("#capture").addEventListener("click",async()=>{
  const button=$("#capture"),status=$("#status");button.disabled=true;status.className="";status.textContent="正在读取并保存……";
  try{
    const [result]=await chrome.scripting.executeScript({target:{tabId:activeTab.id},func:collectPage});
    const page=result?.result||{title:activeTab.title,url:activeTab.url,selection:"",description:"",page_text:""};
    const response=await fetch("http://localhost:8765/api/web-capture",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...page,title:$("#title").value.trim()||page.title,source_kind:$("#sourceKind").value,category_path:$("#categoryPath").value.trim(),selection:[$("#selection").value.trim(),page.selection].filter(Boolean).join("\n\n")})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||"保存失败");
    status.className="success";status.textContent=`已保存《${data.title}》到媒体知识库。`;
  }catch(error){status.className="error";status.textContent=error.message.includes("Failed to fetch")?"无法连接本地知识库，请先打开并运行网站。":error.message}
  finally{button.disabled=false}
});

initialize();
