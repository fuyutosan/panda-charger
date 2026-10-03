// ゲームの記録を、友達に見せるための画像へ。認証情報・クラウド保存は扱わない。
(function () {
  'use strict';
  const overlay = document.getElementById('profileOverlay');
  const preview = document.getElementById('profilePreview');
  const message = document.getElementById('profileMessage');
  const nameInput = document.getElementById('profileName');
  const shareButton = document.getElementById('profileShare');
  const download = document.getElementById('profileDownload');
  const refresh = document.getElementById('profileRefresh');
  const featuredInput = document.getElementById('profileFeatured');
  let sourceOverlay = null, sourceButton = null, file = null, imageUrl = null, generation = 0, caption = '';
  const rarityColors = { N:'#36965b', R:'#3188c4', SR:'#a745b8', UR:'#c28c20' };
  function round(c,x,y,w,h,r,color) {
    c.fillStyle=color; c.beginPath(); c.roundRect(x,y,w,h,r); c.fill();
  }
  function text(c,str,x,y,size,color,weight,align) {
    c.textAlign=align || 'left'; c.fillStyle=color || '#245d3c'; c.font=(weight || 600)+' '+size+'px sans-serif'; c.fillText(str,x,y);
  }
  async function image(src) {
    try { const im=new Image(); im.src=src; await im.decode(); return im; } catch(e) { return null; }
  }
  function drawImage(c,im,x,y,w,h,r) {
    if(!im) return;
    c.save(); c.beginPath(); c.roundRect(x,y,w,h,r); c.clip(); c.drawImage(im,x,y,w,h); c.restore();
  }
  async function generate() {
    const ticket=++generation;
    file=null; shareButton.disabled=true; refresh.disabled=true; download.hidden=true; preview.hidden=true;
    refresh.textContent='画像を作成中…';
    message.textContent='あなたのコレクションを1枚にしているよ…';
    // 見せる項目だけのスナップショット。合言葉などは画像へ入れない。
    const snapshot={charges:save.charges, streak:save.streak.count, cards:{...save.cards}, outfit:save.outfit,
      outfits:{...save.unlockedOutfits}, ach:save.ach.slice(), bestCombo:save.bestCombo};
    const name=nameInput.value.trim() || 'メイメイの充電士';
    const pool=RARITY_ORDER.flatMap(r=>CARD_POOL[r].map(v=>({...v,rarity:r})));
    const owned=pool.filter(v=>snapshot.cards[v.id]>0);
    const featured=owned.find(v=>v.id===featuredInput.value) || owned[owned.length-1];
    const outfit=OUTFITS.find(v=>v.id===snapshot.outfit && snapshot.outfits[v.id]);
    const outfits=OUTFITS.filter(v=>snapshot.outfits[v.id]).length;
    const achievements=ACHIEVEMENTS.filter(v=>snapshot.ach.includes(v.id)).length;
    const artwork=await Promise.all(owned.map(async v=>[v.id,await image(CARD_IMAGES[v.id])]));
    const art=new Map(artwork);
    const avatar=await image(document.getElementById('pandaFace').src);
    if(ticket!==generation) return;
    const canvas=document.createElement('canvas'); canvas.width=1080; canvas.height=2800;
    const c=canvas.getContext('2d');
    if(!c) throw new Error('canvas unavailable');
    const bg=c.createLinearGradient(0,0,1080,2800); bg.addColorStop(0,'#f4fff1'); bg.addColorStop(1,'#b7eccc');
    c.fillStyle=bg; c.fillRect(0,0,1080,2800);
    for(let i=0;i<22;i++) { c.fillStyle='#ffffff65'; c.beginPath(); c.arc((i*239)%1080,(i*359)%2560,14+(i%5)*8,0,Math.PI*2); c.fill(); }
    text(c,'MY PANDA-SAN POWER',540,98,29,'#498560',800,'center');
    text(c,'マイ充電プロフィール',540,168,57,'#226640',900,'center');
    round(c,60,214,960,386,36,'#ffffffdf');
    round(c,86,244,254,254,32,'#e6f5e4');
    if(avatar) {
      const scale=Math.min(228/avatar.naturalWidth,228/avatar.naturalHeight);
      const w=avatar.naturalWidth*scale,h=avatar.naturalHeight*scale;
      c.drawImage(avatar,99+(228-w)/2,262+(228-h)/2,w,h);
    }
    if(outfit) text(c,outfit.emoji,213,286,76,'#24623c',600,'center');
    c.font='800 43px sans-serif';
    const nameSize=Math.min(43,43*570/Math.max(1,c.measureText(name).width));
    text(c,name,374,298,nameSize,'#235e3b',800);
    text(c,'Lv.'+snapshot.charges+' '+titleForCharges(snapshot.charges),374,360,33,'#49825b',700);
    text(c,'充電 '+snapshot.charges+'回',374,418,32);
    text(c,'連続 '+snapshot.streak+'日 / ベスト '+snapshot.bestCombo+'コンボ',374,474,28,'#53745c');
    text(c,'いまの着せ替え：'+(outfit ? outfit.emoji+' '+outfit.name : 'いつものメイメイ'),540,552,29,'#4e714f',700,'center');
    round(c,60,626,960,342,32,'#ffffffef');
    if(featured) {
      round(c,82,648,292,292,24,rarityColors[featured.rarity]);
      drawImage(c,art.get(featured.id),90,656,276,276,18);
      text(c,'きみのとっておき',404,690,28,'#49825b',800);
      text(c,featured.rarity+' / '+RARITY_LABEL_JA[featured.rarity],404,738,25,rarityColors[featured.rarity],800);
      c.font='900 39px sans-serif'; c.fillStyle='#245e3a'; c.textAlign='left';
      canvasLines(c,featured.name,404,798,550,46,2);
      c.font='600 25px sans-serif'; c.fillStyle='#53745c';
      canvasLines(c,featured.body,404,895,550,32,3);
    } else {
      text(c,'ここから、きみのコレクションが始まるよ',540,776,36,'#245e3a',800,'center');
      text(c,'充電して お気に入りのパンダさんと出会おう🐼',540,840,28,'#53745c',700,'center');
    }
    text(c,'あつめたパンダさんずかん',76,1030,40,'#245e3a',800);
    text(c,owned.length+' / '+CARD_TOTAL,1005,1030,39,'#2c7b48',800,'right');
    RARITY_ORDER.forEach((r,i)=>{
      const count=owned.filter(v=>v.rarity===r).length;
      round(c,76+i*234,1058,216,48,18,rarityColors[r]);
      text(c,r+'  '+count+' / '+CARD_POOL[r].length,184+i*234,1091,26,'#fff',800,'center');
    });
    pool.forEach((v,i)=>{
      const x=76+(i%6)*157, y=1130+Math.floor(i/6)*145, has=snapshot.cards[v.id]>0;
      round(c,x,y,143,135,18,has?rarityColors[v.rarity]:'#cbdfd1');
      round(c,x+5,y+5,133,112,13,has?'#fff':'#e9f3e9');
      if(has && art.get(v.id)) drawImage(c,art.get(v.id),x+15,y+5,112,112,13);
      else text(c,has?'画像未取得':'?',x+72,y+76,has?18:42,has?'#5c7662':'#a0b7a4',800,'center');
      text(c,v.rarity,x+12,y+129,17,has?'#fff':'#69836e',800);
      if(has) text(c,'×'+snapshot.cards[v.id],x+131,y+129,17,'#fff',800,'right');
    });
    text(c,'きせかえコレクション',76,1910,38,'#245e3a',800);
    text(c,outfits+' / '+OUTFITS.length,1005,1910,36,'#2c7b48',800,'right');
    OUTFITS.forEach((v,i)=>{
      const x=76+(i%3)*315,y=1940+Math.floor(i/3)*104,has=!!snapshot.outfits[v.id],equipped=outfit && outfit.id===v.id;
      round(c,x,y,299,91,18,equipped?'#f6ce6a':has?'#ffffffed':'#d3e5d7');
      if(!has) c.globalAlpha=.42;
      text(c,v.emoji,x+39,y+58,43,'#3c6b46',700,'center'); c.globalAlpha=1;
      text(c,v.name,x+77,y+35,25,has?'#295b3b':'#69836f',700);
      text(c,equipped?'着用中！':has?'GET!':'これから',x+77,y+68,21,equipped?'#765318':has?'#368350':'#7a9280',700);
    });
    text(c,'じっせきスタンプ',76,2200,38,'#245e3a',800);
    text(c,achievements+' / '+ACHIEVEMENTS.length,1005,2200,36,'#2c7b48',800,'right');
    ACHIEVEMENTS.forEach((v,i)=>{
      const x=76+(i%4)*236,y=2230+Math.floor(i/4)*87,has=snapshot.ach.includes(v.id);
      round(c,x,y,222,77,16,has?'#f5d885':'#cfdfd2');
      if(!has) c.globalAlpha=.4;
      text(c,v.icon,x+31,y+50,33,'#715726',700,'center'); c.globalAlpha=1;
      c.font='700 21px sans-serif'; c.textAlign='left'; c.fillStyle=has?'#755320':'#748979';
      canvasLines(c,v.name,x+58,y+31,156,26,2);
      if(has) text(c,'✓',x+202,y+20,18,'#846225',800,'center');
    });
    text(c,'こんなに集めたよ！あなたのコレクションも見せてね',540,2644,31,'#24633d',800,'center');
    text(c,'パンダさんパワー充電器',540,2710,27,'#497e55',700,'center');
    text(c,'panda-charger.pages.dev',540,2758,26,'#497e55',500,'center');
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(ticket!==generation) return;
    if(!blob) throw new Error('image unavailable');
    if(imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl=URL.createObjectURL(blob); file=new File([blob],'panda-san-profile.png',{type:'image/png'});
    preview.src=imageUrl; preview.hidden=false; download.href=imageUrl; download.hidden=false;
    caption='パンダさんパワーのマイ充電プロフィール🐼\nずかん '+owned.length+'/'+CARD_TOTAL+'種・きせかえ '+outfits+'/'+OUTFITS.length+'・じっせき '+achievements+'/'+ACHIEVEMENTS.length+'！\nあなたのコレクションも見せてね💚\nhttps://panda-charger.pages.dev/\n#パンダさんパワー';
    shareButton.disabled=false; refresh.disabled=false;
    refresh.textContent='画像を作り直す';
    message.textContent='できたよ！この1枚を友達に送れるよ🐼';
  }
  function rebuild() {
    generate().catch(()=>{
      message.textContent='画像を作れなかったよ。もう一度「画像を作り直す」を押してね。';
      refresh.disabled=false;
      refresh.textContent='画像を作り直す';
    });
  }
  function close() {
    generation++; closeModal(overlay);
    if(sourceOverlay) openModal(sourceOverlay);
    if(sourceButton) sourceButton.focus({preventScroll:true});
  }
  document.querySelectorAll('.profile-open').forEach(button=>button.addEventListener('click',()=>{
    sourceButton=button; sourceOverlay=document.getElementById(button.dataset.profileSource);
    const selected=featuredInput.value;
    featuredInput.replaceChildren();
    const owned=RARITY_ORDER.flatMap(r=>CARD_POOL[r].filter(v=>save.cards[v.id]>0).map(v=>({...v,rarity:r})));
    owned.forEach(v=>{const option=document.createElement('option');option.value=v.id;option.textContent=v.rarity+'：'+v.name;featuredInput.appendChild(option);});
    if(!owned.length) {const option=document.createElement('option');option.textContent='まず充電して、パンダさんと出会おう';option.value='';featuredInput.appendChild(option);}
    featuredInput.disabled=!owned.length;
    featuredInput.value=owned.some(v=>v.id===selected)?selected:lastDrawnCard&&owned.some(v=>v.id===lastDrawnCard.id)?lastDrawnCard.id:owned.length?owned[owned.length-1].id:'';
    closeModal(sourceOverlay); openModal(overlay); document.getElementById('profileClose').focus({preventScroll:true}); rebuild();
  }));
  document.getElementById('profileClose').addEventListener('click',close);
  overlay.addEventListener('click',e=>{if(e.target===overlay) close();});
  overlay.addEventListener('keydown',e=>{
    if(e.key==='Escape') { e.preventDefault(); close(); }
    if(e.key==='Tab') {
      const elements=Array.from(overlay.querySelectorAll('button,input,select,a[href]')).filter(el=>!el.hidden&&!el.disabled);
      const index=elements.indexOf(document.activeElement); e.preventDefault();
      elements[(index+(e.shiftKey?-1:1)+elements.length)%elements.length].focus();
    }
  });
  refresh.addEventListener('click',rebuild);
  featuredInput.addEventListener('change',rebuild);
  nameInput.addEventListener('input',()=>{
    generation++; file=null; shareButton.disabled=true; download.hidden=true; refresh.disabled=false;
    refresh.textContent='画像を作り直す';
    message.textContent='名前を変えたら「画像を作り直す」を押してね。';
  });
  shareButton.addEventListener('click',()=>{
    if(!file) return;
    if(navigator.canShare && navigator.share && navigator.canShare({files:[file]})) {
      navigator.share({files:[file]}).catch(e=>{if(e.name!=='AbortError') message.textContent='共有を開けなかったよ。「画像を保存する」から送ってね。';});
    } else message.textContent='このブラウザでは直接共有できないので「画像を保存する」から友達に送ってね。';
  });
  document.getElementById('profileCopy').addEventListener('click',async()=>{
    if(!caption) return;
    try { await navigator.clipboard.writeText(caption); message.textContent='紹介文をコピーしたよ！画像と一緒に送ってね。'; }
    catch(e) { message.textContent=caption; }
  });
})();
