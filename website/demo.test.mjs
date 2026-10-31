import test from 'node:test';
import assert from 'node:assert/strict';
import { TARGET, initialDemo, available, transition, formatMoney } from './dist/demo.mjs';
test('earmarking savings reduces available money without creating an expense',()=>{
 const before=initialDemo(),after=transition(before,'save');
 assert.equal(after.reserved,250000);assert.equal(available(after),1716000);assert.equal(after.spent,before.spent);assert.equal(before.reserved,200000);
});
test('releases restore availability without creating income',()=>{
 const before=initialDemo(),after=transition(before,'release');
 assert.equal(after.income,before.income);assert.equal(after.reserved,150000);assert.equal(available(after),1816000);
});
test('savings stop at target and release stops at zero',()=>{
 let s=initialDemo();for(let i=0;i<100;i++)s=transition(s,'save');assert.equal(s.reserved,TARGET);
 for(let i=0;i<100;i++)s=transition(s,'release');assert.equal(s.reserved,0);assert.ok(available(s)>=0);
});
test('expenses cannot spend reserved funds or create a negative balance',()=>{
 let s=initialDemo();for(let i=0;i<1000;i++)s=transition(s,'expense');assert.equal(s.reserved,200000);assert.ok(available(s)>=0);assert.ok(available(s)<12000);
 assert.deepEqual(transition(s,'save'),s);assert.ok(Object.values(s).every(Number.isSafeInteger));
});
test('reset restores sample state and INR formatting',()=>{
 const s=transition(transition(initialDemo(),'save'),'expense');assert.deepEqual(transition(s,'reset'),initialDemo());assert.equal(formatMoney(1766000),'₹17,660');
});
