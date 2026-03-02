import type { HTMLAttributes } from 'react';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  title?: string;
  children: React.ReactNode;
};

export function Card({ title, children, className = '', ...props }: CardProps) {
  return (
    <div className={`card ${className}`} {...props}>
      {title && (
        <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-3 md:px-6">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
}
