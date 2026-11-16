"use strict";
const API=(window.ERYRI_API_BASE||"").replace(/\/$/,"");
const $=id=>document.getElementById(id);
const race=new Date("2027-05-15T12:00:00Z");
const state={token:sessionStorage.getItem("eryri_session")||"",files:[],feedback:[],current:null,sha:null,dirty:false,feedbackOriginal:"",feedbackRows:[],activities:[],activitiesFetched:false,activityError:"",sessionFeedback:{},feedbackOpen:{}};
const show=(id,on)=>$(id).classList.toggle("hidden",!on);
function status(message,error=false){$("status").textContent=message;$("status").classList.toggle("danger",error)}
function weeksToGo(date){const monday=new Date(date+"T12:00:00Z");return Math.max(0,Math.ceil((race-monday)/604800000))+" weeks to go"}
function dateFromFile(path){return path.match(/week\d+-(\d{4}-\d{2}-\d{2})\.md$/)?.[1]||null}
function humanDate(s){return new Date(s+"T12:00:00Z").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"})}
function el(tag,attrs={},text){const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==="class")e.className=v;else e.setAttribute(k,v)}if(text!==undefined)e.textContent=text;return e}
async function api(path,options={}){if(!API)throw Error("API URL not configured. Follow portal/DEPLOY.md.");const res=await fetch(API+path,{...options,headers:{"Authorization":"Bearer "+state.token,...(options.body?{"Content-Type":"application/json"}:{}),...(options.headers||{})},cache:"no-store"});const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||"Request failed ("+res.status+")");return data}
function showLastSync(value){
 const node=$("last-sync");
 if(!node)return;
 const time=new Date(value||"");
 if(!value||Number.isNaN(time.getTime())){node.textContent="Last activity sync: unknown";return}
 node.textContent="Last activity sync: "+time.toLocaleString("en-GB",{timeZone:"Europe/London",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",hour12:false})+" (UK)";
}
async function loadActivities(){
 const start=dateFromFile($("weekselect").value);
 if(!start)return;
 const oldest=start,newest=new Date(new Date(start+"T12:00:00Z").getTime()+6*86400000).toISOString().slice(0,10);
 try{const r=await api("/api/file?path="+encodeURIComponent("data/portal-activities.json"));const snapshot=JSON.parse(r.content);showLastSync(snapshot.updated_at);state.activities=(snapshot.activities||[]).filter(a=>a.date>=oldest&&a.date<=newest);state.activitiesFetched=true;state.activityError="";}
 catch(e){state.activities=[];state.activitiesFetched=false;state.activityError=e.message;}
}
function sessionActivity(date,title){
 const m=date.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\d+) Nov$/);
 if(!m)return null;
 const dateKey="2026-11-"+m[2].padStart(2,"0");
 const same=state.activities.filter(a=>a.date===dateKey);
 const isRun=!/strength|bouldering/i.test(title);
 const candidates=same.filter(a=>isRun?/^(run|trailrun|virtualrun|treadmill)$/i.test(a.type):/strength/i.test(title)?/strength|weight/i.test(a.type):/climb|boulder/i.test(a.type));
 if(candidates.length===1)return {status:"completed",activity:candidates[0]};
 if(candidates.length>1||same.length)return {status:"review",activity:null};
 return {status:"awaiting",activity:null};
}
const sessionFeedbackLabels={
 "Mon 9 Nov":"Monday 9 November",
 "Tue 10 Nov":"Tuesday 10 November",
 "Wed 11 Nov":"Wednesday 11 November",
 "Thu 12 Nov":"Thursday 12 November",
 "Sat 14 Nov":"Saturday 14 November"
};
let modalSaving=false;
function closeSessionFeedback(){if(modalSaving)return;if($("session-feedback-text").value!==$("session-feedback-text").dataset.original&&!confirm("Discard unsaved session feedback?"))return;$("session-feedback-modal").classList.add("hidden");$("session-feedback-text").value="";$("session-feedback-message").textContent="";}
async function openSessionFeedback(date){
 const path=$("weekselect").value, prefix=sessionFeedbackLabels[date];
 if(!prefix)return;
 const modal=$("session-feedback-modal"),area=$("session-feedback-text"),save=$("session-feedback-save");
 modal.classList.remove("hidden");$("session-feedback-title").textContent=date+" · Feedback";$("session-feedback-message").textContent="Loading saved feedback…";area.disabled=true;save.disabled=true;modal.dataset.path=path;modal.dataset.prefix=prefix;
 try{
  const r=await api("/api/file?path="+encodeURIComponent(path));
  if(modal.dataset.path!==path||modal.classList.contains("hidden"))return;
  const row=parseFeedback(r.content).find(x=>x.label.startsWith(prefix));
  if(!row)throw Error("No feedback entry exists for this session.");
  area.value=row.value;area.dataset.original=row.value;area.disabled=false;save.disabled=false;$("session-feedback-message").textContent="Edit your comments, then save to GitHub.";
 }catch(e){$("session-feedback-message").textContent="Could not load feedback: "+e.message}
}
async function saveSessionFeedback(){
 if(modalSaving)return;
 const modal=$("session-feedback-modal"),area=$("session-feedback-text"),path=modal.dataset.path,prefix=modal.dataset.prefix;
 modalSaving=true;$("session-feedback-save").disabled=true;$("session-feedback-close").disabled=true;$("session-feedback-message").textContent="Saving to GitHub…";
 try{
  // Always use the newest file SHA so edits from another device are preserved.
  const latest=await api("/api/file?path="+encodeURIComponent(path));
  const lines=latest.content.split("\n"),row=parseFeedback(latest.content).find(x=>x.label.startsWith(prefix));
  if(!row)throw Error("Session feedback entry was not found.");
  const savedValue=row.value.trim(),original=area.dataset.original.trim(),next=area.value.trim().replace(/\r?\n/g,"; ");
  if(savedValue!==original&&savedValue!==next)throw Error("Feedback was changed on another device. Copy your text before reopening this session.");
  lines[row.index]="- "+row.label+": "+(next||"**Not supplied**");
  await api("/api/feedback",{method:"PUT",body:JSON.stringify({path,content:lines.join("\n"),sha:latest.sha})});
  area.dataset.original=next;$("session-feedback-message").textContent="Saved to GitHub.";
  if($("weekselect").value===path&&!state.dirty)await loadFeedback(path);
  await renderSessions(path);
  modal.classList.add("hidden");
 }catch(e){$("session-feedback-message").textContent="Not saved: "+e.message}
 finally{modalSaving=false;$("session-feedback-save").disabled=false;$("session-feedback-close").disabled=false}
}
$("session-feedback-save").onclick=saveSessionFeedback;
$("session-feedback-close").onclick=closeSessionFeedback;
$("session-feedback-modal").addEventListener("click",e=>{if(e.target===$("session-feedback-modal"))closeSessionFeedback()});
function tab(name){for(const id of ["week","plan"])show(id,id===name);document.querySelectorAll("[data-tab]").forEach(b=>b.className=b.dataset.tab===name?"primary":"secondary")}
function populateSelect(select,paths){select.replaceChildren();for(const path of paths){const d=dateFromFile(path);if(!d)continue;const o=el("option",{value:path},weeksToGo(d)+" · "+humanDate(d));select.append(o)}}
function setWeek(path){state.current=path}
let sessionsRenderId=0;
function workoutWeekId(date){const first=new Date("2026-10-26T12:00:00Z");const day=new Date(date+"T12:00:00Z");return String(Math.round((day-first)/604800000)+1).padStart(2,"0")}
function formatStepEnd(step){
 const kind=step.endCondition?.conditionTypeKey;
 const value=Number(step.endConditionValue);
 if(kind==="time")return value%60===0?(value/60)+" min":value+" sec";
 if(kind==="distance")return value>=1000?(value/1000)+" km":value+" m";
 if(kind==="lap.button")return "until LAP";
 return kind==="iterations"?value+" repeats":kind||"";
}
function cleanInstruction(value){return String(value||"").replace(/\\bRPE\\s*\\d+(?:\\s*[-–]\\s*\\d+)?[;,.]?\\s*/gi,"").trim()}
async function weeklyWorkoutData(date){
 const id=workoutWeekId(date);
 const get=async kind=>{try{const r=await api("/api/file?path="+encodeURIComponent("automation/"+kind+"/week"+id+".json"));return JSON.parse(r.content)}catch(e){return null}};
 const [garmin,strength]=await Promise.all([get("garmin"),get("strength")]);
 return {garmin,strength};
}
function findGarminWorkout(data,date,title){
 if(!data?.workouts)return null;
 const day=date.slice(0,3);
 const lookup={"2026-11-09":{Mon:"EASY20",Tue:"ROLL35",Thu:"COAST10T80",Sat:"EASY30"},"2026-11-16":{Mon:"EASY20",Tue:"ROLL30",Thu:"COAST8T60",Sat:"PARKRUN5K"}};
 const key=lookup[data.week===3?"2026-11-09":data.week===4?"2026-11-16":""]?.[day];
 if(key)return data.workouts[key]||null;
 const candidates=Object.entries(data.workouts);
 const match=candidates.filter(([k,w])=>day==="Mon"?/easy/i.test(k):day==="Tue"?/roll|hill/i.test(k):day==="Thu"?/coast|long/i.test(k):day==="Sat"?/park|5k/i.test(k):false);
 return match.length===1?match[0][1]:null;
}
async function renderSessions(path){
 const renderId=++sessionsRenderId;
 const root=$("sessions");root.replaceChildren();if(!path)return;
 const d=dateFromFile(path);

 if(d!=="2026-11-09"&&d!=="2026-11-16"){
   root.append(el("div",{class:"card"},"No dated approved workout schedule is available for this week in the connected repository. See Full plan for the master instructions; feedback is not a workout prescription."));
   return;
 }
 try{
   const isWeek4=d==="2026-11-16";
   const workoutData=await weeklyWorkoutData(d);
   const r=isWeek4?null:await api("/api/file?path="+encodeURIComponent("plans/week03-approved-amendments-2026-11-08.md"));
   const lines=isWeek4?[]:r.content.split("\n");
   const table=lines.filter(l=>l.trimStart().startsWith("|"));
   const parseCells=l=>l.split("|").slice(1,-1).map(x=>x.trim());
   const rows=isWeek4?[["Mon 16 Nov","Easy conversational run","20",""],["Tue 17 Nov","Rolling hills","30",""],["Thu 19 Nov","Coastal run · 8 km or 60 min maximum","60",""],["Sat 21 Nov","Parkrun 5 km","30",""]]:table.slice(2).map(parseCells).filter(c=>c.length>=4 && /^\d/.test(c[2]) || c.length>=4 && /^up to \d/.test(c[2]));
   // Read saved comments once per week, without exposing them in the public page source.
   let feedbackByDate={};
   try{
     const saved=await api("/api/file?path="+encodeURIComponent(path));
     for(const row of parseFeedback(saved.content)){
       for(const [shortDate,prefix] of Object.entries(sessionFeedbackLabels)){
         if(row.section==="## Session comments"&&row.label.startsWith(prefix))feedbackByDate[shortDate]=row.value;
       }
     }
   }catch(e){root.append(el("p",{class:"muted"},"Feedback could not be loaded: "+e.message))}
   if(renderId!==sessionsRenderId)return;
   const makeCard=(date,title,details,pack)=>{
     const card=el("article",{class:"card"});
     card.append(el("h3",{},date+" · "+title));
     if(title==="Rest day"){root.append(card);return;}
     const planFold=el("details",{class:"session-plan-fold"});
     if(state.feedbackOpen[path+"|plan|"+date])planFold.open=true;
     planFold.append(el("summary",{},"Workout details"));
     const garmin=findGarminWorkout(workoutData.garmin,date,title);
     const strength=workoutData.strength?.sessions?.[date]||(isWeek4&&date==="Wed 18 Nov"?{
 name:"Introductory leg strength",duration:"15–20 min total",
 steps:[
 {name:"Step-ups",instruction:"Light, technique-focused step-ups; prioritise correct form."},
 {name:"Calf raises",instruction:"Light calf raises; prioritise correct form."},
 {name:"Supported split squats",instruction:"Use support and prioritise correct form."},
 {name:"Balance",instruction:"Light balance practice with correct technique."}
 ],
 note:"The approved plan specifies exercises and total duration, but not sets or repetitions."
}:null);
     if(garmin){
       planFold.append(el("p",{class:"muted"},"Garmin workout: "+garmin.workoutName));
       const steps=el("ol",{class:"workout-steps"});
       for(const segment of garmin.workoutSegments||[]){
         for(const step of segment.workoutSteps||[]){
           const name=step.stepType?.stepTypeKey||"Step";
           const duration=formatStepEnd(step);
           const item=el("li",{});
           item.append(el("strong",{},name.charAt(0).toUpperCase()+name.slice(1)+(duration?" · "+duration:"")));
           if(step.description)item.append(el("p",{},cleanInstruction(step.description)));
           steps.append(item);
         }
       }
       planFold.append(steps);
     }else if(strength){
       planFold.append(el("p",{class:"muted"},strength.name+" · "+strength.duration));
       const steps=el("ol",{class:"workout-steps"});
       for(const step of strength.steps||[]){const item=el("li",{});item.append(el("strong",{},step.name),el("p",{},step.instruction));steps.append(item)}
       planFold.append(steps);
       if(strength.note)planFold.append(el("p",{class:"muted"},strength.note));
     }else planFold.append(el("p",{},details));
     if(pack&&pack!=="Not applicable")planFold.append(el("p",{class:"muted"},"Pack: "+pack));
     planFold.addEventListener("toggle",()=>{state.feedbackOpen[path+"|plan|"+date]=planFold.open});
     card.append(planFold);
     if(state.activitiesFetched){
       const match=sessionActivity(date,title);
       if(match?.status==="completed"){const a=match.activity;const distance=a.distance>0?(a.distance/1000).toFixed(2)+" km · ":"";const fold=el("details",{class:"session-activity-fold"});const key=path+"|activity|"+date;if(state.feedbackOpen[key])fold.open=true;fold.append(el("summary",{},"✓ Completed"));fold.append(el("p",{class:"muted"},a.name+" · "+distance+Math.round((a.moving_time||a.elapsed_time)/60)+" min"));fold.addEventListener("toggle",()=>{state.feedbackOpen[key]=fold.open});card.append(fold);}
       else if(match?.status==="review")card.append(el("p",{class:"muted"},"? Activity recorded on this date — needs review"));
       else card.append(el("p",{class:"muted"},"○ Awaiting activity"));
     }

     if(sessionFeedbackLabels[date]){
       const feedback=feedbackByDate[date]||"";
       const details=el("details",{class:"session-feedback-fold"});
       if(state.feedbackOpen[path+"|"+date])details.open=true;
       const summary=el("summary",{},feedback?"Feedback · View comments":"Feedback · No comments yet");
       details.append(summary);
       const content=el("p",{class:"session-feedback-copy"},feedback||"No feedback recorded for this session.");
       details.append(content);
       const b=el("button",{class:"secondary",type:"button"},feedback?"Edit feedback":"Enter feedback");
       b.onclick=()=>openSessionFeedback(date);
       details.append(b);
       details.addEventListener("toggle",()=>{state.feedbackOpen[path+"|"+date]=details.open});
       card.append(details);
     }
     root.append(card);
   };
   const sessions=rows.map(c=>({date:c[0],title:c[1],details:c[2]+" minutes",pack:c[3]}));
   sessions.push(isWeek4?{date:"Wed 18 Nov",title:"Leg strength",details:"15–20 minutes · Light leg-strength exercises, focus on technique.",pack:"Not applicable"}:{date:"Wed 11 Nov",title:"Introductory leg strength",details:"15–20 minutes · Light step-ups, calf raises, supported split squats and balance. Optional easy bouldering.",pack:"Not applicable"});
   sessions.push(isWeek4?{date:"Fri 20 Nov",title:"Optional easy bouldering",details:"Keep this an easy optional session.",pack:"Not applicable"}:{date:"Fri 13 Nov",title:"Optional easy solo bouldering",details:"No two-hour session with Jo this Friday.",pack:"Not applicable"});
   const dayOrder={Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5,Sun:6};
   // Show every calendar day, including days without a scheduled workout.
   const weekStart=new Date(d+"T12:00:00Z");
   const dayNames=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
   for(let offset=0;offset<7;offset++){
     const day=new Date(weekStart.getTime()+offset*86400000);
     const label=dayNames[day.getUTCDay()]+" "+day.getUTCDate()+" "+day.toLocaleDateString("en-GB",{month:"short",timeZone:"UTC"});
     if(!sessions.some(session=>session.date===label)){
       sessions.push({date:label,title:"Rest day",details:"No scheduled activity.",pack:""});
     }
   }
   sessions.sort((a,b)=>(dayOrder[a.date.slice(0,3)]??7)-(dayOrder[b.date.slice(0,3)]??7));
   for(const session of sessions)makeCard(session.date,session.title,session.details,session.pack);
   // Explicitly verify the final Sunday card is present for this dated week.
   const sunday=new Date(weekStart.getTime()+6*86400000);
   const sundayLabel="Sun "+sunday.getUTCDate()+" "+sunday.toLocaleDateString("en-GB",{month:"short",timeZone:"UTC"});
   if(!Array.from(root.querySelectorAll("h3")).some(h=>h.textContent.startsWith(sundayLabel+" · "))){makeCard(sundayLabel,"Rest day","","");}
   if(state.activityError)root.append(el("p",{class:"muted"},"Activity sync unavailable: "+state.activityError));
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
 state.feedbackRows=parseFeedback(content).filter(row=>row.section==="## Weekly observations");
 if(!state.feedbackRows.length){
  root.append(el("p",{class:"muted"},"No weekly observations are available in this format. Use Advanced to edit the original Markdown."));
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
async function loadIndex(){const r=await api("/api/index");state.files=r.files||[];state.feedback=state.files.filter(x=>/^feedback\/week\d+-\d{4}-\d{2}-\d{2}\.md$/.test(x)).sort().reverse();populateSelect($("weekselect"),state.feedback);const documents=$("documents");documents.replaceChildren();

const schedule=el("div",{class:"card"});const scheduleTitle=el("h3",{},"Eryri 56K · training programme");const scheduleSelect=el("select",{});const scheduleDetails=el("div",{});schedule.append(scheduleTitle,scheduleSelect,scheduleDetails);documents.append(schedule);
try{const result=await api("/api/file?path="+encodeURIComponent("plans/approved-29-week-summary-2026-10-26.md"));const rows=result.content.split("\n").filter(line=>/^\d+\|\d{4}-\d\d-\d\d\|/.test(line)).map(line=>line.split("|"));for(const r of rows){const option=el("option",{},"Week "+r[0]+" · "+r[1]+" · "+r[2]);option.value=r[0];scheduleSelect.append(option)}
scheduleSelect.value="4";const render=()=>{const r=rows.find(x=>x[0]===scheduleSelect.value);if(!r)return;scheduleDetails.replaceChildren();scheduleDetails.append(el("p",{},r[0]==="4"?"Phase: Cutback · 4 runs plus Wednesday leg strength · Thursday capped at 8 km or 60 minutes":"Phase: "+r[2]+" · "+r[3]+" runs · approximately "+r[4]+" hours · estimated "+r[5]+"–"+r[6]+" km"));let sessions=[["Monday",r[9]==="0"?"Rest":r[9]+" min easy"],["Tuesday",r[10]+" (original approved workout reference)"],["Thursday",r[7]==="0"?"Race-week easy run: see approved plan":r[7]+" km or "+r[8]+" min, whichever first"],["Saturday",r[11]==="0"?"Rest":r[11]+" min"]];if(r[0]==="3"){sessions=[["Monday 9 Nov","Easy 20 min, conversational"],["Tuesday 10 Nov","Gentle hills 35 min (5 min warm-up, 25 min hills, 5 min cool-down)"],["Wednesday 11 Nov","Introductory leg strength 15–20 min; optional easy bouldering"],["Thursday 12 Nov","Coastal trail: stop at 10 km or 80 elapsed min, whichever comes first; light pack"],["Friday 13 Nov","Optional easy solo bouldering"],["Saturday 14 Nov","Parkrun 5 km, aim under 30 min if recovered; 40 min including warm-up and cool-down"]];scheduleDetails.append(el("p",{class:"muted"},"Approved Week 3 amendments (8 Nov), with subsequently approved Garmin changes. Running maximum 175 min. Use perceived effort rather than HR targets; heart rate remains recorded."))}if(r[0]==="4"){sessions=[["Monday 16 Nov","Easy conversational run · 20 minutes"],["Tuesday 17 Nov","Rolling hills · 30 minutes, controlled effort"],["Wednesday 18 Nov","Light leg-strength workout · 15–20 minutes; focus on correct technique"],["Thursday 19 Nov","Coastal run · stop at 8 km or 60 minutes, whichever comes first"],["Friday 20 Nov","Optional easy bouldering"],["Saturday 21 Nov","Parkrun · 5 km, no programmed warm-up or cool-down; controlled, with sub-30-minute aim if recovered"],["Sunday 22 Nov","Rest day"]];scheduleDetails.append(el("p",{class:"muted"},"Approved Week 4 cutback schedule (16–22 November), including Wednesday leg strength. This view does not schedule Garmin workouts."))}for(const [day,workout] of sessions){const line=el("p",{},day+": "+workout);scheduleDetails.append(line)}scheduleDetails.append(el("p",{class:"muted"},r[0]==="3"?"Current approved Week 3 schedule. This view does not change Garmin workouts.":r[0]==="4"?"Current approved Week 4 schedule. This view does not change Garmin workouts.":"Draft planning view: original 26 October baseline. Later changes have not yet been incorporated for this week; this view does not schedule workouts."))};scheduleSelect.onchange=render;render()}catch(e){scheduleDetails.append(el("p",{class:"danger"},"Could not load the programme: "+e.message))}
const allowed=state.files.filter(x=>x==="TRAINING_MASTER.md"||x==="WEEKLY_WORKFLOW.md");
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
const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());const target=state.feedback.find(p=>dateFromFile(p)<=today)||state.feedback[0];if(target){$("weekselect").value=target;await loadFeedback(target);setWeek(target);await loadActivities();await renderSessions(target)}show("main",true);show("signout",true);show("signin",false);status("")}
async function begin(){if(!API){status("API not configured yet; see deployment guide.",true);return}location.href=API+"/auth/start"}
async function exchangeTicket(){const fragment=new URLSearchParams(location.hash.slice(1));const ticket=fragment.get("ticket");if(!ticket)return;history.replaceState(null,"",location.pathname+location.search);const r=await fetch(API+"/auth/exchange",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticket})});const data=await r.json();if(!r.ok)throw Error(data.error||"Sign-in failed");state.token=data.session;sessionStorage.setItem("eryri_session",state.token)}
$("refresh").onclick=async()=>{
 const button=$("refresh");
 if(button.disabled)return;
 button.disabled=true;
 const original=button.title;
 button.title="Syncing activities from Intervals.icu…";
 try{
   const before=await api("/api/file?path="+encodeURIComponent("data/portal-activities.json"));
   const previous=JSON.parse(before.content).updated_at||"";
   await api("/api/sync-activities",{method:"POST",body:"{}"});
   status("Activity sync requested. Waiting for GitHub Actions…");
   let synced=false;
   for(let attempt=0;attempt<24;attempt++){
     await new Promise(resolve=>setTimeout(resolve,5000));
     const latest=await api("/api/file?path="+encodeURIComponent("data/portal-activities.json"));
     const updated=JSON.parse(latest.content).updated_at||"";
     if(updated&&updated!==previous){synced=true;break}
   }
   await loadActivities();
   await renderSessions(state.current);
   status(synced?"":"Sync is still running. Try Refresh again shortly.");
 }catch(e){status("Activity sync could not start: "+e.message,true)}
 finally{button.disabled=false;button.title=original}
};
$("signin").onclick=begin;$("signout").onclick=()=>{const token=state.token;state.token="";sessionStorage.removeItem("eryri_session");apiLogout(token);show("main",false);show("signin",true);show("signout",false);status("Signed out.")};
async function apiLogout(token){if(API&&token)try{await fetch(API+"/auth/logout",{method:"POST",headers:{"Authorization":"Bearer "+token}})}catch{}}
document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>tab(b.dataset.tab));
$("weekselect").onchange=async e=>{const path=e.target.value,previous=state.current;if(!await loadFeedback(path)){e.target.value=previous;return}setWeek(path);await loadActivities();await renderSessions(path)};
$("editor").oninput=()=>{state.dirty=true;$("savestatus").textContent="Unsaved changes"};
$("reload").onclick=()=>loadFeedback($("weekselect").value);
$("save").onclick=async()=>{
 const button=$("save");button.disabled=true;$("savestatus").textContent="Saving…";
 try{
  const path=$("weekselect").value;
  const latest=await api("/api/file?path="+encodeURIComponent(path));
  const latestRows=parseFeedback(latest.content);
  const originalRows=parseFeedback(state.feedbackOriginal);
  const lines=latest.content.split("\n");
  for(const row of state.feedbackRows){
   const original=originalRows.find(x=>x.label===row.label&&x.section===row.section);
   const current=latestRows.find(x=>x.label===row.label&&x.section===row.section);
   if(!current)throw Error("Weekly observation field no longer exists: "+row.label);
   const next=row.area.value.trim().replace(/\r?\n/g,"; ");
   if(current.value!==(original?.value||"")&&current.value!==next)throw Error("A weekly observation changed on another device. Reload before saving.");
   lines[current.index]="- "+current.label+": "+(next||"**Not supplied**");
  }
  const content=lines.join("\n");
  const r=await api("/api/feedback",{method:"PUT",body:JSON.stringify({path,content,sha:latest.sha})});
  state.sha=r.sha;state.feedbackOriginal=content;$("editor").value=content;renderFeedbackForm(content);state.dirty=false;
  $("savestatus").textContent="Saved to GitHub · "+new Date().toLocaleTimeString("en-GB");
  await renderSessions(path);
 }catch(e){$("savestatus").textContent="Not saved: "+e.message}
 finally{button.disabled=false}
};
window.addEventListener("beforeunload",e=>{if(state.dirty){e.preventDefault();e.returnValue=""}});
(async()=>{try{await exchangeTicket();if(state.token)await loadIndex();else status(API?"Sign in to view your private training plan.":"API not configured yet; see portal/DEPLOY.md.")}catch(e){status(e.message,true);if(e.message.includes("Unauthorized")||e.message.includes("session")){state.token="";sessionStorage.removeItem("eryri_session")}}})();
