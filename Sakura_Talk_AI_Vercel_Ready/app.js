const state = {
  level: 'N3', scenario: 'Free Talk', scenarioJa: 'フリートーク', name: '',
  transcript: [], startedAt: null, timerId: null, pc: null, dc: null, stream: null,
  remoteAudio: null, connected: false, muted: false, demo: false,
  userDraft: '', assistantDraft: '', lastAssistantText: ''
};

const $ = (id) => document.getElementById(id);
const screens = ['home','setup','call','report'];
function go(name){ screens.forEach(s => $('screen-'+s).classList.toggle('active', s===name)); window.scrollTo({top:0,behavior:'instant'}); }
function toast(msg){ const el=$('toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),2600); }
function esc(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

$('startSetupBtn').onclick=()=>go('setup');
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));

document.querySelectorAll('#levelOptions button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#levelOptions button').forEach(x=>x.classList.remove('selected'));
  b.classList.add('selected'); state.level=b.dataset.value;
});
document.querySelectorAll('.scenario').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.scenario').forEach(x=>x.classList.remove('selected'));
  b.classList.add('selected'); state.scenario=b.dataset.scenario; state.scenarioJa=b.dataset.ja;
});

$('enterCallBtn').onclick=()=>{
  state.name=$('displayName').value.trim() || 'Learner'; localStorage.setItem('sakura-name',state.name);
  $('callScenarioTitle').textContent=state.scenarioJa; $('callLevelText').textContent=`${state.level} · Tokyo Japanese`;
  resetTranscript(); go('call');
};
$('displayName').value=localStorage.getItem('sakura-name')||'';

function setCallState(text, live=false){ $('callStateText').textContent=text; document.body.classList.toggle('call-live',live); }
function startTimer(){ state.startedAt=Date.now(); clearInterval(state.timerId); state.timerId=setInterval(()=>{ const s=Math.floor((Date.now()-state.startedAt)/1000); $('timerText').textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; },1000); }
function stopTimer(){ clearInterval(state.timerId); state.timerId=null; }
function resetTranscript(){ state.transcript=[]; state.userDraft=''; state.assistantDraft=''; renderTranscript(); $('timerText').textContent='00:00'; }
function addTurn(role,text){ const clean=(text||'').trim(); if(!clean)return; const last=state.transcript[state.transcript.length-1]; if(last && last.role===role && last.text===clean)return; state.transcript.push({role,text:clean,ts:Date.now()}); if(role==='assistant')state.lastAssistantText=clean; renderTranscript(); }
function renderTranscript(){ const el=$('transcriptList'); if(!state.transcript.length){el.innerHTML='<div class="empty-transcript">Your conversation will appear here.</div>';return;} el.innerHTML=state.transcript.map(t=>`<div class="turn ${t.role}"><div class="who">${t.role==='user'?'YOU':'SAKURA'}</div><div class="bubble">${esc(t.text)}</div></div>`).join(''); el.scrollTop=el.scrollHeight; }

async function connectRealtime(){
  if(state.connected)return;
  $('voiceBtn').disabled=true; setCallState('Connecting to Sakura…',true);
  try{
    const tokenResp=await fetch('/api/realtime-token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({level:state.level,scenario:state.scenario,name:state.name})});
    const tokenData=await tokenResp.json();
    if(!tokenResp.ok) throw new Error(tokenData.error||'Voice service unavailable');
    const ephemeral=tokenData.value || tokenData.client_secret?.value || tokenData.client_secret;
    if(!ephemeral) throw new Error('Realtime token was not returned');

    const pc=new RTCPeerConnection(); state.pc=pc;
    const audio=document.createElement('audio'); audio.autoplay=true; audio.playsInline=true; state.remoteAudio=audio;
    pc.ontrack=(e)=>{ audio.srcObject=e.streams[0]; };
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}}); state.stream=stream;
    pc.addTrack(stream.getAudioTracks()[0],stream);
    const dc=pc.createDataChannel('oai-events'); state.dc=dc;
    dc.onopen=()=>{ state.connected=true; $('voiceBtn').classList.add('active'); $('voiceBtn').querySelector('strong').textContent='Voice live'; $('apiStatusText').textContent='Live'; setCallState('話してみて。ちゃんと聞いてるよ。',true); startTimer(); };
    dc.onmessage=(e)=>handleRealtimeEvent(JSON.parse(e.data));
    dc.onerror=()=>toast('Realtime data channel error');
    pc.onconnectionstatechange=()=>{ if(['failed','disconnected','closed'].includes(pc.connectionState) && state.connected){ setCallState('Connection ended.'); state.connected=false; } };

    const offer=await pc.createOffer(); await pc.setLocalDescription(offer);
    const sdpResp=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',body:offer.sdp,headers:{Authorization:`Bearer ${ephemeral}`,'Content-Type':'application/sdp'}});
    if(!sdpResp.ok) throw new Error(`Realtime handshake failed (${sdpResp.status})`);
    await pc.setRemoteDescription({type:'answer',sdp:await sdpResp.text()});
  }catch(err){
    console.error(err); toast(err.message.includes('API key')?'OpenAI API key is not configured yet. Try demo mode.':err.message);
    setCallState('Voice is not configured yet — demo mode is ready.'); $('apiStatusText').textContent='Demo ready';
    cleanupRealtime(false);
  }finally{$('voiceBtn').disabled=false;}
}

