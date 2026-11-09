import type { SVGProps } from "react";

type SmallIconProps = SVGProps<SVGSVGElement>;

const smallIconProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };

export const IconLock = (props: SmallIconProps) => <svg {...smallIconProps} {...props}><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
export const IconLink = (props: SmallIconProps) => <svg {...smallIconProps} {...props}><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" /></svg>;
export const IconInfo = (props: SmallIconProps) => <svg {...smallIconProps} {...props}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;
export const IconSearch = (props: SmallIconProps) => <svg {...smallIconProps} {...props}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>;
export const IconGraduation = (props: SmallIconProps) => <svg {...smallIconProps} {...props}><path d="m2 9 10-5 10 5-10 5L2 9Z" /><path d="M6 11v6c3.5 3 8.5 3 12 0v-6M22 9v7" /></svg>;
export const IconBell = (props: SmallIconProps) => <svg {...smallIconProps} {...props}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10 21h4" /></svg>;
export const IconMail = (props: SmallIconProps) => <svg {...smallIconProps} {...props}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 7 9-7" /></svg>;
export const IconMapPin = (props: SmallIconProps) => <svg {...smallIconProps} {...props}><path d="M20 10c0 5.2-8 11-8 11S4 15.2 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
export const IconPhone = (props: SmallIconProps) => <svg {...smallIconProps} {...props}><path d="M8.2 3.5 5.8 4.6c-1 .5-1.5 1.6-1.2 2.7 1.7 6.3 5.8 10.4 12.1 12.1 1.1.3 2.2-.2 2.7-1.2l1.1-2.4-4-2.1-1.5 1.7a13.7 13.7 0 0 1-6.3-6.3l1.7-1.5-2.2-4.1Z" /></svg>;
export const IconInstagram = (props: SmallIconProps) => <svg {...smallIconProps} {...props}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none" /></svg>;
export const IconWhatsApp = (props: SmallIconProps) => <svg {...smallIconProps} {...props}><path d="M20.5 11.7a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.4-4.3A8.4 8.4 0 1 1 20.5 11.7Z" /><path d="M8.8 7.8c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.8 1.9c.1.2.1.4 0 .6l-.5.7c.6 1.2 1.6 2.2 2.8 2.8l.7-.5c.2-.1.4-.1.6 0l1.9.8c.3.1.4.3.4.5v.5c0 .3 0 .5-.4.7-.4.2-.8.3-1.1.2-3.3-.9-5.9-3.5-6.8-6.8-.1-.3 0-.7.2-1.1Z" /></svg>;
export const IconArrowUpRight = (props: SmallIconProps) => <svg {...smallIconProps} {...props}><path d="M5 19 19 5M8 5h11v11" /></svg>;

export function IconAdminNav({ name, ...props }: SmallIconProps & { name: "dashboard" | "profesores" | "alumnos" | "cursos" | "pagos" | "consultas" | "reportes" | "config" }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    profesores: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 8h5M19.5 5.5v5" /></>,
    alumnos: <><circle cx="12" cy="8" r="3" /><path d="M5 20v-2a7 7 0 0 1 14 0v2" /></>,
    cursos: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5v-12Z" /><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20" /></>,
    pagos: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>,
    consultas: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 7 9-7" /></>,
    reportes: <><path d="M3 20h18M6 16v-5M12 16V4M18 16V9" /></>,
    config: <><circle cx="12" cy="12" r="3" /><path d="M10 2h4l.7 2.4 2 .8L19 4l3 3-1.2 2.3.8 2L24 12l-2.4.7-.8 2L22 17l-3 3-2.3-1.2-2 .8L14 22h-4l-.7-2.4-2-.8L5 20l-3-3 1.2-2.3-.8-2L0 12l2.4-.7.8-2L2 7l3-3 2.3 1.2 2-.8L10 2Z" transform="translate(2 2) scale(.83)" /></>,
  };
  return <svg {...smallIconProps} {...props}>{paths[name]}</svg>;
}

export const IconBriefcase = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-9 h-9">
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
    <line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" />
  </svg>
);

export const IconFamily = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-9 h-9">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
  </svg>
);

export const IconShield = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-9 h-9">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export const IconDoc = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-9 h-9">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

export const IconBuilding = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-9 h-9">
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
  </svg>
);

export const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const IconExternal = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

export const TypeIcon = ({ type }: { type: string }) => {
  if (type === "video") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 flex-shrink-0"><polygon points="5 3 19 12 5 21 5 3" /></svg>;
  if (type === "pdf") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 flex-shrink-0"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 flex-shrink-0"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>;
};
