const {test}=require('node:test');
const assert=require('node:assert/strict');
const {courses,buildExam,score,createRecord}=require('../mock-exam.js');

const chapters=[
  {id:'topik-listening',q:Array.from({length:100},(_,i)=>({id:`l${i}`}))},
  {id:'topik-vocab',q:Array.from({length:100},(_,i)=>({id:`v${i}`}))},
  {id:'topik-grammar',q:Array.from({length:100},(_,i)=>({id:`g${i}`}))},
  {id:'topik-reading',q:Array.from({length:100},(_,i)=>({id:`r${i}`}))},
  {id:'topik-number',q:Array.from({length:100},(_,i)=>({id:`n${i}`}))}
];

test('three courses use the requested duration and question balance',()=>{
  assert.deepEqual(Object.values(courses).map(x=>[x.minutes,x.listening,x.reading]),[[10,4,6],[20,8,12],[100,30,40]]);
  for(const id of Object.keys(courses)){
    const q=buildExam(chapters,id,()=>0.4),course=courses[id];
    assert.equal(q.length,course.listening+course.reading);
    assert.equal(q.filter(x=>x.mockSection==='listening').length,course.listening);
    assert.equal(q.filter(x=>x.mockSection==='reading').length,course.reading);
    assert.deepEqual(Object.fromEntries(Object.keys(course.readingFields).map(field=>[field,q.filter(x=>x.mockField===field).length])),course.readingFields);
    assert.equal(new Set(q.map(x=>x.id)).size,q.length);
  }
});

test('section scores are converted to 100 points and saved with weaknesses',()=>{
  const answers=[...Array.from({length:4},(_,i)=>({section:'listening',field:'listening',correct:i<3})),...Array.from({length:6},(_,i)=>({section:'reading',field:['vocabulary','vocabulary','grammar','reading','reading','other'][i],correct:i<3}))];
  const r=createRecord({courseId:'quick10',answers,date:'2026-10-03',createdAt:1,id:'x'});
  assert.equal(r.listening,75);assert.equal(r.reading,50);assert.equal(r.fields.listening.wrong,1);assert.equal(r.fields.vocabulary.wrong,0);assert.equal(r.fields.grammar.wrong,0);assert.equal(r.fields.reading.wrong,2);assert.equal(r.fields.other.wrong,1);assert.equal(r.examConditions,false);assert.equal(r.missed,'4,8,9,10');
});

test('only a completed full course qualifies as exam conditions',()=>{
  const answers=[...Array.from({length:30},()=>({section:'listening',field:'listening',correct:true})),...Array.from({length:40},()=>({section:'reading',field:'reading',correct:true}))];
  assert.equal(createRecord({courseId:'full',answers,date:'2026-10-03',createdAt:1,id:'x'}).examConditions,true);
  assert.equal(createRecord({courseId:'full',answers,date:'2026-10-03',createdAt:1,id:'x',timedOut:true}).examConditions,false);
  assert.equal(score(2,3),67);
});