function handleRealtimeEvent(ev){
  if(ev.type==='input_audio_buffer.speech_started') setCallState('Listening…',true);
  if(ev.type==='input_audio_buffer.speech_stopped') setCallState('Sakura is thinking…',true);
  if(ev.type==='conversation.item.input_audio_transcription.delta'){ state.userDraft += ev.delta||''; }
  if(ev.type==='conversation.item.input_audio_transcription.completed'){ addTurn('user',ev.transcript||state.userDraft); state.userDraft=''; }
  if(ev.type==='response.output_audio_transcript.delta' || ev.type==='response.output_text.delta'){ state.assistantDraft += ev.delta||''; setCallState('Sakura is speaking…',true); }
  if(ev.type==='response.output_audio_transcript.done' || ev.type==='response.output_text.done'){ const text=ev.transcript||ev.text||state.assistantDraft; addTurn('assistant',text); state.assistantDraft=''; setCallState('Listening…',true); }
  if(ev.type==='response.done' && state.assistantDraft){ addTurn('assistant',state.assistantDraft); state.assistantDraft=''; }
  if(ev.type==='error'){ console.error('Realtime error',ev); toast(ev.error?.message||'Realtime error'); }
}

function cleanupRealtime(stopClock=true){
  state.connected=false; state.muted=false;
  try{state.dc?.close()}catch{} try{state.pc?.close()}catch{} state.stream?.getTracks().forEach(t=>t.stop());
  state.pc=null; state.dc=null; state.stream=null; state.remoteAudio=null;
  $('voiceBtn').classList.remove('active'); $('voiceBtn').querySelector('strong').textContent='Start voice'; $('muteBtn').textContent='🔇';
  if(stopClock)stopTimer();
}
$('voiceBtn').onclick=()=> state.connected ? toast('Voice is already live — just speak naturally.') : connectRealtime();
$('muteBtn').onclick=()=>{ if(!state.stream){toast('Start voice first.');return;} state.muted=!state.muted; state.stream.getAudioTracks().forEach(t=>t.enabled=!state.muted); $('muteBtn').textContent=state.muted?'🎙':'🔇'; toast(state.muted?'Microphone muted':'Microphone on'); };

$('toggleTranscriptBtn').onclick=()=>{ const list=$('transcriptList'); const hidden=list.style.display==='none'; list.style.display=hidden?'block':'none'; $('toggleTranscriptBtn').textContent=hidden?'Hide':'Show'; };

$('helpBtn').onclick=()=>openSheet(); $('sheetBackdrop').onclick=closeSheet;
function openSheet(){ $('sheetBackdrop').classList.add('show'); $('helpSheet').classList.add('show'); $('helpSheet').setAttribute('aria-hidden','false'); }
function closeSheet(){ $('sheetBackdrop').classList.remove('show'); $('helpSheet').classList.remove('show'); $('helpSheet').setAttribute('aria-hidden','true'); }
document.querySelectorAll('[data-help]').forEach(b=>b.onclick=()=>{ const type=b.dataset.help; closeSheet(); if(state.connected&&state.dc?.readyState==='open'){ const map={hint:'Give the learner one short Japanese sentence they can naturally say next. Then return to role-play.',simple:'Repeat your last point in simpler Japanese suitable for this learner level.',repeat:'Repeat your last sentence slowly and clearly, without a long explanation.',translate:'Briefly explain your last Japanese sentence in Bengali, then immediately return to Japanese role-play.'}; state.dc.send(JSON.stringify({type:'response.create',response:{instructions:map[type],output_modalities:['audio']}})); } else toast('Help will work during a live voice session.'); });

