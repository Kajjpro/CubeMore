import { useEffect, useState } from "react";

/**
 * A button that asks for a second tap instead of opening a dialog (no modals
 * on top of anyone's timer). First tap: the label changes to `confirmLabel`;
 * a second tap within 4 seconds does it; otherwise it goes back.
 */
export function ConfirmButton(props: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
  ariaLabel?: string;
  /** A compact control in the race layout (see DESIGN.md, tap targets). */
  dense?: boolean;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timeout = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timeout);
  }, [armed]);

  return (
    <button
      type="button"
      className={props.className}
      data-armed={armed}
      data-dense={props.dense || undefined}
      aria-label={armed ? props.confirmLabel : props.ariaLabel}
      onClick={() => {
        if (armed) {
          setArmed(false);
          props.onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? props.confirmLabel : props.label}
    </button>
  );
}
