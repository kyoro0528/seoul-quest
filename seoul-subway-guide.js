(() => {
  'use strict';
  const stations={myeongdong:{name:'明洞駅 · 명동역',lat:37.56099,lon:126.98633},hongdae:{name:'弘大入口駅 · 홍대입구역',lat:37.55719,lon:126.92538},seongsu:{name:'聖水駅 · 성수역',lat:37.54458,lon:127.05598}};
  const target=document.querySelector('#guideMap');
  let map,marker,loading,selection=0;
  function loadMapLibrary(){
    if(window.L)return Promise.resolve();
    if(loading)return loading;
    loading=new Promise((resolve,reject)=>{
      const css=document.createElement('link');css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';css.integrity='sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';css.crossOrigin='';
      const js=document.createElement('script');js.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';js.integrity='sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';js.crossOrigin='';
      let a=false,b=false;const timeout=setTimeout(fail,15000);
      function fail(){clearTimeout(timeout);css.remove();js.remove();reject(new Error('network'));}
      function ready(){if(a&&b){clearTimeout(timeout);resolve();}}
      css.onload=()=>{a=true;ready();};js.onload=()=>{b=true;ready();};css.onerror=js.onerror=fail;document.head.append(css,js);
    }).catch(error=>{loading=null;throw error;});return loading;
  }
  document.querySelectorAll('[data-map]').forEach(button=>button.addEventListener('click',async()=>{
    const current=++selection;
    const s=stations[button.dataset.map];
    document.querySelectorAll('[data-map]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    document.querySelector('#externalMap').href=`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=16/${s.lat}/${s.lon}`;
    const status=document.querySelector('#mapStatus');status.textContent=s.name+'の地図を読み込んでいます…';
    try{
      await loadMapLibrary();if(current!==selection)return;
      if(!map){target.replaceChildren();target.style.display='block';target.setAttribute('aria-label','駅周辺の地図');map=L.map(target,{scrollWheelZoom:false});L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(map).on('tileerror',()=>{status.textContent='地図の一部を読み込めませんでした。下の地図リンクをご利用ください。';});}
      map.setView([s.lat,s.lon],15);if(marker)marker.remove();marker=L.marker([s.lat,s.lon],{title:s.name,alt:s.name}).addTo(map).bindPopup(s.name).openPopup();map.invalidateSize();
      status.textContent=s.name+'周辺。ドラッグ・＋／−で操作できます。表示できない場合は下の地図リンクをご利用ください。';
    }catch(error){status.textContent='地図を読み込めませんでした。もう一度街のボタンを押すか、下の地図リンクをご利用ください。';}
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
    top.append(text,play);const reading=document.createElement('p');reading.className='phrase-reading';reading.textContent=kana;const translation=document.createElement('p');translation.className='phrase-translation';translation.textContent=jp;const copy=document.createElement('button');copy.type='button';copy.className='copy-text';copy.textContent='韓国語をコピー';copy.onclick=()=>copyText(ko);card.append(translation,top,reading,copy);document.querySelector('#phraseList').append(card);
  });
  function copyText(text){
    const status=document.querySelector('#copyStatus');
    if(!navigator.clipboard){status.textContent='コピーできませんでした。文字を長押しして選択してください。';return;}
    navigator.clipboard.writeText(text).then(()=>{status.textContent='コピーしました：'+text;},()=>{status.textContent='コピーできませんでした。文字を長押しして選択してください。';});
  }
  document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',()=>copyText(button.dataset.copy)));
  document.querySelector('#phraseSearch').addEventListener('input',e=>{
    const term=e.target.value.trim().toLocaleLowerCase();let count=0;
    document.querySelectorAll('.phrase-card').forEach(card=>{card.hidden=!card.textContent.toLocaleLowerCase().includes(term);if(!card.hidden)count++;});
    document.querySelector('#phraseCount').textContent=count?count+'件の表現':'該当する表現がありません。別の言葉で探してください。';
  });
  window.addEventListener('pagehide',()=>{if('speechSynthesis'in window)speechSynthesis.cancel();});
})();
