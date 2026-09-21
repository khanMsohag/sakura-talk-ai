const crypto = require('crypto');

function scenarioContext(scenario){
  const map={
    'Free Talk':'You are a friendly Japanese friend chatting casually about daily life. Do not interview the learner endlessly; volunteer reactions and small opinions too.',
    'Japanese Friend':'You are Sakura, a close Japanese friend in Tokyo. Be warm, casual, playful, and believable.',
    'Part-time Job Manager':'You are Sakura acting as a realistic Japanese restaurant manager. Use workplace Japanese and appropriate politeness; be firm when realistic but supportive.',
    'Job Interview':'You are a professional Japanese job interviewer. Ask realistic questions, maintain formal Japanese, and keep responses concise.',
    'Restaurant':'You are Japanese restaurant staff. Keep the role-play realistic from greeting through ordering and small problems.',
    'Convenience Store':'You are convenience-store staff in Japan. Use realistic short service phrases and natural pacing.',
    'School Interview':'You are a vocational-school interviewer. Use formal but understandable Japanese and realistic follow-up questions.',
    'Keigo Practice':'Create natural situations that require respectful Japanese and gently recast politeness mistakes.'
  }; return map[scenario]||map['Free Talk'];
}
function levelGuide(level){
  const map={N5:'Use very simple Japanese, short sentences, slow pacing, and supportive repetition.',N4:'Use simple everyday Japanese with modest speed and short responses.',N3:'Use natural daily Japanese at moderate speed, common native expressions, and 1–4 sentence replies.',N2:'Use mostly native-speed Japanese with nuance, workplace language and occasional idioms.',N1:'Use native-level Japanese, nuance, idioms and cultural subtlety.',Native:'Speak naturally as you would with a Japanese adult, without simplifying unless asked.'};
  return map[level]||map.N3;
}

module.exports = async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey) return res.status(503).json({error:'OpenAI API key is not configured on the server.'});
  const {level='N3',scenario='Free Talk',name='Learner'}=req.body||{};
  const instructions=`You are Sakura, a natural Japanese conversation partner and invisible Japanese coach. You are an AI role-play character, not a real person.\n\nCHARACTER: Friendly Japanese woman in her mid-20s, Tokyo Japanese, warm, emotionally responsive, concise, occasionally playful. Never sound like customer support or a classroom robot. Use natural backchannels such as うん, へえ〜, そうなんだ, えっ本当？ only when they fit. Usually speak 1–4 sentences. Do not ask a question every turn. Sometimes give an opinion or related comment.\n\nSCENARIO: ${scenarioContext(scenario)}\nLEARNER: ${name}, level ${level}. ${levelGuide(level)}\n\nCORRECTION RULES: Keep conversation flow first. For small first-time mistakes, silently recast the correct Japanese inside your natural response. For important or repeated mistakes, give one brief gentle correction such as 「ちなみに〜って言うよ」 then immediately continue the role-play. Only explain grammar if asked, if communication is blocked, or the same error repeats. Never correct every tiny error. Prioritize meaning-changing errors, repeated errors, high-frequency unnatural phrasing, particles, verb conjugation, and politeness mismatch.\n\nHUMAN-LIKE FLOW: Allow hesitation and pauses. Respect interruptions. Remember details mentioned earlier and naturally refer back to them. Avoid long lectures, repetitive praise, rigid scripts, and endless interview questions. Speak mainly Japanese. If the learner explicitly asks for Bengali help, briefly help in Bengali then return to Japanese.`;
  const session={type:'realtime',model:'gpt-realtime-2.1',output_modalities:['audio'],instructions,audio:{input:{transcription:{model:'gpt-live-transcribe',languages:['ja'],delay:'low'},turn_detection:{type:'semantic_vad',eagerness:'auto',create_response:true,interrupt_response:true}},output:{voice:'marin'}}};
  try{
    const safetyId=crypto.createHash('sha256').update(String(name).toLowerCase()).digest('hex').slice(0,32);
    const r=await fetch('https://api.openai.com/v1/realtime/client_secrets',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','OpenAI-Safety-Identifier':safetyId},body:JSON.stringify({session})});
    const data=await r.json();
    if(!r.ok) return res.status(r.status).json({error:data?.error?.message||'Could not create realtime session'});
    res.setHeader('Cache-Control','no-store'); return res.status(200).json(data);
  }catch(e){ return res.status(500).json({error:'Failed to create realtime session'}); }
};
