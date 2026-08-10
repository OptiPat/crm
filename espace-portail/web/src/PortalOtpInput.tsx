import { useCallback, useRef } from "react";

export interface PortalOtpInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  idPrefix?: string;
}

export function PortalOtpInput({
  value,
  onChange,
  disabled = false,
  idPrefix = "portal-otp",
}: PortalOtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, index) => value[index] ?? "");

  const focusAt = (index: number) => {
    const clamped = Math.max(0, Math.min(5, index));
    refs.current[clamped]?.focus();
    refs.current[clamped]?.select();
  };

  const applyDigits = useCallback(
    (raw: string) => {
      const next = raw.replace(/\D/g, "").slice(0, 6);
      onChange(next);
      if (next.length > 0) {
        const clamped = Math.max(0, Math.min(5, next.length === 6 ? 5 : next.length - 1));
        refs.current[clamped]?.focus();
        refs.current[clamped]?.select();
      }
    },
    [onChange]
  );

  const handleDigitChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    const chars = Array.from({ length: 6 }, (_, i) => value[i] ?? "");
    chars[index] = digit;
    const next = chars.join("").replace(/\D/g, "").slice(0, 6);
    onChange(next);
    if (digit && index < 5) {
      focusAt(index + 1);
    }
  };

  const handleKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      focusAt(index - 1);
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focusAt(index - 1);
      return;
    }
    if (event.key === "ArrowRight" && index < 5) {
      event.preventDefault();
      focusAt(index + 1);
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text");
    const digitsOnly = pasted.replace(/\D/g, "").slice(0, 6);
    if (!digitsOnly) return;
    event.preventDefault();
    applyDigits(digitsOnly);
  };

  return (
    <div className="cp-login-otp" role="group" aria-label="Code à 6 chiffres">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          id={`${idPrefix}-${index}`}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digit}
          disabled={disabled}
          aria-label={`Chiffre ${index + 1}`}
          className="cp-login-otp-digit"
          onChange={(event) => handleDigitChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
        />
      ))}
    </div>
  );
}
