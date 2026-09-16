"use client";
import {Loader} from '@/components/motion/loader';
export function BusyIcon({size=16,className=''}:{size?:number;className?:string}) {
  return <span aria-hidden="true" className="busy-icon"><Loader variant="bars" size={size} label="处理中" className={className.replace(/\bspin\b/g,'')}/></span>;
}
