const {test}=require('node:test');const assert=require('node:assert/strict');
const {model,makePdf}=require('../exam-pdf.js');
const {createRecord}=require('../mock-exam.js');
test('PDF model uses the selected attempt, sorts weaknesses and preserves unevaluated fields',()=>{
  const record=createRecord({courseId:'quick10',date:'2026-10-03',id:'a',createdAt:1,answers:[{section:'listening',field:'listening',correct:true},{section:'reading',field:'grammar',correct:false}]});
  const m=model(record);assert.equal(m.total,100);assert.equal(m.weak[0].key,'grammar');assert.equal(m.rows.find(x=>x.key==='vocabulary').rate,null);assert.throws(()=>model({...record,source:'manual'}));
});
test('PDF embeds one image on exactly one A4 page with correct byte offsets',()=>{
  const jpeg=Uint8Array.from([255,216,255,217]);const pdf=makePdf(jpeg,1240,1754),s=Buffer.from(pdf).toString('latin1');
  assert.match(s,/\/Count 1/);assert.match(s,/\/MediaBox \[0 0 595.28 841.89\]/);assert.equal((s.match(/\/Type \/Page\b/g)||[]).length,1);
  const xref=Number(s.match(/startxref\n(\d+)/)[1]);assert.equal(s.slice(xref,xref+4),'xref');
  const lines=s.slice(xref).split('\n');for(let id=1;id<=5;id++){const offset=Number(lines[id+2].slice(0,10));assert.equal(s.slice(offset,offset+7),`${id} 0 obj`);}
});
