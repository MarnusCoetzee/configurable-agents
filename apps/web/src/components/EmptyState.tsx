import { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-10 px-6">
      {icon && (
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-edge text-accent mb-4">
          {icon}
        </div>
      )}
      <div className="text-sm font-medium text-slate-200">{title}</div>
      {description && (
        <div className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          {description}
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
