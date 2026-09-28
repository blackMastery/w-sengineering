import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

const control =
  "w-full rounded-lg border border-navy/30 bg-white/70 px-3.5 text-[16px] text-navy outline-none placeholder:text-navy/40 focus:border-navy focus:ring-2 focus:ring-navy/15 aria-invalid:border-red-700";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13.5px] font-medium">{label}</span>
      {children}
      {hint && <span className="text-[12.5px] opacity-65">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`h-12 ${control} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`py-3 ${control} ${props.className ?? ""}`} />;
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-800/25 bg-red-50 px-3.5 py-2.5 text-[13.5px] text-red-900">
      {children}
    </p>
  );
}

export function FormNotice({ children }: { children: ReactNode }) {
  return <p role="status" className="rounded-lg bg-sand px-3.5 py-3 text-[14px] leading-relaxed">{children}</p>;
}

export function PrimaryButton({ children, pending, ...props }: { pending?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      disabled={pending || props.disabled}
      className={`h-12 rounded-lg bg-navy px-5 text-[15px] font-semibold text-cream-2 hover:bg-navy-deep disabled:opacity-60 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}
