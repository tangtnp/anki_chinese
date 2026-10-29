import {test} from 'node:test';
import assert from 'node:assert/strict';
import {characterReading,isHanzi} from '../src/pronunciation.ts';
test('Chinese detection excludes punctuation and Latin text',()=>{
 assert.equal(isHanzi('学'),true);assert.equal(isHanzi('銀'),true);assert.equal(isHanzi('。'),false);assert.equal(isHanzi('a'),false);
});
test('word cards prefer aligned deck-author readings',async()=>{
 assert.equal(await characterReading('你好',0,'nǐ hǎo'),'nǐ');assert.equal(await characterReading('你好',1,'nǐ hǎo'),'hǎo');
});
test('polyphonic characters use their full phrase context',async()=>{
 assert.equal(await characterReading('银行开门了。',1),'háng');assert.equal(await characterReading('我们行走。',2),'xíng');
});
test('mixed text preserves character offsets and ignores non-Chinese taps',async()=>{
 assert.equal(await characterReading('A银行 2号',2),'háng');assert.equal(await characterReading('A银行 2号',5),'hào');assert.equal(await characterReading('你好。',2),'');
});
