(() => {
  'use strict';
  const stations={myeongdong:{name:'明洞駅 · 명동역',lat:37.56099,lon:126.98633},hongdae:{name:'弘大入口駅 · 홍대입구역',lat:37.55719,lon:126.92538},seongsu:{name:'聖水駅 · 성수역',lat:37.54458,lon:127.05598}};
  const target=document.querySelector('#guideMap');
  document.querySelectorAll('[data-map]').forEach(button=>button.addEventListener('click',()=>{
    const s=stations[button.dataset.map];
    document.querySelectorAll('[data-map]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    const frame=document.createElement('iframe');frame.title=s.name+'周辺の地図';frame.referrerPolicy='strict-origin-when-cross-origin';
    const query=new URLSearchParams({bbox:[s.lon-.012,s.lat-.007,s.lon+.012,s.lat+.007].join(','),layer:'mapnik',marker:[s.lat,s.lon].join(',')});
    frame.src='https://www.openstreetmap.org/export/embed.html?'+query;
    target.replaceChildren(frame);
    document.querySelector('#mapStatus').textContent=s.name+'周辺。ドラッグ・＋／−で操作できます。表示できない場合は下の地図リンクをご利用ください。';
    document.querySelector('#externalMap').href=`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=16/${s.lat}/${s.lon}`;
  }));
  const phrases=[
    ['지하철역이 어디예요?','チハチョリョギ オディエヨ？','地下鉄の駅はどこですか？'],
    ['명동역에 어떻게 가요?','ミョンドンヨゲ オットケ カヨ？','明洞駅へはどうやって行きますか？'],
    ['몇 호선을 타야 해요?','ミョッ ホソヌル タヤ ヘヨ？','何号線に乗ればいいですか？'],
    ['이 열차는 성수역에 가요?','イ ヨルチャヌン ソンスヨゲ カヨ？','この列車は聖水駅へ行きますか？'],
    ['어디에서 갈아타야 해요?','オディエソ カラタヤ ヘヨ？','どこで乗り換えればいいですか？'],
    ['여기에서 내려야 해요?','ヨギエソ ネリョヤ ヘヨ？','ここで降りればいいですか？'],
    ['몇 번 출구로 나가야 해요?','ミョッ ポン チュルグロ ナガヤ ヘヨ？','何番出口から出ればいいですか？'],
    ['엘리베이터가 어디에 있어요?','エルリベイトガ オディエ イッソヨ？','エレベーターはどこにありますか？'],
    ['교통카드를 충전하고 싶어요.','キョトンカドゥルル チュンジョナゴ シポヨ。','交通カードをチャージしたいです。'],
    ['잔액은 어디에서 확인해요?','チャネグン オディエソ ファギネヨ？','残高はどこで確認しますか？'],
    ['막차가 몇 시예요?','マクチャガ ミョッ シエヨ？','終電は何時ですか？'],
    ['죄송하지만 다시 말씀해 주세요.','チェソンハジマン タシ マルスメ ジュセヨ。','すみませんが、もう一度おっしゃってください。']
  ];
  const status=document.querySelector('#speechStatus');
  phrases.forEach(([ko,kana,jp])=>{
    const card=document.createElement('article');card.className='phrase-card';
    const top=document.createElement('div');top.className='phrase-top';
    const text=document.createElement('p');text.lang='ko';text.textContent=ko;
    const play=document.createElement('button');play.type='button';play.className='phrase-audio';play.textContent='🔊';play.setAttribute('aria-label',ko+'の音声を聞く');
    play.onclick=()=>{if(!('speechSynthesis'in window)){status.textContent='このブラウザは音声再生に対応していません。';return;}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(ko);u.lang='ko-KR';u.rate=.8;const v=speechSynthesis.getVoices().find(v=>v.lang.startsWith('ko'));if(v)u.voice=v;u.onerror=()=>{status.textContent='韓国語音声を再生できませんでした。端末の音声設定をご確認ください。';};u.onend=()=>{status.textContent='再生しました。';};speechSynthesis.speak(u);status.textContent='韓国語を再生しています。';};
    top.append(text,play);const reading=document.createElement('p');reading.className='phrase-reading';reading.textContent=kana;const translation=document.createElement('p');translation.className='phrase-translation';translation.textContent=jp;card.append(top,reading,translation);document.querySelector('#phraseList').append(card);
  });
  document.querySelector('#toggleTranslations').onclick=e=>{const hidden=document.querySelector('#phraseList').classList.toggle('hide-translations');e.currentTarget.setAttribute('aria-pressed',String(hidden));e.currentTarget.textContent=hidden?'日本語訳を表示する':'日本語訳を隠して練習する';};
  window.addEventListener('pagehide',()=>{if('speechSynthesis'in window)speechSynthesis.cancel();});
})();
