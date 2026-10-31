import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp, segment, sceneProgress, cardPose, revealedWordCount,
  scrollSavings, horizontalDistance,
} from './dist/motion.mjs';

test('clamps progress and contains invalid numeric inputs', () => {
  assert.equal(clamp(-1), 0);
  assert.equal(clamp(.35), .35);
  assert.equal(clamp(Infinity), 1);
  assert.equal(clamp(-Infinity), 0);
  assert.equal(clamp(NaN), 0);
  assert.equal(clamp(undefined), 0);
  assert.equal(clamp(20, 10, -10), 10);
  assert.equal(clamp(4, NaN, Infinity), 1);
});

test('scene progress starts and ends at sticky travel boundaries', () => {
  assert.equal(sceneProgress(300, 3600, 900), 0);
  assert.equal(sceneProgress(0, 3600, 900), 0);
  assert.equal(sceneProgress(-1350, 3600, 900), .5);
  assert.equal(sceneProgress(-2700, 3600, 900), 1);
  assert.equal(sceneProgress(-9000, 3600, 900), 1);
  for (const geometry of [[0,0,0], [-10,100,900], [NaN,NaN,NaN], [Infinity,Infinity,Infinity]]) {
    assert.ok(Number.isFinite(sceneProgress(...geometry)));
  }
});

test('segments reveal within their own interval and handle a collapsed interval', () => {
  assert.equal(segment(.1,.2,.6),0);
  assert.ok(Math.abs(segment(.4,.2,.6)-.5)<1e-12);
  assert.equal(segment(.9,.2,.6),1);
  assert.equal(segment(.49,.5,.5),0);
  assert.equal(segment(.5,.5,.5),1);
});

test('deck starts with a front card and a shrinking stack, then advances and completes', () => {
  assert.deepEqual(cardPose(0,0,4),{y:0,scale:1,rotate:0,opacity:1,done:false});
  assert.equal(cardPose(1,0,4).y,18);
  assert.ok(cardPose(1,0,4).scale < cardPose(0,0,4).scale);
  const outgoing=cardPose(0,.2,4);
  assert.ok(outgoing.y<0);
  assert.ok(outgoing.rotate<0);
  assert.ok(outgoing.opacity<1);
  assert.equal(outgoing.done,false);
  assert.equal(cardPose(0,.25,4).done,true);
  assert.equal(cardPose(1,.25,4).y,0);
  assert.equal(cardPose(1,.25,4).scale,1);
  for(let index=0;index<4;index++) {
    assert.equal(cardPose(index,1,4).done,true);
    assert.equal(cardPose(index,1,4).opacity,0);
  }
});

test('scroll illustrations are reversible, finite and opacity/scale bounded', () => {
  const before=cardPose(2,.3,5);
  cardPose(2,.9,5);
  assert.deepEqual(cardPose(2,.3,5),before);
  for(const progress of [-Infinity,-2,0,.1,.49,1,2,Infinity,NaN]) {
    for(let index=0;index<5;index++) {
      const pose=cardPose(index,progress,5);
      for(const key of ['y','scale','rotate','opacity']) assert.ok(Number.isFinite(pose[key]));
      assert.ok(pose.opacity>=0&&pose.opacity<=1);
      assert.ok(pose.scale>0);
    }
  }
  assert.equal(cardPose(8,.2,5).opacity,0);
  assert.equal(cardPose(0,.2,0).opacity,0);
});

test('word reveal stays within the supplied title and reaches every word', () => {
  assert.equal(revealedWordCount(0,7),1);
  assert.equal(revealedWordCount(.5,7),4);
  assert.equal(revealedWordCount(1,7),7);
  assert.equal(revealedWordCount(10,7),7);
  assert.equal(revealedWordCount(NaN,7),1);
  assert.equal(revealedWordCount(.5,0),0);
});

test('savings scroll uses integer paise, saturates and refuses unsafe monetary targets', () => {
  assert.equal(scrollSavings(-1,500000),0);
  assert.equal(scrollSavings(.5,500000),250000);
  assert.equal(scrollSavings(1,500000),500000);
  assert.equal(scrollSavings(2,500000),500000);
  assert.equal(scrollSavings(.333,999),333);
  assert.ok(Number.isSafeInteger(scrollSavings(.731,Number.MAX_SAFE_INTEGER)));
  for(const target of [-1,1.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) {
    assert.throws(()=>scrollSavings(.5,target),RangeError);
  }
});

test('horizontal filmstrip distance cannot move a shorter track or become NaN', () => {
  assert.equal(horizontalDistance(2100,1200),900);
  assert.equal(horizontalDistance(700,1200),0);
  assert.equal(horizontalDistance(NaN,800),0);
  assert.equal(horizontalDistance(2100,NaN),2100);
});
