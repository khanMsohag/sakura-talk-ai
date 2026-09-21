module.exports = async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey) return res.status(503).json({error:'OpenAI API key is not configured on the server.'});
  const {level='N3',scenario='Free Talk',durationSec=0,transcript=[]}=req.body||{};
  const compact=(Array.isArray(transcript)?transcript:[]).slice(-60).map(t=>`${t.role==='assistant'?'Sakura':'Learner'}: ${String(t.text||'').slice(0,800)}`).join('\n');
  const prompt=`Analyze this Japanese learning role-play. Be fair and useful. Do not invent mistakes that are not visible in the transcript. Pronunciation cannot be reliably judged from text, so use null unless there is explicit audio-derived evidence. Return ONLY valid JSON with exactly this shape:\n{"summary":"short Bengali-friendly summary","scores":{"naturalness":0,"grammar":0,"vocabulary":0,"fluency":0,"confidence":0,"pronunciation":null},"corrections":[{"original":"...","better":"...","reason_bn":"short Bengali explanation"}],"strengths":["..."],"focus_next":["..."]}\nUse scores 0-100. Maximum 4 corrections, 3 strengths, 3 focus items. Level: ${level}. Scenario: ${scenario}. Duration: ${durationSec}s.\nTRANSCRIPT:\n${compact||'(no transcript)'}`;
  try{
    const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-5.6-luna',messages:[{role:'system',content:'You are a precise Japanese-language conversation coach. Output JSON only.'},{role:'user',content:prompt}],response_format:{type:'json_object'}})});
    const data=await r.json(); if(!r.ok)return res.status(r.status).json({error:data?.error?.message||'Report analysis failed'});
    const text=data?.choices?.[0]?.message?.content||'{}'; const parsed=JSON.parse(text); res.setHeader('Cache-Control','no-store'); return res.status(200).json(parsed);
  }catch(e){ return res.status(500).json({error:'Could not generate the session report'}); }
};
