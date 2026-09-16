import type {ArchiveAsset} from '../lib/archive-types';
type Revision={status:string;confirmed:unknown};
export function canConfirmReview(asset:ArchiveAsset,revision?:Revision):boolean;
export function reviewBlocker(asset:ArchiveAsset,revision?:Revision,primary?:ArchiveAsset):string;
