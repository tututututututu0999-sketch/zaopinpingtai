// Use the basename only: a ZIP/project name must not classify every file as a gift box.
export function inferMaterialType(filename, fallback = 'OTHER') {
  const name = String(filename).split(/[\\/]/).pop().normalize('NFKC').replace(/\.[^.]+$/, '').toLowerCase();
  if (/扉页|扉頁|title[ _-]*page/.test(name)) return 'TITLE_PAGE';
  if (/说明书|说明卡|说明册|说明页|使用指南|产品手册|instruction|booklet/.test(name)) return 'PRODUCT_BOOKLET';
  if (/挂图|掛圖|wall[ _-]*chart/.test(name)) return 'WALL_CHART';
  if (/礼盒|禮盒|包装盒|gift[ _-]*box/.test(name)) return 'GIFT_BOX';
  if (/封面|书封|書封|book[ _-]*cover/.test(name)) return 'BOOK_COVER';
  return fallback;
}
