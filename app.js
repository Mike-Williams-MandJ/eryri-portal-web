"use strict";
const API=(window.ERYRI_API_BASE||"").replace(/\/$/,"");
const $=id=>document.getElementById(id);
const race=new Date("2027-05-15T12:00:00Z");
const state={token:sessionStorage.getItem("eryri_session")||"",files:[],feedback:[],current:null,sha:null,dirty:false,feedbackOriginal:"",feedbackRows:[]};
const show=(id,on)=>$(id).classList.toggle("hidden",!on);
function status(message,error=false){$("status").textContent=message;$("status").classList.toggle("danger",error)}
function weeksToGo(date){const monday=new Date(date+"T12:00:00Z");return Math.max(0,Math.ceil((race-monday)/604800000))+" weeks to go"}
function dateFromFile(path){return path.match(/week\d+-(\d{4}-\d{2}-\d{2})\.md$/)?.[1]||null}
function humanDate(s){return new Date(s+"T12:00:00Z").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"})}
function el(tag,attrs={},text){const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==="class")e.className=v;else e.setAttribute(k,v)}if(text!==undefined)e.textContent=text;return e}
async function api(path,options={}){if(!API)throw Error("API URL not configured. Follow portal/DEPLOY.md.");const res=await fetch(API+path,{...options,headers:{"Authorization":"Bearer "+state.token,...(options.body?{"Content-Type":"application/json"}:{}),...(options.headers||{})},cache:"no-store"});const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||"Request failed ("+res.status+")");return data}
function tab(name){for(const id of ["week","plan","feedback"])show(id,id===name);document.querySelectorAll("[data-tab]").forEach(b=>b.className=b.dataset.tab===name?"primary":"secondary")}
function populateSelect(select,paths){select.replaceChildren();for(const path of paths){const d=dateFromFile(path);if(!d)continue;const o=el("option",{value:path},weeksToGo(d)+" · "+humanDate(d));select.append(o)}}
function setWeek(path){state.current=path;const d=dateFromFile(path);$("countdown").textContent=d?weeksToGo(d):"—";$("range").textContent=d?humanDate(d)+" · Monday–Sunday":"";renderSessions(path)}
async function renderSessions(path){const root=$("sessions");root.replaceChildren();if(!path)return;try{const result=await api("/api/file?path="+encodeURIComponent(path));const text=result.content;const lines=text.split("\n");let blocks=[];let current=null;for(const line of lines){const heading=line.match(/^##\s+(.+)/);if(heading){if(current)blocks.push(current);current={title:heading[1],body:[]}}else if(current)current.body.push(line)}if(current)blocks.push(current);if(!blocks.length){root.append(el("pre",{},text));return}for(const b of blocks){const card=el("article",{class:"card"});card.append(el("h3",{},b.title));card.append(el("pre",{},b.body.join("\n").trim()||"No notes yet"));root.append(card)}}catch(e){root.append(el("p",{class:"danger"},e.message))}}

// Keep the existing Markdown structure and modify only the user's selected lines.
function parseFeedback(content){
 const lines=content.split("\n"), rows=[];
 for(let i=0;i<lines.length;i++){
  const m=lines[i].match(/^- (.+?)(?::\s*)(.*)$/);
  if(!m)continue;
  const section=lines.slice(0,i).reverse().find(l=>/^## /.test(l))||"";
  if(section==="## Session comments"||section==="## Weekly observations"){
   rows.push({index:i,label:m[1],value:/^\*\*Not supplied\*\*$/.test(m[2])?"":m[2],section});
  }
 }
 return rows;
}
function renderFeedbackForm(content){
 const root=$("feedbackfields");root.replaceChildren();
 state.feedbackRows=parseFeedback(content);
 if(!state.feedbackRows.length){
  root.append(el("p",{class:"muted"},"This historical week uses a different feedback format. Use Advanced: edit original Markdown below."));
  show("advanced",true);$("advancedtoggle").textContent="Hide advanced editor";return;
 }
 let last="";
 for(const row of state.feedbackRows){
  if(row.section!==last){root.append(el("h3",{},row.section.replace(/^## /,"")));last=row.section}
  const wrap=el("div",{class:"feedback-field"}),label=el("label",{},row.label),area=el("textarea",{rows:"3",placeholder:"Add your comments (optional)",spellcheck:"true"});
  area.value=row.value;row.area=area;
  area.addEventListener("input",()=>{state.dirty=true;$("savestatus").textContent="Unsaved changes";});
  wrap.append(label,area);root.append(wrap);
 }
}
function collectFeedback(){
 if(!$("advanced").classList.contains("hidden"))return $("editor").value;
 const lines=state.feedbackOriginal.split("\n");
 for(const row of state.feedbackRows){
  const v=row.area.value.trim().replace(/\r?\n/g,"; ");
  lines[row.index]="- "+row.label+": "+(v||"**Not supplied**");
 }
 return lines.join("\n");
}
$("advancedtoggle").onclick=()=>{
 const open=$("advanced").classList.contains("hidden");
 if(open){$("editor").value=collectFeedback();}
 else {renderFeedbackForm($("editor").value);state.feedbackOriginal=$("editor").value;}
 show("advanced",open);
 $("advancedtoggle").textContent=open?"Hide advanced editor":"Advanced: edit original Markdown";
};
\nasync function loadFeedback(path){if(state.dirty&&!confirm("Discard unsaved feedback edits?"))return false;try{const r=await api("/api/file?path="+encodeURIComponent(path));$("editor").value=r.content;state.feedbackOriginal=r.content;renderFeedbackForm(r.content);state.sha=r.sha;state.dirty=false;$("savestatus").textContent="Loaded from GitHub.";return true}catch(e){$("savestatus").textContent=e.message;return false}}
async function loadIndex(){const r=await api("/api/index");state.files=r.files||[];state.feedback=state.files.filter(x=>/^feedback\/week\d+-\d{4}-\d{2}-\d{2}\.md$/.test(x)).sort().reverse();populateSelect($("weekselect"),state.feedback);populateSelect($("feedbackweek"),state.feedback);const documents=$("documents");documents.replaceChildren();const allowed=state.files.filter(x=>x==="TRAINING_MASTER.md"||x==="WEEKLY_WORKFLOW.md"||x.startsWith("plans/")||x.startsWith("feedback/")&&x.endsWith(".md")||x==="automation/garmin/week03.json");for(const path of allowed){const card=el("div",{class:"card week"});card.append(el("span",{},path));const b=el("button",{class:"secondary"},"View");b.onclick=async()=>{const r=await api("/api/file?path="+encodeURIComponent(path));const pre=card.querySelector("pre");if(pre)pre.remove();card.append(el("pre",{},r.content));b.textContent="Refresh"};card.append(b);documents.append(card)}
const today=new Date().toISOString().slice(0,10);const target=state.feedback.find(p=>dateFromFile(p)<=today)||state.feedback[0];if(target){$("weekselect").value=target;$("feedbackweek").value=target;setWeek(target);await loadFeedback(target)}show("main",true);show("signout",true);show("signin",false);status("Connected to private GitHub repository.")}
async function begin(){if(!API){status("API not configured yet; see deployment guide.",true);return}location.href=API+"/auth/start"}
async function exchangeTicket(){const fragment=new URLSearchParams(location.hash.slice(1));const ticket=fragment.get("ticket");if(!ticket)return;history.replaceState(null,"",location.pathname+location.search);const r=await fetch(API+"/auth/exchange",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticket})});const data=await r.json();if(!r.ok)throw Error(data.error||"Sign-in failed");state.token=data.session;sessionStorage.setItem("eryri_session",state.token)}
$("signin").onclick=begin;$("signout").onclick=()=>{const token=state.token;state.token="";sessionStorage.removeItem("eryri_session");apiLogout(token);show("main",false);show("signin",true);show("signout",false);status("Signed out.")};
async function apiLogout(token){if(API&&token)try{await fetch(API+"/auth/logout",{method:"POST",headers:{"Authorization":"Bearer "+token}})}catch{}}
document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>tab(b.dataset.tab));
$("weekselect").onchange=e=>setWeek(e.target.value);
$("feedbackweek").onchange=async e=>{const prior=$("feedbackweek").dataset.previous||state.feedback[0];if(await loadFeedback(e.target.value))$("feedbackweek").dataset.previous=e.target.value;else e.target.value=prior};
$("editor").oninput=()=>{state.dirty=true;$("savestatus").textContent="Unsaved changes"};
$("reload").onclick=()=>loadFeedback($("feedbackweek").value);
$("save").onclick=async()=>{const button=$("save");button.disabled=true;$("savestatus").textContent="Saving…";try{const path=$("feedbackweek").value;const r=await api("/api/feedback",{method:"PUT",body:JSON.stringify({path,content:collectFeedback(),sha:state.sha})});state.sha=r.sha;state.feedbackOriginal=collectFeedback();$("editor").value=state.feedbackOriginal;renderFeedbackForm(state.feedbackOriginal);state.dirty=false;$("savestatus").textContent="Saved to GitHub · "+new Date().toLocaleTimeString("en-GB");if(path===$("weekselect").value)renderSessions(path)}catch(e){$("savestatus").textContent="Not saved: "+e.message}finally{button.disabled=false}};
window.addEventListener("beforeunload",e=>{if(state.dirty){e.preventDefault();e.returnValue=""}});
(async()=>{try{await exchangeTicket();if(state.token)await loadIndex();else status(API?"Sign in to view your private training plan.":"API not configured yet; see portal/DEPLOY.md.")}catch(e){status(e.message,true);if(e.message.includes("Unauthorized")||e.message.includes("session")){state.token="";sessionStorage.removeItem("eryri_session")}}})();
