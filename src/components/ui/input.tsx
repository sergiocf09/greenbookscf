import * as React from "react";

import { cn } from "@/lib/utils";

const baseClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

/**
 * Controlled numeric inputs often coerce "" to 0 in their onChange
 * (`parseInt(v) || 0`), which makes a 0 impossible to delete. This keeps a
 * local text draft while editing so the field can be empty; the parent still
 * receives its coerced value, and the draft re-syncs on blur or external change.
 */
const NumberInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, value, onChange, onBlur, onFocus, ...props }, ref) => {
    const external = value === undefined || value === null ? "" : String(value);
    const [draft, setDraft] = React.useState(external);
    const editing = React.useRef(false);

    React.useEffect(() => {
      setDraft((prev) => {
        if (!editing.current) return external;
        // While editing, keep the draft if it represents the same number.
        const same = (prev === "" || prev === "-") ? Number(external) === 0 || external === "" : Number(prev) === Number(external);
        return same ? prev : external;
      });
    }, [external]);

    return (
      <input
        type="number"
        className={cn(baseClass, className)}
        ref={ref}
        value={value === undefined ? undefined : draft}
        onFocus={(e) => {
          editing.current = true;
          // A lone 0 is selected so typing replaces it.
          if (e.target.value === "0") e.target.select();
          onFocus?.(e);
        }}
        onChange={(e) => {
          editing.current = true;
          setDraft(e.target.value);
          onChange?.(e);
        }}
        onBlur={(e) => {
          editing.current = false;
          setDraft(external);
          onBlur?.(e);
        }}
        {...props}
      />
    );
  },
);
NumberInput.displayName = "NumberInput";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    if (type === "number") {
      return <NumberInput className={className} ref={ref} {...props} />;
    }
    return <input type={type} className={cn(baseClass, className)} ref={ref} {...props} />;
  },
);
Input.displayName = "Input";

export { Input };
