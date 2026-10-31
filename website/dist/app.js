import { TARGET, STEP, initialDemo, available, transition, formatMoney } from './demo.mjs';

const $ = selector => document.querySelector(selector);
let state = initialDemo();
function renderDemo(message) {
  const percent = Math.round(state.reserved / TARGET * 100);
  $('#available-value').textContent = formatMoney(available(state));
  $('#reserved-value').textContent = formatMoney(state.reserved);
  $('#spent-value').textContent = formatMoney(state.spent);
  $('#expense-row-value').textContent = '−' + formatMoney(state.spent);
  $('#jar-value').textContent = formatMoney(state.reserved);
  $('#jar-liquid').style.setProperty('--fill', `${percent}%`);
  $('#jar-progress').style.width = `${percent}%`;
  $('#demo-jar').setAttribute('aria-valuenow', String(percent));
  $('#demo-jar').setAttribute('aria-valuetext', `${formatMoney(state.reserved)} of ${formatMoney(TARGET)} saved`);
  $('#jar-percent').textContent = percent === 100 ? 'A lovely little plan, fully funded ♡' : `${percent}% of your lovely little plan`;
  $('#demo-jar').classList.toggle('complete', percent === 100);
  $('#save-sample').disabled = state.reserved >= TARGET || available(state) < STEP;
  $('#release-sample').disabled = state.reserved < STEP;
  $('#sample-expense').disabled = available(state) < 12_000;
  if (message) $('#demo-message').textContent = message;
}
$('#save-sample').addEventListener('click', () => {
  state = transition(state, 'save');
  renderDemo(state.reserved === TARGET ? 'Your sample wish is fully funded. Little by little, you got there! ♡' : `Another ₹500 set aside. ${formatMoney(available(state))} is still available to spend.`);
});
$('#release-sample').addEventListener('click', () => { state=transition(state,'release');renderDemo(`₹500 back in your sample available money. Plans can change, and that’s okay.`); });
$('#sample-expense').addEventListener('click', () => {state=transition(state,'expense');renderDemo(`A sample ₹120 expense recorded. Available money is now ${formatMoney(available(state))}; your jar stays the same.`);});
$('#reset-demo').addEventListener('click', () => { state=transition(state,'reset');renderDemo('Example reset. Your jar is 40% full. Every little bit counts.'); });

const wishes = {
  weekend: 'A weekend away. A little saved today, a lovely memory tomorrow.',
  creative: 'A creative little corner. Make space for the things that light you up.',
  rainy: 'A rainy-day cushion. Grow a little reassurance for whatever comes next.',
};
document.querySelectorAll('[data-wish]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-wish]').forEach(item => {const selected=item===button;item.classList.toggle('active',selected);item.setAttribute('aria-pressed',String(selected));});
  $('#wish-selection').textContent=wishes[button.dataset.wish];
}));

const tabs = [...document.querySelectorAll('[role="tab"]')];
function chooseTab(tab, focus=false) {
  tabs.forEach(item => { const active=item===tab;item.setAttribute('aria-selected',String(active));item.tabIndex=active?0:-1;document.getElementById(item.getAttribute('aria-controls')).hidden=!active; });
  if(focus)tab.focus();
}
tabs.forEach((tab,index) => {
  tab.addEventListener('click',()=>chooseTab(tab));
  tab.addEventListener('keydown',event=>{
    let next=index;
    if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(index+1)%tabs.length;
    else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(index+tabs.length-1)%tabs.length;
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=tabs.length-1;
    else return;
    event.preventDefault();chooseTab(tabs[next],true);
  });
});
const menu=$('.menu-toggle'), nav=$('#site-nav');
function closeMenu() {menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open navigation');nav.classList.remove('open');}
menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Close navigation':'Open navigation');nav.classList.toggle('open',open);});
nav.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.getAttribute('aria-expanded')==='true'){closeMenu();menu.focus();}});
document.addEventListener('click',event=>{if(!event.target.closest('.nav-wrap'))closeMenu();});
const narrow=matchMedia('(max-width: 760px)');narrow.addEventListener('change',closeMenu);

const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{threshold:.08});
  document.querySelectorAll('.reveal').forEach(element=>{element.classList.add('will-reveal');observer.observe(element);});
}
let scrollQueued=false;
function updateProgress() {
  const range=document.documentElement.scrollHeight-innerHeight;
  const ratio=range>0?Math.min(1,Math.max(0,scrollY/range)):0;
  $('#reading-progress').style.transform=`scaleX(${ratio})`;
  $('#journey-label').textContent=ratio<.2?'A little room to grow':ratio<.5?'Every little bit counts':ratio<.8?'Your wishes. Your pace.':'Lovely things start small';
  scrollQueued=false;
}
addEventListener('scroll',()=>{if(!scrollQueued){scrollQueued=true;requestAnimationFrame(updateProgress);}},{passive:true});
addEventListener('resize',updateProgress);
updateProgress();renderDemo();
