"use client";
import * as Lucide from 'lucide-react';
import {useReducedMotion} from 'motion/react';
import {useHoverCapable} from '@/lib/hooks/use-hover-capable';

// Keep one icon family and one stroke weight. Only interactive hover/focus
// animates; waiting indicators are supplied by beUI separately.
function icon(Icon:Lucide.LucideIcon,kind='lift') {
 return function UiIcon(props:Lucide.LucideProps) {
  const reduce=useReducedMotion(),hover=useHoverCapable();
  return <Icon aria-hidden="true" strokeWidth={1.75} {...props} className={`ui-icon ${hover&&!reduce?`ui-icon-${kind}`:''} ${props.className||''}`}/>;
 };
}
export const Download=icon(Lucide.Download);
export const Copy=icon(Lucide.Copy);
export const Archive=icon(Lucide.Archive),ArrowLeft=icon(Lucide.ArrowLeft,'left'),ArrowRight=icon(Lucide.ArrowRight,'right'),BadgeCheck=icon(Lucide.BadgeCheck,'pop'),Check=icon(Lucide.Check,'pop'),CheckSquare=icon(Lucide.CheckSquare,'pop'),ClipboardCheck=icon(Lucide.ClipboardCheck),Edit3=icon(Lucide.Edit3,'tilt'),FileArchive=icon(Lucide.FileArchive),FileCheck2=icon(Lucide.FileCheck2),FolderUp=icon(Lucide.FolderUp),ImageIcon=icon(Lucide.ImageIcon),Layers3=icon(Lucide.Layers3),Maximize2=icon(Lucide.Maximize2,'pop'),Moon=icon(Lucide.Moon,'tilt'),Pencil=icon(Lucide.Pencil,'tilt'),Plus=icon(Lucide.Plus,'quarter'),RefreshCw=icon(Lucide.RefreshCw,'turn'),Search=icon(Lucide.Search,'tilt'),Sparkles=icon(Lucide.Sparkles,'pop'),Square=icon(Lucide.Square),Sun=icon(Lucide.Sun,'turn'),Trash2=icon(Lucide.Trash2,'tilt'),Upload=icon(Lucide.Upload),WandSparkles=icon(Lucide.WandSparkles,'tilt'),X=icon(Lucide.X,'quarter'),ChevronDown=icon(Lucide.ChevronDown),ShieldCheck=icon(Lucide.ShieldCheck,'pop');
