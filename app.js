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
async function renderSessions(path){
 const root=$("sessions");root.replaceChildren();if(!path)return;
 const d=dateFromFile(path);

 if(d!=="2026-11-09"){
   root.append(el("div",{class:"card"},"No dated approved workout schedule is available for this week in the connected repository. See Full plan for the master instructions; feedback is not a workout prescription."));
   return;
 }
 try{
   const r=await api("/api/file?path="+encodeURIComponent("plans/week03-approved-amendments-2026-11-08.md"));
   const lines=r.content.split("\n");
   const table=lines.filter(l=>l.trimStart().startsWith("|"));
   const parseCells=l=>l.split("|").slice(1,-1).map(x=>x.trim());
   const rows=table.slice(2).map(parseCells).filter(c=>c.length>=4 && /^\d/.test(c[2]) || c.length>=4 && /^up to \d/.test(c[2]));
   const makeCard=(date,title,details,pack)=>{
     const card=el("article",{class:"card"});
     card.append(el("h3",{},date+" · "+title));
     card.append(el("p",{},details));
     if(pack)card.append(el("p",{class:"muted"},"Pack: "+pack));
     root.append(card);
   };
   for(const c of rows)makeCard(c[0],c[1],c[2]+" minutes",c[3]);
   makeCard("Wed 11 Nov","Introductory leg strength","15–20 minutes · Light step-ups, calf raises, supported split squats and balance. Optional easy bouldering.","Not applicable");
   makeCard("Fri 13 Nov","Optional easy solo bouldering","No two-hour session with Jo this Friday.","Not applicable");
   root.append(el("p",{class:"muted"},"Approved running budget: up to 175 minutes. Thursday ends at 10 km or 80 elapsed minutes, whichever comes first. The historical amendment notes an earlier Garmin deployment discrepancy; see Full plan for details."));
 }catch(e){root.append(el("p",{class:"danger"},"Could not load approved workout schedule: "+e.message))}
}

