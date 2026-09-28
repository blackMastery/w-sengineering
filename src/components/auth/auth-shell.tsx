import type { ReactNode } from "react";

export function AuthShell({ title, intro, children, footer }: { title: string; intro?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-8 pb-16 md:pt-12">
      <div>
        <h1 className="font-serif text-[34px] leading-tight font-medium">{title}</h1>
        {intro && <p className="mt-2 text-[14.5px] leading-relaxed opacity-75">{intro}</p>}
      </div>
      {children}
      {footer && <div className="border-t border-navy/12 pt-4 text-[14px]">{footer}</div>}
    </div>
  );
}
