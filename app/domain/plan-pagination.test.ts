import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPage } from './plan-pagination';

test('each 12-item page restarts wide and splits only on its seventh item', () => {
  for (const [total, requested, count, split, pages] of [
    [1,1,1,false,1], [6,1,6,false,1], [7,1,7,true,1], [12,1,12,true,1],
    [13,2,1,false,2], [18,2,6,false,2], [19,2,7,true,2], [24,2,12,true,2],
    [25,3,1,false,3],
  ] as const) {
    const result = planPage(total, requested);
    assert.equal(result.count, count, `count at ${total}`);
    assert.equal(result.split, split, `split at ${total}`);
    assert.equal(result.pages, pages);
  }
});

test('empty search and deletion clamp the page without hiding remaining entries', () => {
  assert.deepEqual(planPage(0, 3), {pages:1,page:1,start:0,end:0,count:0,split:false});
  assert.deepEqual(planPage(12, 2), {pages:1,page:1,start:0,end:12,count:12,split:true});
});
