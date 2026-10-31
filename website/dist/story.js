import {clamp,segment,sceneProgress,cardPose,scrollSavings} from './motion.mjs';
import {formatMoney} from './demo.mjs';

/** Illustrations only. Scroll never writes to the journal demo or device data. */
export function initScrollStory() {
  const $=s=>document.querySelector(s);
  const scenes=[...document.querySelectorAll('[data-scene]')];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let motionOff=reduced.matches,framePending=false,pointerX=0,pointerY=0;
  let soundOn=false,audioContext;
  const discovered=new Set();
  const particles=$('.ambient-particles');
  for(let i=0;i<42;i++){
    const star=document.createElement('span');star.textContent=i%4===0?'✦':'·';
    star.style.cssText=`--left:${(i*37+9)%98}%;--top:${(i*29+7)%97}%;--size:${i%4===0?11+i%13:14}px;--duration:${15+i%13}s;--delay:-${i%17}s`;
    particles.append(star);
  }
  const coins=$('.road-coins');
  for(let i=0;i<27;i++){
    const coin=document.createElement('span');coin.textContent='★';
    coin.style.cssText=`--coin-x:${35+(i*17)%29}%;--coin-y:${3+i*3.45}%;--coin-rotate:${(i*13)%32-16}deg`;
    coins.append(coin);
  }
  const deck=$('.money-deck');
  const finish=document.createElement('div');finish.className='deck-finish';finish.setAttribute('aria-hidden','true');
  finish.innerHTML='<span>★</span><h3>A little clearer.</h3><p>Five sample moments. One money story.<br>Available: <b>₹17,660</b></p>';deck.prepend(finish);
  const words=new Map();
  document.querySelectorAll('[data-scroll-words]').forEach(heading=>{
    const walker=document.createTreeWalker(heading,NodeFilter.SHOW_TEXT),nodes=[];
    while(walker.nextNode())if(walker.currentNode.textContent.trim())nodes.push(walker.currentNode);
    for(const node of nodes){
      const fragment=document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(word=>{if(!word.trim()){fragment.append(document.createTextNode(word));return;}const span=document.createElement('span');span.className='scroll-word';span.textContent=word;fragment.append(span);});
      node.replaceWith(fragment);
    }
    words.set(heading,[...heading.querySelectorAll('.scroll-word')]);
  });
  const cards=[...document.querySelectorAll('.money-card')];
  const checks=[...document.querySelectorAll('.record-checklist span')];
  cards.forEach((card,i)=>card.style.zIndex=String(cards.length-i+10));
  const wishCards=[...document.querySelectorAll('.wish-option')];
  const tabs=[...document.querySelectorAll('[role=tab]')];
  const panels=[...document.querySelectorAll('[role=tabpanel]')];
  const reel=$('.gallery-reel');
  const fillers=[['A LITTLE MONEY MOMENT','₹17,660 available','Income, expenses and wish savings, together.'],['A LITTLE LOOK BACK','Your everyday, at a glance','Choose a date in the app to revisit its entries.'],['A COPY TO KEEP','PDF · CSV · JSON','Export only when you choose. Keep backups private.'],['YOUR LITTLE CORNER','Make it feel like you','A nickname, a date format, a gentler amount of motion.']];
  const slides=panels.map((panel,index)=>{
    const slide=document.createElement('article');slide.className='gallery-slide';
    const title=tabs[index].querySelector('span').textContent;
    slide.innerHTML=`<div class="gallery-phone-status"><b>9:41</b><span>▮▮▮ ▰</span></div><div class="gallery-app-header">TULLIP ✦</div><h3>${title}</h3>`;
    slide.append(panel.querySelector('.feature-illustration').cloneNode(true));
    const filler=document.createElement('div');filler.className='gallery-filler';
    filler.innerHTML=`<small>${fillers[index][0]}</small><strong>${fillers[index][1]}</strong><p>${fillers[index][2]}</p>`;
    slide.append(filler);
    const nav=document.createElement('div');nav.className='gallery-phone-nav';nav.innerHTML='<span>⌂</span><span>▤</span><span>♡</span><span>◴</span>';slide.append(nav);reel.append(slide);return slide;
  });
  let manualGallery=null,lastGalleryProgress=-1;
  function selectGallery(index){
    const selected=Math.round(clamp(index,0,slides.length-1));
    tabs.forEach((tab,i)=>{const active=i===selected;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;panels[i].hidden=!active;});
  }
  function drawGallery(position){
    const mobile=innerWidth<=760,small=innerWidth<=380;
    const gap=mobile?(small?160:180):250;
    slides.forEach((slide,i)=>{
      const distance=i-position,depth=Math.min(3,Math.abs(distance));
      const angle=clamp(distance*-31,-62,62);
      slide.style.transform=`translate3d(${distance*gap}px,${depth*17}px,${-depth*(mobile?95:145)}px) rotateY(${angle}deg) scale(${1-depth*.045})`;
      slide.style.opacity=String(clamp(1-Math.max(0,depth-1)*.2,.35,1));slide.style.zIndex=String(10-Math.round(depth*2));
    });selectGallery(position);
  }
  tabs.forEach((tab,i)=>{
    tab.addEventListener('click',()=>{manualGallery=i;drawGallery(i);});
    tab.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)){manualGallery=tabs.findIndex(t=>t.getAttribute('aria-selected')==='true');drawGallery(manualGallery);}});
  });
  const motionButton=$('#motion-toggle');
  function applyMotion(){
    document.documentElement.classList.toggle('motion-off',motionOff);
    motionButton.setAttribute('aria-pressed',String(motionOff));
    motionButton.setAttribute('aria-label',motionOff?'Enable motion':'Reduce motion');
    motionButton.title=motionOff?'Motion reduced':'Reduce motion';
    requestDraw();
  }
  motionButton.addEventListener('click',()=>{motionOff=!motionOff;applyMotion();});
  reduced.addEventListener('change',event=>{motionOff=event.matches;applyMotion();if(motionOff)pauseTour();});
  const soundButton=$('#sound-toggle');
  async function chime(){
    if(!soundOn)return;
    try{
      audioContext??=new (window.AudioContext||window.webkitAudioContext)();
      if(audioContext.state==='suspended')await audioContext.resume();
      [659.25,880].forEach((frequency,i)=>{const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='sine';osc.frequency.value=frequency;const start=audioContext.currentTime+i*.07;gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.045,start+.014);gain.gain.exponentialRampToValueAtTime(.0001,start+.35);osc.connect(gain);gain.connect(audioContext.destination);osc.start(start);osc.stop(start+.36);});
    }catch{soundOn=false;soundButton.setAttribute('aria-pressed','false');soundButton.setAttribute('aria-label','Turn sound on');soundButton.title='Sound unavailable';}
  }
  soundButton.addEventListener('click',()=>{soundOn=!soundOn;soundButton.setAttribute('aria-pressed',String(soundOn));soundButton.setAttribute('aria-label',soundOn?'Turn sound off':'Turn sound on');soundButton.title=soundOn?'Sound on':'Sound off';if(soundOn)void chime();});
  function burst(element){
    void chime();if(motionOff)return;
    const rect=element.getBoundingClientRect(),layer=$('.interaction-sparkles');
    for(let i=0;i<11;i++){const star=document.createElement('span');star.className='burst-star';star.textContent=i%3?'✦':'♡';const angle=i*Math.PI*2/11;star.style.cssText=`--x:${rect.left+rect.width/2}px;--y:${rect.top+rect.height/2}px;--dx:${Math.cos(angle)*(65+i*3)}px;--dy:${Math.sin(angle)*75-45}px`;star.addEventListener('animationend',()=>star.remove(),{once:true});layer.append(star);setTimeout(()=>star.remove(),1200);}
  }
  document.querySelectorAll('#save-sample,#release-sample,#sample-expense,[data-wish]').forEach(button=>button.addEventListener('click',()=>burst(button)));

  function lightWords(scene,p){
    scene.querySelectorAll('[data-scroll-words]').forEach(heading=>{
      const list=words.get(heading)||[];
      list.forEach((word,i)=>{word.style.opacity=String(motionOff?1:.16+.84*clamp(p*list.length-i+1));});
    });
  }
  function draw(){
    framePending=false;
    const vh=innerHeight;
    const hero=$('.hero'),heroP=clamp(scrollY/Math.max(1,hero.offsetHeight));
    $('.hero-phone').style.transform=motionOff?'':`translate3d(${pointerX*9}px,${heroP*90+pointerY*5}px,0) rotate(${6-heroP*6}deg) rotateY(${pointerX*7}deg) scale(var(--phone-scale))`;
    $('.hero-lumi').style.setProperty('--lumi-x',`${motionOff?0:pointerX*-13}px`);
    $('.hero-lumi').style.setProperty('--lumi-y',`${motionOff?0:heroP*65+pointerY*-7}px`);
    let current=null,night=false;
    for(const scene of scenes){
      const rect=scene.getBoundingClientRect();
      const p=motionOff?1:sceneProgress(rect.top,rect.height,vh);
      if(rect.top<vh*.52&&rect.bottom>vh*.52){current=scene.dataset.scene;night=current==='night';}
      if(rect.top<vh*.42)discovered.add(scene.dataset.scene);
      // Only active/adjacent scenes need animated style updates.
      if(rect.top>vh*1.2||rect.bottom< -vh*.2)continue;
      lightWords(scene,segment(p,0,.7));
      if(scene.dataset.scene==='records'){
        const deckP=motionOff?1:segment(p,.08,.87),done=Math.min(cards.length,Math.floor(deckP*cards.length));
        cards.forEach((card,i)=>{const pose=cardPose(i,deckP,cards.length);card.style.transform=`translate3d(0,${pose.y}px,${-i*3}px) rotate(${pose.rotate}deg) scale(${pose.scale})`;card.style.opacity=String(pose.opacity);card.classList.toggle('done',deckP*cards.length-i>.55);});
        checks.forEach((check,i)=>check.classList.toggle('done',i<done));$('#record-count').textContent=String(done);finish.style.opacity=String(segment(p,.86,.98));
        $('.deck-lumi').style.transform=`translate3d(${(Math.sin(p*Math.PI)*45)}px,${35-Math.sin(p*Math.PI)*35}px,0) rotate(${p*7-5}deg)`;
      }else if(scene.dataset.scene==='growth'){
        const growth=motionOff?1:segment(p,.05,.92),amount=scrollSavings(growth,500000);
        scene.style.setProperty('--road-progress',String(growth));$('#growth-amount').textContent=formatMoney(amount);$('.growth-track i').style.width=`${growth*100}%`;
        $('#growth-caption').textContent=growth>.98?'A lovely little wish, fully funded.':growth>.77?'Almost someday.':growth>.48?'Halfway there.':growth>.17?'A little closer.':'A little start.';
        [...coins.children].forEach((coin,i)=>coin.classList.toggle('collected',growth>(26-i)/27));
        $('.growth-lumi-wrap').style.transform=`translate3d(${Math.sin(growth*Math.PI)*24}px,${-growth*70}px,0) rotate(${growth*9-5}deg) scale(${.87+growth*.15})`;
      }else if(scene.dataset.scene==='wishes'){
        const fan=motionOff?1:segment(p,.08,.68),mobile=innerWidth<=760,gap=mobile?Math.min(92,innerWidth*.21):280;
        wishCards.forEach((card,i)=>{const offset=i-1;card.style.transform=`translate3d(${offset*gap*fan}px,${Math.abs(offset)*25*fan}px,${-Math.abs(offset)*35}px) rotate(${offset*17*fan}deg) scale(${mobile?.87-Math.abs(offset)*fan*.12:1-Math.abs(offset)*fan*.055})`;card.style.zIndex=String(card===document.activeElement?10:4-Math.abs(offset));});
      }else if(scene.dataset.scene==='night'){
        const introOut=motionOff?0:segment(p,.37,.57),lumiIn=motionOff?1:segment(p,.46,.68);
        const prologue=$('.night-prologue');prologue.style.opacity=String(1-introOut);prologue.style.transform=`translateY(${-introOut*100}px) scale(${1-introOut*.08})`;
        [...document.querySelectorAll('.night-stars>span')].forEach((star,i)=>star.classList.toggle('lit',motionOff||segment(p,0,.38)*7>=i+.5));
        const layout=$('.scene-night .lumi-layout');layout.style.opacity=String(lumiIn);layout.style.transform=`translateY(${(1-lumiIn)*70}px) scale(${.94+lumiIn*.06})`;
        $('.scene-night .lumi-portrait>.lumi').style.transform=`rotate(${-7+p*11}deg) translateY(${-Math.sin(p*Math.PI)*10}px)`;
      }else if(scene.dataset.scene==='gallery'){
        if(Math.abs(p-lastGalleryProgress)>.002){manualGallery=null;lastGalleryProgress=p;}
        drawGallery(manualGallery??(motionOff?0:segment(p,.06,.93)*(slides.length-1)));
        $('.gallery-marquee').style.transform=`translateX(${-p*24}%)`;
      }
    }
    const finale=$('#get-tullip').getBoundingClientRect();if(finale.top<vh*.6&&finale.bottom>vh*.2)night=true;
    document.body.classList.toggle('is-night',night);document.body.classList.toggle('story-active',!!current);
    document.querySelectorAll('[data-chapter]').forEach(link=>{const active=link.dataset.chapter===current;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','step');else link.removeAttribute('aria-current');});
    $('#journey-count').textContent=String(discovered.size);$('#finale-count').textContent=String(discovered.size);
    const range=document.documentElement.scrollHeight-vh;$('#reading-progress').style.transform=`scaleX(${range>0?clamp(scrollY/range):0})`;
  }
  function requestDraw(){if(!framePending){framePending=true;requestAnimationFrame(draw);}}
  addEventListener('scroll',requestDraw,{passive:true});addEventListener('resize',requestDraw);
  $('.hero').addEventListener('pointermove',event=>{if(motionOff||event.pointerType==='touch')return;const r=heroBounds();pointerX=clamp((event.clientX-r.left)/r.width,0,1)*2-1;pointerY=clamp((event.clientY-r.top)/r.height,0,1)*2-1;requestDraw();});
  $('.hero').addEventListener('pointerleave',()=>{pointerX=0;pointerY=0;requestDraw();});
  function heroBounds(){return $('.hero').getBoundingClientRect();}
  if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{threshold:.06});document.querySelectorAll('.reveal').forEach(el=>{if(!el.closest('.scroll-scene')&&!motionOff)el.classList.add('will-reveal');observer.observe(el);});}

  const dialog=$('#tour-dialog');let tourTimer=null,tourIndex=0,tourElapsed=0,tourStarted=0,tourPaused=true,tourOpener;
  function renderTour(){const copy=slides[tourIndex].cloneNode(true);copy.style.cssText='';$('.tour-frame').replaceChildren(copy);$('#tour-caption').textContent=tabs[tourIndex].querySelector('span').textContent;$('.tour-timeline span').style.width=`${clamp(tourElapsed/20000)*100}%`;}
  function pauseTour(){tourPaused=true;clearInterval(tourTimer);tourTimer=null;$('#tour-pause').textContent=tourElapsed>=20000?'Replay tour':'Play tour';}
  function playTour(){if(tourElapsed>=20000){tourElapsed=0;tourIndex=0;renderTour();}tourPaused=false;tourStarted=performance.now()-tourElapsed;$('#tour-pause').textContent='Pause tour';clearInterval(tourTimer);tourTimer=setInterval(()=>{tourElapsed=Math.min(20000,performance.now()-tourStarted);const next=Math.min(slides.length-1,Math.floor(tourElapsed/5000));if(next!==tourIndex){tourIndex=next;renderTour();}$('.tour-timeline span').style.width=`${tourElapsed/200}%`;if(tourElapsed>=20000)pauseTour();},100);}
  document.querySelectorAll('[data-play-tour]').forEach(button=>button.addEventListener('click',()=>{tourOpener=button;tourElapsed=0;tourIndex=0;renderTour();dialog.showModal();if(!motionOff)playTour();else pauseTour();}));
  $('.close-tour').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{pauseTour();tourOpener?.focus();});
  $('#tour-pause').addEventListener('click',()=>tourPaused?playTour():pauseTour());
  function moveTour(delta){pauseTour();tourIndex=(tourIndex+delta+slides.length)%slides.length;tourElapsed=tourIndex*5000;renderTour();}
  $('#tour-next').addEventListener('click',()=>moveTour(1));$('#tour-previous').addEventListener('click',()=>moveTour(-1));
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pauseTour();void audioContext?.suspend();}});
  applyMotion();drawGallery(0);draw();
}
