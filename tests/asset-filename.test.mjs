import assert from 'node:assert/strict';
import test from 'node:test';
import {inferMaterialType} from '../visual-rules/asset-filename.mjs';

test('specific filenames override generic AI cover classification', () => {
  for(const [filename,type] of [['扉页4.png','TITLE_PAGE'],['主书封面5.png','BOOK_COVER'],['礼盒封面.png','GIFT_BOX'],['礼盒说明卡.jpg','PRODUCT_BOOKLET'],['产品说明书.webp','PRODUCT_BOOKLET'],['挂图2.png','WALL_CHART']]) {
    assert.equal(inferMaterialType(filename,'BOOK_COVER'),type);
  }
});
test('project paths do not classify the image, unknown names retain vision fallback', () => {
  assert.equal(inferMaterialType('礼盒/扉页4.png'),'TITLE_PAGE');
  assert.equal(inferMaterialType('礼盒/IMG_001.png','WALL_CHART'),'WALL_CHART');
  assert.equal(inferMaterialType('礼盒\\IMG_001.png'),'OTHER');
  assert.equal(inferMaterialType('Gift Box.PNG'),'GIFT_BOX');
});
