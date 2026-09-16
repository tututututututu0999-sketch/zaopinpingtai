export const SELLING_EXAMPLES={A:'10-51-24',B:'10-51-36',C:'10-51-46',D:'10-55-25',E:'10-52-22',F:'10-55-37',G:'10-56-34',H:'10-54-48',I:'10-56-10'};
export function sellingExample(type){return Object.hasOwn(SELLING_EXAMPLES,type)?{type,path:`/selling-layouts/${type}.png`,source:`Snipaste_2026-08-18_${SELLING_EXAMPLES[type]}.png`}:null;}