$('demoLineBtn').onclick=runDemo;
async function runDemo(){
  if(state.connected){toast('You are already in live voice mode.');return;}
  state.demo=true; resetTranscript(); startTimer(); setCallState('Demo: Sakura is listening…',true); $('apiStatusText').textContent='Demo';
  addTurn('user','昨日、大阪へ行くました。友達と行きました。'); await sleep(900);
  const r1='あ、昨日大阪に行きました？いいね！友達と何をしたの？'; addTurn('assistant',r1); speak(r1); setCallState('Sakura is speaking…',true); await sleep(3500);
  addTurn('user','たこ焼きを食べて、道頓堀で写真を撮りました。'); await sleep(800);
  const r2='へえ〜、いいね。道頓堀って夜だとけっこうにぎやかだったでしょ？'; addTurn('assistant',r2); speak(r2); setCallState('Demo complete — end the session to see your report.');
}
function speak(text){ if(!('speechSynthesis'in window))return; speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang='ja-JP'; u.rate=.96; const voices=speechSynthesis.getVoices(); const ja=voices.find(v=>v.lang?.startsWith('ja')); if(ja)u.voice=ja; speechSynthesis.speak(u); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

$('leaveCallBtn').onclick=async()=>{ if(!state.transcript.length && !state.startedAt){ cleanupRealtime(); go('setup'); return; } await endSession(); };
async function endSession(){
  const durationSec=state.startedAt?Math.max(1,Math.floor((Date.now()-state.startedAt)/1000)):0; cleanupRealtime(); setCallState('Session ended.'); $('apiStatusText').textContent='Ready'; go('report'); renderReportLoading();
  try{
    const res=await fetch('/api/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:state.name,level:state.level,scenario:state.scenario,durationSec,transcript:state.transcript})});
    const data=await res.json(); if(!res.ok)throw new Error(data.error||'Report failed'); renderReport(data);
  }catch(err){ console.error(err); renderReport(localReport(durationSec)); toast('Showing local report because AI report is not configured yet.'); }
}
function renderReportLoading(){ $('scoreGrid').innerHTML='<div class="score"><strong>…</strong><small>Analyzing</small></div>'; $('correctionsList').innerHTML='<p class="tiny">Reviewing your conversation…</p>'; $('strengthsList').innerHTML=''; $('focusList').innerHTML=''; }
function renderReport(r){ const metrics=[['Naturalness',r.scores?.naturalness],['Grammar',r.scores?.grammar],['Vocabulary',r.scores?.vocabulary],['Fluency',r.scores?.fluency],['Confidence',r.scores?.confidence],['Pronunciation',r.scores?.pronunciation]]; $('scoreGrid').innerHTML=metrics.map(([k,v])=>`<div class="score"><strong>${v !== null && v !== undefined && Number.isFinite(Number(v)) ? Math.round(Number(v)) : '—'}</strong><small>${k}</small></div>`).join(''); $('reportSubtitle').textContent=r.summary||`${state.scenario} · ${state.level}`; const cs=r.corrections||[]; $('correctionsList').innerHTML=cs.length?cs.map(c=>`<div class="correction"><div class="bad">✕ ${esc(c.original||'')}</div><div class="good">✓ ${esc(c.better||'')}</div><div class="why">${esc(c.reason_bn||c.reason||'')}</div></div>`).join(''):'<p class="tiny">No major correction needed this time.</p>'; $('strengthsList').innerHTML=(r.strengths||[]).map(x=>`<span>${esc(x)}</span>`).join(''); $('focusList').innerHTML=(r.focus_next||[]).map(x=>`<span>${esc(x)}</span>`).join(''); }
function localReport(durationSec){ const hasMistake=state.transcript.some(t=>t.role==='user'&&t.text.includes('行くました')); return {summary:`${Math.max(1,Math.round(durationSec/60))} min · ${state.scenario} · ${state.level}`,scores:{naturalness:74,grammar:76,vocabulary:72,fluency:75,confidence:80,pronunciation:null},corrections:hasMistake?[{original:'昨日、大阪へ行くました。',better:'昨日、大阪へ行きました。',reason_bn:'「行く」-এর polite past form হলো 「行きました」。'}]:[],strengths:['会話を続けられた','返事が自然','内容が伝わった'],focus_next:['動詞の活用','自然な相づち']}; }
$('newSessionBtn').onclick=()=>{ resetTranscript(); go('setup'); };

window.addEventListener('beforeunload',()=>cleanupRealtime());
