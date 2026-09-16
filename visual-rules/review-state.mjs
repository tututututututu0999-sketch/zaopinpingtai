export function canConfirmReview(asset,revision){
 if(!asset.previewUrl||!revision||asset.reuseState==='NOT_REUSABLE')return false;
 return revision.status==='PENDING'||(asset.reviewState!=='CONFIRMED'&&Boolean(revision.confirmed)&&['READY','WAITING_ELIGIBILITY','FAILED','APPROVED'].includes(revision.status));
}
export function reviewBlocker(asset,revision,primary){
 if(!asset.previewUrl)return '图片预览尚未准备好';
 if(asset.reviewState!=='CONFIRMED'&&revision?.confirmed)return '视觉档案已确认，还需确认基础信息';
 if(revision?.status==='WAITING_ELIGIBILITY'){
  if(!primary)return '尚未选择套系主参考';
  if(primary.reviewState!=='CONFIRMED')return '请先审核当前主参考';
  if(primary.reuseState==='NOT_REUSABLE')return '当前主参考不可复用，请更换';
  if(asset.reuseState==='NOT_REUSABLE')return '素材已标记不可复用';
  return '资格已补齐，可继续入库';
 }
 return '';
}
