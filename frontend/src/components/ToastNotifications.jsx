import { useEffect } from "react";
import { useStore } from "../store/AppStore";

const TOAST_ICONS = {
  success: { icon: "check_circle", color: "text-tertiary-fixed", bg: "bg-tertiary-fixed/10 border-tertiary-fixed/20" },
  error:   { icon: "error",        color: "text-error",          bg: "bg-error/10 border-error/20"                   },
  warning: { icon: "warning",      color: "text-[#ffca7a]",      bg: "bg-[#ffca7a]/10 border-[#ffca7a]/20"           },
  info:    { icon: "info",         color: "text-secondary",      bg: "bg-secondary/10 border-secondary/20"           },
};

export default function ToastNotifications() {
  const { state, dispatch } = useStore();

  return (
    <div className="fixed top-[4.5rem] right-4 z-[2000] flex flex-col gap-2 pointer-events-none" aria-live="polite">
      {state.toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} dispatch={dispatch} />
      ))}
    </div>
  );
}

function Toast({ toast, dispatch }) {
  const style = TOAST_ICONS[toast.kind] || TOAST_ICONS.info;

  useEffect(() => {
    const timer = setTimeout(
      () => dispatch({ type: "REMOVE_TOAST", id: toast.id }),
      5000
    );
    return () => clearTimeout(timer);
  }, [toast.id, dispatch]);

  return (
    <div
      className={`toast-enter glass-panel rounded-xl px-4 py-3 flex items-start gap-3 pointer-events-auto max-w-[320px] border ${style.bg}`}
    >
      <span className={`material-symbols-outlined text-lg ${style.color} shrink-0 mt-0.5`}>
        {style.icon}
      </span>
      <p className="font-mono text-xs text-on-surface leading-relaxed flex-1">{toast.message}</p>
      <button
        onClick={() => dispatch({ type: "REMOVE_TOAST", id: toast.id })}
        className="text-on-surface-variant hover:text-primary transition-colors shrink-0 mt-0.5"
      >
        <span className="material-symbols-outlined text-sm">close</span>
      </button>
    </div>
  );
}
