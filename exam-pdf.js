(function(root){
  'use strict';
  const fields=[['vocabulary','語彙'],['grammar','文法'],['listening','聞き取り'],['reading','読解'],['other','数字・その他']];
  function model(record){
    if(!record||record.source!=='original-mock')throw Error('オリジナル模試の結果を選んでください。');
    const rows=fields.map(([key,name])=>{const f=record.fields[key];return {key,name,total:f.total,correct:f.total-f.wrong,rate:f.total?Math.round((f.total-f.wrong)/f.total*100):null};});
    return {record,total:record.listening+record.reading,rows,weak:rows.filter(f=>f.rate!==null).sort((a,b)=>a.rate-b.rate).slice(0,3)};
  }
  // A single A4 page with a JPEG image keeps Japanese glyphs portable without a remote font.
  function makePdf(jpeg,width,height){
    const enc=new TextEncoder(),chunks=[],offsets=[0];let length=0;
    const add=value=>{const b=typeof value==='string'?enc.encode(value):value;chunks.push(b);length+=b.length;};
    const object=(id,body)=>{offsets[id]=length;add(`${id} 0 obj\n${body}\nendobj\n`);};
    add('%PDF-1.4\n');
    object(1,'<< /Type /Catalog /Pages 2 0 R >>');
    object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    object(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    offsets[4]=length;add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);add(jpeg);add('\nendstream\nendobj\n');
    const stream='q 595.28 0 0 841.89 0 0 cm /Im0 Do Q\n';object(5,`<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}endstream`);
    const xref=length;add('xref\n0 6\n0000000000 65535 f \n');for(let i=1;i<=5;i++)add(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
    add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out=new Uint8Array(length);let cursor=0;for(const chunk of chunks){out.set(chunk,cursor);cursor+=chunk.length;}return out;
  }
  async function draw(record){
    const m=model(record);if(document.fonts?.ready)await document.fonts.ready;
    const canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754;const c=canvas.getContext('2d');
    if(!c)throw Error('PDFを作成できませんでした。');
    const text=(s,x,y,size=25,color='#102a43',bold=false)=>{c.fillStyle=color;c.font=`${bold?'700':'400'} ${size}px sans-serif`;c.fillText(String(s),x,y);};
    const line=(y)=>{c.strokeStyle='#d9e2ec';c.beginPath();c.moveTo(70,y);c.lineTo(1170,y);c.stroke();};
    c.fillStyle='#fff';c.fillRect(0,0,1240,1754);c.fillStyle='#102a43';c.fillRect(0,0,1240,200);
    text('TOPIK STUDY',70,75,30,'#b9d8ff',true);text('オリジナル模試 成績レポート',70,137,42,'#fff',true);
    text(`${record.date}  |  ${record.name}`,70,247,27);text(`制限時間：${({quick10:10,standard20:20,full:100})[record.courseId]||'-'}分`,70,286,24,'#627d98');
    text(`${m.total}`,70,389,86,'#1756a9',true);text('/ 200点換算',250,384,29);text(`聞き取り ${record.listening} / 100   読解 ${record.reading} / 100`,70,442,29);
    text(m.total>=140?'2級の基準点（140点）以上':m.total>=80?'1級の基準点（80点）以上':'1級の基準点まであと '+(80-m.total)+'点',70,490,28,'#16834a',true);
    text('正答数の割合を各100点に換算した練習得点です。公式試験の配点とは異なります。',70,532,22,'#627d98');line(559);
    text('今回の分野別正答率',70,607,32,'#102a43',true);
    const cx=330,cy=850,radius=160,point=(i,rate)=>{const angle=-Math.PI/2+i*2*Math.PI/5;return [cx+Math.cos(angle)*radius*rate/100,cy+Math.sin(angle)*radius*rate/100];};
    function polygon(values,fill){c.beginPath();values.forEach((v,i)=>{const p=point(i,v);i?c.lineTo(...p):c.moveTo(...p)});c.closePath();if(fill){c.fillStyle=fill;c.fill();}c.stroke();}
    c.strokeStyle='#d9e2ec';[20,40,60,80,100].forEach(n=>polygon(Array(5).fill(n)));
    m.rows.forEach((f,i)=>{c.beginPath();c.moveTo(cx,cy);c.lineTo(...point(i,100));c.stroke();const p=point(i,132);c.textAlign='center';text(f.name,...p,23);text(f.rate===null?'未評価':f.rate+'%',p[0],p[1]+31,24,'#1756a9',true);});c.textAlign='left';
    if(m.rows.every(f=>f.rate!==null)){c.strokeStyle='#1756a9';c.lineWidth=3;polygon(m.rows.map(f=>f.rate),'#1756a933');c.lineWidth=1;}else text('未評価分野があるため図形は表示しません。',70,1120,21,'#627d98');
    m.rows.forEach((f,i)=>{const y=702+i*79;text(f.name,680,y,25,'#102a43',true);text(f.rate===null?'未評価':`${f.correct} / ${f.total}問（${f.rate}%）`,680,y+33,24,'#627d98');});
    line(1160);text('次に復習すること',70,1212,32,'#102a43',true);
    const tips={vocabulary:'単語の意味と例文を確認し、翌日にもう一度解く。',grammar:'助詞・活用を見直し、誤答が違う理由を説明する。',listening:'数字・時刻・場所と、否定や言い直しを聞き直す。',reading:'本文の根拠を探し、条件や否定表現を確認する。',other:'数字や助数詞を復習し、似た表現を比較する。'};
    m.weak.forEach((f,i)=>{text(`${i+1}. ${f.name}（正答率 ${f.rate}%）`,70,1268+i*85,26,'#1756a9',true);text(tips[f.key],70,1304+i*85,24);});
    line(1537);text('このレポートは1回の模試結果です。問題数が少ない分野は参考値として確認してください。',70,1581,22,'#627d98');text('合格確率や本番の合否を保証するものではありません。',70,1617,22,'#627d98');text('https://topik-study.pages.dev/  |  非公式・オリジナル教材',70,1688,22,'#627d98');
    return canvas;
  }
  async function download(record){const canvas=await draw(record),raw=atob(canvas.toDataURL('image/jpeg',.94).split(',')[1]),jpeg=Uint8Array.from(raw,ch=>ch.charCodeAt(0));const blob=new Blob([makePdf(jpeg,canvas.width,canvas.height)],{type:'application/pdf'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`TOPIK-${record.date}-${record.courseId}.pdf`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  const api={model,makePdf,draw,download};if(typeof module==='object'&&module.exports)module.exports=api;else root.TopikExamPdf=api;
})(typeof window==='undefined'?globalThis:window);
