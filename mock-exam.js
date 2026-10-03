(function(root){
  'use strict';
  const courses={
    quick10:{id:'quick10',name:'10分模試',minutes:10,listening:4,reading:6,readingFields:{vocabulary:2,grammar:1,reading:2,other:1}},
    standard20:{id:'standard20',name:'20分模試',minutes:20,listening:8,reading:12,readingFields:{vocabulary:3,grammar:3,reading:4,other:2}},
    full:{id:'full',name:'本番時間模試',minutes:100,listening:30,reading:40,readingFields:{vocabulary:10,grammar:10,reading:15,other:5}}
  };
  function shuffle(items,rng=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
  function buildExam(chapters,courseId,rng=Math.random){
    const course=courses[courseId];if(!course)throw Error('模試コースが見つかりません。');
    const byId=Object.fromEntries(chapters.map(x=>[x.id,x]));
    const listening=byId['topik-listening']?.q||[],sources={vocabulary:byId['topik-vocab']?.q||[],grammar:byId['topik-grammar']?.q||[],reading:byId['topik-reading']?.q||[],other:byId['topik-number']?.q||[]};
    if(listening.length<course.listening||Object.entries(course.readingFields).some(([field,count])=>sources[field].length<count))throw Error('模試に必要な問題数が不足しています。');
    const reading=Object.entries(course.readingFields).flatMap(([field,count])=>shuffle(sources[field],rng).slice(0,count).map(q=>({...q,mockSection:'reading',mockField:field})));
    return [...shuffle(listening,rng).slice(0,course.listening).map(q=>({...q,mockSection:'listening',mockField:'listening'})),...shuffle(reading,rng)];
  }
  const score=(correct,total)=>total?Math.round(correct/total*100):0;
  function createRecord({courseId,answers,date,createdAt,id,timedOut=false}){
    const course=courses[courseId];if(!course)throw Error('模試コースが見つかりません。');
    const stats={listening:{total:0,correct:0},reading:{total:0,correct:0}};
    answers.forEach(a=>{if(!stats[a.section])return;stats[a.section].total++;if(a.correct)stats[a.section].correct++});
    const fields={vocabulary:{total:0,wrong:0},grammar:{total:0,wrong:0},listening:{total:0,wrong:0},reading:{total:0,wrong:0},other:{total:0,wrong:0}};
    answers.forEach(a=>{const field=fields[a.field]||fields.other;field.total++;if(!a.correct)field.wrong++});
    const missed=answers.map((a,n)=>a.correct?null:n+1).filter(Boolean).join(',');
    return {id,createdAt,date,name:`オリジナル模試 ${course.name}`,listening:score(stats.listening.correct,stats.listening.total),reading:score(stats.reading.correct,stats.reading.total),examConditions:courseId==='full'&&!timedOut,missed,note:`自動保存・聞き取り ${stats.listening.correct}/${stats.listening.total}問、読解 ${stats.reading.correct}/${stats.reading.total}問${timedOut?'（時間切れ）':''}`,fields,source:'original-mock',courseId};
  }
  const api={courses,buildExam,score,createRecord};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.TopikMockExam=api;
})(typeof window==='undefined'?globalThis:window);