// Keep the existing Markdown structure and modify only the user's selected lines.
function parseFeedback(content){
 const lines=content.split("\n"), rows=[];
 for(let i=0;i<lines.length;i++){
  const m=lines[i].match(/^- (.+?)(?::\s*)(.*)$/);
  if(!m)continue;
  const section=(lines.slice(0,i).reverse().find(l=>/^##\s+/.test(l))||"").trim();
  if(/^##\s+(Session comments|Weekly observations)$/i.test(section)){
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
async function loadFeedback(path){if(state.dirty&&!confirm("Discard unsaved feedback edits?"))return false;try{const r=await api("/api/file?path="+encodeURIComponent(path));$("editor").value=r.content;state.feedbackOriginal=r.content;show("advanced",false);$("advancedtoggle").textContent="Advanced: edit original Markdown";renderFeedbackForm(r.content);state.sha=r.sha;state.dirty=false;$("savestatus").textContent="Loaded from GitHub.";return true}catch(e){$("savestatus").textContent=e.message;return false}}
async function loadIndex(){const r=await api("/api/index");state.files=r.files||[];state.feedback=state.files.filter(x=>/^feedback\/week\d+-\d{4}-\d{2}-\d{2}\.md$/.test(x)).sort().reverse();populateSelect($("weekselect"),state.feedback);populateSelect($("feedbackweek"),state.feedback);const documents=$("documents");documents.replaceChildren();
documents.append(el("p",{class:"muted"},"The 29-week approved baseline is available below. Later changes to individual workouts are documented separately."));
const schedule=el("div",{class:"card"});const scheduleTitle=el("h3",{},"29-week approved programme · 26 October 2026");const scheduleSelect=el("select",{});const scheduleDetails=el("div",{});schedule.append(scheduleTitle,scheduleSelect,scheduleDetails);documents.append(schedule);
try{const result=await api("/api/file?path="+encodeURIComponent("plans/approved-29-week-summary-2026-10-26.md"));const rows=result.content.split("\n").filter(line=>/^\d+\|\d{4}-\d\d-\d\d\|/.test(line)).map(line=>line.split("|"));for(const r of rows){const option=el("option",{},"Week "+r[0]+" · "+r[1]+" · "+r[2]);option.value=r[0];scheduleSelect.append(option)}
scheduleSelect.value="3";const render=()=>{const r=rows.find(x=>x[0]===scheduleSelect.value);if(!r)return;scheduleDetails.replaceChildren();scheduleDetails.append(el("p",{},"Phase: "+r[2]+" · "+r[3]+" runs · approximately "+r[4]+" hours · estimated "+r[5]+"–"+r[6]+" km"));let sessions=[["Monday",r[9]==="0"?"Rest":r[9]+" min easy"],["Tuesday",r[10]+" (original approved workout reference)"],["Thursday",r[7]==="0"?"Race-week easy run: see approved plan":r[7]+" km or "+r[8]+" min, whichever first"],["Saturday",r[11]==="0"?"Rest":r[11]+" min"]];if(r[0]==="3"){sessions=[["Monday 9 Nov","Easy 20 min, conversational"],["Tuesday 10 Nov","Gentle hills 35 min (5 min warm-up, 25 min hills, 5 min cool-down)"],["Wednesday 11 Nov","Introductory leg strength 15–20 min; optional easy bouldering"],["Thursday 12 Nov","Coastal trail: stop at 10 km or 80 elapsed min, whichever comes first; light pack"],["Friday 13 Nov","Optional easy solo bouldering"],["Saturday 14 Nov","Parkrun 5 km, aim under 30 min if recovered; 40 min including warm-up and cool-down"]];scheduleDetails.append(el("p",{class:"muted"},"Approved Week 3 amendments (8 Nov), with subsequently approved Garmin changes. Running maximum 175 min. Use perceived effort rather than HR targets; heart rate remains recorded."))}for(const [day,workout] of sessions){const line=el("p",{},day+": "+workout);scheduleDetails.append(line)}scheduleDetails.append(el("p",{class:"muted"},r[0]==="3"?"Week 3 amended plan; this view does not change Garmin workouts.":"Original 26 October baseline; no later week-specific amendment is incorporated here. This view does not schedule workouts."))};scheduleSelect.onchange=render;render()}catch(e){scheduleDetails.append(el("p",{class:"danger"},"Could not load the programme: "+e.message))}
const allowed=state.files.filter(x=>x==="TRAINING_MASTER.md"||x==="WEEKLY_WORKFLOW.md"||x.startsWith("plans/")&&x.endsWith(".md"));
const labels={"TRAINING_MASTER.md":"Master training instructions","WEEKLY_WORKFLOW.md":"Weekly review and planning workflow","plans/week03-approved-amendments-2026-11-08.md":"27 weeks to go · approved workout amendments"};
for(const path of allowed){
 const card=el("article",{class:"card plan-document"});
 card.append(el("h3",{},labels[path]||path.split("/").pop().replace(/[-_]/g," ")));
 const b=el("button",{class:"secondary",type:"button"},"Show document");
 const content=el("div",{class:"plan-content hidden"});
 b.onclick=async()=>{if(!content.classList.contains("hidden")){content.classList.add("hidden");b.textContent="Show document";return}
 b.disabled=true;b.textContent="Loading…";
 try{const r=await api("/api/file?path="+encodeURIComponent(path));content.replaceChildren();
 for(const line of r.content.split("\n")){if(!line.trim())continue;
 if(/^#{1,4}\s/.test(line)){content.append(el("h4",{},line.replace(/^#+\s*/,"")));continue}
 content.append(el("p",{},line.replace(/\*\*/g,"").replace(/^[-*]\s/,"• ")))}
 content.classList.remove("hidden");b.textContent="Hide document"
 }catch(e){content.replaceChildren(el("p",{class:"danger"},e.message));content.classList.remove("hidden");b.textContent="Retry"}finally{b.disabled=false}};
 card.append(b,content);documents.append(card);
}
const today=new Date().toISOString().slice(0,10);const target=state.feedback.find(p=>dateFromFile(p)<=today)||state.feedback[0];if(target){$("weekselect").value=target;$("feedbackweek").value=target;setWeek(target);await loadFeedback(target)}show("main",true);show("signout",true);show("signin",false);status("")}
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
